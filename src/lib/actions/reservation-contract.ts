"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requirePermission, requireSession } from "@/lib/session";
import { getLocale, getDictionary } from "@/lib/i18n";
import { auditCreate, auditAction, requirePermissionAudited } from "@/lib/audit";
import { createContractWithSchedule } from "@/lib/contract-schedule";
import { mapOfferToContractInput } from "@/lib/crm/reservation-contract-mapping";
import { isValidReservationTransition, BLOCKING_UNIT_RESERVATION_STATUSES } from "@/lib/crm/reservation-rules";
import { resolveRenterForLead } from "@/lib/actions/leads";
import { syncExpiredReservations } from "@/lib/actions/reservations";

type Tx = Prisma.TransactionClient;

/**
 * Read-only data for the pre-conversion review page
 * (/crm/reservations/[id]/create-contract, Step 23) - never writes
 * anything, safe to load repeatedly while the user reviews. All real
 * eligibility enforcement happens again, server-side, inside
 * convertReservationToContract() itself - this is a display convenience
 * only, never a substitute for that check (same "UI visibility is not
 * security" principle as every other module - see docs/PERMISSIONS.md §5).
 */
export async function getReservationConversionPreview(reservationId: string) {
  const { organizationId } = await requirePermission("reservation.view");
  await syncExpiredReservations(organizationId);
  return prisma.reservation.findUniqueOrThrow({
    where: { id: reservationId, organizationId },
    include: {
      lead: true,
      offer: true,
      unit: { include: { floor: { include: { building: { include: { compound: true } } } } } },
    },
  });
}

/**
 * Orchestrates Reservation -> Contract creation (see
 * docs/RESERVATION-TO-CONTRACT.md for the full design). Deliberately a
 * thin orchestration layer over the existing, unmodified
 * createContractWithSchedule() - the same core service both
 * createContract() and renewContract() already call - so this becomes a
 * third caller rather than a second contract-creation engine (Step 8).
 *
 * Every relation is re-verified from the database inside this single
 * Serializable transaction, never trusted from the caller: Reservation ->
 * Offer -> Lead/Unit are all re-read and cross-checked against each
 * other, matching the "never trust client-provided IDs" instruction -
 * the only client input to this whole function is `reservationId` itself.
 *
 * Returns the resulting Contract id. Callers that need a redirect
 * (the create-contract page's own form action) call redirect() themselves
 * after this resolves, following the same convention renewContract() uses.
 */
export async function convertReservationToContract(reservationId: string): Promise<string> {
  const { organizationId } = await requirePermissionAudited("reservation.convert", "Reservation", reservationId);
  const { user } = await requireSession();
  const t = getDictionary(await getLocale());

  await syncExpiredReservations(organizationId);

  let offerIdForRevalidate = "";
  let leadIdForRevalidate = "";

  const contractId = await prisma.$transaction(
    async (tx: Tx) => {
      const reservation = await tx.reservation.findUniqueOrThrow({ where: { id: reservationId, organizationId } });
      offerIdForRevalidate = reservation.offerId;
      leadIdForRevalidate = reservation.leadId;

      // Step 17: idempotency - a retried request or a double-click on an
      // already-converted reservation returns the existing Contract
      // instead of erroring or creating a second one. The physical FK
      // lives on Contract.reservationId (see schema.prisma), so the
      // existing Contract is looked up from that side.
      if (reservation.status === "CONVERTED_TO_CONTRACT") {
        const existingContract = await tx.contract.findFirst({ where: { organizationId, reservationId: reservation.id } });
        if (!existingContract) {
          // Should be unreachable (both writes happen in the same
          // transaction below) - defensive rather than silently failing.
          throw new Error(t.reservationContract.alreadyConverted);
        }
        return existingContract.id;
      }

      // Step 2: only a CONFIRMED reservation may convert - reuses the
      // single source of truth for legal transitions (reservation-rules.ts)
      // rather than a second, parallel status check here.
      if (!isValidReservationTransition(reservation.status, "CONVERTED_TO_CONTRACT")) {
        throw new Error(t.validation.reservationNotConfirmedForConversion);
      }

      // Step 2: every relation cross-verified server-side, never trusted
      // from the Reservation row alone.
      const offer = await tx.leasingOffer.findUniqueOrThrow({ where: { id: reservation.offerId, organizationId } });
      if (offer.leadId !== reservation.leadId || offer.unitId !== reservation.unitId) {
        throw new Error(t.validation.reservationOfferMismatch);
      }
      // Step 6: the accepted Offer must still be ACCEPTED (never SUPERSEDED/
      // CANCELLED/etc.) - since ACCEPTED offers can never be revised
      // (see docs/RESERVATION-MANAGEMENT.md §11), this is normally
      // guaranteed already, but re-checked here rather than assumed.
      if (offer.status !== "ACCEPTED") {
        throw new Error(t.validation.reservationOfferNotAccepted);
      }
      if (!offer.leaseStartDate) {
        throw new Error(t.validation.offerMissingLeaseStartDate);
      }

      const lead = await tx.lead.findUniqueOrThrow({ where: { id: reservation.leadId, organizationId } });
      const unit = await tx.unit.findUniqueOrThrow({ where: { id: reservation.unitId, organizationId } });

      // Step 3: Unit must still be RESERVED (covers OCCUPIED/MAINTENANCE/
      // VACANT-drift with one check - this schema has no separate
      // "BLOCKED" status). Never silently repaired - a clear rejection
      // instead.
      if (unit.status !== "RESERVED") {
        throw new Error(t.validation.reservationUnitNotEligible);
      }
      // Reject if a DIFFERENT active reservation is also contesting this
      // Unit (shouldn't be possible given the invariants
      // confirmReservation()/releaseUnitIfSafe() maintain, but checked
      // explicitly per Step 3's own instruction rather than assumed).
      const conflictingReservation = await tx.reservation.findFirst({
        where: { organizationId, unitId: unit.id, status: { in: [...BLOCKING_UNIT_RESERVATION_STATUSES] }, id: { not: reservation.id } },
      });
      if (conflictingReservation) {
        throw new Error(t.validation.reservationUnitConflict);
      }
      // Step 21: existing Contract conflict - do not rely solely on
      // Unit.status (mirrors releaseUnitIfSafe()'s own defense-in-depth
      // ACTIVE-contract check).
      const activeContract = await tx.contract.findFirst({ where: { organizationId, unitId: unit.id, status: "ACTIVE" } });
      if (activeContract) {
        throw new Error(t.validation.unitAlreadyOccupied);
      }

      // Step 4: Lead -> Renter, reusing the shared resolver (never a
      // second implementation of convertLeadToRenter()'s own logic).
      const { renterId } = await resolveRenterForLead(tx, organizationId, lead);

      // Step 5/9/10: the accepted Offer is the sole commercial source of
      // truth - never the Unit's own base rent.
      const mapped = mapOfferToContractInput(
        {
          netAnnualRent: Number(offer.netAnnualRent),
          paymentFrequency: offer.paymentFrequency,
          securityDeposit: Number(offer.securityDeposit),
          leasingCommissionAmount: Number(offer.leasingCommissionAmount),
          leaseDurationMonths: offer.leaseDurationMonths,
          specialTerms: offer.specialTerms,
        },
        offer.leaseStartDate
      );

      // Step 7/8/9/11: the exact existing contract-creation service -
      // numbering, payment-schedule generation, and the Unit ->
      // OCCUPIED write (Step 15: Contract is created ACTIVE immediately,
      // exactly like manual creation, so occupancy begins now) all reused
      // verbatim, never reimplemented.
      const contract = await createContractWithSchedule(tx, organizationId, {
        unitId: unit.id,
        renterId,
        startDate: mapped.startDate,
        endDate: mapped.endDate,
        rentAmount: mapped.rentAmount,
        paymentFrequency: mapped.paymentFrequency,
        securityDeposit: mapped.securityDeposit,
        commissionAmount: mapped.commissionAmount,
        extraChargesMode: mapped.extraChargesMode,
        vatApplicable: unit.vatApplicable,
        notes: mapped.notes,
      });

      // Step 13: the one physical relation, both directions.
      await tx.contract.update({ where: { id: contract.id, organizationId }, data: { reservationId: reservation.id } });

      // Step 12: Reservation becomes terminal.
      const updatedReservation = await tx.reservation.update({
        where: { id: reservation.id, organizationId },
        data: { status: "CONVERTED_TO_CONTRACT", convertedAt: new Date() },
      });

      // Step 14: Lead -> WON only now, after the Contract itself exists -
      // never before the transaction is guaranteed to commit.
      const updatedLead = await tx.lead.update({
        where: { id: lead.id, organizationId },
        data: { status: "WON", convertedContractId: contract.id, convertedRenterId: renterId },
      });

      // Step 29: audit, reusing only existing AuditAction values.
      await auditCreate(tx, {
        entityType: "Contract",
        entityId: contract.id,
        entityDisplayName: contract.contractNumber,
        newValues: {
          unitId: unit.id,
          renterId,
          startDate: mapped.startDate,
          endDate: mapped.endDate,
          rentAmount: mapped.rentAmount,
          paymentFrequency: mapped.paymentFrequency,
        },
        metadata: {
          reservationId: reservation.id,
          reservationNumber: reservation.reservationNumber,
          offerId: offer.id,
          offerNumber: offer.offerNumber,
          leadId: lead.id,
          unitId: unit.id,
          renterId,
          contractId: contract.id,
          contractNumber: contract.contractNumber,
        },
      });
      await auditAction(tx, {
        action: "UPDATE",
        entityType: "Reservation",
        entityId: updatedReservation.id,
        entityDisplayName: updatedReservation.reservationNumber,
        previousValues: { status: reservation.status },
        newValues: { status: "CONVERTED_TO_CONTRACT" },
        metadata: { contractId: contract.id, contractNumber: contract.contractNumber },
      });
      await auditAction(tx, {
        action: "APPROVE",
        entityType: "Lead",
        entityId: updatedLead.id,
        entityDisplayName: updatedLead.leadNumber,
        previousValues: { status: lead.status },
        newValues: { status: "WON", convertedContractId: contract.id, convertedRenterId: renterId },
        metadata: { contractId: contract.id, contractNumber: contract.contractNumber },
      });

      // Step 30: LeadActivity, reusing the existing STATUS_CHANGE type
      // (same convention every other Reservation/Offer lifecycle event
      // uses).
      await tx.leadActivity.create({
        data: {
          organizationId,
          leadId: lead.id,
          activityType: "STATUS_CHANGE",
          subject: t.reservation.activityContractCreated(contract.contractNumber, unit.unitNumber),
          createdByUserId: user.id,
        },
      });

      return contract.id;
    },
    { isolationLevel: "Serializable" }
  );

  revalidatePath("/crm/reservations");
  revalidatePath(`/crm/reservations/${reservationId}`);
  if (offerIdForRevalidate) revalidatePath(`/crm/offers/${offerIdForRevalidate}`);
  if (leadIdForRevalidate) revalidatePath(`/crm/leads/${leadIdForRevalidate}`);
  revalidatePath("/crm/pipeline");
  revalidatePath("/crm");
  revalidatePath("/contracts");
  revalidatePath("/units");
  revalidatePath("/dashboard");

  return contractId;
}

/**
 * The Contract that resulted from this Offer's Reservation, if any (Step
 * 25 of docs/RESERVATION-TO-CONTRACT.md's Offer-profile integration) -
 * null when the Offer's reservation (if it has one) hasn't converted yet.
 * Deliberately a separate, lightweight query rather than widening
 * getActiveReservationForOffer() (which is specifically "active,
 * unconverted" - see docs/RESERVATION-MANAGEMENT.md §11).
 */
export async function getConvertedContractForOffer(offerId: string) {
  const { organizationId } = await requirePermission("reservation.view");
  const reservation = await prisma.reservation.findFirst({
    where: { organizationId, offerId, status: "CONVERTED_TO_CONTRACT" },
    include: { convertedContract: { select: { id: true, contractNumber: true, status: true } } },
    orderBy: { createdAt: "desc" },
  });
  return reservation?.convertedContract ?? null;
}

/** Thin wrapper for the create-contract page's <form action> - converts, then redirects to the existing Contract detail/edit page (Step 24), never a separate "converted contracts" view. */
export async function convertReservationToContractAndRedirect(reservationId: string): Promise<never> {
  const contractId = await convertReservationToContract(reservationId);
  redirect(`/contracts/${contractId}/edit`);
}
