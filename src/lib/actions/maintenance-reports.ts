"use server";

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/session";
import { computeResponseSlaStatus, computeResolutionSlaStatus, RECURRING_ISSUE_MIN_COUNT } from "@/lib/operations/maintenance-rules";

/**
 * Maintenance Request Report (Step 64) - status/category/priority breakdown,
 * bounded groupBy queries only, never a full-table load.
 */
export async function getMaintenanceRequestReport(filters: { from?: Date; to?: Date } = {}) {
  const { organizationId } = await requirePermission("report.view");
  const where: Prisma.MaintenanceRequestWhereInput = {
    organizationId,
    reportedAt: filters.from || filters.to ? { gte: filters.from, lte: filters.to } : undefined,
  };

  const [byStatus, byPriority, total] = await Promise.all([
    prisma.maintenanceRequest.groupBy({ by: ["status"], where, _count: { _all: true } }),
    prisma.maintenanceRequest.groupBy({ by: ["priority"], where, _count: { _all: true } }),
    prisma.maintenanceRequest.count({ where }),
  ]);

  return { total, byStatus, byPriority };
}

/** Work Order Status Report (Step 64) - bounded groupBy. */
export async function getWorkOrderStatusReport(filters: { from?: Date; to?: Date } = {}) {
  const { organizationId } = await requirePermission("report.view");
  const where: Prisma.MaintenanceWorkOrderWhereInput = {
    organizationId,
    createdAt: filters.from || filters.to ? { gte: filters.from, lte: filters.to } : undefined,
  };

  const [byStatus, total] = await Promise.all([
    prisma.maintenanceWorkOrder.groupBy({ by: ["status"], where, _count: { _all: true } }),
    prisma.maintenanceWorkOrder.count({ where }),
  ]);

  return { total, byStatus };
}

/**
 * SLA Performance Report (Step 65) - denominators defined explicitly:
 * Response met/breached only counts Requests with a responseDueAt AND
 * either a firstResponseAt or now-past-due (computeResponseSlaStatus's own
 * MET/BREACHED branches - AT_RISK/ON_TRACK are excluded from these counts,
 * since they are neither met nor breached yet). Resolution met/breached
 * excludes CANCELLED Requests entirely (never counted as "met" - Step 65's
 * own explicit warning). Average times use only the Requests that actually
 * have both a start and an end timestamp for that metric.
 */
export async function getSlaPerformanceReport(filters: { from?: Date; to?: Date } = {}) {
  const { organizationId } = await requirePermission("report.view");
  const rows = await prisma.maintenanceRequest.findMany({
    where: { organizationId, reportedAt: filters.from || filters.to ? { gte: filters.from, lte: filters.to } : undefined },
    select: { reportedAt: true, responseDueAt: true, resolutionDueAt: true, firstResponseAt: true, resolvedAt: true, status: true },
  });

  let responseMet = 0;
  let responseBreached = 0;
  let resolutionMet = 0;
  let resolutionBreached = 0;
  let responseTimeSumMs = 0;
  let responseTimeCount = 0;
  let resolutionTimeSumMs = 0;
  let resolutionTimeCount = 0;

  for (const r of rows) {
    const responseStatus = computeResponseSlaStatus({ reportedAt: r.reportedAt, responseDueAt: r.responseDueAt, firstResponseAt: r.firstResponseAt });
    if (responseStatus === "MET") responseMet++;
    if (responseStatus === "BREACHED") responseBreached++;
    if (r.firstResponseAt) {
      responseTimeSumMs += r.firstResponseAt.getTime() - r.reportedAt.getTime();
      responseTimeCount++;
    }

    const resolutionStatus = computeResolutionSlaStatus({ reportedAt: r.reportedAt, resolutionDueAt: r.resolutionDueAt, resolvedAt: r.resolvedAt, requestStatus: r.status });
    if (resolutionStatus === "MET") resolutionMet++;
    if (resolutionStatus === "BREACHED") resolutionBreached++;
    if (r.status === "RESOLVED" && r.resolvedAt) {
      resolutionTimeSumMs += r.resolvedAt.getTime() - r.reportedAt.getTime();
      resolutionTimeCount++;
    }
  }

  return {
    totalRequests: rows.length,
    responseMet,
    responseBreached,
    resolutionMet,
    resolutionBreached,
    averageResponseMinutes: responseTimeCount > 0 ? responseTimeSumMs / responseTimeCount / 60_000 : null,
    averageResolutionMinutes: resolutionTimeCount > 0 ? resolutionTimeSumMs / resolutionTimeCount / 60_000 : null,
  };
}

/** Maintenance by Category (Step 64). */
export async function getMaintenanceByCategoryReport() {
  const { organizationId } = await requirePermission("report.view");
  return prisma.maintenanceRequest.groupBy({ by: ["category"], where: { organizationId }, _count: { _all: true } });
}

/** Maintenance by Compound (Step 64). */
export async function getMaintenanceByCompoundReport() {
  const { organizationId } = await requirePermission("report.view");
  const grouped = await prisma.maintenanceRequest.groupBy({ by: ["compoundId"], where: { organizationId, compoundId: { not: null } }, _count: { _all: true } });
  const compounds = await prisma.compound.findMany({ where: { organizationId, id: { in: grouped.map((g) => g.compoundId).filter((id): id is string => !!id) } }, select: { id: true, name: true, arabicName: true } });
  const byId = new Map(compounds.map((c) => [c.id, c]));
  return grouped.map((g) => ({ compoundId: g.compoundId, compound: g.compoundId ? byId.get(g.compoundId) : undefined, count: g._count._all }));
}

/** Maintenance by Unit - top 25 units by request count (Step 64/68's own foundation). */
export async function getMaintenanceByUnitReport() {
  const { organizationId } = await requirePermission("report.view");
  const grouped = await prisma.maintenanceRequest.groupBy({
    by: ["unitId"],
    where: { organizationId, unitId: { not: null } },
    _count: { _all: true },
    orderBy: { _count: { unitId: "desc" } },
    take: 25,
  });
  const units = await prisma.unit.findMany({ where: { organizationId, id: { in: grouped.map((g) => g.unitId).filter((id): id is string => !!id) } }, select: { id: true, unitNumber: true } });
  const byId = new Map(units.map((u) => [u.id, u]));
  return grouped.map((g) => ({ unitId: g.unitId, unit: g.unitId ? byId.get(g.unitId) : undefined, count: g._count._all }));
}

/** Maintenance Cost Report (Step 64) - operational cost only, grouped by category via the parent Request. Never an accounting figure. */
export async function getMaintenanceCostReport(filters: { from?: Date; to?: Date } = {}) {
  const { organizationId } = await requirePermission("report.view");
  const workOrders = await prisma.maintenanceWorkOrder.findMany({
    where: { organizationId, status: "CLOSED", closedAt: filters.from || filters.to ? { gte: filters.from, lte: filters.to } : undefined },
    select: { actualCost: true, estimatedCost: true, request: { select: { category: true } } },
  });

  const byCategory = new Map<string, { count: number; actualCost: Prisma.Decimal }>();
  let totalActual = new Prisma.Decimal(0);
  let totalEstimated = new Prisma.Decimal(0);

  for (const wo of workOrders) {
    const cost = wo.actualCost ?? new Prisma.Decimal(0);
    totalActual = totalActual.plus(cost);
    if (wo.estimatedCost) totalEstimated = totalEstimated.plus(wo.estimatedCost);
    const entry = byCategory.get(wo.request.category) ?? { count: 0, actualCost: new Prisma.Decimal(0) };
    entry.count++;
    entry.actualCost = entry.actualCost.plus(cost);
    byCategory.set(wo.request.category, entry);
  }

  return {
    totalActualCost: totalActual,
    totalEstimatedCost: totalEstimated,
    workOrderCount: workOrders.length,
    byCategory: Array.from(byCategory.entries()).map(([category, v]) => ({ category, ...v })),
  };
}

/** Vendor Performance Report (Step 66) - facts only, no subjective scoring. */
export async function getVendorPerformanceReport() {
  const { organizationId } = await requirePermission("report.view");
  const vendors = await prisma.maintenanceVendor.findMany({
    where: { organizationId },
    select: {
      id: true,
      name: true,
      workOrders: { select: { status: true, createdAt: true, closedAt: true, actualCost: true } },
    },
  });

  return vendors.map((v) => {
    const assigned = v.workOrders.length;
    const completed = v.workOrders.filter((w) => w.status === "COMPLETED" || w.status === "VERIFIED" || w.status === "CLOSED").length;
    const closed = v.workOrders.filter((w) => w.status === "CLOSED");
    const totalCost = closed.reduce((sum, w) => sum.plus(w.actualCost ?? new Prisma.Decimal(0)), new Prisma.Decimal(0));
    const completionTimes = closed.filter((w) => w.closedAt).map((w) => w.closedAt!.getTime() - w.createdAt.getTime());
    const avgCompletionMinutes = completionTimes.length > 0 ? completionTimes.reduce((a, b) => a + b, 0) / completionTimes.length / 60_000 : null;
    return { vendorId: v.id, name: v.name, assigned, completed, closed: closed.length, operationalCost: totalCost, averageCompletionMinutes: avgCompletionMinutes };
  });
}

/** Technician Performance Report (Step 67) - facts only, never a scoring/ranking. */
export async function getTechnicianPerformanceReport() {
  const { organizationId } = await requirePermission("report.view");
  const users = await prisma.user.findMany({
    where: { organizationId, assignedMaintenanceWorkOrders: { some: {} } },
    select: {
      id: true,
      name: true,
      assignedMaintenanceWorkOrders: { select: { status: true, createdAt: true, closedAt: true } },
    },
  });

  return users.map((u) => {
    const assigned = u.assignedMaintenanceWorkOrders.length;
    const completed = u.assignedMaintenanceWorkOrders.filter((w) => w.status === "COMPLETED" || w.status === "VERIFIED" || w.status === "CLOSED").length;
    const verified = u.assignedMaintenanceWorkOrders.filter((w) => w.status === "VERIFIED" || w.status === "CLOSED").length;
    const closed = u.assignedMaintenanceWorkOrders.filter((w) => w.status === "CLOSED");
    const completionTimes = closed.filter((w) => w.closedAt).map((w) => w.closedAt!.getTime() - w.createdAt.getTime());
    const avgCompletionMinutes = completionTimes.length > 0 ? completionTimes.reduce((a, b) => a + b, 0) / completionTimes.length / 60_000 : null;
    return { userId: u.id, name: u.name, assigned, completed, verified, closed: closed.length, averageCompletionMinutes: avgCompletionMinutes };
  });
}

/** Recurring Issue Report foundation (Step 68) - same Unit + same Category, count within a window, no AI. */
export async function getRecurringIssueReport(windowDays = 90) {
  const { organizationId } = await requirePermission("report.view");
  const since = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000);
  const rows = await prisma.maintenanceRequest.findMany({
    where: { organizationId, unitId: { not: null }, reportedAt: { gte: since } },
    select: { unitId: true, category: true, unit: { select: { unitNumber: true } } },
  });

  const grouped = new Map<string, { unitId: string; unitNumber: string; category: string; count: number }>();
  for (const r of rows) {
    if (!r.unitId || !r.unit) continue;
    const key = `${r.unitId}:${r.category}`;
    const entry = grouped.get(key) ?? { unitId: r.unitId, unitNumber: r.unit.unitNumber, category: r.category, count: 0 };
    entry.count++;
    grouped.set(key, entry);
  }

  return Array.from(grouped.values())
    .filter((e) => e.count >= RECURRING_ISSUE_MIN_COUNT)
    .sort((a, b) => b.count - a.count);
}
