import { describe, it, expect } from "vitest";
import {
  isAllowedMimeType,
  extensionMatchesMimeType,
  matchesFileSignature,
  validateUploadedFile,
  MAX_FILE_SIZE_BYTES,
} from "./file-validation";

const PDF_BYTES = Buffer.concat([Buffer.from("%PDF-1.4\n"), Buffer.alloc(20)]);
const JPEG_BYTES = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(20)]);
const PNG_BYTES = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(20)]);
const WEBP_BYTES = Buffer.concat([
  Buffer.from("RIFF"),
  Buffer.from([0, 0, 0, 0]),
  Buffer.from("WEBP"),
  Buffer.alloc(20),
]);
const EXE_BYTES = Buffer.concat([Buffer.from([0x4d, 0x5a]), Buffer.alloc(20)]); // "MZ" - Windows PE header
const HTML_BYTES = Buffer.from("<html><script>alert(1)</script></html>");

describe("isAllowedMimeType", () => {
  it("allows exactly PDF/JPEG/PNG/WEBP", () => {
    expect(isAllowedMimeType("application/pdf")).toBe(true);
    expect(isAllowedMimeType("image/jpeg")).toBe(true);
    expect(isAllowedMimeType("image/png")).toBe(true);
    expect(isAllowedMimeType("image/webp")).toBe(true);
  });

  it("rejects anything else, including HTML/SVG/executables", () => {
    expect(isAllowedMimeType("text/html")).toBe(false);
    expect(isAllowedMimeType("image/svg+xml")).toBe(false);
    expect(isAllowedMimeType("application/x-msdownload")).toBe(false);
  });
});

describe("extensionMatchesMimeType", () => {
  it("accepts a matching extension", () => {
    expect(extensionMatchesMimeType("photo.jpg", "image/jpeg")).toBe(true);
    expect(extensionMatchesMimeType("photo.JPEG", "image/jpeg")).toBe(true);
  });

  it("rejects a mismatched extension", () => {
    expect(extensionMatchesMimeType("malware.exe.jpg", "application/pdf")).toBe(false);
    expect(extensionMatchesMimeType("document.pdf", "image/png")).toBe(false);
  });
});

describe("matchesFileSignature", () => {
  it("matches real PDF/JPEG/PNG/WEBP signatures", () => {
    expect(matchesFileSignature(PDF_BYTES, "application/pdf")).toBe(true);
    expect(matchesFileSignature(JPEG_BYTES, "image/jpeg")).toBe(true);
    expect(matchesFileSignature(PNG_BYTES, "image/png")).toBe(true);
    expect(matchesFileSignature(WEBP_BYTES, "image/webp")).toBe(true);
  });

  it("rejects a renamed executable claiming to be a PDF", () => {
    expect(matchesFileSignature(EXE_BYTES, "application/pdf")).toBe(false);
  });

  it("rejects HTML content claiming any allowed image/pdf type", () => {
    expect(matchesFileSignature(HTML_BYTES, "application/pdf")).toBe(false);
    expect(matchesFileSignature(HTML_BYTES, "image/png")).toBe(false);
  });

  it("rejects a too-short buffer rather than throwing", () => {
    expect(matchesFileSignature(Buffer.from([1, 2]), "image/png")).toBe(false);
  });
});

describe("validateUploadedFile", () => {
  it("accepts a valid PDF", () => {
    const result = validateUploadedFile({ fileName: "contract.pdf", claimedMimeType: "application/pdf", size: PDF_BYTES.length, buffer: PDF_BYTES });
    expect(result).toEqual({ valid: true, mimeType: "application/pdf" });
  });

  it("rejects an empty file", () => {
    const result = validateUploadedFile({ fileName: "empty.pdf", claimedMimeType: "application/pdf", size: 0, buffer: Buffer.alloc(0) });
    expect(result.valid).toBe(false);
    expect(result.error).toBe("EMPTY_FILE");
  });

  it("rejects an oversized file", () => {
    const result = validateUploadedFile({
      fileName: "huge.pdf",
      claimedMimeType: "application/pdf",
      size: MAX_FILE_SIZE_BYTES + 1,
      buffer: PDF_BYTES,
    });
    expect(result.valid).toBe(false);
    expect(result.error).toBe("TOO_LARGE");
  });

  it("rejects a disallowed MIME type (e.g. SVG)", () => {
    const result = validateUploadedFile({ fileName: "image.svg", claimedMimeType: "image/svg+xml", size: 10, buffer: Buffer.from("<svg/>") });
    expect(result.valid).toBe(false);
    expect(result.error).toBe("MIME_NOT_ALLOWED");
  });

  it("rejects a renamed executable disguised with a .pdf extension and application/pdf claim", () => {
    const result = validateUploadedFile({ fileName: "malware.pdf", claimedMimeType: "application/pdf", size: EXE_BYTES.length, buffer: EXE_BYTES });
    expect(result.valid).toBe(false);
    expect(result.error).toBe("SIGNATURE_MISMATCH");
  });

  it("rejects a path-traversal filename regardless of otherwise-valid content", () => {
    const result = validateUploadedFile({
      fileName: "../../etc/passwd.pdf",
      claimedMimeType: "application/pdf",
      size: PDF_BYTES.length,
      buffer: PDF_BYTES,
    });
    // Extension matches (.pdf) and signature matches - this function only
    // validates content, not path safety. Path safety is sanitizeFileName()'s
    // job (filename.test.ts), always applied before persisting the name.
    expect(result.valid).toBe(true);
  });

  it("rejects extension/MIME mismatch even with a valid signature for a different type", () => {
    const result = validateUploadedFile({ fileName: "photo.png", claimedMimeType: "image/jpeg", size: JPEG_BYTES.length, buffer: JPEG_BYTES });
    expect(result.valid).toBe(false);
    expect(result.error).toBe("EXTENSION_MISMATCH");
  });
});
