"use server";

import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/session";
import { computeReservationConfirmationRate, computeReservationToContractConversionRate } from "@/lib/crm/reservation-rules";
import { syncExpiredReservations } from "@/lib/actions/reservations";

function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

/**
 * Reservation Dashboard KPIs (Step 26/27). Active/Confirmed/Expiring Today
 * are live snapshots (matching the CRM/Offer dashboards' own "Draft
 * Offers"/"Active Leads" convention); Expired This Month/Cancelled are
 * calendar-month bounded (matching Offer's "Rejected This Month"
 * convention). Amount totals are operational tracking sums, deliberately
 * never mixed with accounting revenue (Step 26's explicit instruction) -
 * see docs/RESERVATION-MANAGEMENT.md, "Financial isolation".
 */
export async function getReservationDashboardStats() {
  const { organizationId } = await requirePermission("reservation.view");
  await syncExpiredReservations(organizationId);

  const monthStart = startOfMonth(new Date());
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const endOfToday = new Date(startOfToday);
  endOfToday.setDate(endOfToday.getDate() + 1);

  const [
    activeCount,
    confirmedCount,
    expiringTodayCount,
    expiredThisMonth,
    cancelledAllTime,
    expiredAllTime,
    releasedAllTime,
    convertedAllTime,
    contractsCreatedThisMonth,
    amountPendingAgg,
    amountReceivedAgg,
  ] = await Promise.all([
    prisma.reservation.count({ where: { organizationId, status: { in: ["DRAFT", "PENDING", "CONFIRMED"] } } }),
    prisma.reservation.count({ where: { organizationId, status: "CONFIRMED" } }),
    prisma.reservation.count({ where: { organizationId, status: { in: ["PENDING", "CONFIRMED"] }, holdUntil: { gte: startOfToday, lt: endOfToday } } }),
    prisma.reservation.count({ where: { organizationId, status: "EXPIRED", expiredAt: { gte: monthStart } } }),
    prisma.reservation.count({ where: { organizationId, status: "CANCELLED" } }),
    prisma.reservation.count({ where: { organizationId, status: "EXPIRED" } }),
    prisma.reservation.count({ where: { organizationId, status: "RELEASED" } }),
    prisma.reservation.count({ where: { organizationId, status: "CONVERTED_TO_CONTRACT" } }),
    prisma.reservation.count({ where: { organizationId, status: "CONVERTED_TO_CONTRACT", convertedAt: { gte: monthStart } } }),
    prisma.reservation.aggregate({ where: { organizationId, reservationAmountStatus: "PENDING" }, _sum: { reservationAmount: true } }),
    prisma.reservation.aggregate({ where: { organizationId, reservationAmountStatus: "RECEIVED" }, _sum: { reservationAmount: true } }),
  ]);

  return {
    activeCount,
    confirmedCount,
    expiringTodayCount,
    expiredThisMonth,
    cancelledCount: cancelledAllTime,
    // "Reservation Conversion Pending" (Step 26/34 of
    // docs/RESERVATION-TO-CONTRACT.md) = confirmed reservations not yet
    // CONVERTED_TO_CONTRACT. CONFIRMED already excludes
    // CONVERTED_TO_CONTRACT (a distinct status value), so this needs no
    // separate subtraction.
    conversionPendingCount: confirmedCount,
    confirmationRate: computeReservationConfirmationRate(confirmedCount, cancelledAllTime, expiredAllTime),
    // Step 34: Contracts Created from Reservations / Reservation ->
    // Contract Conversion Rate. Active (DRAFT/PENDING/CONFIRMED)
    // reservations are excluded from the rate's denominator - only
    // end-state reservations count.
    contractsCreatedCount: convertedAllTime,
    contractsCreatedThisMonth,
    conversionRate: computeReservationToContractConversionRate(convertedAllTime, cancelledAllTime, expiredAllTime, releasedAllTime),
    amountPending: Number(amountPendingAgg._sum.reservationAmount ?? 0),
    amountReceived: Number(amountReceivedAgg._sum.reservationAmount ?? 0),
  };
}

/** Report 1: Active Reservations - every DRAFT/PENDING/CONFIRMED reservation, soonest hold expiry first. */
export async function getActiveReservationsReport() {
  const { organizationId } = await requirePermission("reservation.view");
  await syncExpiredReservations(organizationId);
  return prisma.reservation.findMany({
    where: { organizationId, status: { in: ["DRAFT", "PENDING", "CONFIRMED"] } },
    include: {
      lead: { select: { fullName: true } },
      unit: { select: { unitNumber: true } },
      assignedToUser: { select: { name: true } },
    },
    orderBy: { holdUntil: "asc" },
  });
}

/** Report 2: Reservation Expiry - every reservation with its hold window, flagging which have already lapsed. */
export async function getReservationExpiryReport() {
  const { organizationId } = await requirePermission("reservation.view");
  await syncExpiredReservations(organizationId);
  const now = new Date();
  const rows = await prisma.reservation.findMany({
    where: { organizationId, status: { in: ["DRAFT", "PENDING", "CONFIRMED", "EXPIRED"] } },
    include: { lead: { select: { fullName: true } }, unit: { select: { unitNumber: true } } },
    orderBy: { holdUntil: "asc" },
  });
  return rows.map((r) => ({ ...r, isPastDue: r.holdUntil < now && (r.status === "PENDING" || r.status === "CONFIRMED") }));
}

/** Report 3: Reservation Cancellation Analysis - counts grouped by cancellation reason. */
export async function getReservationCancellationAnalysisReport() {
  const { organizationId } = await requirePermission("reservation.view");
  await syncExpiredReservations(organizationId);
  const rows = await prisma.reservation.groupBy({
    by: ["cancelReason"],
    where: { organizationId, status: "CANCELLED" },
    _count: { id: true },
  });
  return rows.filter((r) => r.cancelReason !== null).map((r) => ({ reason: r.cancelReason!, count: r._count.id }));
}

/** Report 4: Reservation Amount Status - counts and total amount grouped by amount status. */
export async function getReservationAmountStatusReport() {
  const { organizationId } = await requirePermission("reservation.view");
  await syncExpiredReservations(organizationId);
  const rows = await prisma.reservation.groupBy({
    by: ["reservationAmountStatus"],
    where: { organizationId },
    _count: { id: true },
    _sum: { reservationAmount: true },
  });
  return rows.map((r) => ({ status: r.reservationAmountStatus, count: r._count.id, totalAmount: Number(r._sum.reservationAmount ?? 0) }));
}

/** Report 5: Reservations by Compound - counts/confirmed/total amount grouped by the reservation's unit's compound. */
export async function getReservationsByCompoundReport() {
  const { organizationId } = await requirePermission("reservation.view");
  await syncExpiredReservations(organizationId);
  const reservations = await prisma.reservation.findMany({
    where: { organizationId },
    select: {
      status: true,
      reservationAmount: true,
      unit: { select: { floor: { select: { building: { select: { compound: { select: { id: true, name: true, arabicName: true } } } } } } } },
    },
  });
  const byCompound = new Map<string, { compoundId: string; name: string; nameAr: string | null; reservationCount: number; confirmedCount: number; totalAmount: number }>();
  for (const r of reservations) {
    const compound = r.unit.floor.building.compound;
    const entry = byCompound.get(compound.id) ?? { compoundId: compound.id, name: compound.name, nameAr: compound.arabicName, reservationCount: 0, confirmedCount: 0, totalAmount: 0 };
    entry.reservationCount += 1;
    entry.totalAmount += Number(r.reservationAmount);
    if (r.status === "CONFIRMED") entry.confirmedCount += 1;
    byCompound.set(compound.id, entry);
  }
  return Array.from(byCompound.values()).sort((a, b) => b.reservationCount - a.reservationCount);
}

/** Report 6: Agent Reservation Performance - per-agent volume and confirmation rate. */
export async function getAgentReservationPerformanceReport() {
  const { organizationId } = await requirePermission("reservation.view");
  await syncExpiredReservations(organizationId);
  const reservations = await prisma.reservation.findMany({
    where: { organizationId, assignedToUserId: { not: null } },
    select: { assignedToUserId: true, status: true, assignedToUser: { select: { name: true } } },
  });
  const byAgent = new Map<string, { userId: string; name: string; total: number; confirmed: number; cancelled: number; expired: number }>();
  for (const r of reservations) {
    if (!r.assignedToUserId) continue;
    const entry = byAgent.get(r.assignedToUserId) ?? { userId: r.assignedToUserId, name: r.assignedToUser?.name ?? "-", total: 0, confirmed: 0, cancelled: 0, expired: 0 };
    entry.total += 1;
    if (r.status === "CONFIRMED") entry.confirmed += 1;
    if (r.status === "CANCELLED") entry.cancelled += 1;
    if (r.status === "EXPIRED") entry.expired += 1;
    byAgent.set(r.assignedToUserId, entry);
  }
  return Array.from(byAgent.values())
    .map((a) => ({ ...a, confirmationRate: computeReservationConfirmationRate(a.confirmed, a.cancelled, a.expired) }))
    .sort((a, b) => b.total - a.total);
}

/**
 * CRM Funnel Report (Step 35 of docs/RESERVATION-TO-CONTRACT.md): counts
 * of Leads, Viewings, Offers, Reservations, and Contracts, plus each
 * stage's conversion percentage from the immediately previous stage.
 * Deliberately counts DISTINCT Leads that reached each stage (via each
 * stage's own leadId, never a raw row count) - a Lead with two Viewings
 * still counts once at the "Viewing" stage - so the funnel reflects
 * actual linked records and never implies causality between unrelated
 * rows (the brief's explicit "be precise with denominators" instruction).
 */
export async function getCrmFunnelReport() {
  const { organizationId } = await requirePermission("reservation.view");
  await syncExpiredReservations(organizationId);

  const [leadCount, viewingLeadIds, offerLeadIds, reservationLeadIds, contractCount] = await Promise.all([
    prisma.lead.count({ where: { organizationId } }),
    prisma.viewing.findMany({ where: { organizationId }, select: { leadId: true }, distinct: ["leadId"] }),
    prisma.leasingOffer.findMany({ where: { organizationId }, select: { leadId: true }, distinct: ["leadId"] }),
    prisma.reservation.findMany({ where: { organizationId }, select: { leadId: true }, distinct: ["leadId"] }),
    prisma.contract.count({ where: { organizationId, reservationId: { not: null } } }),
  ]);

  const viewingCount = viewingLeadIds.length;
  const offerCount = offerLeadIds.length;
  const reservationCount = reservationLeadIds.length;

  const pct = (numerator: number, denominator: number) => (denominator === 0 ? 0 : Math.round((numerator / denominator) * 1000) / 10);

  return [
    { stage: "lead" as const, count: leadCount, conversionFromPrevious: null },
    { stage: "viewing" as const, count: viewingCount, conversionFromPrevious: pct(viewingCount, leadCount) },
    { stage: "offer" as const, count: offerCount, conversionFromPrevious: pct(offerCount, viewingCount) },
    { stage: "reservation" as const, count: reservationCount, conversionFromPrevious: pct(reservationCount, offerCount) },
    { stage: "contract" as const, count: contractCount, conversionFromPrevious: pct(contractCount, reservationCount) },
  ];
}

/**
 * Contract Origination Report (Step 36) - full traceability from Lead to
 * Contract for every Contract created via the Reservation conversion
 * flow, plus every manually-created Contract shown with Source =
 * "Manual" (reservationId null). One row per Contract, using only
 * actual linked records (the Contract's own reservationId relation),
 * never inferred/matched by name or date.
 */
export async function getContractOriginationReport() {
  const { organizationId } = await requirePermission("reservation.view");
  const contracts = await prisma.contract.findMany({
    where: { organizationId },
    include: {
      renter: { select: { fullName: true, fullNameAr: true } },
      unit: { include: { floor: { include: { building: { include: { compound: true } } } } } },
      reservation: {
        select: {
          reservationNumber: true,
          lead: { select: { id: true, fullName: true } },
          offer: { select: { offerNumber: true, viewing: { select: { viewingNumber: true } } } },
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });
  return contracts.map((c) => ({
    id: c.id,
    contractNumber: c.contractNumber,
    leadName: c.reservation?.lead.fullName ?? null,
    leadId: c.reservation?.lead.id ?? null,
    viewingNumber: c.reservation?.offer.viewing?.viewingNumber ?? null,
    offerNumber: c.reservation?.offer.offerNumber ?? null,
    reservationNumber: c.reservation?.reservationNumber ?? null,
    renterName: c.renter.fullNameAr ?? c.renter.fullName,
    unitNumber: c.unit.unitNumber,
    compoundName: c.unit.floor.building.compound.name,
    rentAmount: Number(c.rentAmount),
    startDate: c.startDate,
    endDate: c.endDate,
    source: c.reservation ? ("RESERVATION" as const) : ("MANUAL" as const),
  }));
}
