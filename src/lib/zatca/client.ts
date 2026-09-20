/**
 * Extension point for real ZATCA Fatoora API integration.
 *
 * Going live requires, outside this codebase:
 *   1. Onboarding the taxpayer's "solution unit" (CSR generation, OTP from
 *      the ZATCA portal, exchanging the CSR for a compliance CSID).
 *   2. Signing each invoice's UBL XML (XAdES enveloped signature) with the
 *      CSID private key, embedding the cryptographic stamp + QR tags 6-9.
 *   3. Calling `/compliance/invoices` during onboarding, then
 *      `/invoices/clearance/single` (standard invoices, synchronous) or
 *      `/invoices/reporting/single` (simplified invoices, within 24h) per
 *      the Fatoora Simulation/Production base URL.
 *
 * None of that can be done safely without real ZATCA credentials, so this
 * client is a typed stub: it records submission attempts and always
 * returns NOT_SUBMITTED/PENDING so the rest of the app (statuses, retries)
 * has a real integration seam to plug into later.
 */

import { getLocale, getDictionary } from "@/lib/i18n";

export interface ZatcaSubmissionResult {
  status: "PENDING" | "CLEARED" | "REPORTED" | "REJECTED";
  message: string;
  raw?: unknown;
}

export async function submitToZatca(_signedXml: string): Promise<ZatcaSubmissionResult> {
  const t = getDictionary(await getLocale());
  const configured = Boolean(process.env.ZATCA_API_BASE_URL && process.env.ZATCA_ONBOARDING_OTP);

  if (!configured) {
    return { status: "PENDING", message: t.zatca.notConfigured };
  }

  // Real call would POST the signed XML/JSON to ZATCA's clearance or
  // reporting endpoint here, using the org's CSID for mutual TLS.
  return { status: "PENDING", message: t.zatca.pendingIntegration };
}
