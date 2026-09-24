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
 *
 * Hardening (Prompt 23 Step 4, Critical Rule 3 - fail closed): in
 * production this NEVER silently falls back to LOCAL_DEV. Defense in
 * depth alongside src/instrumentation.ts's own startup check (Step 3) -
 * that check already stops the server from starting at all with this
 * misconfiguration, but a new upload path calling this function directly
 * (e.g. under a test harness that bypasses instrumentation, or a future
 * refactor) must independently refuse to write a real production
 * document to a non-durable local filesystem rather than silently
 * "working" against it.
 */
export function getDefaultStorageProviderKind(): StorageProvider {
  if (s3CompatibleProvider.isConfigured) return "S3_COMPATIBLE";
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "Refusing to use LOCAL_DEV document storage in production - configure all five DOCUMENT_S3_* environment variables. See docs/PRODUCTION-DEPLOYMENT.md, \"Storage\"."
    );
  }
  return "LOCAL_DEV";
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

/**
 * Observability-only variant of getDefaultStorageProviderKind() that never
 * throws (Prompt 23 - protected operational health endpoint,
 * /api/ops/health). Reporting "storage is misconfigured" is exactly what
 * that endpoint exists to surface to an operator - it must not itself
 * crash because production storage happens to be misconfigured. Never
 * used by any actual upload/download code path, only by the health route.
 */
export function getDefaultStorageProviderKindSafe(): StorageProvider | "MISCONFIGURED_LOCAL_DEV_IN_PRODUCTION" {
  if (s3CompatibleProvider.isConfigured) return "S3_COMPATIBLE";
  if (process.env.NODE_ENV === "production") return "MISCONFIGURED_LOCAL_DEV_IN_PRODUCTION";
  return "LOCAL_DEV";
}
