import type { StorageProvider } from "@prisma/client";
import type { DocumentStorageProvider } from "./types";
import { LocalDevStorageProvider } from "./local-dev";
import { S3CompatibleStorageProvider } from "./s3-compatible";

const localDevProvider = new LocalDevStorageProvider();
const s3CompatibleProvider = new S3CompatibleStorageProvider();

/**
 * The only place in the codebase that decides which concrete adapter a new
 * upload targets (Step 16/18): S3_COMPATIBLE when its environment variables
 * are all present, LOCAL_DEV otherwise - never chosen by a caller, and
 * never something a business action decides for itself. Existing
 * DocumentVersion rows keep whatever `storageProvider` they were created
 * with (never silently migrated), so getStorageProviderByKind() is what
 * every read path (download route) must use to resolve the adapter for an
 * already-stored version.
 */
export function getDefaultStorageProviderKind(): StorageProvider {
  return s3CompatibleProvider.isConfigured ? "S3_COMPATIBLE" : "LOCAL_DEV";
}

export function getStorageProviderByKind(kind: StorageProvider): DocumentStorageProvider {
  switch (kind) {
    case "LOCAL_DEV":
      return localDevProvider;
    case "S3_COMPATIBLE":
      return s3CompatibleProvider;
    default: {
      const exhaustiveCheck: never = kind;
      throw new Error(`Unknown storage provider: ${exhaustiveCheck}`);
    }
  }
}

export function getStorageProvider(): DocumentStorageProvider {
  return getStorageProviderByKind(getDefaultStorageProviderKind());
}
