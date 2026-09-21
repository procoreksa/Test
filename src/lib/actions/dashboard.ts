"use server";

import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/session";
import { syncOverdueStatuses } from "@/lib/actions/collections";
import { subMonths, format, startOfMonth, endOfMonth, addDays } from "date-fns";

const EXPIRING_WINDOW_DAYS = 90;

export async function getDashboardStats() {
  await syncOverdueStatuses();
  const { organizationId } = await requirePermission("dashboard.view");
  const now = new Date();

  const [
    unitsTotal,
    unitsOccupied,
    contractsActive,
    invoices,
    overdueCount,
    overdueSchedules,
    expiringContracts,
    unclosedContracts,
  ] = await Promise.all([
    prisma.unit.count({ where: { organizationId } }),
    prisma.unit.count({ where: { organizationId, status: "OCCUPIED" } }),
    prisma.contract.count({ where: { organizationId, status: "ACTIVE" } }),
    prisma.invoice.findMany({ where: { organizationId }, select: { totalAmount: true, paidAmount: true, vatAmount: true, status: true, issueDate: true } }),
    prisma.paymentSchedule.count({ where: { organizationId, status: "OVERDUE" } }),
    prisma.paymentSchedule.findMany({
      where: { organizationId, status: "OVERDUE" },
      include: { contract: { include: { renter: true, unit: true } } },
      orderBy: { dueDate: "asc" },
      take: 10,
    }),
    prisma.contract.findMany({
      where: { organizationId, status: "ACTIVE", endDate: { gte: now, lte: addDays(now, EXPIRING_WINDOW_DAYS) } },
      include: { renter: true, unit: { include: { property: true } } },
      orderBy: { endDate: "asc" },
      take: 10,
    }),
    prisma.contract.findMany({
      where: { organizationId, status: "ACTIVE", endDate: { lt: now } },
      include: { renter: true, unit: { include: { property: true } } },
      orderBy: { endDate: "asc" },
      take: 10,
    }),
  ]);

  const totalInvoiced = invoices.reduce((sum, i) => sum + Number(i.totalAmount), 0);
  const totalCollected = invoices.reduce((sum, i) => sum + Number(i.paidAmount), 0);
  const totalOutstanding = totalInvoiced - totalCollected;
  const totalVat = invoices.reduce((sum, i) => sum + Number(i.vatAmount), 0);

  const months: { label: string; invoiced: number; collected: number }[] = [];
  for (let i = 5; i >= 0; i--) {
    const monthDate = subMonths(new Date(), i);
    const start = startOfMonth(monthDate);
    const end = endOfMonth(monthDate);
    const monthInvoices = invoices.filter((inv) => inv.issueDate >= start && inv.issueDate <= end);
    months.push({
      label: format(monthDate, "MMM yy"),
      invoiced: monthInvoices.reduce((s, i) => s + Number(i.totalAmount), 0),
      collected: monthInvoices.reduce((s, i) => s + Number(i.paidAmount), 0),
    });
  }

  return {
    unitsTotal,
    unitsOccupied,
    occupancyRate: unitsTotal > 0 ? Math.round((unitsOccupied / unitsTotal) * 100) : 0,
    contractsActive,
    totalInvoiced,
    totalCollected,
    totalOutstanding,
    totalVat,
    overdueCount,
    overdueSchedules,
    expiringContracts,
    unclosedContracts,
    monthlySeries: months,
  };
}
