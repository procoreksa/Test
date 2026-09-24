/**
 * Shared fixtures for Document Management's real-DB test suite
 * (docs/DOCUMENT-MANAGEMENT.md). Mirrors tenant-portal-test-helpers.ts's/
 * owner-portal-test-helpers.ts's own conventions.
 */
import { MockStorageProvider } from "@/lib/documents/providers/mock";

export const VALID_PDF_BYTES = Buffer.concat([Buffer.from("%PDF-1.4\n"), Buffer.alloc(32)]);

export function pdfFile(name = "document.pdf"): File {
  return new File([VALID_PDF_BYTES], name, { type: "application/pdf" });
}

export function documentFormData(fields: Record<string, string>, file?: File): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  if (file) fd.set("file", file);
  return fd;
}

export function newMockStorageProvider(): MockStorageProvider {
  return new MockStorageProvider();
}
