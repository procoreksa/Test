import { describe, it, expect } from "vitest";
import { toPortalDocumentDto } from "./portal-dto";

describe("toPortalDocumentDto", () => {
  it("includes only the minimized safe fields", () => {
    const dto = toPortalDocumentDto({
      id: "doc_1",
      title: "Lease Contract",
      category: "CONTRACT",
      status: "ACTIVE",
      currentVersion: { fileName: "lease.pdf", mimeType: "application/pdf", fileSize: 1024, createdAt: new Date("2026-01-01T00:00:00Z") },
    });
    expect(dto).toEqual({
      documentId: "doc_1",
      title: "Lease Contract",
      category: "CONTRACT",
      currentVersion: { fileName: "lease.pdf", mimeType: "application/pdf", fileSize: 1024, uploadedAt: "2026-01-01T00:00:00.000Z" },
      canDownload: true,
    });
  });

  it("never leaks storageKey/checksum/uploader identity - not present on the output type at all", () => {
    const dto = toPortalDocumentDto({
      id: "doc_1",
      title: "t",
      category: "CONTRACT",
      status: "ACTIVE",
      currentVersion: { fileName: "f.pdf", mimeType: "application/pdf", fileSize: 1, createdAt: new Date() },
    });
    expect(Object.keys(dto)).toEqual(["documentId", "title", "category", "currentVersion", "canDownload"]);
    expect(Object.keys(dto.currentVersion!)).toEqual(["fileName", "mimeType", "fileSize", "uploadedAt"]);
  });

  it("marks canDownload false when archived even if a current version exists", () => {
    const dto = toPortalDocumentDto({
      id: "doc_1",
      title: "t",
      category: "CONTRACT",
      status: "ARCHIVED",
      currentVersion: { fileName: "f.pdf", mimeType: "application/pdf", fileSize: 1, createdAt: new Date() },
    });
    expect(dto.canDownload).toBe(false);
  });

  it("marks canDownload false and currentVersion null when there is no current version", () => {
    const dto = toPortalDocumentDto({ id: "doc_1", title: "t", category: "CONTRACT", status: "ACTIVE", currentVersion: null });
    expect(dto.currentVersion).toBeNull();
    expect(dto.canDownload).toBe(false);
  });
});
