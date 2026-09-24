import { createHash } from "crypto";

/**
 * SHA-256 integrity checksum (Step 25) - for detecting corruption/tampering
 * only. Never used for authorization or deduplication-as-access-control:
 * two organizations' documents can share an identical checksum with zero
 * bearing on who may access either one.
 */
export function computeSha256(buffer: Buffer): string {
  return createHash("sha256").update(buffer).digest("hex");
}
