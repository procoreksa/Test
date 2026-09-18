import { createHash } from "crypto";

/**
 * Base64 SHA-256 hash used to chain invoices together (each invoice stores
 * the previous invoice's hash as `previousInvoiceHash`, mirroring ZATCA's
 * PIH requirement). Real ZATCA compliance hashes the canonicalized UBL XML;
 * here we hash a stable JSON projection of the invoice, which is sufficient
 * to detect tampering/reordering within this system.
 */
export function hashInvoicePayload(payload: Record<string, unknown>): string {
  const canonical = JSON.stringify(payload, Object.keys(payload).sort());
  return createHash("sha256").update(canonical).digest("base64");
}

export const GENESIS_HASH = Buffer.from("0").toString("base64");
