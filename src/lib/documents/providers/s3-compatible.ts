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
 * Production storage adapter boundary (Step 18). Reads its configuration
 * from environment variables only, never from the database (Step 19):
 * `DOCUMENT_S3_ENDPOINT`, `DOCUMENT_S3_REGION`, `DOCUMENT_S3_BUCKET`,
 * `DOCUMENT_S3_ACCESS_KEY_ID`, `DOCUMENT_S3_SECRET_ACCESS_KEY`.
 *
 * No S3-compatible SDK/credentials exist in this environment (confirmed by
 * the Step 1 architecture audit - see docs/DOCUMENT-MANAGEMENT.md), so this
 * class is deliberately a validated boundary rather than a working client:
 * it can always be constructed and reports whether it is configured
 * (`isConfigured`), but every actual storage operation throws a clear
 * `StorageProviderNotConfiguredError` until both (a) all five env vars are
 * present AND (b) a real client implementation is wired in behind this
 * same interface - a future, separate change, never claimed as done here
 * (see docs/PRODUCTION-DEPLOYMENT.md, "Object storage"). This intentionally
 * mirrors Critical Principle 6 of the Notifications module: no false
 * claims of a working integration that was never actually exercised.
 */
export class S3CompatibleStorageProvider implements DocumentStorageProvider {
  readonly kind = "S3_COMPATIBLE" as const;
  readonly isConfigured: boolean;
  private readonly config: S3CompatibleConfig | null;

  constructor(env: Record<string, string | undefined> = process.env) {
    this.config = readConfig(env);
    this.isConfigured = this.config !== null;
  }

  private assertConfigured(): void {
    if (!this.config) throw new StorageProviderNotConfiguredError(this.kind);
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async putObject(_params: { key: string; body: Buffer; contentType: string }): Promise<void> {
    this.assertConfigured();
    throw new Error(
      "S3_COMPATIBLE storage is configured but no client implementation is wired in yet - see docs/DOCUMENT-MANAGEMENT.md, 'Production storage adapter'."
    );
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async getObject(_params: { key: string }): Promise<Buffer | null> {
    this.assertConfigured();
    throw new Error(
      "S3_COMPATIBLE storage is configured but no client implementation is wired in yet - see docs/DOCUMENT-MANAGEMENT.md, 'Production storage adapter'."
    );
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async exists(_params: { key: string }): Promise<boolean> {
    this.assertConfigured();
    throw new Error(
      "S3_COMPATIBLE storage is configured but no client implementation is wired in yet - see docs/DOCUMENT-MANAGEMENT.md, 'Production storage adapter'."
    );
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async deleteObject(_params: { key: string }): Promise<void> {
    this.assertConfigured();
    throw new Error(
      "S3_COMPATIBLE storage is configured but no client implementation is wired in yet - see docs/DOCUMENT-MANAGEMENT.md, 'Production storage adapter'."
    );
  }
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
