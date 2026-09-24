import { prisma } from "@/lib/prisma";
import { addDays } from "date-fns";
import { computeConversionRate } from "@/lib/crm/lead-rules";
import { computeViewingCompletionRate } from "@/lib/crm/viewing-rules";
import { computeOfferAcceptanceRate } from "@/lib/crm/offer-rules";
import { computeReservationConfirmationRate, computeReservationToContractConversionRate } from "@/lib/crm/reservation-rules";
import type { ResolvedExecutiveFilters } from "@/lib/executive/filters";

/**
 * Contract KPIs (Steps 12/13) - Active Contracts and the 30/60/90-day expiry
 * windows are always "as of now", never period-filtered (Critical Principle
 * 4: snapshot). `contractsPastEndDate` surfaces the confirmed pre-existing
 * gap that `ContractStatus.EXPIRED` is never written anywhere in this
 * codebase (grep-confirmed during the Step 1 audit) - an ACTIVE Contract
 * whose own `endDate` has already passed. This is deliberately NOT "fixed"
 * by inferring EXPIRED from the date here (Step 12 forbids inventing a
 * status the domain layer never sets); it is surfaced via the Attention
 * Center instead, so this pre-existing behavior is visible rather than
 * silently accepted.
 */
export interface ContractsSummary {
  activeContracts: number;
  contractsExpiring30: number;
  contractsExpiring60: number;
  contractsExpiring90: number;
  contractsPastEndDate: number;
}

function unitScope(filters: Pick<ResolvedExecutiveFilters, "compoundId" | "buildingId">) {
  if (filters.buildingId) return { unit: { floor: { buildingId: filters.buildingId } } };
  if (filters.compoundId) return { unit: { floor: { building: { compoundId: filters.compoundId } } } };
  return {};
}

export async function getContractsSummary(organizationId: string, filters: Pick<ResolvedExecutiveFilters, "compoundId" | "buildingId">, now: Date): Promise<ContractsSummary> {
  const scope = unitScope(filters);
  const [activeContracts, expiring30, expiring60, expiring90, pastEndDate] = await Promise.all([
    prisma.contract.count({ where: { organizationId, status: "ACTIVE", ...scope } }),
    prisma.contract.count({ where: { organizationId, status: "ACTIVE", endDate: { gte: now, lte: addDays(now, 30) }, ...scope } }),
    prisma.contract.count({ where: { organizationId, status: "ACTIVE", endDate: { gte: now, lte: addDays(now, 60) }, ...scope } }),
    prisma.contract.count({ where: { organizationId, status: "ACTIVE", endDate: { gte: now, lte: addDays(now, 90) }, ...scope } }),
    prisma.contract.count({ where: { organizationId, status: "ACTIVE", endDate: { lt: now }, ...scope } }),
  ]);
  return { activeContracts, contractsExpiring30: expiring30, contractsExpiring60: expiring60, contractsExpiring90: expiring90, contractsPastEndDate: pastEndDate };
}

/**
 * Leasing funnel (Step 14) - reuses every existing rate formula verbatim
 * (never a second conversion-rate implementation). Deliberately counts-only
 * across stages (no attempt at a single cohort-tracked "Lead-to-Contract %"
 * over one time basis, since leads/viewings/offers/reservations/contracts
 * created in the same period are not the same underlying cohort - a
 * documented limitation, not an oversight).
 *
 * Per-stage timing is intentionally mixed, because the underlying schema is
 * mixed (Step 1 audit finding):
 *  - Offer (acceptedAt/rejectedAt) and Reservation (confirmedAt/cancelledAt/
 *    expiredAt/convertedAt/releasedAt) each carry real per-outcome
 *    timestamps, so those counts are "the outcome happened in this period" -
 *    genuinely period-accurate.
 *  - Lead and Viewing have no such per-outcome timestamp (Lead has no
 *    wonAt/lostAt; Viewing has completedAt but no cancelledAt/noShowAt), so
 *    those two remain a cohort metric: "of the Leads/Viewings CREATED in
 *    this period, how many are (as of now) in each terminal status" - a
 *    real, single, consistently-applied definition, just not the same kind
 *    of period-accuracy as Offer/Reservation. This mix is documented in
 *    docs/EXECUTIVE-DASHBOARDS.md rather than papered over with a fake
 *    shared timestamp.
 */
export interface LeasingFunnelSummary {
  leadsNew: number;
  leadsWon: number;
  leadsLost: number;
  leadConversionRate: number;
  viewingsCompleted: number;
  viewingCompletionRate: number;
  offersAccepted: number;
  offerAcceptanceRate: number;
  reservationsConfirmed: number;
  reservationConfirmationRate: number;
  reservationToContractRate: number;
  contractsSigned: number;
}

export async function getLeasingFunnelSummary(organizationId: string, period: { gte: Date; lt: Date }): Promise<LeasingFunnelSummary> {
  const [
    leadsNew,
    leadsWon,
    leadsLost,
    viewingsCompleted,
    viewingsCancelled,
    viewingsNoShow,
    offersAccepted,
    offersRejected,
    reservationsConfirmed,
    reservationsCancelled,
    reservationsExpired,
    reservationsConverted,
    reservationsReleased,
    contractsSigned,
  ] = await Promise.all([
    prisma.lead.count({ where: { organizationId, createdAt: period } }),
    prisma.lead.count({ where: { organizationId, status: "WON", createdAt: period } }),
    prisma.lead.count({ where: { organizationId, status: "LOST", createdAt: period } }),
    prisma.viewing.count({ where: { organizationId, status: "COMPLETED", createdAt: period } }),
    prisma.viewing.count({ where: { organizationId, status: "CANCELLED", createdAt: period } }),
    prisma.viewing.count({ where: { organizationId, status: "NO_SHOW", createdAt: period } }),
    prisma.leasingOffer.count({ where: { organizationId, status: "ACCEPTED", acceptedAt: period } }),
    prisma.leasingOffer.count({ where: { organizationId, status: "REJECTED", rejectedAt: period } }),
    prisma.reservation.count({ where: { organizationId, status: "CONFIRMED", confirmedAt: period } }),
    prisma.reservation.count({ where: { organizationId, status: "CANCELLED", cancelledAt: period } }),
    prisma.reservation.count({ where: { organizationId, status: "EXPIRED", expiredAt: period } }),
    prisma.reservation.count({ where: { organizationId, convertedContract: { isNot: null }, convertedAt: period } }),
    prisma.reservation.count({ where: { organizationId, status: "RELEASED", releasedAt: period } }),
    prisma.contract.count({ where: { organizationId, createdAt: period } }),
  ]);

  return {
    leadsNew,
    leadsWon,
    leadsLost,
    leadConversionRate: computeConversionRate(leadsWon, leadsLost),
    viewingsCompleted,
    viewingCompletionRate: computeViewingCompletionRate(viewingsCompleted, viewingsCancelled, viewingsNoShow),
    offersAccepted,
    offerAcceptanceRate: computeOfferAcceptanceRate(offersAccepted, offersRejected),
    reservationsConfirmed,
    reservationConfirmationRate: computeReservationConfirmationRate(reservationsConfirmed, reservationsCancelled, reservationsExpired),
    reservationToContractRate: computeReservationToContractConversionRate(reservationsConverted, reservationsCancelled, reservationsExpired, reservationsReleased),
    contractsSigned,
  };
}
