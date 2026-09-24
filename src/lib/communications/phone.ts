import { normalizeSaudiMobile } from "@/lib/crm/phone";

/**
 * E.164 formatter for the WhatsApp provider adapter. Deliberately reuses
 * normalizeSaudiMobile()'s own Saudi-detection logic rather than building a
 * second, conflicting normalization scheme - but returns a "+"-prefixed
 * E.164 string, since normalizeSaudiMobile()'s own digits-only output is
 * intentionally scoped to CRM duplicate-matching, not provider-facing
 * dialing (see that function's own doc comment).
 */
export function toE164(rawPhone: string): string {
  const canonical = normalizeSaudiMobile(rawPhone);
  return `+${canonical}`;
}
