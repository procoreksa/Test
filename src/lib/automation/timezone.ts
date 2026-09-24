/**
 * Timezone decision (Step 23, docs/AUTOMATION-SCHEDULED-JOBS.md "Timezone
 * decision"): unlike the rest of this codebase (which inherits Node's
 * server-local time everywhere - see docs/TECHNICAL-DEBT.md item 3), every
 * scheduled, tenant-facing automation in this module resolves date
 * boundaries against `Organization.timezone` (default `"Asia/Riyadh"`,
 * validated as a real IANA zone) - not the server's own local time. Every
 * organization in this codebase is Saudi-based today (Organization.country
 * defaults to "SA", currency is fixed SAR, ZATCA is Saudi-only), so this is
 * a safe, explicit default rather than a guess, and it degrades gracefully:
 * if a future organization is genuinely in another zone, changing its
 * `timezone` column is the only thing that needs to happen - no code here
 * assumes Riyadh specifically.
 *
 * No new dependency is added (no `date-fns-tz`): Node's built-in `Intl` API
 * is sufficient to compute correct, DST-safe local-time boundaries for any
 * IANA zone, via the standard "two-pass offset correction" technique
 * (the same approach `date-fns-tz`'s own `zonedTimeToUtc` uses internally).
 */

export function isValidIanaTimeZone(timeZone: string): boolean {
  if (!timeZone) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone });
    return true;
  } catch {
    return false;
  }
}

interface ZonedParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

function getZonedParts(instant: Date, timeZone: string): ZonedParts {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(instant);
  const map: Record<string, string> = {};
  for (const p of parts) map[p.type] = p.value;
  return {
    year: Number(map.year),
    month: Number(map.month),
    day: Number(map.day),
    // "24:00:00" is formatted by some ICU versions for local midnight - normalize to 0.
    hour: Number(map.hour) % 24,
    minute: Number(map.minute),
    second: Number(map.second),
  };
}

/** The UTC-offset-equivalent (in ms) of `timeZone` at `instant` - positive east of UTC (e.g. +3h for Asia/Riyadh). */
function offsetMsAt(instant: Date, timeZone: string): number {
  const p = getZonedParts(instant, timeZone);
  const localAsUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return localAsUtc - instant.getTime();
}

/**
 * Converts a local wall-clock date/time in `timeZone` to the UTC instant it
 * represents - DST-safe via two-pass offset correction (a single pass is
 * already correct outside the rare few hours spanning a DST transition).
 */
export function zonedTimeToUtc(y: number, month: number, day: number, hour: number, minute: number, second: number, timeZone: string): Date {
  const guess = new Date(Date.UTC(y, month - 1, day, hour, minute, second));
  const offset1 = offsetMsAt(guess, timeZone);
  const corrected = new Date(guess.getTime() - offset1);
  const offset2 = offsetMsAt(corrected, timeZone);
  return new Date(guess.getTime() - offset2);
}

/** "yyyy-MM-dd" for `instant`'s calendar date as observed in `timeZone`. */
export function zonedDateKey(instant: Date, timeZone: string): string {
  const p = getZonedParts(instant, timeZone);
  return `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
}

/** The UTC instant of local midnight (00:00:00) on `instant`'s own calendar day in `timeZone`. */
export function zonedStartOfDay(instant: Date, timeZone: string): Date {
  const p = getZonedParts(instant, timeZone);
  return zonedTimeToUtc(p.year, p.month, p.day, 0, 0, 0, timeZone);
}

/** Local midnight N calendar days from `instant`'s own local calendar day in `timeZone` - calendar-day arithmetic, never a naive +/- N*86400000ms (which would be wrong across a DST transition). */
export function zonedStartOfDayOffset(instant: Date, offsetDays: number, timeZone: string): Date {
  const p = getZonedParts(instant, timeZone);
  // UTC calendar-day arithmetic on the local Y/M/D components themselves -
  // safe because we only need the resulting Y/M/D, not a real instant, at
  // this step (Date.UTC normalizes month/day overflow correctly).
  const shifted = new Date(Date.UTC(p.year, p.month - 1, p.day + offsetDays));
  return zonedTimeToUtc(shifted.getUTCFullYear(), shifted.getUTCMonth() + 1, shifted.getUTCDate(), 0, 0, 0, timeZone);
}
