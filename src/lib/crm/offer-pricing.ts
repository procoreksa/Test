/**
 * Pure Leasing Offer pricing calculation, deliberately DB-free (same pattern
 * as src/lib/crm/viewing-rules.ts and src/lib/crm/lead-rules.ts) so every
 * number on an Offer can be unit-tested without a database, and so the same
 * function drives both the server-side persisted calculation and the
 * client-side live preview on the New/Edit Offer form (isomorphic, no
 * "use server"/Prisma import here).
 *
 * Reuses existing conventions rather than inventing new financial logic:
 * - round2()/STANDARD_VAT_RATE from src/lib/zatca/vat.ts (same rounding and
 *   default VAT rate every invoice line already uses).
 * - Rent itself carries NO VAT at Offer stage, matching Contract.vatApplicable
 *   defaulting to false for residential leasing (see docs/LEASING-OFFERS.md,
 *   "VAT behavior") - only the leasing commission is taxed, mirroring
 *   EXTRA_CHARGE_VAT_RATE in src/lib/actions/invoices.ts ("commission/
 *   cleaning are always-taxable services, independent of the rent's VAT
 *   treatment").
 * - securityDeposit/contractFee carry no VAT, matching InvoiceLineKind.
 *   SECURITY_DEPOSIT always being written with vatRate: 0.
 */
import type { PaymentFrequency } from "@prisma/client";
import { round2, STANDARD_VAT_RATE } from "@/lib/zatca/vat";

export interface OfferPricingInput {
  annualRent: number;
  /** At most one of discountAmount/discountPercentage is normally supplied by the form; if both are, discountAmount wins (Step 6). */
  discountAmount?: number;
  discountPercentage?: number;
  /** Flat override; if omitted, computed from commissionRate * netAnnualRent. */
  commissionAmount?: number;
  /** Percentage of netAnnualRent, used only when commissionAmount is not supplied directly. */
  commissionRate?: number;
  commissionVatRate?: number;
  securityDeposit: number;
  contractFee?: number;
  paymentFrequency: PaymentFrequency;
}

export interface OfferPricingResult {
  grossAnnualRent: number;
  discountAmount: number;
  /** Always computed (regardless of which discount input mode was used) so the >10% approval threshold has one authoritative number to check - see requiresManagerEscalation() below. */
  discountPercentage: number;
  netAnnualRent: number;
  leasingCommissionAmount: number;
  commissionVatRate: number;
  commissionVatAmount: number;
  totalCommissionWithVat: number;
  securityDeposit: number;
  contractFee: number;
  installmentCount: number;
  installmentAmount: number;
  /** First installment + deposit + contract fee + commission-with-VAT: the amount indicatively due at signing (Step 8/24). */
  initialPaymentTotal: number;
}

/** Number of rent installments implied by a payment frequency - matches the same concept already used for Contract schedules, just without generating PaymentSchedule rows (Step 8: presentation only). */
export function installmentCountForFrequency(frequency: PaymentFrequency): number {
  switch (frequency) {
    case "MONTHLY":
      return 12;
    case "QUARTERLY":
      return 4;
    case "SEMI_ANNUAL":
      return 2;
    case "ANNUAL":
    case "ONE_TIME":
    default:
      return 1;
  }
}

export function computeOfferPricing(input: OfferPricingInput): OfferPricingResult {
  const grossAnnualRent = round2(Math.max(0, input.annualRent));

  let discountAmount: number;
  if (input.discountAmount != null) {
    discountAmount = round2(Math.max(0, input.discountAmount));
  } else if (input.discountPercentage != null) {
    discountAmount = round2((grossAnnualRent * Math.max(0, input.discountPercentage)) / 100);
  } else {
    discountAmount = 0;
  }
  discountAmount = Math.min(discountAmount, grossAnnualRent);

  const discountPercentage = grossAnnualRent > 0 ? round2((discountAmount / grossAnnualRent) * 100) : 0;
  const netAnnualRent = round2(grossAnnualRent - discountAmount);

  const commissionVatRate = input.commissionVatRate ?? STANDARD_VAT_RATE;
  let leasingCommissionAmount: number;
  if (input.commissionAmount != null) {
    leasingCommissionAmount = round2(Math.max(0, input.commissionAmount));
  } else if (input.commissionRate != null) {
    leasingCommissionAmount = round2((netAnnualRent * Math.max(0, input.commissionRate)) / 100);
  } else {
    leasingCommissionAmount = 0;
  }
  const commissionVatAmount = round2((leasingCommissionAmount * commissionVatRate) / 100);
  const totalCommissionWithVat = round2(leasingCommissionAmount + commissionVatAmount);

  const securityDeposit = round2(Math.max(0, input.securityDeposit));
  const contractFee = round2(Math.max(0, input.contractFee ?? 0));

  const installmentCount = installmentCountForFrequency(input.paymentFrequency);
  const installmentAmount = installmentCount > 0 ? round2(netAnnualRent / installmentCount) : netAnnualRent;

  const initialPaymentTotal = round2(installmentAmount + securityDeposit + contractFee + totalCommissionWithVat);

  return {
    grossAnnualRent,
    discountAmount,
    discountPercentage,
    netAnnualRent,
    leasingCommissionAmount,
    commissionVatRate,
    commissionVatAmount,
    totalCommissionWithVat,
    securityDeposit,
    contractFee,
    installmentCount,
    installmentAmount,
    initialPaymentTotal,
  };
}

/**
 * Sensible security-deposit default: one rent installment's worth (Step 7,
 * "provide sensible default based on existing lease behavior" - Contract
 * itself has no fixed deposit formula, so this mirrors the most common
 * real-world convention of "one installment as deposit" without inventing a
 * new business rule the existing Contract module doesn't already imply).
 */
export function defaultSecurityDeposit(netAnnualRent: number, paymentFrequency: PaymentFrequency): number {
  const count = installmentCountForFrequency(paymentFrequency);
  return round2(netAnnualRent / count);
}
