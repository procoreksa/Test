import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  DeleteObjectCommand,
  type S3ClientConfig,
} from "@aws-sdk/client-s3";
import { NodeHttpHandler } from "@smithy/node-http-handler";
import type { DocumentStorageProvider } from "./types";
import { StorageProviderNotConfiguredError } from "./types";

export interface S3CompatibleConfig {
  endpoint: string;
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
}

/**
 * Bounded so a single storage call can never hang a request indefinitely
 * (Prompt 23 Step 12 - "no infinite waits, no retry storms"). 5s to
 * establish the TCP/TLS connection, 15s for the whole request/response -
 * generous enough for a real S3-compatible endpoint (R2/MinIO/AWS) under
 * normal conditions, small enough that a genuinely unreachable storage
 * backend fails fast rather than exhausting a serverless function's own
 * execution budget. `maxAttempts: 2` (one retry) keeps a transient failure
 * from becoming a multi-request storm while still tolerating one blip.
 */
const CONNECTION_TIMEOUT_MS = 5_000;
const REQUEST_TIMEOUT_MS = 15_000;
const MAX_ATTEMPTS = 2;

/**
 * Production storage adapter (Step 18, Critical Rule 5). Uses the official
 * AWS SDK v3 S3 client (`@aws-sdk/client-s3`), which works unmodified
 * against real AWS S3 and against any S3-compatible provider (Cloudflare
 * R2, MinIO, Supabase Storage, Backblaze B2) via a custom `endpoint` -
 * nothing here is AWS-specific beyond the wire protocol itself.
 *
 * Reads its configuration from environment variables only, never from the
 * database (Step 19): `DOCUMENT_S3_ENDPOINT`, `DOCUMENT_S3_REGION`,
 * `DOCUMENT_S3_BUCKET`, `DOCUMENT_S3_ACCESS_KEY_ID`,
 * `DOCUMENT_S3_SECRET_ACCESS_KEY`, plus optional
 * `DOCUMENT_S3_FORCE_PATH_STYLE` (defaults to `"true"` - path-style
 * addressing is what most non-AWS S3-compatible providers, including
 * MinIO, actually require; real AWS S3 also accepts it).
 *
 * **Object privacy (Step 20-21):** every `putObject()` call never sets an
 * ACL - S3 buckets/objects are private-by-default unless a bucket policy
 * explicitly opens them, and this adapter never overrides that. There is
 * no public-URL generation anywhere in this class; the only way to read an
 * object back is `getObject()`, called exclusively from
 * `src/lib/documents/download.ts` after the caller has already
 * re-authorized the request (Critical Principle 3/4 - the storage key is
 * never itself authorization). No PII is ever written into S3 object
 * metadata/tags (Step 23) - only `ContentType`, already validated upstream
 * by `src/lib/documents/file-validation.ts`'s magic-byte check.
 *
 * **What this class does NOT do:** presigned URLs. V1 deliberately uses
 * the "server-authorized proxy streaming" download strategy (Step 22's
 * preferred option) - `streamDocumentVersion()` reads the full object
 * server-side and returns it directly in the HTTP response, so this
 * adapter never needs to mint a temporary public URL at all.
 */
export class S3CompatibleStorageProvider implements DocumentStorageProvider {
  readonly kind = "S3_COMPATIBLE" as const;
  readonly isConfigured: boolean;
  private readonly config: S3CompatibleConfig | null;
  private readonly forcePathStyle: boolean;
  private client: S3Client | null = null;

  constructor(env: Record<string, string | undefined> = process.env) {
    this.config = readConfig(env);
    this.isConfigured = this.config !== null;
    this.forcePathStyle = env.DOCUMENT_S3_FORCE_PATH_STYLE !== "false";
  }

  private requireConfig(): S3CompatibleConfig {
    if (!this.config) throw new StorageProviderNotConfiguredError(this.kind);
    return this.config;
  }

  private getClient(config: S3CompatibleConfig): S3Client {
    if (!this.client) {
      const clientConfig: S3ClientConfig = {
        endpoint: config.endpoint,
        region: config.region,
        forcePathStyle: this.forcePathStyle,
        credentials: {
          accessKeyId: config.accessKeyId,
          secretAccessKey: config.secretAccessKey,
        },
        maxAttempts: MAX_ATTEMPTS,
        requestHandler: new NodeHttpHandler({
          connectionTimeout: CONNECTION_TIMEOUT_MS,
          requestTimeout: REQUEST_TIMEOUT_MS,
        }),
      };
      this.client = new S3Client(clientConfig);
    }
    return this.client;
  }

  async putObject(params: { key: string; body: Buffer; contentType: string }): Promise<void> {
    const config = this.requireConfig();
    const client = this.getClient(config);
    await client.send(
      new PutObjectCommand({
        Bucket: config.bucket,
        Key: params.key,
        Body: params.body,
        ContentType: params.contentType,
        ContentLength: params.body.length,
        // Deliberately no ACL/Metadata/Tagging - see class doc comment.
      })
    );
  }

  async getObject(params: { key: string }): Promise<Buffer | null> {
    const config = this.requireConfig();
    const client = this.getClient(config);
    try {
      const response = await client.send(new GetObjectCommand({ Bucket: config.bucket, Key: params.key }));
      if (!response.Body) return null;
      const bytes = await response.Body.transformToByteArray();
      return Buffer.from(bytes);
    } catch (error) {
      if (isNotFoundError(error)) return null;
      throw error;
    }
  }

  async exists(params: { key: string }): Promise<boolean> {
    const config = this.requireConfig();
    const client = this.getClient(config);
    try {
      await client.send(new HeadObjectCommand({ Bucket: config.bucket, Key: params.key }));
      return true;
    } catch (error) {
      if (isNotFoundError(error)) return false;
      throw error;
    }
  }

  /**
   * Best-effort, per the interface contract - a delete of an
   * already-missing object (or one whose bucket rejects the delete with a
   * not-found-shaped error) is treated as a no-op success, never thrown.
   * Any other failure (network/credentials/permissions) still throws, so
   * the caller's own compensating-delete-failure handling (Step 13 - "an
   * orphaned storage object is a storage-cost problem, never a security
   * problem, but must not be silently swallowed as if it always
   * succeeded") can log and move on rather than believe cleanup happened
   * when it didn't.
   */
  async deleteObject(params: { key: string }): Promise<void> {
    const config = this.requireConfig();
    const client = this.getClient(config);
    try {
      await client.send(new DeleteObjectCommand({ Bucket: config.bucket, Key: params.key }));
    } catch (error) {
      if (!isNotFoundError(error)) throw error;
    }
  }
}

function isNotFoundError(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  const name = "name" in error ? String((error as { name: unknown }).name) : "";
  const httpStatus =
    "$metadata" in error && typeof (error as { $metadata?: { httpStatusCode?: number } }).$metadata === "object"
      ? (error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode
      : undefined;
  return name === "NoSuchKey" || name === "NotFound" || httpStatus === 404;
}

function readConfig(env: Record<string, string | undefined>): S3CompatibleConfig | null {
  const endpoint = env.DOCUMENT_S3_ENDPOINT;
  const region = env.DOCUMENT_S3_REGION;
  const bucket = env.DOCUMENT_S3_BUCKET;
  const accessKeyId = env.DOCUMENT_S3_ACCESS_KEY_ID;
  const secretAccessKey = env.DOCUMENT_S3_SECRET_ACCESS_KEY;
  if (!endpoint || !region || !bucket || !accessKeyId || !secretAccessKey) return null;
  return { endpoint, region, bucket, accessKeyId, secretAccessKey };
}
