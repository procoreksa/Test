/**
 * ZATCA (Saudi e-invoicing) TLV QR code payload builder — Phase 1 fields.
 *
 * Phase 1 ("Generation") requires a Base64 TLV payload with 5 tags:
 *   1 seller name, 2 VAT number, 3 timestamp (ISO 8601), 4 invoice total
 *   (incl. VAT), 5 VAT total.
 *
 * Phase 2 ("Integration") additionally requires tags 6-9 (invoice hash,
 * ECDSA signature, public key, certificate signature) produced by signing
 * the invoice XML with a CSID certificate issued by ZATCA after onboarding
 * a taxpayer's solution unit. That cryptographic step needs a real ZATCA
 * production/sandbox certificate and is out of scope for this repository —
 * see `submitToZatca()` in `client.ts` for the extension point.
 */

interface ZatcaQrFields {
  sellerName: string;
  vatNumber: string;
  timestampIso: string;
  invoiceTotal: string;
  vatTotal: string;
}

function encodeTlvField(tag: number, value: string): Buffer {
  const valueBuffer = Buffer.from(value, "utf-8");
  const header = Buffer.from([tag, valueBuffer.length]);
  return Buffer.concat([header, valueBuffer]);
}

export function buildZatcaQrBase64(fields: ZatcaQrFields): string {
  const tlvBuffer = Buffer.concat([
    encodeTlvField(1, fields.sellerName),
    encodeTlvField(2, fields.vatNumber),
    encodeTlvField(3, fields.timestampIso),
    encodeTlvField(4, fields.invoiceTotal),
    encodeTlvField(5, fields.vatTotal),
  ]);
  return tlvBuffer.toString("base64");
}
