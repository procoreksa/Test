import type { UnitStatus } from "@prisma/client";

/**
 * Occupancy math - the exact same formula src/lib/actions/dashboard.ts
 * already computes inline (`occupied / total`, rounded to the nearest
 * whole percent), extracted as a single, pure, tested helper so the Owner
 * Portal's dashboard and Properties page never diverge on the definition
 * (docs/OWNER-PORTAL.md, "Occupancy calculation" - Step 19: "use one
 * helper", never invented independently per page).
 *
 * `occupied` and `vacant` are literal `UnitStatus` counts (`OCCUPIED` and
 * `VACANT` respectively) - a unit under `MAINTENANCE` or `RESERVED` counts
 * toward `total` but neither bucket, matching this codebase's existing
 * UnitStatus semantics exactly (never invented here).
 */
export interface OccupancySummary {
  total: number;
  occupied: number;
  vacant: number;
  occupancyRate: number;
}

export function computeOccupancySummary(statuses: UnitStatus[]): OccupancySummary {
  const total = statuses.length;
  const occupied = statuses.filter((s) => s === "OCCUPIED").length;
  const vacant = statuses.filter((s) => s === "VACANT").length;
  const occupancyRate = total > 0 ? Math.round((occupied / total) * 100) : 0;
  return { total, occupied, vacant, occupancyRate };
}
