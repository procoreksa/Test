"use server";

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireTenantPrincipal, requireTenantContractAccess } from "@/lib/tenant-session";
import { computeAvailableDepositBalance, computeRefundRemaining } from "@/lib/security-deposit-rules";
import { settlementVisibilityForTenant, type TenantSettlementVisibility } from "@/lib/portal/tenancy-rules";

/** Step 43/44 - deposit position is always shown from the authoritative ledger, contractual deposit is display-only context, never labeled "Available" (mirrors the internal workspace's own depositOverCollectedNotice wording). */
export async function getTenantDepositPosition(contractId: string) {
  const { contract } = await requireTenantContractAccess(contractId);
  const { organizationId } = await requireTenantPrincipal();

  const ledgerEntries = await prisma.securityDepositLedgerEntry.findMany({ where: { organizationId, contractId }, select: { debit: true, credit: true } });
  const availableDeposit = computeAvailableDepositBalance(ledgerEntries);
  return { requiredDeposit: contract.securityDeposit ?? new Prisma.Decimal(0), availableDeposit };
}

export interface TenantSettlementView {
  visibility: TenantSettlementVisibility;
  settlementNumber: string;
  status: string;
  assessments: Array<{ id: string; category: string; description: string; approvedAmount: Prisma.Decimal; waivedAmount: Prisma.Decimal }>;
  depositApplied: Prisma.Decimal | null;
  refundDue: Prisma.Decimal | null;
  refundPaid: Prisma.Decimal;
  refundRemaining: Prisma.Decimal | null;
  additionalDue: Prisma.Decimal | null;
  additionalDueInvoice: { id: string; invoiceNumber: string; status: string } | null;
}

/**
 * Step 45-49 - visibility-by-status is applied here, once, via
 * settlementVisibilityForTenant(): HIDDEN returns null (the tenant sees
 * nothing - not even that a settlement exists yet - Step 44's "no
 * estimated deductions, no unapproved assessments"). Only TENANT-
 * responsibility approved assessments are ever included (Step 46) - OWNER/
 * PROPERTY_MANAGEMENT/VENDOR/WARRANTY/UNDETERMINED/NO_CHARGE assessments,
 * proposed-but-not-approved amounts, and disputed status are never exposed
 * (Step 47 - dispute submission is out of scope for this phase; a disputed
 * assessment simply isn't part of what a tenant is shown until resolved
 * and approved).
 */
export async function getTenantSettlement(contractId: string): Promise<TenantSettlementView | null> {
  await requireTenantContractAccess(contractId);
  const { organizationId } = await requireTenantPrincipal();

  const settlement = await prisma.securityDepositSettlement.findFirst({
    where: { organizationId, contractId },
    select: {
      settlementNumber: true,
      status: true,
      approvedDepositApplied: true,
      approvedRefundDue: true,
      approvedAdditionalDue: true,
      liabilityAssessments: { where: { responsibility: "TENANT" }, select: { id: true, category: true, description: true, descriptionAr: true, approvedAmount: true, waivedAmount: true } },
      refunds: { where: { status: "PAID" }, select: { amount: true } },
      additionalDueInvoices: { select: { id: true, invoiceNumber: true, status: true } },
    },
  });
  if (!settlement) return null;

  const visibility = settlementVisibilityForTenant(settlement.status);
  if (visibility === "HIDDEN") return null;

  const refundPaid = settlement.refunds.reduce((sum, r) => sum.plus(r.amount), new Prisma.Decimal(0));
  const refundRemaining = settlement.approvedRefundDue !== null ? computeRefundRemaining(settlement.approvedRefundDue, refundPaid) : null;

  return {
    visibility,
    settlementNumber: settlement.settlementNumber,
    status: settlement.status,
    assessments: settlement.liabilityAssessments
      .filter((a) => a.approvedAmount !== null && Number(a.approvedAmount) > 0)
      .map((a) => ({ id: a.id, category: a.category, description: a.description, approvedAmount: a.approvedAmount ?? new Prisma.Decimal(0), waivedAmount: a.waivedAmount })),
    depositApplied: settlement.approvedDepositApplied,
    refundDue: settlement.approvedRefundDue,
    refundPaid,
    refundRemaining,
    additionalDue: settlement.approvedAdditionalDue,
    additionalDueInvoice: settlement.additionalDueInvoices[0] ?? null,
  };
}
