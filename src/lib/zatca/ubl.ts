/**
 * Minimal UBL 2.1 tax invoice XML builder, structured to match ZATCA's
 * required elements (Invoice/UUID, InvoiceTypeCode, supplier/customer
 * parties, tax totals, invoice lines). This produces a well-formed,
 * human/machine-readable export of the invoice for bookkeeping and as a
 * starting point for real ZATCA integration.
 *
 * It intentionally does NOT include `<ext:UBLExtensions>` with the XAdES
 * digital signature, QR-in-signature tag, or the cryptographic stamp —
 * those require signing with a CSID certificate issued by ZATCA during
 * taxpayer onboarding (see `client.ts`). Submitting this XML as-is to
 * ZATCA's Fatoora API will not pass validation; a compliant solution unit
 * must add the signature envelope before calling `/compliance` or
 * `/invoices/reporting`.
 */

export interface UblInvoiceInput {
  uuid: string;
  invoiceNumber: string;
  icv: number;
  documentTypeCode: "388" | "381" | "383"; // tax invoice / credit note / debit note
  isSimplified: boolean;
  issueDateIso: string;
  currency: string;
  seller: {
    name: string;
    vatNumber: string;
    street?: string | null;
    city?: string | null;
    district?: string | null;
    buildingNumber?: string | null;
    postalCode?: string | null;
    country: string;
  };
  buyer: {
    name: string;
    vatNumber?: string | null;
    idType?: string | null;
    idNumber?: string | null;
  };
  lines: Array<{
    id: number;
    description: string;
    quantity: number;
    unitPrice: number;
    vatRate: number;
    vatAmount: number;
    lineTotal: number;
    taxableAmount: number;
  }>;
  subtotal: number;
  vatAmount: number;
  totalAmount: number;
  previousInvoiceHash: string;
}

function xmlEscape(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export function buildUblInvoiceXml(input: UblInvoiceInput): string {
  const invoiceTypeName = input.isSimplified ? "0200000" : "0100000";

  const lines = input.lines
    .map(
      (line) => `
  <cac:InvoiceLine>
    <cbc:ID>${line.id}</cbc:ID>
    <cbc:InvoicedQuantity unitCode="PCE">${line.quantity}</cbc:InvoicedQuantity>
    <cbc:LineExtensionAmount currencyID="${input.currency}">${line.taxableAmount.toFixed(2)}</cbc:LineExtensionAmount>
    <cac:TaxTotal>
      <cbc:TaxAmount currencyID="${input.currency}">${line.vatAmount.toFixed(2)}</cbc:TaxAmount>
      <cbc:RoundingAmount currencyID="${input.currency}">${line.lineTotal.toFixed(2)}</cbc:RoundingAmount>
    </cac:TaxTotal>
    <cac:Item>
      <cbc:Name>${xmlEscape(line.description)}</cbc:Name>
      <cac:ClassifiedTaxCategory>
        <cbc:ID>S</cbc:ID>
        <cbc:Percent>${line.vatRate.toFixed(2)}</cbc:Percent>
        <cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme>
      </cac:ClassifiedTaxCategory>
    </cac:Item>
    <cac:Price>
      <cbc:PriceAmount currencyID="${input.currency}">${line.unitPrice.toFixed(2)}</cbc:PriceAmount>
    </cac:Price>
  </cac:InvoiceLine>`
    )
    .join("");

  return `<?xml version="1.0" encoding="UTF-8"?>
<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"
         xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"
         xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">
  <cbc:ProfileID>reporting:1.0</cbc:ProfileID>
  <cbc:ID>${xmlEscape(input.invoiceNumber)}</cbc:ID>
  <cbc:UUID>${input.uuid}</cbc:UUID>
  <cbc:IssueDate>${input.issueDateIso.slice(0, 10)}</cbc:IssueDate>
  <cbc:IssueTime>${input.issueDateIso.slice(11, 19)}</cbc:IssueTime>
  <cbc:InvoiceTypeCode name="${invoiceTypeName}">${input.documentTypeCode}</cbc:InvoiceTypeCode>
  <cbc:DocumentCurrencyCode>${input.currency}</cbc:DocumentCurrencyCode>
  <cbc:TaxCurrencyCode>${input.currency}</cbc:TaxCurrencyCode>
  <cac:AdditionalDocumentReference>
    <cbc:ID>ICV</cbc:ID>
    <cbc:UUID>${input.icv}</cbc:UUID>
  </cac:AdditionalDocumentReference>
  <cac:AdditionalDocumentReference>
    <cbc:ID>PIH</cbc:ID>
    <cac:Attachment>
      <cbc:EmbeddedDocumentBinaryObject mimeCode="text/plain">${input.previousInvoiceHash}</cbc:EmbeddedDocumentBinaryObject>
    </cac:Attachment>
  </cac:AdditionalDocumentReference>
  <cac:AccountingSupplierParty>
    <cac:Party>
      <cac:PostalAddress>
        <cbc:StreetName>${xmlEscape(input.seller.street ?? "")}</cbc:StreetName>
        <cbc:BuildingNumber>${xmlEscape(input.seller.buildingNumber ?? "")}</cbc:BuildingNumber>
        <cbc:CitySubdivisionName>${xmlEscape(input.seller.district ?? "")}</cbc:CitySubdivisionName>
        <cbc:CityName>${xmlEscape(input.seller.city ?? "")}</cbc:CityName>
        <cbc:PostalZone>${xmlEscape(input.seller.postalCode ?? "")}</cbc:PostalZone>
        <cac:Country><cbc:IdentificationCode>${input.seller.country}</cbc:IdentificationCode></cac:Country>
      </cac:PostalAddress>
      <cac:PartyTaxScheme>
        <cbc:CompanyID>${xmlEscape(input.seller.vatNumber)}</cbc:CompanyID>
        <cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme>
      </cac:PartyTaxScheme>
      <cac:PartyLegalEntity>
        <cbc:RegistrationName>${xmlEscape(input.seller.name)}</cbc:RegistrationName>
      </cac:PartyLegalEntity>
    </cac:Party>
  </cac:AccountingSupplierParty>
  <cac:AccountingCustomerParty>
    <cac:Party>
      ${
        input.buyer.vatNumber
          ? `<cac:PartyTaxScheme><cbc:CompanyID>${xmlEscape(
              input.buyer.vatNumber
            )}</cbc:CompanyID><cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme></cac:PartyTaxScheme>`
          : ""
      }
      <cac:PartyLegalEntity>
        <cbc:RegistrationName>${xmlEscape(input.buyer.name)}</cbc:RegistrationName>
      </cac:PartyLegalEntity>
    </cac:Party>
  </cac:AccountingCustomerParty>
  <cac:TaxTotal>
    <cbc:TaxAmount currencyID="${input.currency}">${input.vatAmount.toFixed(2)}</cbc:TaxAmount>
  </cac:TaxTotal>
  <cac:LegalMonetaryTotal>
    <cbc:LineExtensionAmount currencyID="${input.currency}">${input.subtotal.toFixed(2)}</cbc:LineExtensionAmount>
    <cbc:TaxExclusiveAmount currencyID="${input.currency}">${input.subtotal.toFixed(2)}</cbc:TaxExclusiveAmount>
    <cbc:TaxInclusiveAmount currencyID="${input.currency}">${input.totalAmount.toFixed(2)}</cbc:TaxInclusiveAmount>
    <cbc:PayableAmount currencyID="${input.currency}">${input.totalAmount.toFixed(2)}</cbc:PayableAmount>
  </cac:LegalMonetaryTotal>${lines}
</Invoice>`;
}
