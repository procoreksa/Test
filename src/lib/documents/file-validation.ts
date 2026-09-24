/**
 * V1 file-type allow-list, size limit, and magic-byte signature validation
 * (Steps 22-24). Pure functions operating on an in-memory Buffer - never
 * trusts the client-supplied MIME type or file extension alone (a renamed
 * .exe claiming "application/pdf" must be rejected), so every accepted
 * upload is verified against its actual byte signature here.
 */

export const ALLOWED_MIME_TYPES = ["application/pdf", "image/jpeg", "image/png", "image/webp"] as const;
export type AllowedMimeType = (typeof ALLOWED_MIME_TYPES)[number];

export const ALLOWED_EXTENSIONS: Record<AllowedMimeType, readonly string[]> = {
  "application/pdf": [".pdf"],
  "image/jpeg": [".jpg", ".jpeg"],
  "image/png": [".png"],
  "image/webp": [".webp"],
};

/** 15MB - within the 10-20MB range suggested by Step 24, centralized here rather than duplicated per upload site. */
export const MAX_FILE_SIZE_BYTES = 15 * 1024 * 1024;

export function isAllowedMimeType(mimeType: string): mimeType is AllowedMimeType {
  return (ALLOWED_MIME_TYPES as readonly string[]).includes(mimeType);
}

export function extensionMatchesMimeType(fileName: string, mimeType: AllowedMimeType): boolean {
  const lower = fileName.toLowerCase();
  return ALLOWED_EXTENSIONS[mimeType].some((ext) => lower.endsWith(ext));
}

/**
 * Checks the file's actual leading bytes against the signature expected for
 * `mimeType` (Step 23). WEBP requires checking two separate offsets (the
 * "RIFF" container header and the "WEBP" fourcc at byte 8) since a generic
 * RIFF file could otherwise be misidentified.
 */
export function matchesFileSignature(buffer: Buffer, mimeType: AllowedMimeType): boolean {
  if (buffer.length < 12) return false;
  switch (mimeType) {
    case "application/pdf":
      return buffer.subarray(0, 4).toString("latin1") === "%PDF";
    case "image/jpeg":
      return buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
    case "image/png":
      return buffer
        .subarray(0, 8)
        .equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
    case "image/webp":
      return buffer.subarray(0, 4).toString("latin1") === "RIFF" && buffer.subarray(8, 12).toString("latin1") === "WEBP";
  }
}

export interface FileValidationInput {
  fileName: string;
  claimedMimeType: string;
  size: number;
  buffer: Buffer;
}

export type FileValidationError =
  | "MIME_NOT_ALLOWED"
  | "EXTENSION_MISMATCH"
  | "SIGNATURE_MISMATCH"
  | "TOO_LARGE"
  | "EMPTY_FILE";

export interface FileValidationResult {
  valid: boolean;
  error?: FileValidationError;
  mimeType?: AllowedMimeType;
}

/**
 * The single validation choke point every upload/version action must call
 * (Step 27's "validate file" step) - checks size, MIME allow-list,
 * extension-vs-MIME consistency, and the actual byte signature together,
 * so no caller can accidentally skip one of the checks.
 */
export function validateUploadedFile(input: FileValidationInput): FileValidationResult {
  if (input.size <= 0 || input.buffer.length === 0) return { valid: false, error: "EMPTY_FILE" };
  if (input.size > MAX_FILE_SIZE_BYTES) return { valid: false, error: "TOO_LARGE" };
  if (!isAllowedMimeType(input.claimedMimeType)) return { valid: false, error: "MIME_NOT_ALLOWED" };
  if (!extensionMatchesMimeType(input.fileName, input.claimedMimeType)) return { valid: false, error: "EXTENSION_MISMATCH" };
  if (!matchesFileSignature(input.buffer, input.claimedMimeType)) return { valid: false, error: "SIGNATURE_MISMATCH" };
  return { valid: true, mimeType: input.claimedMimeType };
}
