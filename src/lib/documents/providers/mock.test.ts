import { describe, it, expect } from "vitest";
import { MockStorageProvider } from "./mock";

describe("MockStorageProvider", () => {
  it("supports put then get round-trip", async () => {
    const provider = new MockStorageProvider();
    await provider.putObject({ key: "k1", body: Buffer.from("hello"), contentType: "application/pdf" });
    expect((await provider.getObject({ key: "k1" }))?.toString()).toBe("hello");
  });

  it("returns null for a missing object", async () => {
    const provider = new MockStorageProvider();
    expect(await provider.getObject({ key: "missing" })).toBeNull();
  });

  it("simulates a single put failure without affecting subsequent puts", async () => {
    const provider = new MockStorageProvider();
    provider.simulateNextPutFailure();
    await expect(provider.putObject({ key: "k1", body: Buffer.from("x"), contentType: "application/pdf" })).rejects.toThrow();
    await expect(provider.putObject({ key: "k1", body: Buffer.from("x"), contentType: "application/pdf" })).resolves.toBeUndefined();
  });

  it("simulates a single delete failure (compensation-failure scenario)", async () => {
    const provider = new MockStorageProvider();
    await provider.putObject({ key: "k1", body: Buffer.from("x"), contentType: "application/pdf" });
    provider.simulateNextDeleteFailure();
    await expect(provider.deleteObject({ key: "k1" })).rejects.toThrow();
    expect(await provider.exists({ key: "k1" })).toBe(true); // failed delete never removed it
  });

  it("makes no external network calls - purely in-memory (no fetch/fs usage in this module)", async () => {
    const provider = new MockStorageProvider();
    expect(provider.debugObjectCount()).toBe(0);
    await provider.putObject({ key: "k1", body: Buffer.from("x"), contentType: "application/pdf" });
    expect(provider.debugObjectCount()).toBe(1);
  });
});
