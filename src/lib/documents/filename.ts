/**
 * Filename sanitization (Step 21). Applied to the user-supplied display
 * filename before it is ever persisted to DocumentVersion.fileName or
 * echoed back in a Content-Disposition header (Step 37) - never to the
 * storage key itself, which is a wholly separate, randomly generated value
 * (see storage-key.ts) that never incorporates user input at all.
 */

const MAX_FILENAME_LENGTH = 200;
const FALLBACK_NAME = "file";

/**
 * Strips path separators/traversal sequences, control characters (incl.
 * null bytes), and collapses whitespace, then bounds the result length.
 * Never throws - always returns a safe, non-empty string, even for
 * pathological input like "../../etc/passwd\u0000.jpg".
 */
export function sanitizeFileName(rawName: string): string {
  let name = rawName.normalize("NFC");

  // Path traversal / directory components - split on any separator and
  // drop "." / ".." / empty segments entirely (never converted to a
  // stray placeholder character), then rejoin what remains with "_". A
  // purely traversal-shaped input (e.g. "../../") collapses to "".
  name = name
    .split(/[/\\]+/)
    .filter((segment) => segment !== "" && segment !== "." && segment !== "..")
    .join("_");

  // Control characters (0x00-0x1F, 0x7F) including null bytes.
  name = name.replace(/[\x00-\x1f\x7f]/g, "");

  name = name.replace(/\.\.+/g, "."); // collapse any remaining ".." runs within a segment
  name = name.trim().replace(/^\.+/, ""); // no leading dots (hidden files / "..")
  name = name.replace(/\s+/g, " ").trim();

  if (name.length === 0) return FALLBACK_NAME;
  if (name.length > MAX_FILENAME_LENGTH) {
    const ext = name.includes(".") ? name.slice(name.lastIndexOf(".")) : "";
    const extBounded = ext.length <= 20 ? ext : "";
    const baseLength = MAX_FILENAME_LENGTH - extBounded.length;
    name = name.slice(0, Math.max(baseLength, 1)) + extBounded;
  }
  return name;
}

/**
 * Renders a filename safely inside a `Content-Disposition` header value
 * (Step 37) - quotes it and escapes/strips characters that could break out
 * of the quoted-string or inject a CRLF header-splitting sequence. Callers
 * should sanitize with sanitizeFileName() first; this defends the header
 * itself regardless.
 */
export function safeContentDisposition(fileName: string, disposition: "inline" | "attachment"): string {
  const safe = fileName.replace(/[\r\n\x00-\x1f\x7f"]/g, "").slice(0, MAX_FILENAME_LENGTH);
  const finalName = safe.length > 0 ? safe : FALLBACK_NAME;
  const asciiFallback = finalName.replace(/[^\x20-\x7e]/g, "_");
  const encoded = encodeURIComponent(finalName);
  return `${disposition}; filename="${asciiFallback}"; filename*=UTF-8''${encoded}`;
}
