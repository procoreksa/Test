import { startOfDay, addDays, startOfWeek, addWeeks, startOfMonth, addMonths, subMonths, startOfQuarter, addQuarters, startOfYear, addYears, isValid, parseISO } from "date-fns";

/**
 * Centralized period abstraction for every Executive Dashboard "period"
 * metric (Steps 4/5 of the Executive & Operations Dashboards brief). Every
 * range is [start, end) - start-inclusive, end-exclusive - so a day/month/
 * quarter/year boundary is never double-counted or dropped, and callers can
 * always express "in this period" as a single `gte: start, lt: end` Prisma
 * filter.
 *
 * Timezone decision (Step 5, carried into docs/EXECUTIVE-DASHBOARDS.md §7 and
 * docs/TECHNICAL-DEBT.md item 3): this codebase has no `Organization.timezone`
 * field and none is added here - every date boundary below is computed
 * against the Node process's local time (`new Date()`), exactly like every
 * pre-existing date-bounded query in this codebase (getDashboardStats(),
 * getOverdueReport(), defaultMonthRange(), the Move-In/Move-Out/Corporate
 * Housing dashboards). This module does not claim "organization-local
 * reporting" - it centralizes the existing, already-shared assumption in one
 * place so a future timezone feature has exactly one call site to change.
 */
export type DateRangePreset = "TODAY" | "THIS_WEEK" | "THIS_MONTH" | "LAST_MONTH" | "THIS_QUARTER" | "THIS_YEAR" | "CUSTOM";

export interface ResolvedDateRange {
  preset: DateRangePreset;
  /** Inclusive start of the period. */
  start: Date;
  /** Exclusive end of the period. */
  end: Date;
}

export const DATE_RANGE_PRESETS: readonly DateRangePreset[] = ["TODAY", "THIS_WEEK", "THIS_MONTH", "LAST_MONTH", "THIS_QUARTER", "THIS_YEAR", "CUSTOM"];

/** Sunday-start week, matching date-fns' own default (no locale-week-start override exists elsewhere in this codebase to be consistent with). */
function weekRange(now: Date): { start: Date; end: Date } {
  const start = startOfWeek(now);
  return { start, end: addWeeks(start, 1) };
}

function monthRange(now: Date): { start: Date; end: Date } {
  const start = startOfMonth(now);
  return { start, end: addMonths(start, 1) };
}

function lastMonthRange(now: Date): { start: Date; end: Date } {
  const start = startOfMonth(subMonths(now, 1));
  return { start, end: addMonths(start, 1) };
}

function quarterRange(now: Date): { start: Date; end: Date } {
  const start = startOfQuarter(now);
  return { start, end: addQuarters(start, 1) };
}

function yearRange(now: Date): { start: Date; end: Date } {
  const start = startOfYear(now);
  return { start, end: addYears(start, 1) };
}

/**
 * Resolves a preset (or CUSTOM start/end date strings, "yyyy-MM-dd") into a
 * concrete [start, end) window. `now` is an explicit parameter (never read
 * internally) so this stays a pure, unit-testable function - callers pass
 * `new Date()` in production and a fixed date in tests (month/year/leap-day
 * boundary tests per Step 79).
 *
 * CUSTOM end is treated as inclusive-of-that-calendar-day on input (a person
 * picks "to Jan 31"), then converted to the exclusive boundary internally
 * (start of the following day) - never a bare `lte` on a `DateTime` column,
 * which would silently exclude same-day timestamps after midnight.
 */
export function resolveDateRange(preset: DateRangePreset, now: Date, customStart?: string, customEnd?: string): ResolvedDateRange {
  switch (preset) {
    case "TODAY": {
      const start = startOfDay(now);
      return { preset, start, end: addDays(start, 1) };
    }
    case "THIS_WEEK": {
      const { start, end } = weekRange(now);
      return { preset, start, end };
    }
    case "THIS_MONTH": {
      const { start, end } = monthRange(now);
      return { preset, start, end };
    }
    case "LAST_MONTH": {
      const { start, end } = lastMonthRange(now);
      return { preset, start, end };
    }
    case "THIS_QUARTER": {
      const { start, end } = quarterRange(now);
      return { preset, start, end };
    }
    case "THIS_YEAR": {
      const { start, end } = yearRange(now);
      return { preset, start, end };
    }
    case "CUSTOM": {
      const parsedStart = customStart ? parseISO(customStart) : undefined;
      const parsedEnd = customEnd ? parseISO(customEnd) : undefined;
      const start = parsedStart && isValid(parsedStart) ? startOfDay(parsedStart) : monthRange(now).start;
      const endDayStart = parsedEnd && isValid(parsedEnd) ? startOfDay(parsedEnd) : now;
      const end = addDays(endDayStart, 1);
      // A malformed/reversed custom range (end before start) falls back to
      // THIS_MONTH rather than silently returning an inverted/empty window.
      if (end <= start) return { preset, ...monthRange(now) };
      return { preset, start, end };
    }
  }
}

/** `{ gte: start, lt: end }` shape most Prisma date-column filters need directly. */
export function toPrismaRange(range: ResolvedDateRange): { gte: Date; lt: Date } {
  return { gte: range.start, lt: range.end };
}
