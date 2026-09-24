import { describe, it, expect } from "vitest";
import { sanitizeFileName, safeContentDisposition } from "./filename";

describe("sanitizeFileName", () => {
  it("keeps an ordinary filename unchanged", () => {
    expect(sanitizeFileName("contract-2026.pdf")).toBe("contract-2026.pdf");
  });

  it("strips path traversal sequences and separators", () => {
    expect(sanitizeFileName("../../etc/passwd")).toBe("etc_passwd");
  });

  it("strips control characters including null bytes", () => {
    expect(sanitizeFileName("evil\u0000name.jpg")).toBe("evilname.jpg");
  });

  it("falls back to a generic name when input is empty after sanitizing", () => {
    expect(sanitizeFileName("../../")).toBe("file");
    expect(sanitizeFileName("")).toBe("file");
  });

  it("bounds excessive length while preserving a short extension", () => {
    const longName = "a".repeat(500) + ".pdf";
    const result = sanitizeFileName(longName);
    expect(result.length).toBeLessThanOrEqual(200);
    expect(result.endsWith(".pdf")).toBe(true);
  });

  it("does not allow a leading dot to hide the file / escape upward", () => {
    expect(sanitizeFileName("..hidden")).toBe("hidden");
  });
});

describe("safeContentDisposition", () => {
  it("builds a quoted attachment header with an ASCII fallback and UTF-8 filename*", () => {
    const header = safeContentDisposition("contract.pdf", "attachment");
    expect(header).toBe(`attachment; filename="contract.pdf"; filename*=UTF-8''contract.pdf`);
  });

  it("strips CRLF/control characters to prevent header injection", () => {
    const header = safeContentDisposition('evil"\r\nSet-Cookie: x=1', "attachment");
    expect(header).not.toMatch(/[\r\n]/);
    expect(header).not.toContain('"\r\n');
  });

  it("supports inline disposition for previewable types", () => {
    const header = safeContentDisposition("photo.jpg", "inline");
    expect(header.startsWith("inline;")).toBe(true);
  });

  it("percent-encodes non-ASCII (e.g. Arabic) filenames in the filename* extended form", () => {
    const header = safeContentDisposition("عقد.pdf", "attachment");
    expect(header).toContain("filename*=UTF-8''");
    expect(header).toContain(encodeURIComponent("عقد.pdf"));
  });
});
