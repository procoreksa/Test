import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

/**
 * Prompt 23 Step 4 (Critical Rule 3 - fail closed): getDefaultStorageProviderKind()
 * must never silently resolve to LOCAL_DEV when NODE_ENV=production. Uses
 * vi.resetModules()-free dynamic re-import via a fresh NODE_ENV each test,
 * since the factory module reads `process.env` at call time (not at
 * import time), so no module-cache reset is actually required here.
 */
describe("getDefaultStorageProviderKind - fail-closed production storage", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    for (const key of ["DOCUMENT_S3_ENDPOINT", "DOCUMENT_S3_REGION", "DOCUMENT_S3_BUCKET", "DOCUMENT_S3_ACCESS_KEY_ID", "DOCUMENT_S3_SECRET_ACCESS_KEY"]) {
      delete process.env[key];
    }
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.unstubAllEnvs();
  });

  it("throws instead of returning LOCAL_DEV when NODE_ENV=production and S3 is not configured", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const { getDefaultStorageProviderKind } = await import("./factory");
    expect(() => getDefaultStorageProviderKind()).toThrow(/Refusing to use LOCAL_DEV/);
  });

  it("returns LOCAL_DEV outside production when S3 is not configured", async () => {
    vi.stubEnv("NODE_ENV", "test");
    const { getDefaultStorageProviderKind } = await import("./factory");
    expect(getDefaultStorageProviderKind()).toBe("LOCAL_DEV");
  });
});
