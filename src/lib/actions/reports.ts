"use server";

import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/session";
import { syncOverdueStatuses } from "@/lib/actions/collections";
import { differenceInCalendarDays, format } from "date-fns";
import type { InvoiceLineKind, PaymentFrequency } from "@prisma/client";

export interface LedgerEntry {
  date: Date;
  type: "INVOICE" | "PAYMENT";
  kind?: InvoiceLineKind;
  reference: string;
  contractNumber?: string;
  debit: number;
  credit: number;
  balance: number;
}

const INSTALLMENTS_PER_YEAR: Record<PaymentFrequency, number> = {
  MONTHLY: 12,
  QUARTERLY: 4,
  SEMI_ANNUAL: 2,
  ANNUAL: 1,
  ONE_TIME: 1,
};

export interface StatementContractInfo {
  contractNumber: string;
  startDate: Date;
  endDate: Date;
  annualRent: number;
  renterName?: string;
  renterNameAr?: string | null;
}

function toStatementContractInfo(contract: {
  contractNumber: string;
  startDate: Date;
  endDate: Date;
  rentAmount: unknown;
  paymentFrequency: PaymentFrequency;
  renter?: { fullName: string; fullNameAr: string | null };
}): StatementContractInfo {
  return {
    contractNumber: contract.contractNumber,
    startDate: contract.startDate,
    endDate: contract.endDate,
    annualRent: Number(contract.rentAmount) * INSTALLMENTS_PER_YEAR[contract.paymentFrequency],
    renterName: contract.renter?.fullName,
    renterNameAr: contract.renter?.fullNameAr,
  };
}

/** The contract to summarize on a statement's header: the active one, or the most recently started otherwise. */
function pickCurrentContract<T extends { status: string; startDate: Date }>(contracts: T[]): T | null {
  return contracts.find((c) => c.status === "ACTIVE") ?? contracts[0] ?? null;
}

/** One row per invoice line (dated by the invoice's due date) so each amount is broken down by what it's for. */
function buildInvoiceLineEntries(
  invoices: Array<{
    dueDate: Date | null;
    issueDate: Date;
    invoiceNumber: string;
    contractNumber?: string;
    lines: Array<{ kind: InvoiceLineKind; lineTotal: unknown }>;
  }>
): Omit<LedgerEntry, "balance">[] {
  return invoices.flatMap((inv) =>
    inv.lines.map((line) => ({
      date: inv.dueDate ?? inv.issueDate,
      type: "INVOICE" as const,
      kind: line.kind,
      reference: inv.invoiceNumber,
      contractNumber: inv.contractNumber,
      debit: Number(line.lineTotal),
      credit: 0,
    }))
  );
}

function buildLedger(entries: Omit<LedgerEntry, "balance">[]): LedgerEntry[] {
  const sorted = [...entries].sort((a, b) => a.date.getTime() - b.date.getTime());

  let balance = 0;
  return sorted.map((e) => {
    balance += e.debit - e.credit;
    return { ...e, balance };
  });
}

export async function listRenterOptions() {
  const { organizationId } = await requirePermission("report.view");
  return prisma.renter.findMany({
    where: { organizationId },
    select: { id: true, fullName: true, fullNameAr: true },
    orderBy: { createdAt: "desc" },
  });
}

export async function listUnitOptions() {
  const { organizationId } = await requirePermission("report.view");
  return prisma.unit.findMany({
    where: { organizationId },
    select: { id: true, unitNumber: true, property: { select: { name: true, nameAr: true } } },
    orderBy: { createdAt: "desc" },
  });
}

export async function getRenterStatement(renterId: string) {
  const { organizationId } = await requirePermission("report.view");
  const renter = await prisma.renter.findUniqueOrThrow({ where: { id: renterId, organizationId } });

  const [invoices, payments, contracts, organization] = await Promise.all([
    prisma.invoice.findMany({
      where: { organizationId, renterId, status: { not: "CANCELLED" } },
      include: { contract: true, lines: true },
      orderBy: { issueDate: "asc" },
    }),
    prisma.payment.findMany({
      where: { organizationId, renterId },
      include: { invoice: { include: { contract: true } } },
      orderBy: { paymentDate: "asc" },
    }),
    prisma.contract.findMany({ where: { organizationId, renterId }, orderBy: { startDate: "desc" } }),
    prisma.organization.findUniqueOrThrow({ where: { id: organizationId }, select: { name: true, nameAr: true, logoUrl: true } }),
  ]);

  const ledger = buildLedger([
    ...buildInvoiceLineEntries(invoices.map((inv) => ({ ...inv, contractNumber: inv.contract?.contractNumber }))),
    ...payments.map((p) => ({
      date: p.paymentDate,
      type: "PAYMENT" as const,
      reference: p.receiptNumber,
      contractNumber: p.invoice.contract?.contractNumber,
      debit: 0,
      credit: Number(p.amount),
    })),
  ]);

  const current = pickCurrentContract(contracts);
  const currentContract = current ? toStatementContractInfo(current) : null;

  return { renter, ledger, organization, currentContract };
}

export async function getUnitStatement(unitId: string) {
  const { organizationId } = await requirePermission("report.view");
  const unit = await prisma.unit.findUniqueOrThrow({
    where: { id: unitId, organizationId },
    include: { property: true },
  });

  const [contracts, organization] = await Promise.all([
    prisma.contract.findMany({
      where: { organizationId, unitId },
      include: { renter: { select: { fullName: true, fullNameAr: true } } },
      orderBy: { startDate: "desc" },
    }),
    prisma.organization.findUniqueOrThrow({ where: { id: organizationId }, select: { name: true, nameAr: true, logoUrl: true } }),
  ]);
  const contractIds = contracts.map((c) => c.id);
  const contractNumberById = new Map(contracts.map((c) => [c.id, c.contractNumber]));

  const [invoices, payments] = await Promise.all([
    prisma.invoice.findMany({
      where: { organizationId, contractId: { in: contractIds }, status: { not: "CANCELLED" } },
      include: { lines: true },
      orderBy: { issueDate: "asc" },
    }),
    prisma.payment.findMany({
      where: { organizationId, invoice: { contractId: { in: contractIds } } },
      include: { invoice: true },
      orderBy: { paymentDate: "asc" },
    }),
  ]);

  const ledger = buildLedger([
    ...buildInvoiceLineEntries(
      invoices.map((inv) => ({ ...inv, contractNumber: inv.contractId ? contractNumberById.get(inv.contractId) : undefined }))
    ),
    ...payments.map((p) => ({
      date: p.paymentDate,
      type: "PAYMENT" as const,
      reference: p.receiptNumber,
      contractNumber: p.invoice.contractId ? contractNumberById.get(p.invoice.contractId) : undefined,
      debit: 0,
      credit: Number(p.amount),
    })),
  ]);

  const current = pickCurrentContract(contracts);
  const currentContract = current ? toStatementContractInfo(current) : null;

  return { unit, ledger, organization, currentContract };
}

export async function getOverdueReport() {
  await syncOverdueStatuses();
  const { organizationId } = await requirePermission("report.view");
  const today = new Date();

  const schedules = await prisma.paymentSchedule.findMany({
    where: { organizationId, status: "OVERDUE" },
    include: { contract: { include: { renter: true, unit: { include: { property: true } } } } },
    orderBy: { dueDate: "asc" },
  });

  return schedules.map((s) => ({
    ...s,
    daysOverdue: differenceInCalendarDays(today, s.dueDate),
  }));
}

export async function getActiveContractsReport() {
  const { organizationId } = await requirePermission("report.view");
  return prisma.contract.findMany({
    where: { organizationId, status: "ACTIVE" },
    include: { renter: true, unit: { include: { property: true } } },
    orderBy: { startDate: "desc" },
  });
}

export async function getExpiringContractsReport(from: Date, to: Date) {
  const { organizationId } = await requirePermission("report.view");
  const today = new Date();

  const contracts = await prisma.contract.findMany({
    where: { organizationId, status: "ACTIVE", endDate: { gte: from, lte: to } },
    include: { renter: true, unit: { include: { property: true } } },
    orderBy: { endDate: "asc" },
  });

  return contracts.map((c) => ({ ...c, daysLeft: differenceInCalendarDays(c.endDate, today) }));
}

export async function getCollectionsReport(from: Date, to: Date) {
  const { organizationId } = await requirePermission("report.view");
  const payments = await prisma.payment.findMany({
    where: { organizationId, paymentDate: { gte: from, lte: to } },
    include: { renter: true, invoice: { include: { contract: { include: { unit: true } } } } },
    orderBy: { paymentDate: "asc" },
  });
  const total = payments.reduce((sum, p) => sum + Number(p.amount), 0);
  return { payments, total };
}

export interface VatReportRow {
  period: string;
  invoiceCount: number;
  subtotal: number;
  vatAmount: number;
  totalAmount: number;
}

export async function getVatReport(from: Date, to: Date) {
  const { organizationId } = await requirePermission("report.view");
  const invoices = await prisma.invoice.findMany({
    where: { organizationId, issueDate: { gte: from, lte: to }, status: { not: "CANCELLED" } },
    select: { issueDate: true, subtotal: true, vatAmount: true, totalAmount: true },
    orderBy: { issueDate: "asc" },
  });

  const byMonth = new Map<string, VatReportRow>();
  for (const inv of invoices) {
    const period = format(inv.issueDate, "yyyy-MM");
    const row = byMonth.get(period) ?? { period, invoiceCount: 0, subtotal: 0, vatAmount: 0, totalAmount: 0 };
    row.invoiceCount += 1;
    row.subtotal += Number(inv.subtotal);
    row.vatAmount += Number(inv.vatAmount);
    row.totalAmount += Number(inv.totalAmount);
    byMonth.set(period, row);
  }

  const rows = Array.from(byMonth.values()).sort((a, b) => a.period.localeCompare(b.period));
  const totals = rows.reduce(
    (acc, r) => ({
      invoiceCount: acc.invoiceCount + r.invoiceCount,
      subtotal: acc.subtotal + r.subtotal,
      vatAmount: acc.vatAmount + r.vatAmount,
      totalAmount: acc.totalAmount + r.totalAmount,
    }),
    { invoiceCount: 0, subtotal: 0, vatAmount: 0, totalAmount: 0 }
  );

  return { rows, totals };
}
