"use server";

import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/session";
import { computeReservationConfirmationRate } from "@/lib/crm/reservation-rules";
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

  const [activeCount, confirmedCount, expiringTodayCount, expiredThisMonth, cancelledAllTime, expiredAllTime, amountPendingAgg, amountReceivedAgg] = await Promise.all([
    prisma.reservation.count({ where: { organizationId, status: { in: ["DRAFT", "PENDING", "CONFIRMED"] } } }),
    prisma.reservation.count({ where: { organizationId, status: "CONFIRMED" } }),
    prisma.reservation.count({ where: { organizationId, status: { in: ["PENDING", "CONFIRMED"] }, holdUntil: { gte: startOfToday, lt: endOfToday } } }),
    prisma.reservation.count({ where: { organizationId, status: "EXPIRED", expiredAt: { gte: monthStart } } }),
    prisma.reservation.count({ where: { organizationId, status: "CANCELLED" } }),
    prisma.reservation.count({ where: { organizationId, status: "EXPIRED" } }),
    prisma.reservation.aggregate({ where: { organizationId, reservationAmountStatus: "PENDING" }, _sum: { reservationAmount: true } }),
    prisma.reservation.aggregate({ where: { organizationId, reservationAmountStatus: "RECEIVED" }, _sum: { reservationAmount: true } }),
  ]);

  return {
    activeCount,
    confirmedCount,
    expiringTodayCount,
    expiredThisMonth,
    cancelledCount: cancelledAllTime,
    // "Reservation Conversion Pending" (Step 26) = confirmed reservations
    // not yet CONVERTED_TO_CONTRACT - since no action in this task ever
    // sets that status, every CONFIRMED reservation currently counts;
    // this becomes meaningful once the future Contract module exists.
    conversionPendingCount: confirmedCount,
    confirmationRate: computeReservationConfirmationRate(confirmedCount, cancelledAllTime, expiredAllTime),
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
