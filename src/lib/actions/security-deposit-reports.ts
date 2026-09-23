"use server";

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/session";
import { computeAvailableDepositBalance, computeRefundRemaining } from "@/lib/security-deposit-rules";

// Step 107 - every report here is server-side paginated; none of them ever
// loads the full dataset for client-side filtering.
const PAGE_SIZE = 25;

function pageOf(page?: number) {
  return Math.max(1, page ?? 1);
}

/** Step 69 - Settlement Report: every settlement with its deposit-position and outcome figures. Collected deposit is computed from a single bounded query across the involved contracts' ledger entries - never N+1 per row. */
export async function getSettlementReport(page?: number) {
  const { organizationId } = await requirePermission("securityDeposit.view");
  const p = pageOf(page);

  const [rows, total] = await Promise.all([
    prisma.securityDepositSettlement.findMany({
      where: { organizationId },
      include: {
        contract: { select: { contractNumber: true, securityDeposit: true } },
        unit: { select: { unitNumber: true } },
        renter: { select: { fullName: true, fullNameAr: true } },
        moveOut: { select: { moveOutNumber: true } },
      },
      orderBy: { createdAt: "desc" },
      skip: (p - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    prisma.securityDepositSettlement.count({ where: { organizationId } }),
  ]);

  const contractIds = Array.from(new Set(rows.map((r) => r.contractId)));
  const ledgerEntries = contractIds.length
    ? await prisma.securityDepositLedgerEntry.findMany({ where: { organizationId, contractId: { in: contractIds } }, select: { contractId: true, debit: true, credit: true } })
    : [];
  const balanceByContract = new Map<string, Prisma.Decimal>();
  for (const contractId of contractIds) {
    balanceByContract.set(contractId, computeAvailableDepositBalance(ledgerEntries.filter((e) => e.contractId === contractId)));
  }

  const enriched = rows.map((r) => ({
    ...r,
    requiredDeposit: r.contract.securityDeposit ?? new Prisma.Decimal(0),
    collectedDeposit: balanceByContract.get(r.contractId) ?? new Prisma.Decimal(0),
  }));

  return { rows: enriched, page: p, totalPages: Math.max(1, Math.ceil(total / PAGE_SIZE)) };
}

/** Step 39/68 - Deposit Balance Report: every Contract with either a contractual deposit or actual ledger activity. */
export async function getDepositBalanceReport(page?: number) {
  const { organizationId } = await requirePermission("securityDeposit.view");
  const p = pageOf(page);

  const where: Prisma.ContractWhereInput = {
    organizationId,
    OR: [{ securityDeposit: { not: null } }, { securityDepositLedgerEntries: { some: {} } }],
  };

  const [contracts, total] = await Promise.all([
    prisma.contract.findMany({
      where,
      select: {
        id: true,
        contractNumber: true,
        securityDeposit: true,
        status: true,
        unit: { select: { unitNumber: true } },
        renter: { select: { fullName: true, fullNameAr: true } },
        securityDepositLedgerEntries: { select: { debit: true, credit: true } },
      },
      orderBy: { createdAt: "desc" },
      skip: (p - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    prisma.contract.count({ where }),
  ]);

  const rows = contracts.map((c) => {
    const availableDeposit = computeAvailableDepositBalance(c.securityDepositLedgerEntries);
    return {
      contractId: c.id,
      contractNumber: c.contractNumber,
      status: c.status,
      unitNumber: c.unit.unitNumber,
      renterName: c.renter.fullName,
      renterNameAr: c.renter.fullNameAr,
      requiredDeposit: c.securityDeposit ?? new Prisma.Decimal(0),
      availableDeposit,
    };
  });

  return { rows, page: p, totalPages: Math.max(1, Math.ceil(total / PAGE_SIZE)) };
}

/** Step 70 - Refund Report: settlements that have (or had) a refund obligation. Refund Due is never confused with Refund Paid. */
export async function getRefundReport(page?: number) {
  const { organizationId } = await requirePermission("securityDeposit.refund.view");
  const p = pageOf(page);

  const where: Prisma.SecurityDepositSettlementWhereInput = { organizationId, approvedRefundDue: { gt: 0 } };

  const [rows, total] = await Promise.all([
    prisma.securityDepositSettlement.findMany({
      where,
      include: {
        renter: { select: { fullName: true, fullNameAr: true } },
        refunds: { orderBy: { createdAt: "desc" } },
      },
      orderBy: { createdAt: "desc" },
      skip: (p - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    prisma.securityDepositSettlement.count({ where }),
  ]);

  const enriched = rows.map((r) => {
    const paidRefunds = r.refunds.filter((f) => f.status === "PAID");
    const refundPaid = paidRefunds.reduce((sum, f) => sum.plus(f.amount), new Prisma.Decimal(0));
    const refundDue = r.approvedRefundDue ?? new Prisma.Decimal(0);
    return {
      ...r,
      refundDue,
      refundPaid,
      refundRemaining: computeRefundRemaining(refundDue, refundPaid),
      lastRefundDate: paidRefunds[0]?.paidAt ?? null,
    };
  });

  return { rows: enriched, page: p, totalPages: Math.max(1, Math.ceil(total / PAGE_SIZE)) };
}

/** Step 71 - Deductions Report: every liability assessment, flat, across the org. */
export async function getDeductionsReport(page?: number) {
  const { organizationId } = await requirePermission("securityDeposit.view");
  const p = pageOf(page);

  const [rows, total] = await Promise.all([
    prisma.moveOutLiabilityAssessment.findMany({
      where: { organizationId },
      include: {
        settlement: { select: { settlementNumber: true, unit: { select: { unitNumber: true } }, renter: { select: { fullName: true, fullNameAr: true } } } },
      },
      orderBy: { createdAt: "desc" },
      skip: (p - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    prisma.moveOutLiabilityAssessment.count({ where: { organizationId } }),
  ]);

  return { rows, page: p, totalPages: Math.max(1, Math.ceil(total / PAGE_SIZE)) };
}

/** Step 68 - Outstanding Additional Amount Report: settlements with a tenant receivable, and its linked invoice's own (authoritative) paid/unpaid state. */
export async function getOutstandingAdditionalAmountReport(page?: number) {
  const { organizationId } = await requirePermission("securityDeposit.view");
  const p = pageOf(page);

  const where: Prisma.SecurityDepositSettlementWhereInput = { organizationId, approvedAdditionalDue: { gt: 0 } };

  const [rows, total] = await Promise.all([
    prisma.securityDepositSettlement.findMany({
      where,
      include: {
        renter: { select: { fullName: true, fullNameAr: true } },
        additionalDueInvoices: { select: { id: true, invoiceNumber: true, status: true, totalAmount: true, paidAmount: true } },
      },
      orderBy: { createdAt: "desc" },
      skip: (p - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    prisma.securityDepositSettlement.count({ where }),
  ]);

  return { rows, page: p, totalPages: Math.max(1, Math.ceil(total / PAGE_SIZE)) };
}

/** Step 68/98 - Disputed Settlement Report: settlements with at least one assessment carrying a RAISED or UNDER_REVIEW dispute. */
export async function getDisputedSettlementsReport(page?: number) {
  const { organizationId } = await requirePermission("securityDeposit.dispute.manage");
  const p = pageOf(page);

  const where: Prisma.SecurityDepositSettlementWhereInput = { organizationId, liabilityAssessments: { some: { disputeStatus: { in: ["RAISED", "UNDER_REVIEW"] } } } };

  const [rows, total] = await Promise.all([
    prisma.securityDepositSettlement.findMany({
      where,
      include: {
        renter: { select: { fullName: true, fullNameAr: true } },
        liabilityAssessments: { where: { disputeStatus: { in: ["RAISED", "UNDER_REVIEW"] } }, select: { id: true, description: true, disputeStatus: true, disputeNote: true } },
      },
      orderBy: { createdAt: "desc" },
      skip: (p - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    prisma.securityDepositSettlement.count({ where }),
  ]);

  return { rows, page: p, totalPages: Math.max(1, Math.ceil(total / PAGE_SIZE)) };
}
