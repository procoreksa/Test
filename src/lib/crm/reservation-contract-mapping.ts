/**
 * Pure, DB-free Offer -> Contract commercial mapping (Step 5/9/10 of
 * docs/RESERVATION-TO-CONTRACT.md) - deliberately isolated from any Prisma
 * call so it can be unit-tested directly and so the reservation-conversion
 * action and its tests share one authoritative source for "what does this
 * Offer become as a Contract."
 *
 * The one non-obvious piece: `Contract.rentAmount` is the amount due PER
 * INSTALLMENT at the chosen frequency, not the annual total (confirmed by
 * src/lib/schedule.ts's own doc comment and the manual contract form's
 * field label, "Installment Amount (SAR)"). Offer.netAnnualRent is always
 * the annual figure, so it must be divided by installments-per-year before
 * it can become Contract.rentAmount - getting this wrong would silently
 * quadruple (or quarter) every invoice a Quarterly/Monthly contract ever
 * issues.
 */
import { addMonths } from "date-fns";
import type { PaymentFrequency } from "@prisma/client";
import { round2 } from "@/lib/zatca/vat";

const INSTALLMENTS_PER_YEAR: Record<Exclude<PaymentFrequency, "ONE_TIME">, number> = {
  MONTHLY: 12,
  QUARTERLY: 4,
  SEMI_ANNUAL: 2,
  ANNUAL: 1,
};

/**
 * Converts an annual figure into the existing Contract.rentAmount
 * convention (per-installment). ONE_TIME has no "installments per year" -
 * the entire lease term is one installment, so the amount is the annual
 * rent scaled by the lease term in years (matching how src/lib/schedule.ts
 * treats a ONE_TIME contract's rentAmount as the full-term total).
 */
export function computeContractRentAmount(netAnnualRent: number, paymentFrequency: PaymentFrequency, leaseDurationMonths: number): number {
  if (paymentFrequency === "ONE_TIME") {
    return round2(netAnnualRent * (leaseDurationMonths / 12));
  }
  return round2(netAnnualRent / INSTALLMENTS_PER_YEAR[paymentFrequency]);
}

/** Reuses date-fns's addMonths - the exact same function src/lib/schedule.ts already uses to step installment periods - rather than inventing a second date convention (Step 10). */
export function computeLeaseEndDate(leaseStartDate: Date, leaseDurationMonths: number): Date {
  return addMonths(leaseStartDate, leaseDurationMonths);
}

export interface OfferCommercialSnapshot {
  netAnnualRent: number;
  paymentFrequency: PaymentFrequency;
  securityDeposit: number;
  leasingCommissionAmount: number;
  leaseDurationMonths: number;
  specialTerms: string | null;
}

export interface ContractMappingResult {
  startDate: Date;
  endDate: Date;
  rentAmount: number;
  paymentFrequency: PaymentFrequency;
  securityDeposit: number | undefined;
  commissionAmount: number | undefined;
  extraChargesMode: "ONE_TIME";
  notes: string | undefined;
}

/**
 * The accepted Offer is the sole commercial source of truth (Step 5) -
 * this function never reads or infers from the Unit's own base rent.
 * `leaseStartDate` is taken as an explicit, already-validated parameter
 * (the caller rejects a missing Offer.leaseStartDate before ever reaching
 * here - see Step 6, "reject rather than silently adjust").
 *
 * Fields Contract has no equivalent for are simply not mapped (documented
 * in docs/RESERVATION-TO-CONTRACT.md, not invented): Offer.contractFee
 * (Contract has no contractFee column), Offer.furnishedStatus (Contract
 * has no furnishing column), and Contract.cleaningAmount (Offer has no
 * cleaning-fee field at all). extraChargesMode defaults to "ONE_TIME",
 * matching Contract's own schema default and the manual creation form's
 * default selection.
 */
export function mapOfferToContractInput(offer: OfferCommercialSnapshot, leaseStartDate: Date): ContractMappingResult {
  return {
    startDate: leaseStartDate,
    endDate: computeLeaseEndDate(leaseStartDate, offer.leaseDurationMonths),
    rentAmount: computeContractRentAmount(offer.netAnnualRent, offer.paymentFrequency, offer.leaseDurationMonths),
    paymentFrequency: offer.paymentFrequency,
    securityDeposit: offer.securityDeposit > 0 ? offer.securityDeposit : undefined,
    commissionAmount: offer.leasingCommissionAmount > 0 ? offer.leasingCommissionAmount : undefined,
    extraChargesMode: "ONE_TIME",
    notes: offer.specialTerms ?? undefined,
  };
}
