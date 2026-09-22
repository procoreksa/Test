"use server";

import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/session";
import { computeConversionRate } from "@/lib/crm/lead-rules";

const CLOSED_STATUSES = ["WON", "LOST"] as const;

/**
 * CRM dashboard KPIs (Step 18). Deliberately its own /crm dashboard, not
 * folded into the financial /dashboard - see docs/CRM-LEADS.md.
 *
 * Conversion rate = WON / (WON + LOST); active (not yet closed) leads are
 * never part of the denominator - see src/lib/crm/lead-rules.ts,
 * computeConversionRate(), and docs/CRM-LEADS.md, "Conversion rate
 * calculation".
 */
export async function getCrmDashboardStats() {
  const { organizationId } = await requirePermission("lead.view");
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfTomorrow = new Date(startOfToday.getTime() + 24 * 60 * 60 * 1000);

  const [totalActive, newCount, qualifiedCount, wonCount, lostCount, followUpsToday, followUpsOverdue, bySource, byStatus, leadsWithAgent] =
    await Promise.all([
      prisma.lead.count({ where: { organizationId, status: { notIn: [...CLOSED_STATUSES, "ARCHIVED"] } } }),
      prisma.lead.count({ where: { organizationId, status: "NEW" } }),
      prisma.lead.count({ where: { organizationId, status: "QUALIFIED" } }),
      prisma.lead.count({ where: { organizationId, status: "WON" } }),
      prisma.lead.count({ where: { organizationId, status: "LOST" } }),
      prisma.lead.count({
        where: { organizationId, status: { notIn: [...CLOSED_STATUSES, "ARCHIVED"] }, nextFollowUpAt: { gte: startOfToday, lt: startOfTomorrow } },
      }),
      prisma.lead.count({
        where: { organizationId, status: { notIn: [...CLOSED_STATUSES, "ARCHIVED"] }, nextFollowUpAt: { lt: startOfToday } },
      }),
      prisma.lead.groupBy({ by: ["source"], where: { organizationId }, _count: { _all: true } }),
      prisma.lead.groupBy({ by: ["status"], where: { organizationId }, _count: { _all: true } }),
      prisma.lead.findMany({
        where: { organizationId, assignedToUserId: { not: null } },
        select: { assignedToUserId: true, status: true, assignedToUser: { select: { name: true } } },
      }),
    ]);

  const agentMap = new Map<string, { name: string; total: number; won: number; lost: number }>();
  for (const l of leadsWithAgent) {
    if (!l.assignedToUserId) continue;
    const entry = agentMap.get(l.assignedToUserId) ?? { name: l.assignedToUser?.name ?? "—", total: 0, won: 0, lost: 0 };
    entry.total += 1;
    if (l.status === "WON") entry.won += 1;
    if (l.status === "LOST") entry.lost += 1;
    agentMap.set(l.assignedToUserId, entry);
  }
  const byAgent = Array.from(agentMap.entries()).map(([userId, v]) => ({
    userId,
    name: v.name,
    total: v.total,
    won: v.won,
    lost: v.lost,
    conversionRate: computeConversionRate(v.won, v.lost),
  }));

  return {
    totalActive,
    newCount,
    qualifiedCount,
    wonCount,
    lostCount,
    conversionRate: computeConversionRate(wonCount, lostCount),
    followUpsToday,
    followUpsOverdue,
    bySource: bySource.map((s) => ({ source: s.source, count: s._count._all })),
    byStatus: byStatus.map((s) => ({ status: s.status, count: s._count._all })),
    byAgent,
  };
}

/** Lead Pipeline Report (Step 21) - count of leads currently in each status. */
export async function getLeadPipelineReport() {
  const { organizationId } = await requirePermission("lead.view");
  const rows = await prisma.lead.groupBy({ by: ["status"], where: { organizationId }, _count: { _all: true } });
  return rows.map((r) => ({ status: r.status, count: r._count._all }));
}

/** Lead Source Report (Step 21) - counts and conversion rate per acquisition source. */
export async function getLeadSourceReport() {
  const { organizationId } = await requirePermission("lead.view");
  const leads = await prisma.lead.findMany({ where: { organizationId }, select: { source: true, status: true } });

  const map = new Map<string, { total: number; won: number; lost: number }>();
  for (const l of leads) {
    const entry = map.get(l.source) ?? { total: 0, won: 0, lost: 0 };
    entry.total += 1;
    if (l.status === "WON") entry.won += 1;
    if (l.status === "LOST") entry.lost += 1;
    map.set(l.source, entry);
  }
  return Array.from(map.entries()).map(([source, v]) => ({ source, ...v, conversionRate: computeConversionRate(v.won, v.lost) }));
}

/** Lead Conversion Report (Step 21/19) - the single headline number plus its inputs, so the calculation is never ambiguous on screen. */
export async function getLeadConversionReport() {
  const { organizationId } = await requirePermission("lead.view");
  const [wonCount, lostCount, activeCount] = await Promise.all([
    prisma.lead.count({ where: { organizationId, status: "WON" } }),
    prisma.lead.count({ where: { organizationId, status: "LOST" } }),
    prisma.lead.count({ where: { organizationId, status: { notIn: ["WON", "LOST", "ARCHIVED"] } } }),
  ]);
  return { wonCount, lostCount, activeCount, conversionRate: computeConversionRate(wonCount, lostCount) };
}

/** Leasing Agent Performance (Step 21) - no commission calculation, per the brief. */
export async function getAgentPerformanceReport() {
  const { organizationId } = await requirePermission("lead.view");
  const [leads, followUpActivities] = await Promise.all([
    prisma.lead.findMany({
      where: { organizationId, assignedToUserId: { not: null } },
      select: { id: true, assignedToUserId: true, status: true, assignedToUser: { select: { id: true, name: true, email: true } } },
    }),
    prisma.leadActivity.groupBy({
      by: ["leadId"],
      where: { organizationId, activityType: "FOLLOW_UP" },
      _count: { _all: true },
    }),
  ]);

  const leadIdToAgent = new Map<string, string>();
  for (const l of leads) if (l.assignedToUserId) leadIdToAgent.set(l.id, l.assignedToUserId);

  const followUpsByAgent = new Map<string, number>();
  for (const f of followUpActivities) {
    const agentId = leadIdToAgent.get(f.leadId);
    if (!agentId) continue;
    followUpsByAgent.set(agentId, (followUpsByAgent.get(agentId) ?? 0) + f._count._all);
  }

  const map = new Map<string, { name: string; email: string; assigned: number; won: number; lost: number }>();
  for (const l of leads) {
    if (!l.assignedToUserId) continue;
    const entry = map.get(l.assignedToUserId) ?? { name: l.assignedToUser?.name ?? "—", email: l.assignedToUser?.email ?? "—", assigned: 0, won: 0, lost: 0 };
    entry.assigned += 1;
    if (l.status === "WON") entry.won += 1;
    if (l.status === "LOST") entry.lost += 1;
    map.set(l.assignedToUserId, entry);
  }

  return Array.from(map.entries()).map(([userId, v]) => ({
    userId,
    ...v,
    conversionRate: computeConversionRate(v.won, v.lost),
    followUpsCompleted: followUpsByAgent.get(userId) ?? 0,
  }));
}

/** Lost Lead Analysis (Step 21) - grouped by reason, plus the individual lost leads for drill-down. */
export async function getLostLeadAnalysis() {
  const { organizationId } = await requirePermission("lead.view");
  const lostLeads = await prisma.lead.findMany({
    where: { organizationId, status: "LOST" },
    select: { id: true, leadNumber: true, fullName: true, lostReason: true, lostReasonNote: true, updatedAt: true, assignedToUser: { select: { name: true } } },
    orderBy: { updatedAt: "desc" },
  });

  const byReason = new Map<string, number>();
  for (const l of lostLeads) {
    const reason = l.lostReason ?? "OTHER";
    byReason.set(reason, (byReason.get(reason) ?? 0) + 1);
  }

  return {
    total: lostLeads.length,
    byReason: Array.from(byReason.entries()).map(([reason, count]) => ({ reason, count })),
    leads: lostLeads,
  };
}
