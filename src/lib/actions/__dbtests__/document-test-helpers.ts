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

/**
 * Builds an error shaped like a real AWS SDK v3 / S3-compatible (R2)
 * rejection - `.name` set to the S3 error code and a `$metadata` object
 * carrying HTTP status/request ids, exactly the two things
 * extractStorageErrorMetadata() (src/lib/actions/documents.ts) reads. Used
 * to prove the diagnostic-logging path extracts and logs only this safe
 * metadata, never the error's own `.message` text (the literal production
 * incident: a raw "Access Denied" SDK message reaching the browser
 * unfiltered). Never used by production code - test-only.
 */
export function simulatedAccessDeniedError(): Error {
  const error = new Error("Access Denied");
  Object.assign(error, {
    name: "AccessDenied",
    $metadata: { httpStatusCode: 403, requestId: "test-request-id-0001", extendedRequestId: "test-extended-request-id-0001" },
  });
  return error;
}
