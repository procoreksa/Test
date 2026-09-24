import { prisma } from "@/lib/prisma";
import { resolveDateRange, type DateRangePreset, type ResolvedDateRange, DATE_RANGE_PRESETS } from "@/lib/executive/date-range";

/** Raw, unvalidated filter values as they arrive from a URL's `searchParams` - every value is a `string | undefined`, never trusted. */
export interface RawExecutiveFilterParams {
  period?: string;
  from?: string;
  to?: string;
  compoundId?: string;
  buildingId?: string;
}

export interface ResolvedExecutiveFilters {
  range: ResolvedDateRange;
  /** null means "no compound filter" - either none was given, or the given id didn't resolve to a compound in the caller's own organization (silently dropped, never an error - see resolveExecutiveFilters()). */
  compoundId: string | null;
  buildingId: string | null;
}

function isDateRangePreset(value: string | undefined): value is DateRangePreset {
  return !!value && (DATE_RANGE_PRESETS as readonly string[]).includes(value);
}

/**
 * Server-validated filter resolution (Step 71/72) - the ONLY place URL query
 * params are turned into a Prisma `where` clause fragment. Every id is
 * re-checked against `organizationId` here, never trusted from the URL
 * directly:
 *
 *  - a `compoundId`/`buildingId` belonging to a different organization
 *    (cross-org injection) resolves to `null` (filter ignored) - never a
 *    thrown error, which would otherwise let an attacker distinguish
 *    "exists in another org" from "doesn't exist at all";
 *  - a `buildingId` that exists in THIS organization but under a different
 *    Compound than the given `compoundId` (same-org, invalid hierarchy) is
 *    likewise dropped rather than silently applied as an inconsistent
 *    AND-filter that would just return zero rows with no indication why.
 *
 * Both cases degrade to "no filter on that dimension" - the safe, always-
 * defined fallback - never a 500, never a leaked existence signal.
 */
export async function resolveExecutiveFilters(organizationId: string, params: RawExecutiveFilterParams, now: Date = new Date()): Promise<ResolvedExecutiveFilters> {
  const preset = isDateRangePreset(params.period) ? params.period : "THIS_MONTH";
  const range = resolveDateRange(preset, now, params.from, params.to);

  let compoundId: string | null = null;
  if (params.compoundId) {
    const compound = await prisma.compound.findFirst({ where: { id: params.compoundId, organizationId }, select: { id: true } });
    compoundId = compound?.id ?? null;
  }

  let buildingId: string | null = null;
  if (params.buildingId) {
    const building = await prisma.building.findFirst({ where: { id: params.buildingId, organizationId }, select: { id: true, compoundId: true } });
    if (building && (!compoundId || building.compoundId === compoundId)) {
      buildingId = building.id;
    }
  }

  return { range, compoundId, buildingId };
}
