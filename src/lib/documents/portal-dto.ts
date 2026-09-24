/**
 * Minimized portal-safe Document DTOs (Steps 56/61) - the exact same shape
 * for Tenant and Owner portals (a "Tenant Document DTO" and "Owner Document
 * DTO" are structurally identical; only how they're resolved differs).
 * Deliberately excludes storageKey, checksum, uploader identity, internal
 * notes, historical versions, audit history, and internal DocumentLink
 * rows - a portal page/action must only ever construct this shape, never
 * pass through a raw Document/DocumentVersion record.
 */
export interface PortalDocumentDto {
  documentId: string;
  title: string;
  category: string;
  currentVersion: {
    fileName: string;
    mimeType: string;
    fileSize: number;
    uploadedAt: string; // ISO date - the version's createdAt, not "who" uploaded it
  } | null;
  canDownload: boolean;
}

export function toPortalDocumentDto(input: {
  id: string;
  title: string;
  category: string;
  status: "ACTIVE" | "ARCHIVED";
  currentVersion: { fileName: string; mimeType: string; fileSize: number; createdAt: Date } | null;
}): PortalDocumentDto {
  return {
    documentId: input.id,
    title: input.title,
    category: input.category,
    currentVersion: input.currentVersion
      ? {
          fileName: input.currentVersion.fileName,
          mimeType: input.currentVersion.mimeType,
          fileSize: input.currentVersion.fileSize,
          uploadedAt: input.currentVersion.createdAt.toISOString(),
        }
      : null,
    canDownload: input.status === "ACTIVE" && input.currentVersion !== null,
  };
}
