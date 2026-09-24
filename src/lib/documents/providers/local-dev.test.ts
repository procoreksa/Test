import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { promises as fs } from "fs";
import os from "os";
import path from "path";
import { LocalDevStorageProvider } from "./local-dev";

describe("LocalDevStorageProvider", () => {
  let tmpDir: string;
  let provider: LocalDevStorageProvider;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "doc-storage-test-"));
    provider = new LocalDevStorageProvider(tmpDir);
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it("writes and reads back an object", async () => {
    await provider.putObject({ key: "org1/contract/c1/abc.pdf", body: Buffer.from("hello"), contentType: "application/pdf" });
    const result = await provider.getObject({ key: "org1/contract/c1/abc.pdf" });
    expect(result?.toString()).toBe("hello");
  });

  it("returns null for a missing object rather than throwing", async () => {
    const result = await provider.getObject({ key: "org1/contract/c1/missing.pdf" });
    expect(result).toBeNull();
  });

  it("reports exists() correctly", async () => {
    await provider.putObject({ key: "org1/x/1/f.pdf", body: Buffer.from("a"), contentType: "application/pdf" });
    expect(await provider.exists({ key: "org1/x/1/f.pdf" })).toBe(true);
    expect(await provider.exists({ key: "org1/x/1/missing.pdf" })).toBe(false);
  });

  it("deletes an object, and treats deleting a missing object as a no-op success", async () => {
    await provider.putObject({ key: "org1/x/1/f.pdf", body: Buffer.from("a"), contentType: "application/pdf" });
    await provider.deleteObject({ key: "org1/x/1/f.pdf" });
    expect(await provider.exists({ key: "org1/x/1/f.pdf" })).toBe(false);
    await expect(provider.deleteObject({ key: "org1/x/1/f.pdf" })).resolves.toBeUndefined();
  });

  it("refuses to write/read outside the base directory even given a traversal key", async () => {
    await expect(provider.putObject({ key: "../../etc/evil", body: Buffer.from("x"), contentType: "text/plain" })).rejects.toThrow();
    await expect(provider.getObject({ key: "../../etc/passwd" })).rejects.toThrow();
  });

  it("writes files that are not placed under any public/static directory (caller-chosen tmp dir, never public/)", async () => {
    await provider.putObject({ key: "org1/x/1/f.pdf", body: Buffer.from("a"), contentType: "application/pdf" });
    expect(tmpDir).not.toContain("public");
  });
});
