"use server";

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/session";
import { syncOverdueStatuses } from "@/lib/actions/collections";
import { subMonths, format, startOfMonth, addDays } from "date-fns";

const EXPIRING_WINDOW_DAYS = 90;
const TREND_MONTHS = 6;

/**
 * Hardening (docs/PERFORMANCE-REVIEW.md, "Dashboard query audit"): this
 * used to be `prisma.invoice.findMany({ where: { organizationId } })` with
 * no limit or date bound - every invoice the organization has EVER
 * issued, loaded into memory on every single dashboard view, just to sum
 * a handful of totals and bucket the last 6 months in JavaScript. For a
 * long-lived organization with tens of thousands of invoices this scales
 * the dashboard's load time and memory with the organization's entire
 * history forever. Replaced with a bounded aggregate for the lifetime
 * totals and a bounded (6-month), grouped-in-SQL query for the trend -
 * same output shape, same business definition (every invoice regardless
 * of status counts toward these totals, exactly as before - this is a
 * performance fix, not a business-logic change), just computed by
 * Postgres instead of pulled row-by-row into Node.
 */
async function getInvoiceTotals(organizationId: string) {
  const totals = await prisma.invoice.aggregate({
    where: { organizationId },
    _sum: { totalAmount: true, paidAmount: true, vatAmount: true },
  });
  const totalInvoiced = Number(totals._sum.totalAmount ?? 0);
  const totalCollected = Number(totals._sum.paidAmount ?? 0);
  const totalVat = Number(totals._sum.vatAmount ?? 0);
  return { totalInvoiced, totalCollected, totalOutstanding: totalInvoiced - totalCollected, totalVat };
}

async function getMonthlyInvoiceTrend(organizationId: string, now: Date) {
  const windowStart = startOfMonth(subMonths(now, TREND_MONTHS - 1));
  const rows = await prisma.$queryRaw<Array<{ month: Date; invoiced: Prisma.Decimal | null; collected: Prisma.Decimal | null }>>(Prisma.sql`
    SELECT date_trunc('month', "issueDate") AS month,
           SUM("totalAmount") AS invoiced,
           SUM("paidAmount") AS collected
    FROM invoices
    WHERE "organizationId" = ${organizationId} AND "issueDate" >= ${windowStart}
    GROUP BY date_trunc('month', "issueDate")
  `);
  const byMonthKey = new Map(rows.map((r) => [format(r.month, "yyyy-MM"), r]));

  const months: { label: string; invoiced: number; collected: number }[] = [];
  for (let i = TREND_MONTHS - 1; i >= 0; i--) {
    const monthDate = subMonths(now, i);
    const row = byMonthKey.get(format(monthDate, "yyyy-MM"));
    months.push({
      label: format(monthDate, "MMM yy"),
      invoiced: Number(row?.invoiced ?? 0),
      collected: Number(row?.collected ?? 0),
    });
  }
  return months;
}

export async function getDashboardStats() {
  await syncOverdueStatuses();
  const { organizationId } = await requirePermission("dashboard.view");
  const now = new Date();

  const [
    unitsTotal,
    unitsOccupied,
    contractsActive,
    invoiceTotals,
    monthlySeries,
    overdueCount,
    overdueSchedules,
    expiringContracts,
    unclosedContracts,
    totalCompounds,
    totalBuildings,
    totalFloors,
    unitsForOccupancy,
  ] = await Promise.all([
    prisma.unit.count({ where: { organizationId } }),
    prisma.unit.count({ where: { organizationId, status: "OCCUPIED" } }),
    prisma.contract.count({ where: { organizationId, status: "ACTIVE" } }),
    getInvoiceTotals(organizationId),
    getMonthlyInvoiceTrend(organizationId, now),
    prisma.paymentSchedule.count({ where: { organizationId, status: "OVERDUE" } }),
    prisma.paymentSchedule.findMany({
      where: { organizationId, status: "OVERDUE" },
      include: { contract: { include: { renter: true, unit: true } } },
      orderBy: { dueDate: "asc" },
      take: 10,
    }),
    prisma.contract.findMany({
      where: { organizationId, status: "ACTIVE", endDate: { gte: now, lte: addDays(now, EXPIRING_WINDOW_DAYS) } },
      include: { renter: true, unit: { include: { floor: { include: { building: { include: { compound: true } } } } } } },
      orderBy: { endDate: "asc" },
      take: 10,
    }),
    prisma.contract.findMany({
      where: { organizationId, status: "ACTIVE", endDate: { lt: now } },
      include: { renter: true, unit: { include: { floor: { include: { building: { include: { compound: true } } } } } } },
      orderBy: { endDate: "asc" },
      take: 10,
    }),
    prisma.compound.count({ where: { organizationId } }),
    prisma.building.count({ where: { organizationId } }),
    prisma.floor.count({ where: { organizationId } }),
    prisma.unit.findMany({
      where: { organizationId },
      select: {
        status: true,
        floor: { select: { building: { select: { compound: { select: { id: true, name: true, arabicName: true } } } } } },
      },
    }),
  ]);

  const occupancyByCompoundMap = new Map<string, { name: string; arabicName: string | null; occupied: number; total: number }>();
  for (const u of unitsForOccupancy) {
    const compound = u.floor.building.compound;
    const entry = occupancyByCompoundMap.get(compound.id) ?? { name: compound.name, arabicName: compound.arabicName, occupied: 0, total: 0 };
    entry.total += 1;
    if (u.status === "OCCUPIED") entry.occupied += 1;
    occupancyByCompoundMap.set(compound.id, entry);
  }
  const occupancyByCompound = Array.from(occupancyByCompoundMap.entries()).map(([compoundId, v]) => ({
    compoundId,
    name: v.name,
    arabicName: v.arabicName,
    occupied: v.occupied,
    total: v.total,
    occupancyRate: v.total > 0 ? Math.round((v.occupied / v.total) * 100) : 0,
  }));

  return {
    unitsTotal,
    unitsOccupied,
    occupancyRate: unitsTotal > 0 ? Math.round((unitsOccupied / unitsTotal) * 100) : 0,
    contractsActive,
    ...invoiceTotals,
    overdueCount,
    overdueSchedules,
    expiringContracts,
    unclosedContracts,
    monthlySeries,
    totalCompounds,
    totalBuildings,
    totalFloors,
    occupancyByCompound,
  };
}
