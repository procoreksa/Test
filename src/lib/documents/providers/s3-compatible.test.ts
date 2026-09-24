import { describe, it, expect } from "vitest";
import { S3CompatibleStorageProvider } from "./s3-compatible";
import { StorageProviderNotConfiguredError } from "./types";

const FULL_ENV = {
  DOCUMENT_S3_ENDPOINT: "https://s3.example.com",
  DOCUMENT_S3_REGION: "us-east-1",
  DOCUMENT_S3_BUCKET: "docs",
  DOCUMENT_S3_ACCESS_KEY_ID: "key",
  DOCUMENT_S3_SECRET_ACCESS_KEY: "secret",
};

describe("S3CompatibleStorageProvider", () => {
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

  it("never claims a working integration even when configured (no client implementation exists yet)", async () => {
    const provider = new S3CompatibleStorageProvider(FULL_ENV);
    await expect(
      provider.putObject({ key: "org1/x/1/f.pdf", body: Buffer.from("x"), contentType: "application/pdf" })
    ).rejects.toThrow(/no client implementation/);
  });
});
