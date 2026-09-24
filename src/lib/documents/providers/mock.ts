import type { DocumentStorageProvider } from "./types";

/**
 * Deterministic in-memory storage adapter for tests (Step 88) - zero
 * filesystem/network access. Supports every scenario the mandatory
 * storage-failure tests need: normal put/get, a missing object, a
 * `failNextPut`/`failNextDelete` toggle to simulate a storage-write or
 * delete-compensation failure, and metadata retrieval via `exists()`.
 */
export class MockStorageProvider implements DocumentStorageProvider {
  readonly kind = "LOCAL_DEV" as const;
  readonly isConfigured = true;

  private readonly objects = new Map<string, { body: Buffer; contentType: string }>();
  private failNextPut = false;
  private failNextDelete = false;

  /** Test hook: makes the next putObject() call reject, simulating a storage-write failure (Steps 28-29/78-80). */
  simulateNextPutFailure(): void {
    this.failNextPut = true;
  }

  /** Test hook: makes the next deleteObject() call reject, simulating a failed compensating delete. */
  simulateNextDeleteFailure(): void {
    this.failNextDelete = true;
  }

  async putObject(params: { key: string; body: Buffer; contentType: string }): Promise<void> {
    if (this.failNextPut) {
      this.failNextPut = false;
      throw new Error("Simulated storage write failure");
    }
    this.objects.set(params.key, { body: Buffer.from(params.body), contentType: params.contentType });
  }

  async getObject(params: { key: string }): Promise<Buffer | null> {
    const object = this.objects.get(params.key);
    return object ? Buffer.from(object.body) : null;
  }

  async exists(params: { key: string }): Promise<boolean> {
    return this.objects.has(params.key);
  }

  async deleteObject(params: { key: string }): Promise<void> {
    if (this.failNextDelete) {
      this.failNextDelete = false;
      throw new Error("Simulated storage delete failure");
    }
    this.objects.delete(params.key);
  }

  /** Test-only introspection - never used by production code paths. */
  debugObjectCount(): number {
    return this.objects.size;
  }
}
