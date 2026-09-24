import { randomBytes } from "crypto";

/**
 * Generates the opaque, unpredictable storage key every DocumentVersion is
 * addressed by (Step 20). Deliberately never derived from the user-supplied
 * filename (only its extension is reused, purely for a human-friendly key
 * suffix - never for path construction from raw input) and never
 * sequential/guessable. Org-scoped prefix (Step 4 of
 * docs/STORAGE-ARCHITECTURE.md) gives structural cross-tenant isolation at
 * the storage layer itself, even before any application-level check runs -
 * defense in depth, never a substitute for the real authorization check on
 * every download (Critical Principle 3).
 */
export function generateStorageKey(params: {
  organizationId: string;
  entityType: string;
  entityId: string;
  fileExtension: string;
}): string {
  const random = randomBytes(16).toString("hex");
  const ext = normalizeExtension(params.fileExtension);
  return `${params.organizationId}/${params.entityType.toLowerCase()}/${params.entityId}/${random}${ext}`;
}

function normalizeExtension(ext: string): string {
  const trimmed = ext.trim().toLowerCase();
  // Keep only the trailing alphanumeric run - the actual extension text,
  // never a path, never a dot-run - so a malicious value like
  // "/../../evil.sh" reduces to just ".sh", not a traversal sequence.
  const match = trimmed.match(/[a-z0-9]+$/);
  if (!match) return "";
  return `.${match[0].slice(0, 10)}`;
}

export function extensionForMimeType(mimeType: string): string {
  switch (mimeType) {
    case "application/pdf":
      return ".pdf";
    case "image/jpeg":
      return ".jpg";
    case "image/png":
      return ".png";
    case "image/webp":
      return ".webp";
    default:
      return "";
  }
}
