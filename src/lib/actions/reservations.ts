"use server";

import { z } from "zod";
import type { ReservationStatus, ReservationAmountStatus, Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requirePermission, requireSession } from "@/lib/session";
import { getLocale, getDictionary } from "@/lib/i18n";
import { auditCreate, auditUpdate, auditAction, requirePermissionAudited } from "@/lib/audit";
import { nextCounterValue, formatReservationNumber } from "@/lib/numbering";
import {
  defaultHoldUntil,
  isValidReservationTransition,
  BLOCKING_UNIT_RESERVATION_STATUSES,
  blocksNewReservationForOffer,
  defaultReservationAmountStatus,
} from "@/lib/crm/reservation-rules";

const PAGE_SIZE = 25;

type Tx = Prisma.TransactionClient | typeof prisma;

const RESERVATION_AMOUNT_STATUS_VALUES = ["NOT_REQUIRED", "PENDING", "RECEIVED", "REFUNDED", "FORFEITED"] as const;
const RESERVATION_CANCEL_REASON_VALUES = [
  "CUSTOMER_REQUEST",
  "PAYMENT_NOT_RECEIVED",
  "DOCUMENTS_INCOMPLETE",
  "UNIT_CHANGED",
  "OFFER_CHANGED",
  "TIMEOUT",
  "MANAGEMENT_DECISION",
  "OTHER",
] as const;

/** Statuses a Reservation may still be edited/reassigned in (Step 30's "Hold Until changed"/"Assigned agent changed") - terminal statuses are read-only. */
const EDITABLE_RESERVATION_STATUSES: readonly ReservationStatus[] = ["DRAFT", "PENDING", "CONFIRMED"];

/**
 * The single choke point every RESERVED -> VACANT move passes through
 * (Step 33). Never blindly overwrites Unit.status: only acts when the Unit
 * is actually RESERVED (idempotency guard - matters when called from
 * multiple paths, e.g. cancel and the expiry sync, without double side
 * effects), and re-verifies no other active reservation or ACTIVE Contract
 * still needs the unit before releasing it.
 */
export async function releaseUnitIfSafe(tx: Tx, organizationId: string, unitId: string, excludeReservationId?: string): Promise<void> {
  const unit = await tx.unit.findUniqueOrThrow({ where: { id: unitId, organizationId } });
  if (unit.status !== "RESERVED") return;

  const otherActive = await tx.reservation.findFirst({
    where: {
      organizationId,
      unitId,
      status: { in: [...BLOCKING_UNIT_RESERVATION_STATUSES] },
      id: excludeReservationId ? { not: excludeReservationId } : undefined,
    },
  });
  if (otherActive) return;

  const activeContract = await tx.contract.findFirst({ where: { organizationId, unitId, status: "ACTIVE" } });
  if (activeContract) return;

  await tx.unit.update({ where: { id: unitId, organizationId }, data: { status: "VACANT" } });
}

/** Unit eligibility (Step 8): must be VACANT, and no other PENDING/CONFIRMED reservation may already hold it. Shared by createReservation/submitReservation/confirmReservation so every stage re-verifies independently rather than trusting an earlier check. */
async function assertUnitEligibleForReservation(
  tx: Tx,
  organizationId: string,
  unitId: string,
  messages: { statusMsg: string; conflictMsg: string },
  excludeReservationId?: string
): Promise<void> {
  const unit = await tx.unit.findUniqueOrThrow({ where: { id: unitId, organizationId } });
  if (unit.status !== "VACANT") {
    throw new Error(messages.statusMsg);
  }
  const conflict = await tx.reservation.findFirst({
    where: {
      organizationId,
      unitId,
      status: { in: [...BLOCKING_UNIT_RESERVATION_STATUSES] },
      id: excludeReservationId ? { not: excludeReservationId } : undefined,
    },
  });
  if (conflict) {
    throw new Error(messages.conflictMsg);
  }
}

/**
 * Lazily persists expiry (Step 10/32) - no cron job. Unlike Offer's silent
 * updateMany, the brief explicitly requires an audited action + LeadActivity
 * + Unit release per expired Reservation, so each candidate is reconciled
 * in its own small transaction (reservation volume is inherently bounded -
 * at most a handful of PENDING/CONFIRMED rows per organization at any
 * time - so this is not an N+1 concern in practice). Called at the top of
 * every read AND every mutating action, so nothing can act on a stale row.
 */
export async function syncExpiredReservations(organizationId: string): Promise<void> {
  const now = new Date();
  const candidates = await prisma.reservation.findMany({
    where: { organizationId, status: { in: ["PENDING", "CONFIRMED"] }, holdUntil: { lt: now } },
    select: { id: true },
  });
  if (candidates.length === 0) return;

  const t = getDictionary(await getLocale());
  for (const { id } of candidates) {
    await prisma.$transaction(async (tx) => {
      const existing = await tx.reservation.findUnique({ where: { id, organizationId } });
      // Re-check inside the transaction: another concurrent call may have
      // already reconciled (or the row may have been mutated) between the
      // candidate scan above and this transaction starting.
      if (!existing || existing.holdUntil >= new Date() || (existing.status !== "PENDING" && existing.status !== "CONFIRMED")) return;

      const updated = await tx.reservation.update({ where: { id, organizationId }, data: { status: "EXPIRED", expiredAt: new Date() } });
      await releaseUnitIfSafe(tx, organizationId, existing.unitId, id);
      await auditAction(tx, {
        action: "UPDATE",
        entityType: "Reservation",
        entityId: updated.id,
        entityDisplayName: updated.reservationNumber,
        previousValues: { status: existing.status },
        newValues: { status: "EXPIRED", expiredAt: updated.expiredAt },
        metadata: { trigger: "expiry_sync" },
      });
      await tx.leadActivity.create({
        data: {
          organizationId,
          leadId: existing.leadId,
          activityType: "STATUS_CHANGE",
          subject: t.reservation.activityExpired(updated.reservationNumber),
          createdByUserId: existing.createdByUserId,
        },
      });
      const lead = await tx.lead.findUniqueOrThrow({ where: { id: existing.leadId } });
      if (lead.status !== "WON") {
        await tx.lead.update({ where: { id: existing.leadId }, data: { status: "NEGOTIATION" } });
      }
    });
  }
}

export async function createReservation(formData: FormData) {
  const { organizationId } = await requirePermission("reservation.create");
  const { user } = await requireSession();
  const t = getDictionary(await getLocale());

  const offerId = z.string().min(1).parse(formData.get("offerId"));
  const assignedToUserId = (formData.get("assignedToUserId") as string) || undefined;
  const holdUntilRaw = formData.get("holdUntil");
  const holdUntil = holdUntilRaw ? new Date(String(holdUntilRaw)) : defaultHoldUntil();
  const reservationAmount = z.coerce.number().min(0).parse(formData.get("reservationAmount") || 0);
  const notes = (formData.get("notes") as string) || undefined;

  if (Number.isNaN(holdUntil.getTime()) || holdUntil <= new Date()) {
    throw new Error(t.validation.reservationHoldUntilFuture);
  }
  if (assignedToUserId) {
    await prisma.user.findUniqueOrThrow({ where: { id: assignedToUserId, organizationId } });
  }

  let leadIdForRevalidate = "";

  const reservationId = await prisma.$transaction(
    async (tx) => {
      const offer = await tx.leasingOffer.findUniqueOrThrow({ where: { id: offerId, organizationId } });
      if (offer.status !== "ACCEPTED") {
        throw new Error(t.validation.reservationOfferNotAccepted);
      }
      leadIdForRevalidate = offer.leadId;

      const existingForOffer = await tx.reservation.findMany({ where: { organizationId, offerId } });
      if (existingForOffer.some((r) => blocksNewReservationForOffer(r.status))) {
        throw new Error(t.validation.reservationOfferAlreadyActive);
      }

      await assertUnitEligibleForReservation(
        tx,
        organizationId,
        offer.unitId,
        { statusMsg: t.validation.reservationUnitNotEligible, conflictMsg: t.validation.reservationUnitConflict }
      );

      const seq = await nextCounterValue(tx, organizationId, "reservation");
      const reservationNumber = formatReservationNumber(seq);
      const reservationAmountStatus = defaultReservationAmountStatus(reservationAmount);

      const reservation = await tx.reservation.create({
        data: {
          organizationId,
          reservationNumber,
          leadId: offer.leadId,
          offerId: offer.id,
          unitId: offer.unitId,
          assignedToUserId,
          holdUntil,
          reservationAmount,
          reservationAmountStatus,
          notes,
          createdByUserId: user.id,
        },
      });

      await auditCreate(tx, {
        entityType: "Reservation",
        entityId: reservation.id,
        entityDisplayName: reservation.reservationNumber,
        newValues: { offerId: offer.id, leadId: offer.leadId, unitId: offer.unitId, holdUntil, reservationAmount, reservationAmountStatus },
      });

      await tx.leadActivity.create({
        data: {
          organizationId,
          leadId: offer.leadId,
          activityType: "STATUS_CHANGE",
          subject: t.reservation.activityCreated(reservationNumber),
          createdByUserId: user.id,
        },
      });

      const lead = await tx.lead.findUniqueOrThrow({ where: { id: offer.leadId } });
      if (lead.status !== "WON") {
        await tx.lead.update({ where: { id: offer.leadId }, data: { status: "RESERVATION_PENDING" } });
      }

      return reservation.id;
    },
    { isolationLevel: "Serializable" }
  );

  revalidatePath("/crm/reservations");
  revalidatePath(`/crm/offers/${offerId}`);
  if (leadIdForRevalidate) revalidatePath(`/crm/leads/${leadIdForRevalidate}`);
  revalidatePath("/crm");
  return reservationId;
}

/** DRAFT -> PENDING (Step 12/23's "Submit" action) - the moment a Reservation starts blocking other reservations for the same Unit (Step 8), so this is race-sensitive the same way createReservation is. */
export async function submitReservation(reservationId: string) {
  const { organizationId } = await requirePermissionAudited("reservation.update", "Reservation", reservationId);
  const t = getDictionary(await getLocale());
  await syncExpiredReservations(organizationId);

  await prisma.$transaction(
    async (tx) => {
      const existing = await tx.reservation.findUniqueOrThrow({ where: { id: reservationId, organizationId } });
      if (!isValidReservationTransition(existing.status, "PENDING")) {
        throw new Error(t.validation.reservationInvalidTransition);
      }
      await assertUnitEligibleForReservation(
        tx,
        organizationId,
        existing.unitId,
        { statusMsg: t.validation.reservationUnitNotEligible, conflictMsg: t.validation.reservationUnitConflict },
        reservationId
      );
      const updated = await tx.reservation.update({ where: { id: reservationId, organizationId }, data: { status: "PENDING" } });
      await auditAction(tx, {
        action: "UPDATE",
        entityType: "Reservation",
        entityId: updated.id,
        entityDisplayName: updated.reservationNumber,
        previousValues: { status: existing.status },
        newValues: { status: "PENDING" },
      });
    },
    { isolationLevel: "Serializable" }
  );

  revalidatePath("/crm/reservations");
  revalidatePath(`/crm/reservations/${reservationId}`);
}

/** PENDING -> CONFIRMED (Step 14). Unit becomes RESERVED here - re-checks eligibility one more time (defense in depth against a race between submit and confirm) inside the same Serializable transaction as the Unit status write. */
export async function confirmReservation(reservationId: string) {
  const { organizationId } = await requirePermissionAudited("reservation.confirm", "Reservation", reservationId);
  const { user } = await requireSession();
  const t = getDictionary(await getLocale());
  await syncExpiredReservations(organizationId);

  await prisma.$transaction(
    async (tx) => {
      const existing = await tx.reservation.findUniqueOrThrow({ where: { id: reservationId, organizationId } });
      if (!isValidReservationTransition(existing.status, "CONFIRMED")) {
        throw new Error(t.validation.reservationInvalidTransition);
      }
      await assertUnitEligibleForReservation(
        tx,
        organizationId,
        existing.unitId,
        { statusMsg: t.validation.reservationUnitNotEligible, conflictMsg: t.validation.reservationUnitConflict },
        reservationId
      );

      const updated = await tx.reservation.update({
        where: { id: reservationId, organizationId },
        data: { status: "CONFIRMED", confirmedAt: new Date() },
      });
      await tx.unit.update({ where: { id: existing.unitId, organizationId }, data: { status: "RESERVED" } });
      await auditAction(tx, {
        action: "UPDATE",
        entityType: "Reservation",
        entityId: updated.id,
        entityDisplayName: updated.reservationNumber,
        previousValues: { status: existing.status },
        newValues: { status: "CONFIRMED", confirmedAt: updated.confirmedAt },
      });
      await tx.leadActivity.create({
        data: {
          organizationId,
          leadId: existing.leadId,
          activityType: "STATUS_CHANGE",
          subject: t.reservation.activityConfirmed(updated.reservationNumber),
          createdByUserId: user.id,
        },
      });
      // Per docs/RESERVATION-MANAGEMENT.md, "Lead status integration": the
      // Lead is already at RESERVATION_PENDING from Offer acceptance /
      // Reservation creation - confirming the Reservation does not
      // introduce a new LeadStatus or move it any further (WON is reserved
      // exclusively for a future successful Contract).
    },
    { isolationLevel: "Serializable" }
  );

  revalidatePath("/crm/reservations");
  revalidatePath(`/crm/reservations/${reservationId}`);
}

async function terminalReservationMove(
  reservationId: string,
  permission: "reservation.cancel" | "reservation.release",
  toStatus: "CANCELLED" | "RELEASED",
  timestampField: "cancelledAt" | "releasedAt",
  activitySubject: (t: ReturnType<typeof getDictionary>, reservationNumber: string) => string,
  extra?: { cancelReason?: string; cancelReasonNote?: string }
) {
  const { organizationId } = await requirePermissionAudited(permission, "Reservation", reservationId);
  const { user } = await requireSession();
  const t = getDictionary(await getLocale());
  await syncExpiredReservations(organizationId);

  let leadIdForRevalidate = "";

  await prisma.$transaction(async (tx) => {
    const existing = await tx.reservation.findUniqueOrThrow({ where: { id: reservationId, organizationId } });
    leadIdForRevalidate = existing.leadId;
    if (!isValidReservationTransition(existing.status, toStatus)) {
      throw new Error(t.validation.reservationInvalidTransition);
    }
    const updated = await tx.reservation.update({
      where: { id: reservationId, organizationId },
      data: {
        status: toStatus,
        [timestampField]: new Date(),
        ...(extra?.cancelReason ? { cancelReason: extra.cancelReason as never, cancelReasonNote: extra.cancelReasonNote } : {}),
      },
    });
    await releaseUnitIfSafe(tx, organizationId, existing.unitId, reservationId);
    await auditAction(tx, {
      action: toStatus === "CANCELLED" ? "CANCEL" : "UPDATE",
      entityType: "Reservation",
      entityId: updated.id,
      entityDisplayName: updated.reservationNumber,
      previousValues: { status: existing.status },
      newValues: { status: toStatus, ...extra },
    });
    await tx.leadActivity.create({
      data: {
        organizationId,
        leadId: existing.leadId,
        activityType: "STATUS_CHANGE",
        subject: activitySubject(t, updated.reservationNumber),
        notes: extra?.cancelReasonNote,
        createdByUserId: user.id,
      },
    });

    // Per docs/RESERVATION-MANAGEMENT.md, "Lead status integration": both
    // Cancel and Release free the Unit without the Lead having converted -
    // the Lead returns to NEGOTIATION (the accepted Offer's commercial
    // terms still stand; only the specific Unit hold fell through), unless
    // already WON. Never automatically marked LOST.
    const lead = await tx.lead.findUniqueOrThrow({ where: { id: existing.leadId } });
    if (lead.status !== "WON") {
      await tx.lead.update({ where: { id: existing.leadId }, data: { status: "NEGOTIATION" } });
    }
  });

  revalidatePath("/crm/reservations");
  revalidatePath(`/crm/reservations/${reservationId}`);
  if (leadIdForRevalidate) revalidatePath(`/crm/leads/${leadIdForRevalidate}`);
  revalidatePath("/crm");
}

/** Cancel requires a reason (Step 16) - customer-initiated (or agency-attributed-to-customer) termination. */
export async function cancelReservation(formData: FormData) {
  const reservationId = z.string().min(1).parse(formData.get("reservationId"));
  const t = getDictionary(await getLocale());
  const cancelReason = z.enum(RESERVATION_CANCEL_REASON_VALUES).parse(formData.get("cancelReason"));
  const cancelReasonNote = (formData.get("cancelReasonNote") as string) || undefined;
  if (cancelReason === "OTHER" && !cancelReasonNote?.trim()) {
    throw new Error(t.validation.reservationCancelReasonNoteRequired);
  }
  await terminalReservationMove(reservationId, "reservation.cancel", "CANCELLED", "cancelledAt", (tt, num) => tt.reservation.activityCancelled(num), {
    cancelReason,
    cancelReasonNote,
  });
}

/** Explicit management Release (Step 17) - no customer cancellation reason involved; a deliberate, no-reason-required decision to let the Unit go. */
export async function releaseReservation(reservationId: string) {
  await terminalReservationMove(reservationId, "reservation.release", "RELEASED", "releasedAt", (tt, num) => tt.reservation.activityReleased(num));
}

export async function updateReservationAmountStatus(formData: FormData) {
  const reservationId = z.string().min(1).parse(formData.get("reservationId"));
  const { organizationId } = await requirePermissionAudited("reservation.amount.update", "Reservation", reservationId);
  const amountStatus = z.enum(RESERVATION_AMOUNT_STATUS_VALUES).parse(formData.get("reservationAmountStatus"));

  await prisma.$transaction(async (tx) => {
    const existing = await tx.reservation.findUniqueOrThrow({ where: { id: reservationId, organizationId } });
    const updated = await tx.reservation.update({ where: { id: reservationId, organizationId }, data: { reservationAmountStatus: amountStatus } });
    await auditUpdate(tx, {
      action: "UPDATE",
      entityType: "Reservation",
      entityId: updated.id,
      entityDisplayName: updated.reservationNumber,
      before: { reservationAmountStatus: existing.reservationAmountStatus },
      after: { reservationAmountStatus: updated.reservationAmountStatus },
    });
  });

  revalidatePath("/crm/reservations");
  revalidatePath(`/crm/reservations/${reservationId}`);
}

export async function updateReservationHoldUntil(formData: FormData) {
  const reservationId = z.string().min(1).parse(formData.get("reservationId"));
  const { organizationId } = await requirePermissionAudited("reservation.update", "Reservation", reservationId);
  const t = getDictionary(await getLocale());
  const holdUntil = z.coerce.date().parse(formData.get("holdUntil"));
  if (holdUntil <= new Date()) {
    throw new Error(t.validation.reservationHoldUntilFuture);
  }

  await prisma.$transaction(async (tx) => {
    const existing = await tx.reservation.findUniqueOrThrow({ where: { id: reservationId, organizationId } });
    if (!EDITABLE_RESERVATION_STATUSES.includes(existing.status)) {
      throw new Error(t.validation.reservationCannotEdit);
    }
    const updated = await tx.reservation.update({ where: { id: reservationId, organizationId }, data: { holdUntil } });
    await auditUpdate(tx, {
      entityType: "Reservation",
      entityId: updated.id,
      entityDisplayName: updated.reservationNumber,
      before: { holdUntil: existing.holdUntil },
      after: { holdUntil: updated.holdUntil },
    });
  });

  revalidatePath(`/crm/reservations/${reservationId}`);
}

export async function reassignReservationAgent(reservationId: string, assignedToUserId: string) {
  const { organizationId } = await requirePermissionAudited("reservation.update", "Reservation", reservationId);
  const t = getDictionary(await getLocale());
  await prisma.user.findUniqueOrThrow({ where: { id: assignedToUserId, organizationId } });

  await prisma.$transaction(async (tx) => {
    const existing = await tx.reservation.findUniqueOrThrow({ where: { id: reservationId, organizationId } });
    if (!EDITABLE_RESERVATION_STATUSES.includes(existing.status)) {
      throw new Error(t.validation.reservationCannotEdit);
    }
    const updated = await tx.reservation.update({ where: { id: reservationId, organizationId }, data: { assignedToUserId } });
    await auditUpdate(tx, {
      entityType: "Reservation",
      entityId: updated.id,
      entityDisplayName: updated.reservationNumber,
      before: { assignedToUserId: existing.assignedToUserId },
      after: { assignedToUserId: updated.assignedToUserId },
    });
  });

  revalidatePath(`/crm/reservations/${reservationId}`);
}

export interface ReservationListFilters {
  search?: string;
  status?: string;
  amountStatus?: string;
  assignedToUserId?: string;
  compoundId?: string;
  unitId?: string;
  leadId?: string;
  dateFrom?: Date;
  dateTo?: Date;
  holdUntilFrom?: Date;
  holdUntilTo?: Date;
  expiredOnly?: boolean;
  expiringToday?: boolean;
  activeOnly?: boolean;
  page?: number;
}

export async function listReservations(filters: ReservationListFilters = {}) {
  const { organizationId } = await requirePermission("reservation.view");
  await syncExpiredReservations(organizationId);
  const page = Math.max(1, filters.page ?? 1);

  let statusFilter = (filters.status as ReservationStatus) || undefined;
  if (filters.expiredOnly) statusFilter = "EXPIRED";

  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const endOfToday = new Date(startOfToday);
  endOfToday.setDate(endOfToday.getDate() + 1);

  const where: Prisma.ReservationWhereInput = {
    organizationId,
    status: filters.activeOnly ? { in: ["DRAFT", "PENDING", "CONFIRMED"] } : statusFilter,
    reservationAmountStatus: (filters.amountStatus as ReservationAmountStatus) || undefined,
    assignedToUserId: filters.assignedToUserId || undefined,
    leadId: filters.leadId || undefined,
    unitId: filters.unitId || undefined,
    createdAt: filters.dateFrom || filters.dateTo ? { gte: filters.dateFrom, lt: filters.dateTo } : undefined,
    holdUntil: filters.expiringToday
      ? { gte: startOfToday, lt: endOfToday }
      : filters.holdUntilFrom || filters.holdUntilTo
        ? { gte: filters.holdUntilFrom, lt: filters.holdUntilTo }
        : undefined,
    unit: filters.compoundId ? { floor: { building: { compoundId: filters.compoundId } } } : undefined,
    ...(filters.search
      ? {
          OR: [
            { reservationNumber: { contains: filters.search, mode: "insensitive" as const } },
            { lead: { fullName: { contains: filters.search, mode: "insensitive" as const } } },
          ],
        }
      : {}),
  };

  const [rows, total] = await Promise.all([
    prisma.reservation.findMany({
      where,
      include: {
        lead: { select: { id: true, fullName: true, leadNumber: true } },
        offer: { select: { id: true, offerNumber: true, versionNumber: true } },
        unit: { include: { floor: { include: { building: { include: { compound: true } } } } } },
        assignedToUser: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    prisma.reservation.count({ where }),
  ]);

  return { rows, total, page, pageSize: PAGE_SIZE, totalPages: Math.max(1, Math.ceil(total / PAGE_SIZE)) };
}

export async function getReservationById(reservationId: string) {
  const { organizationId } = await requirePermission("reservation.view");
  await syncExpiredReservations(organizationId);
  return prisma.reservation.findUniqueOrThrow({
    where: { id: reservationId, organizationId },
    include: {
      lead: true,
      offer: true,
      unit: { include: { floor: { include: { building: { include: { compound: true } } } } } },
      assignedToUser: { select: { id: true, name: true, email: true } },
    },
  });
}

/** The single active (DRAFT/PENDING/CONFIRMED) reservation for an Offer, if any (Step 18's Offer-profile integration) - null when none exists or the Offer isn't ACCEPTED. */
export async function getActiveReservationForOffer(offerId: string) {
  const { organizationId } = await requirePermission("reservation.view");
  await syncExpiredReservations(organizationId);
  return prisma.reservation.findFirst({
    where: { organizationId, offerId, status: { in: ["DRAFT", "PENDING", "CONFIRMED"] } },
    orderBy: { createdAt: "desc" },
  });
}

/** Every reservation for a Lead's profile page (Step 19), newest first. */
export async function getReservationsForLead(leadId: string) {
  const { organizationId } = await requirePermission("reservation.view");
  await syncExpiredReservations(organizationId);
  const reservations = await prisma.reservation.findMany({
    where: { organizationId, leadId },
    include: { unit: { select: { unitNumber: true } }, offer: { select: { offerNumber: true } } },
    orderBy: { createdAt: "desc" },
  });
  const active = reservations.find((r) => r.status === "DRAFT" || r.status === "PENDING" || r.status === "CONFIRMED") ?? null;
  return { reservations, active };
}

/** Per-unit active reservation summary for the Units list/detail (Step 20) - a single grouped query, not N+1. */
export async function getActiveReservationsForUnits(unitIds: string[]) {
  const { organizationId } = await requirePermission("reservation.view");
  if (unitIds.length === 0) return new Map<string, { reservationNumber: string; status: ReservationStatus; holdUntil: Date }>();
  await syncExpiredReservations(organizationId);
  const rows = await prisma.reservation.findMany({
    where: { organizationId, unitId: { in: unitIds }, status: { in: ["DRAFT", "PENDING", "CONFIRMED"] } },
    select: { unitId: true, reservationNumber: true, status: true, holdUntil: true },
  });
  return new Map(rows.map((r) => [r.unitId, { reservationNumber: r.reservationNumber, status: r.status, holdUntil: r.holdUntil }]));
}

/** ACCEPTED offers with no active reservation - drives /crm/reservations/new when no ?offerId= is supplied (Step 24). */
export async function listReservableOffers() {
  const { organizationId } = await requirePermission("reservation.create");
  const offers = await prisma.leasingOffer.findMany({
    where: { organizationId, status: "ACCEPTED" },
    include: { lead: { select: { fullName: true } }, unit: { select: { unitNumber: true } } },
    orderBy: { acceptedAt: "desc" },
  });
  if (offers.length === 0) return [];
  const activeReservations = await prisma.reservation.findMany({
    where: { organizationId, offerId: { in: offers.map((o) => o.id) } },
  });
  const blockedOfferIds = new Set(activeReservations.filter((r) => blocksNewReservationForOffer(r.status)).map((r) => r.offerId));
  return offers.filter((o) => !blockedOfferIds.has(o.id));
}

export async function listReservationAssignableUsers() {
  const { organizationId } = await requirePermission("reservation.create");
  return prisma.user.findMany({
    where: { organizationId, isActive: true },
    select: { id: true, name: true, email: true, role: true },
    orderBy: { name: "asc" },
  });
}
