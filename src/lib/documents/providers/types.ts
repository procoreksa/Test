import type { StorageProvider } from "@prisma/client";

/**
 * The storage boundary (Critical Principle 2 / Step 16). Business actions
 * (src/lib/actions/documents.ts) NEVER touch a filesystem path or a vendor
 * SDK directly - only through a DocumentStorageProvider, resolved via
 * getStorageProvider() (./factory.ts). Adding a real production adapter
 * later means implementing this interface and wiring it into the factory;
 * no other file in the Document Management module changes.
 *
 * `getObject`/`exists`/`deleteObject` are keyed only by the opaque
 * `storageKey` already recorded on a DocumentVersion - never anything
 * derived from a request path or user input (Critical Principle 3/4: the
 * key is never itself treated as authorization, and is only ever reached
 * after the caller has already re-authorized the principal).
 */
export interface DocumentStorageProvider {
  readonly kind: StorageProvider;
  /** Whether this adapter is actually usable right now (LOCAL_DEV: always; S3_COMPATIBLE: only once its env vars are all present - Step 18). */
  readonly isConfigured: boolean;

  putObject(params: { key: string; body: Buffer; contentType: string }): Promise<void>;
  /** Returns null if the object does not exist (never throws for a missing key - callers decide how to handle that, e.g. Step 81's integrity-problem path). */
  getObject(params: { key: string }): Promise<Buffer | null>;
  exists(params: { key: string }): Promise<boolean>;
  /** Best-effort - used for orphan-object cleanup on a failed finalize (Step 29). Never throws; a delete of an already-missing object is a no-op success. */
  deleteObject(params: { key: string }): Promise<void>;
}

export class StorageProviderNotConfiguredError extends Error {
  constructor(providerKind: string) {
    super(`Storage provider "${providerKind}" is not configured in this environment.`);
    this.name = "StorageProviderNotConfiguredError";
  }
}
