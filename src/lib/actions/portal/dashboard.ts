"use server";

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireTenantPrincipal } from "@/lib/tenant-session";
import { selectCurrentTenancy, computeTenantOutstandingBalance } from "@/lib/portal/tenancy-rules";
import { computeAvailableDepositBalance, computeRefundRemaining } from "@/lib/security-deposit-rules";
import { settlementVisibilityForTenant } from "@/lib/portal/tenancy-rules";

/**
 * Step 14/77 - every query here is bounded (a handful of `take`-limited
 * reads plus a couple of aggregates), never a full-history scan, mirroring
 * the internal getDashboardStats()/getOperationsDashboard() convention.
 */
export async function getTenantDashboard() {
  const { organizationId, renterId } = await requireTenantPrincipal();

  const contracts = await prisma.contract.findMany({
    where: { organizationId, renterId },
    select: { id: true, contractNumber: true, status: true, startDate: true, endDate: true, securityDeposit: true, unit: { select: { unitNumber: true } } },
    orderBy: { startDate: "desc" },
  });
  const { current } = selectCurrentTenancy(contracts);

  const [nextSchedule, invoices, openMaintenanceCount, moveIn, moveOut, recentPayments] = await Promise.all([
    current
      ? prisma.paymentSchedule.findFirst({
          where: { organizationId, contractId: current.id, status: { in: ["PENDING", "OVERDUE"] } },
          orderBy: { dueDate: "asc" },
          select: { dueDate: true, amount: true, status: true },
        })
      : null,
    prisma.invoice.findMany({ where: { organizationId, renterId }, select: { totalAmount: true, paidAmount: true, status: true } }),
    prisma.maintenanceRequest.count({ where: { organizationId, renterId, status: { in: ["OPEN", "TRIAGED", "WORK_ORDER_CREATED"] } } }),
    current ? prisma.moveIn.findFirst({ where: { organizationId, contractId: current.id }, select: { id: true, status: true } }) : null,
    current ? prisma.moveOut.findFirst({ where: { organizationId, contractId: current.id }, select: { id: true, status: true } }) : null,
    prisma.payment.findMany({ where: { organizationId, renterId, status: "POSTED" }, orderBy: { paymentDate: "desc" }, take: 5, select: { id: true, receiptNumber: true, amount: true, paymentDate: true } }),
  ]);

  const outstandingBalance = computeTenantOutstandingBalance(invoices);

  let depositPosition: { availableDeposit: Prisma.Decimal; refundRemaining: Prisma.Decimal | null; visibility: string } | null = null;
  if (current) {
    const [ledgerEntries, settlement] = await Promise.all([
      prisma.securityDepositLedgerEntry.findMany({ where: { organizationId, contractId: current.id }, select: { debit: true, credit: true } }),
      prisma.securityDepositSettlement.findFirst({ where: { organizationId, contractId: current.id }, select: { status: true, approvedRefundDue: true, refunds: { where: { status: "PAID" }, select: { amount: true } } } }),
    ]);
    const availableDeposit = computeAvailableDepositBalance(ledgerEntries);
    let refundRemaining: Prisma.Decimal | null = null;
    if (settlement && settlementVisibilityForTenant(settlement.status) === "FINAL" && settlement.approvedRefundDue !== null) {
      const paid = settlement.refunds.reduce((sum, r) => sum.plus(r.amount), new Prisma.Decimal(0));
      refundRemaining = computeRefundRemaining(settlement.approvedRefundDue, paid);
    }
    depositPosition = { availableDeposit, refundRemaining, visibility: settlement ? settlementVisibilityForTenant(settlement.status) : "HIDDEN" };
  }

  return {
    currentContract: current,
    nextPaymentDue: nextSchedule,
    outstandingBalance,
    openMaintenanceCount,
    moveIn,
    moveOut,
    depositPosition,
    recentPayments,
  };
}
