import { intlTag, type Locale } from "./config";

export function currencyFormatter(locale: Locale): Intl.NumberFormat {
  return new Intl.NumberFormat(intlTag(locale), { style: "currency", currency: "SAR" });
}

export function numberFormatter(locale: Locale): Intl.NumberFormat {
  return new Intl.NumberFormat(intlTag(locale), { maximumFractionDigits: 0 });
}

export function longDateFormatter(locale: Locale): Intl.DateTimeFormat {
  return new Intl.DateTimeFormat(intlTag(locale), { day: "numeric", month: "long", year: "numeric" });
}

export function shortDateFormatter(locale: Locale): Intl.DateTimeFormat {
  return new Intl.DateTimeFormat(intlTag(locale), { day: "numeric", month: "short", year: "numeric" });
}

export function monthDateFormatter(locale: Locale): Intl.DateTimeFormat {
  return new Intl.DateTimeFormat(intlTag(locale), { day: "numeric", month: "short" });
}

/** Date + time, used for audit log timestamps where "when exactly" matters, not just the day. */
export function longDateTimeFormatter(locale: Locale): Intl.DateTimeFormat {
  return new Intl.DateTimeFormat(intlTag(locale), {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * Picks the right language for a bilingual data field (a property/renter's
 * name, an invoice line description, ...). These are user-entered records
 * with separate English/Arabic values, not UI chrome — pick whichever
 * matches the viewer's language, falling back to the other if only one
 * was filled in.
 */
export function pickLocalized(locale: Locale, arValue: string | null | undefined, enValue: string): string {
  if (locale === "ar") return arValue || enValue;
  return enValue || arValue || "";
}
