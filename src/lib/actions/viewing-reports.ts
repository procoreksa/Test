"use server";

import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/session";
import { computeViewingCompletionRate, computeOutcomeRate, dateBucketRange } from "@/lib/crm/viewing-rules";

/**
 * CRM Viewing dashboard KPIs (Step 24). See docs/VIEWING-MANAGEMENT.md,
 * "Metric definitions", for the authoritative formulas - all computed here
 * from real counts, never hardcoded/sample data.
 */
export async function getViewingDashboardStats() {
  const { organizationId } = await requirePermission("viewing.view");
  const now = new Date();
  const today = dateBucketRange("today", now);
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1);

  const [todayCount, upcomingCount, completedThisMonth, cancelledThisMonth, noShowThisMonth, completedOutcomes] = await Promise.all([
    prisma.viewing.count({ where: { organizationId, scheduledStart: { gte: today.from, lt: today.to }, status: { notIn: ["CANCELLED"] } } }),
    prisma.viewing.count({ where: { organizationId, scheduledStart: { gte: now }, status: { in: ["SCHEDULED", "CONFIRMED"] } } }),
    prisma.viewing.count({ where: { organizationId, status: "COMPLETED", completedAt: { gte: monthStart, lt: monthEnd } } }),
    prisma.viewing.count({ where: { organizationId, status: "CANCELLED", updatedAt: { gte: monthStart, lt: monthEnd } } }),
    prisma.viewing.count({ where: { organizationId, status: "NO_SHOW", updatedAt: { gte: monthStart, lt: monthEnd } } }),
    prisma.viewing.findMany({ where: { organizationId, status: "COMPLETED" }, select: { outcome: true } }),
  ]);

  const completedTotal = completedOutcomes.length;
  const interestedCount = completedOutcomes.filter((v) => v.outcome === "INTERESTED").length;
  const offerRequestedCount = completedOutcomes.filter((v) => v.outcome === "OFFER_REQUESTED").length;
  const reservationRequestedCount = completedOutcomes.filter((v) => v.outcome === "RESERVATION_REQUESTED").length;

  return {
    todayCount,
    upcomingCount,
    completedThisMonth,
    cancelledThisMonth,
    noShowThisMonth,
    completionRate: computeViewingCompletionRate(completedThisMonth, cancelledThisMonth, noShowThisMonth),
    interestRate: computeOutcomeRate(interestedCount, completedTotal),
    offerRequestRate: computeOutcomeRate(offerRequestedCount, completedTotal),
    reservationRequestRate: computeOutcomeRate(reservationRequestedCount, completedTotal),
  };
}

/** Viewing Schedule Report (Step 26) - every viewing in a date range, chronological. */
export async function getViewingScheduleReport(from?: Date, to?: Date) {
  const { organizationId } = await requirePermission("viewing.view");
  return prisma.viewing.findMany({
    where: { organizationId, scheduledStart: { gte: from, lte: to } },
    include: {
      lead: { select: { fullName: true, leadNumber: true } },
      assignedToUser: { select: { name: true } },
      units: { include: { unit: { include: { floor: { include: { building: { include: { compound: true } } } } } } } },
    },
    orderBy: { scheduledStart: "asc" },
  });
}

/** Viewing Outcome Report (Step 26) - counts per outcome, completed viewings only. */
export async function getViewingOutcomeReport() {
  const { organizationId } = await requirePermission("viewing.view");
  const rows = await prisma.viewing.groupBy({
    by: ["outcome"],
    where: { organizationId, status: "COMPLETED" },
    _count: { _all: true },
  });
  return rows.map((r) => ({ outcome: r.outcome, count: r._count._all }));
}

/** Agent Viewing Performance (Step 26) - no commission calculation, matching the CRM Leads agent-performance report's own scope note. */
export async function getAgentViewingPerformanceReport() {
  const { organizationId } = await requirePermission("viewing.view");
  const viewings = await prisma.viewing.findMany({
    where: { organizationId, assignedToUserId: { not: null } },
    select: { assignedToUserId: true, status: true, outcome: true, assignedToUser: { select: { name: true } } },
  });

  const map = new Map<string, { name: string; scheduled: number; completed: number; cancelled: number; noShow: number; interested: number; offerRequested: number }>();
  for (const v of viewings) {
    if (!v.assignedToUserId) continue;
    const entry = map.get(v.assignedToUserId) ?? { name: v.assignedToUser?.name ?? "—", scheduled: 0, completed: 0, cancelled: 0, noShow: 0, interested: 0, offerRequested: 0 };
    entry.scheduled += 1;
    if (v.status === "COMPLETED") entry.completed += 1;
    if (v.status === "CANCELLED") entry.cancelled += 1;
    if (v.status === "NO_SHOW") entry.noShow += 1;
    if (v.outcome === "INTERESTED") entry.interested += 1;
    if (v.outcome === "OFFER_REQUESTED") entry.offerRequested += 1;
    map.set(v.assignedToUserId, entry);
  }

  return Array.from(map.entries()).map(([userId, v]) => ({
    userId,
    ...v,
    completionPercent: computeViewingCompletionRate(v.completed, v.cancelled, v.noShow),
  }));
}

/** Most Viewed Units (Step 26) - top units by total viewing count, regardless of outcome. */
export async function getMostViewedUnitsReport(limit = 20) {
  const { organizationId } = await requirePermission("viewing.view");
  const grouped = await prisma.viewingUnit.groupBy({
    by: ["unitId"],
    where: { organizationId },
    _count: { id: true },
    orderBy: { _count: { id: "desc" } },
    take: limit,
  });
  if (grouped.length === 0) return [];

  const units = await prisma.unit.findMany({
    where: { id: { in: grouped.map((g) => g.unitId) } },
    select: { id: true, unitNumber: true, floor: { select: { building: { select: { name: true, nameAr: true, compound: { select: { name: true, arabicName: true } } } } } } },
  });
  const unitById = new Map(units.map((u) => [u.id, u]));

  return grouped.map((g) => ({ unitId: g.unitId, unit: unitById.get(g.unitId), viewCount: g._count.id }));
}

/** Most Viewed Compounds (Step 26) - aggregated in JS from ViewingUnit -> Unit -> Floor -> Building -> Compound, since Prisma groupBy can't traverse relations. */
export async function getMostViewedCompoundsReport() {
  const { organizationId } = await requirePermission("viewing.view");
  const rows = await prisma.viewingUnit.findMany({
    where: { organizationId },
    select: { unit: { select: { floor: { select: { building: { select: { compound: { select: { id: true, name: true, arabicName: true } } } } } } } } },
  });

  const map = new Map<string, { name: string; arabicName: string | null; count: number }>();
  for (const r of rows) {
    const compound = r.unit.floor.building.compound;
    const entry = map.get(compound.id) ?? { name: compound.name, arabicName: compound.arabicName, count: 0 };
    entry.count += 1;
    map.set(compound.id, entry);
  }

  return Array.from(map.entries())
    .map(([compoundId, v]) => ({ compoundId, ...v }))
    .sort((a, b) => b.count - a.count);
}

/** No-Show Analysis (Step 26) - the no-show viewings themselves, for drill-down. */
export async function getNoShowAnalysisReport() {
  const { organizationId } = await requirePermission("viewing.view");
  const viewings = await prisma.viewing.findMany({
    where: { organizationId, status: "NO_SHOW" },
    include: { lead: { select: { fullName: true, leadNumber: true } }, assignedToUser: { select: { name: true } } },
    orderBy: { scheduledStart: "desc" },
  });
  return { total: viewings.length, viewings };
}
