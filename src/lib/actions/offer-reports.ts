"use server";

import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/session";
import { computeOfferAcceptanceRate, requiresEscalatedApproval } from "@/lib/crm/offer-rules";
import { syncExpiredOffers } from "@/lib/actions/offers";

function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

/**
 * Offer Dashboard KPIs (Step 29/30). Snapshot counts (Draft/Pending/Sent/
 * Negotiations) are live pipeline state, matching the CRM Lead dashboard's
 * own "Active Leads"/"New Leads" convention; Accepted/Rejected/Expired are
 * bounded to the current calendar month, matching the Viewing dashboard's
 * "Completed This Month"/"Cancelled"/"No Shows" convention. Acceptance Rate
 * and both Value totals are all-time, matching the CRM Lead dashboard's own
 * all-time Conversion Rate.
 */
export async function getOfferDashboardStats() {
  const { organizationId } = await requirePermission("offer.view");
  await syncExpiredOffers(organizationId);

  const monthStart = startOfMonth(new Date());

  const [draftCount, pendingApprovalCount, sentCount, negotiationCount, acceptedThisMonth, rejectedThisMonth, expiredThisMonth, acceptedAllTime, rejectedAllTime, openValueAgg, acceptedValueAgg] =
    await Promise.all([
      prisma.leasingOffer.count({ where: { organizationId, status: "DRAFT" } }),
      prisma.leasingOffer.count({ where: { organizationId, status: "PENDING_APPROVAL" } }),
      prisma.leasingOffer.count({ where: { organizationId, status: "SENT" } }),
      prisma.leasingOffer.count({ where: { organizationId, status: "UNDER_NEGOTIATION" } }),
      prisma.leasingOffer.count({ where: { organizationId, status: "ACCEPTED", acceptedAt: { gte: monthStart } } }),
      prisma.leasingOffer.count({ where: { organizationId, status: "REJECTED", rejectedAt: { gte: monthStart } } }),
      prisma.leasingOffer.count({ where: { organizationId, status: "EXPIRED", expiredAt: { gte: monthStart } } }),
      prisma.leasingOffer.count({ where: { organizationId, status: "ACCEPTED" } }),
      prisma.leasingOffer.count({ where: { organizationId, status: "REJECTED" } }),
      prisma.leasingOffer.aggregate({ where: { organizationId, status: { in: ["APPROVED", "SENT", "UNDER_NEGOTIATION"] } }, _sum: { netAnnualRent: true } }),
      prisma.leasingOffer.aggregate({ where: { organizationId, status: "ACCEPTED" }, _sum: { netAnnualRent: true } }),
    ]);

  return {
    draftCount,
    pendingApprovalCount,
    sentCount,
    negotiationCount,
    acceptedThisMonth,
    rejectedThisMonth,
    expiredThisMonth,
    acceptanceRate: computeOfferAcceptanceRate(acceptedAllTime, rejectedAllTime),
    openOfferValue: Number(openValueAgg._sum.netAnnualRent ?? 0),
    acceptedOfferValue: Number(acceptedValueAgg._sum.netAnnualRent ?? 0),
  };
}

/** Report 1: Offer Pipeline - current count of offers in every status. */
export async function getOfferPipelineReport() {
  const { organizationId } = await requirePermission("offer.view");
  await syncExpiredOffers(organizationId);
  const rows = await prisma.leasingOffer.groupBy({ by: ["status"], where: { organizationId }, _count: { id: true } });
  return rows.map((r) => ({ status: r.status, count: r._count.id }));
}

/** Report 2: Offer Acceptance - accepted vs. rejected counts and the resulting rate, per Step 30's exact formula. */
export async function getOfferAcceptanceReport() {
  const { organizationId } = await requirePermission("offer.view");
  await syncExpiredOffers(organizationId);
  const [accepted, rejected] = await Promise.all([
    prisma.leasingOffer.count({ where: { organizationId, status: "ACCEPTED" } }),
    prisma.leasingOffer.count({ where: { organizationId, status: "REJECTED" } }),
  ]);
  return { accepted, rejected, acceptanceRate: computeOfferAcceptanceRate(accepted, rejected) };
}

/** Report 3: Offer Discount - distribution of discount percentage across every offer, and which ones required escalated (>10%) approval. */
export async function getOfferDiscountReport() {
  const { organizationId } = await requirePermission("offer.view");
  await syncExpiredOffers(organizationId);
  const offers = await prisma.leasingOffer.findMany({
    where: { organizationId },
    select: { id: true, offerNumber: true, versionNumber: true, discountAmount: true, discountPercentage: true, status: true, createdAt: true },
    orderBy: { discountPercentage: "desc" },
  });
  const rows = offers.map((o) => ({
    id: o.id,
    offerNumber: o.offerNumber,
    versionNumber: o.versionNumber,
    discountAmount: Number(o.discountAmount),
    discountPercentage: Number(o.discountPercentage),
    status: o.status,
    createdAt: o.createdAt,
    requiresEscalatedApproval: requiresEscalatedApproval(Number(o.discountPercentage)),
  }));
  const averageDiscountPercentage = rows.length > 0 ? Math.round((rows.reduce((sum, r) => sum + r.discountPercentage, 0) / rows.length) * 10) / 10 : 0;
  return { rows, averageDiscountPercentage, escalatedCount: rows.filter((r) => r.requiresEscalatedApproval).length };
}

/** Report 4: Offer Value by Compound - sum of netAnnualRent grouped by the offer's unit's compound. */
export async function getOfferValueByCompoundReport() {
  const { organizationId } = await requirePermission("offer.view");
  await syncExpiredOffers(organizationId);
  const offers = await prisma.leasingOffer.findMany({
    where: { organizationId },
    select: { netAnnualRent: true, status: true, unit: { select: { floor: { select: { building: { select: { compound: { select: { id: true, name: true, arabicName: true } } } } } } } } },
  });
  const byCompound = new Map<string, { compoundId: string; name: string; nameAr: string | null; offerCount: number; totalNetAnnualRent: number; acceptedCount: number }>();
  for (const o of offers) {
    const compound = o.unit.floor.building.compound;
    const entry = byCompound.get(compound.id) ?? { compoundId: compound.id, name: compound.name, nameAr: compound.arabicName, offerCount: 0, totalNetAnnualRent: 0, acceptedCount: 0 };
    entry.offerCount += 1;
    entry.totalNetAnnualRent += Number(o.netAnnualRent);
    if (o.status === "ACCEPTED") entry.acceptedCount += 1;
    byCompound.set(compound.id, entry);
  }
  return Array.from(byCompound.values()).sort((a, b) => b.totalNetAnnualRent - a.totalNetAnnualRent);
}

/** Report 5: Agent Offer Performance - per-agent offer volume and acceptance rate. */
export async function getAgentOfferPerformanceReport() {
  const { organizationId } = await requirePermission("offer.view");
  await syncExpiredOffers(organizationId);
  const offers = await prisma.leasingOffer.findMany({
    where: { organizationId, assignedToUserId: { not: null } },
    select: { assignedToUserId: true, status: true, assignedToUser: { select: { name: true } } },
  });
  const byAgent = new Map<string, { userId: string; name: string; total: number; accepted: number; rejected: number }>();
  for (const o of offers) {
    if (!o.assignedToUserId) continue;
    const entry = byAgent.get(o.assignedToUserId) ?? { userId: o.assignedToUserId, name: o.assignedToUser?.name ?? "-", total: 0, accepted: 0, rejected: 0 };
    entry.total += 1;
    if (o.status === "ACCEPTED") entry.accepted += 1;
    if (o.status === "REJECTED") entry.rejected += 1;
    byAgent.set(o.assignedToUserId, entry);
  }
  return Array.from(byAgent.values())
    .map((a) => ({ ...a, acceptanceRate: computeOfferAcceptanceRate(a.accepted, a.rejected) }))
    .sort((a, b) => b.total - a.total);
}

/** Report 6: Rejected Offer Analysis - counts grouped by the customer's own rejection reason. */
export async function getRejectedOfferAnalysisReport() {
  const { organizationId } = await requirePermission("offer.view");
  await syncExpiredOffers(organizationId);
  const rows = await prisma.leasingOffer.groupBy({
    by: ["rejectReason"],
    where: { organizationId, status: "REJECTED" },
    _count: { id: true },
  });
  return rows.filter((r) => r.rejectReason !== null).map((r) => ({ reason: r.rejectReason!, count: r._count.id }));
}
