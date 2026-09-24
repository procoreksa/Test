/**
 * Language resolution for a queued notification.
 *
 * No per-recipient, per-organization, or per-portal-account stored language
 * preference exists anywhere in this schema today (locale is a
 * request-scoped cookie only - see src/lib/i18n.ts). Every one of the 9
 * wired business events fires from inside an authenticated internal
 * server action, which DOES have a current locale available via
 * `getLocale()` - so enqueueCommunicationEvent() captures that locale at
 * enqueue time and uses it as the notification's language. This is a
 * proxy (the acting staff member's own UI language), not a true recipient
 * preference, but it is the only real signal this codebase has, and is
 * documented as such rather than silently assumed. English is the
 * fallback for any future non-request-context trigger (e.g. a scheduled
 * job in a later prompt) where no locale is available at all.
 */
export type NotificationLanguage = "en" | "ar";

export function resolveNotificationLanguage(requestLocale: string | null | undefined): NotificationLanguage {
  return requestLocale === "ar" ? "ar" : "en";
}
