/**
 * Small, CRM-scoped phone-matching utility (see docs/CRM-LEADS.md, "Phone
 * normalization"). Deliberately narrow: recognizes the handful of common
 * Saudi/GCC mobile formats a leasing office actually receives, not a
 * general international phone-number library. Does NOT touch
 * Renter.phone/Owner.mobile or any other existing phone field anywhere
 * else in the app - this is CRM duplicate-detection input only.
 */

const SAUDI_COUNTRY_CODE = "966";

/**
 * Normalizes a Saudi/GCC mobile number to a canonical digits-only form
 * (country code + subscriber number, no leading "+" or "0"), so
 * "0501234567", "+966501234567", and "966501234567" all normalize to
 * "966501234567". Numbers that don't look Saudi are returned as
 * digits-only (spaces/dashes stripped) without a country code guess -
 * still useful for exact-match duplicate detection, just not
 * cross-format-normalized.
 */
export function normalizeSaudiMobile(raw: string): string {
  const digitsOnly = raw.replace(/[^\d+]/g, "");
  const stripped = digitsOnly.replace(/^\+/, "");

  if (stripped.startsWith(SAUDI_COUNTRY_CODE)) {
    return stripped;
  }
  if (stripped.startsWith("0") && stripped.length === 10) {
    // Local format: 0501234567 -> 966501234567
    return SAUDI_COUNTRY_CODE + stripped.slice(1);
  }
  if (stripped.length === 9 && stripped.startsWith("5")) {
    // Subscriber number with no leading 0 or country code: 501234567
    return SAUDI_COUNTRY_CODE + stripped;
  }
  return stripped;
}

/** True when two raw mobile numbers normalize to the same canonical form (and neither is empty). */
export function isSameMobile(a: string, b: string): boolean {
  const normA = normalizeSaudiMobile(a);
  const normB = normalizeSaudiMobile(b);
  return normA.length > 0 && normA === normB;
}
