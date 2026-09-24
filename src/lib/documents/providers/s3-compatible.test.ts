import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtempSync, rmSync } from "fs";
import { tmpdir } from "os";
import path from "path";
import S3rver from "s3rver";
import { S3CompatibleStorageProvider } from "./s3-compatible";
import { StorageProviderNotConfiguredError } from "./types";

const FULL_ENV = {
  DOCUMENT_S3_ENDPOINT: "https://s3.example.com",
  DOCUMENT_S3_REGION: "us-east-1",
  DOCUMENT_S3_BUCKET: "docs",
  DOCUMENT_S3_ACCESS_KEY_ID: "key",
  DOCUMENT_S3_SECRET_ACCESS_KEY: "secret",
};

describe("S3CompatibleStorageProvider - configuration boundary", () => {
  it("is not configured when any required env var is missing - buildable/testable with no real credentials", () => {
    const provider = new S3CompatibleStorageProvider({});
    expect(provider.isConfigured).toBe(false);
  });

  it("is not configured when only some env vars are present", () => {
    const provider = new S3CompatibleStorageProvider({ DOCUMENT_S3_ENDPOINT: "https://s3.example.com" });
    expect(provider.isConfigured).toBe(false);
  });

  it("reports configured once all five env vars are present", () => {
    const provider = new S3CompatibleStorageProvider(FULL_ENV);
    expect(provider.isConfigured).toBe(true);
  });

  it("throws StorageProviderNotConfiguredError from every operation when unconfigured, rather than silently no-oping", async () => {
    const provider = new S3CompatibleStorageProvider({});
    const key = { key: "org1/x/1/f.pdf" };
    await expect(provider.putObject({ ...key, body: Buffer.from("x"), contentType: "application/pdf" })).rejects.toBeInstanceOf(
      StorageProviderNotConfiguredError
    );
    await expect(provider.getObject(key)).rejects.toBeInstanceOf(StorageProviderNotConfiguredError);
    await expect(provider.exists(key)).rejects.toBeInstanceOf(StorageProviderNotConfiguredError);
    await expect(provider.deleteObject(key)).rejects.toBeInstanceOf(StorageProviderNotConfiguredError);
  });
});

/**
 * Real integration tests against s3rver (Prompt 23 Step 17 - "no real AWS
 * credentials required in CI, use a mock/local S3-compatible test
 * service, but the production adapter code must be real and typechecked").
 * s3rver is a pure-Node, in-process S3-compatible HTTP server - no Docker,
 * no network egress, no real cloud account - but the code under test here
 * is the exact same S3CompatibleStorageProvider class production traffic
 * would use, wired against `@aws-sdk/client-s3` for real over HTTP.
 *
 * What this DOES verify: putObject/getObject/exists/deleteObject round-trip
 * correctly against a real (if local) S3-compatible HTTP endpoint using
 * the real AWS SDK wire protocol, not-found handling, and idempotent
 * delete. What this CANNOT verify without a real cloud account: actual
 * AWS/R2/MinIO-specific auth edge cases, network-partition behavior
 * against a real remote host, or IAM-policy-level access control - those
 * remain "implemented but not live-verified against a real provider",
 * documented as such in docs/PRODUCTION-RELIABILITY.md.
 */
describe("S3CompatibleStorageProvider - real S3-compatible integration (s3rver)", () => {
  const PORT = 14568;
  const BUCKET = "docs-test-bucket";
  let server: InstanceType<typeof S3rver>;
  let dataDir: string;
  let provider: S3CompatibleStorageProvider;

  beforeAll(async () => {
    dataDir = mkdtempSync(path.join(tmpdir(), "s3rver-test-"));
    server = new S3rver({
      port: PORT,
      address: "localhost",
      silent: true,
      directory: dataDir,
      resetOnClose: true,
      configureBuckets: [{ name: BUCKET, configs: [] }],
    });
    await server.run();

    provider = new S3CompatibleStorageProvider({
      DOCUMENT_S3_ENDPOINT: `http://localhost:${PORT}`,
      DOCUMENT_S3_REGION: "us-east-1",
      DOCUMENT_S3_BUCKET: BUCKET,
      DOCUMENT_S3_ACCESS_KEY_ID: "S3RVER",
      DOCUMENT_S3_SECRET_ACCESS_KEY: "S3RVER",
    });
  }, 30_000);

  afterAll(async () => {
    await new Promise<void>((resolve, reject) => server.close((err: unknown) => (err ? reject(err) : resolve())));
    rmSync(dataDir, { recursive: true, force: true });
  });

  it("round-trips a real object through putObject/getObject", async () => {
    const key = `org-a/documents/${crypto.randomUUID()}/1/lease.pdf`;
    const body = Buffer.from("%PDF-1.4 fake pdf content for integration test");
    await provider.putObject({ key, body, contentType: "application/pdf" });

    const read = await provider.getObject({ key });
    expect(read).not.toBeNull();
    expect(read?.equals(body)).toBe(true);
  });

  it("exists() reflects real object presence before and after a write", async () => {
    const key = `org-a/documents/${crypto.randomUUID()}/1/photo.png`;
    expect(await provider.exists({ key })).toBe(false);
    await provider.putObject({ key, body: Buffer.from("fake-png-bytes"), contentType: "image/png" });
    expect(await provider.exists({ key })).toBe(true);
  });

  it("getObject returns null (never throws) for a key that was never written", async () => {
    const result = await provider.getObject({ key: "org-a/documents/does-not-exist/1/missing.pdf" });
    expect(result).toBeNull();
  });

  it("deleteObject removes a real object, and exists() reflects the removal", async () => {
    const key = `org-a/documents/${crypto.randomUUID()}/1/to-delete.pdf`;
    await provider.putObject({ key, body: Buffer.from("bye"), contentType: "application/pdf" });
    expect(await provider.exists({ key })).toBe(true);

    await provider.deleteObject({ key });
    expect(await provider.exists({ key })).toBe(false);
  });

  it("deleteObject on an already-missing key is a no-op success, never throws (Step 13)", async () => {
    await expect(provider.deleteObject({ key: "org-a/documents/never-existed/1/x.pdf" })).resolves.toBeUndefined();
  });

  it("a request against an unreachable endpoint fails within the bounded timeout rather than hanging (Step 12)", async () => {
    const unreachable = new S3CompatibleStorageProvider({
      DOCUMENT_S3_ENDPOINT: "http://127.0.0.1:1", // reserved/unused port - connection refused immediately, exercising the same bounded-timeout code path
      DOCUMENT_S3_REGION: "us-east-1",
      DOCUMENT_S3_BUCKET: BUCKET,
      DOCUMENT_S3_ACCESS_KEY_ID: "S3RVER",
      DOCUMENT_S3_SECRET_ACCESS_KEY: "S3RVER",
    });
    const start = Date.now();
    await expect(unreachable.getObject({ key: "x" })).rejects.toThrow();
    // Comfortably under the 5s connection timeout + retry budget - proves
    // this doesn't hang indefinitely, without hardcoding a brittle
    // near-exact timing assertion.
    expect(Date.now() - start).toBeLessThan(20_000);
  }, 25_000);
});
