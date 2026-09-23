"use server";

import { prisma } from "@/lib/prisma";
import { requireTenantPrincipal, requireTenantContractAccess, requireTenantInvoiceAccess } from "@/lib/tenant-session";
import { computeTenantOutstandingBalance } from "@/lib/portal/tenancy-rules";

/** Step 20 - reuses the schedule's own authoritative `status` column (kept correct by recomputeScheduleStatus() elsewhere); never recomputed independently here. */
export async function getTenantPaymentSchedule(contractId: string) {
  await requireTenantContractAccess(contractId);
  const { organizationId } = await requireTenantPrincipal();
  return prisma.paymentSchedule.findMany({
    where: { organizationId, contractId },
    orderBy: { installmentNo: "asc" },
    select: { id: true, installmentNo: true, periodStart: true, periodEnd: true, dueDate: true, rentAmount: true, commissionAmount: true, cleaningAmount: true, securityDepositAmount: true, amount: true, status: true },
  });
}

/** Step 21 - tenant-safe invoice list; excludes zatcaResponse/internal hash chain fields. */
export async function getTenantInvoices() {
  const { organizationId, renterId } = await requireTenantPrincipal();
  return prisma.invoice.findMany({
    where: { organizationId, renterId },
    orderBy: { issueDate: "desc" },
    select: { id: true, invoiceNumber: true, documentType: true, issueDate: true, dueDate: true, subtotal: true, vatAmount: true, totalAmount: true, paidAmount: true, status: true, contract: { select: { contractNumber: true } } },
  });
}

export async function getTenantInvoiceDetail(invoiceId: string) {
  await requireTenantInvoiceAccess(invoiceId);
  const { organizationId, renterId } = await requireTenantPrincipal();
  return prisma.invoice.findFirstOrThrow({
    where: { id: invoiceId, organizationId, renterId },
    select: {
      id: true,
      invoiceNumber: true,
      documentType: true,
      kind: true,
      issueDate: true,
      supplyDate: true,
      dueDate: true,
      currency: true,
      subtotal: true,
      vatAmount: true,
      totalAmount: true,
      paidAmount: true,
      status: true,
      qrCodeBase64: true,
      contract: { select: { contractNumber: true } },
      lines: { select: { id: true, description: true, descriptionAr: true, kind: true, quantity: true, unitPrice: true, discount: true, vatRate: true, lineTotal: true, periodStart: true, periodEnd: true } },
      payments: { where: { status: "POSTED" }, select: { id: true, receiptNumber: true, amount: true, paymentDate: true, method: true, referenceNumber: true } },
    },
  });
}

/** Step 23 - payments actually associated with the tenant's own invoices; reversed payments are separate rows (Payment.status/reversalOfPaymentId), so the final authoritative state is whatever these rows show - never hidden. */
export async function getTenantPayments() {
  const { organizationId, renterId } = await requireTenantPrincipal();
  return prisma.payment.findMany({
    where: { organizationId, renterId },
    orderBy: { paymentDate: "desc" },
    select: { id: true, receiptNumber: true, amount: true, paymentDate: true, method: true, referenceNumber: true, status: true, invoice: { select: { id: true, invoiceNumber: true } }, reversalOfPaymentId: true, reversedByPayment: { select: { id: true } } },
  });
}

/** Step 26 - one authoritative balance, computed server-side from the same Invoice rows getTenantInvoices() itself reads; never summed again ad hoc in a page. */
export async function getTenantOutstandingBalance() {
  const { organizationId, renterId } = await requireTenantPrincipal();
  const invoices = await prisma.invoice.findMany({ where: { organizationId, renterId }, select: { totalAmount: true, paidAmount: true, status: true } });
  return computeTenantOutstandingBalance(invoices);
}
