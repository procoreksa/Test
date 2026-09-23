"use server";

import { Prisma } from "@prisma/client";
import type { CorporateHousingAllocationStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/session";
import { isPlannedArrival, isPlannedDeparture, isUnitUnallocated, computeAllocationRate } from "@/lib/corporate-housing-rules";

/** Corporate Housing reports (Step 44-51) - every one server-side scoped/paginated; none loads the full dataset for client-side filtering. */
const PAGE_SIZE = 25;
function pageOf(page?: number) {
  return Math.max(1, page ?? 1);
}

/** Report 1: Corporate Account Summary. */
export async function getCorporateAccountSummaryReport(page?: number) {
  const { organizationId } = await requirePermission("corporateHousingReports.view");
  const p = pageOf(page);

  const [rows, total] = await Promise.all([
    prisma.corporateAccount.findMany({
      where: { organizationId },
      include: { renter: { select: { fullName: true, fullNameAr: true } } },
      orderBy: { createdAt: "desc" },
      skip: (p - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    prisma.corporateAccount.count({ where: { organizationId } }),
  ]);

  const renterIds = rows.map((r) => r.renterId);
  const accountIds = rows.map((r) => r.id);
  const [contractCounts, occupantCounts, allocationCounts] = await Promise.all([
    renterIds.length ? prisma.contract.groupBy({ by: ["renterId"], where: { organizationId, renterId: { in: renterIds }, status: "ACTIVE" }, _count: { _all: true } }) : [],
    accountIds.length ? prisma.corporateOccupant.groupBy({ by: ["corporateAccountId"], where: { organizationId, corporateAccountId: { in: accountIds }, status: "ACTIVE" }, _count: { _all: true } }) : [],
    accountIds.length
      ? prisma.corporateHousingAllocation.groupBy({ by: ["corporateAccountId"], where: { organizationId, corporateAccountId: { in: accountIds }, status: "ACTIVE" }, _count: { _all: true } })
      : [],
  ]);
  const contractsByRenter = new Map(contractCounts.map((c) => [c.renterId, c._count._all]));
  const occupantsByAccount = new Map(occupantCounts.map((c) => [c.corporateAccountId, c._count._all]));
  const allocationsByAccount = new Map(allocationCounts.map((c) => [c.corporateAccountId, c._count._all]));

  const enriched = rows.map((r) => ({
    ...r,
    activeContractCount: contractsByRenter.get(r.renterId) ?? 0,
    activeOccupantCount: occupantsByAccount.get(r.id) ?? 0,
    activeAllocationCount: allocationsByAccount.get(r.id) ?? 0,
  }));

  return { rows: enriched, page: p, totalPages: Math.max(1, Math.ceil(total / PAGE_SIZE)) };
}

/** Report 2: Corporate Occupancy - per account, using the same centralized formulas as the dashboard (Step 45/46). */
export async function getCorporateOccupancyReport(page?: number) {
  const { organizationId } = await requirePermission("corporateHousingReports.view");
  const p = pageOf(page);

  const [accounts, total] = await Promise.all([
    prisma.corporateAccount.findMany({
      where: { organizationId },
      select: { id: true, accountNumber: true, displayName: true, renterId: true },
      orderBy: { createdAt: "desc" },
      skip: (p - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    prisma.corporateAccount.count({ where: { organizationId } }),
  ]);

  const rows = await Promise.all(
    accounts.map(async (account) => {
      const contracts = await prisma.contract.findMany({ where: { organizationId, renterId: account.renterId, status: "ACTIVE" }, select: { unitId: true } });
      const unitIds = Array.from(new Set(contracts.map((c) => c.unitId)));
      const allocations = unitIds.length
        ? await prisma.corporateHousingAllocation.findMany({ where: { organizationId, unitId: { in: unitIds } }, select: { unitId: true, status: true } })
        : [];
      const statusesByUnit = new Map<string, CorporateHousingAllocationStatus[]>();
      for (const a of allocations) {
        const list = statusesByUnit.get(a.unitId) ?? [];
        list.push(a.status);
        statusesByUnit.set(a.unitId, list);
      }
      const unitsWithActiveAllocationCount = unitIds.filter((id) => !isUnitUnallocated(statusesByUnit.get(id) ?? [])).length;
      const activeOccupantCount = await prisma.corporateOccupant.count({ where: { organizationId, corporateAccountId: account.id, status: "ACTIVE" } });

      return {
        account,
        corporateContractCount: contracts.length,
        corporateUnitCount: unitIds.length,
        unitsWithAllocationCount: unitsWithActiveAllocationCount,
        unallocatedUnitCount: unitIds.length - unitsWithActiveAllocationCount,
        activeOccupantCount,
        allocationRate: computeAllocationRate({ corporateLeasedUnitCount: unitIds.length, unitsWithActiveAllocationCount }),
      };
    })
  );

  return { rows, page: p, totalPages: Math.max(1, Math.ceil(total / PAGE_SIZE)) };
}

/** Report 3: Occupant Allocation - no financial data (Step 47). */
export async function getOccupantAllocationReport(page?: number) {
  const { organizationId } = await requirePermission("corporateHousingReports.view");
  const p = pageOf(page);

  const [rows, total] = await Promise.all([
    prisma.corporateHousingAllocation.findMany({
      where: { organizationId },
      select: {
        id: true,
        allocationNumber: true,
        startDate: true,
        plannedEndDate: true,
        status: true,
        corporateAccount: { select: { displayName: true, accountNumber: true } },
        occupant: { select: { fullName: true, fullNameAr: true, employeeNumber: true } },
        unit: { select: { unitNumber: true, floor: { select: { name: true, building: { select: { name: true, nameAr: true, compound: { select: { name: true, arabicName: true } } } } } } } },
      },
      orderBy: { startDate: "desc" },
      skip: (p - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    prisma.corporateHousingAllocation.count({ where: { organizationId } }),
  ]);

  return { rows, page: p, totalPages: Math.max(1, Math.ceil(total / PAGE_SIZE)) };
}

async function arrivalsOrDeparturesReport(organizationId: string, windowDays: number, kind: "arrival" | "departure", page?: number) {
  const p = pageOf(page);
  const now = new Date();
  const windowEnd = new Date(now.getTime() + windowDays * 24 * 60 * 60 * 1000);

  const where: Prisma.CorporateHousingAllocationWhereInput =
    kind === "arrival"
      ? { organizationId, status: "PLANNED", startDate: { gte: now, lte: windowEnd } }
      : { organizationId, status: { in: ["ACTIVE", "PLANNED"] }, plannedEndDate: { gte: now, lte: windowEnd } };

  const [rows, total] = await Promise.all([
    prisma.corporateHousingAllocation.findMany({
      where,
      select: {
        id: true,
        allocationNumber: true,
        startDate: true,
        plannedEndDate: true,
        status: true,
        corporateAccount: { select: { displayName: true, accountNumber: true } },
        occupant: { select: { fullName: true, fullNameAr: true, employeeNumber: true } },
        unit: { select: { unitNumber: true } },
      },
      orderBy: kind === "arrival" ? { startDate: "asc" } : { plannedEndDate: "asc" },
      skip: (p - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    prisma.corporateHousingAllocation.count({ where }),
  ]);
  // Defensive double-check with the same pure predicate the dashboard uses, in case of a boundary mismatch between the Prisma filter and the centralized rule.
  const filtered = rows.filter((r) => (kind === "arrival" ? isPlannedArrival(r, now, windowEnd) : isPlannedDeparture(r, now, windowEnd)));
  return { rows: filtered, page: p, totalPages: Math.max(1, Math.ceil(total / PAGE_SIZE)) };
}

/** Report 4: Planned Arrivals (Step 40/48) - operational only, no Move-In mutation. */
export async function getPlannedArrivalsReport(windowDays: 7 | 30 = 30, page?: number) {
  const { organizationId } = await requirePermission("corporateHousingReports.view");
  return arrivalsOrDeparturesReport(organizationId, windowDays, "arrival", page);
}

/** Report 5: Planned Departures (Step 41/48) - never confused with Contract Move-Out. */
export async function getPlannedDeparturesReport(windowDays: 7 | 30 = 30, page?: number) {
  const { organizationId } = await requirePermission("corporateHousingReports.view");
  return arrivalsOrDeparturesReport(organizationId, windowDays, "departure", page);
}

/** Report 6: Contract Expiry - corporate contracts only, 30/60/90 filter (Step 49). */
export async function getCorporateContractExpiryReport(windowDays: 30 | 60 | 90 = 30, page?: number) {
  const { organizationId } = await requirePermission("corporateHousingReports.view");
  const p = pageOf(page);
  const now = new Date();
  const windowEnd = new Date(now.getTime() + windowDays * 24 * 60 * 60 * 1000);

  const corporateAccounts = await prisma.corporateAccount.findMany({ where: { organizationId }, select: { renterId: true, displayName: true, accountNumber: true } });
  const renterToAccount = new Map(corporateAccounts.map((a) => [a.renterId, a]));
  const renterIds = corporateAccounts.map((a) => a.renterId);
  if (renterIds.length === 0) return { rows: [], page: p, totalPages: 1 };

  const where: Prisma.ContractWhereInput = { organizationId, renterId: { in: renterIds }, status: "ACTIVE", endDate: { gte: now, lte: windowEnd } };
  const [contracts, total] = await Promise.all([
    prisma.contract.findMany({
      where,
      select: { id: true, contractNumber: true, renterId: true, startDate: true, endDate: true, rentAmount: true, unit: { select: { unitNumber: true } } },
      orderBy: { endDate: "asc" },
      skip: (p - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    prisma.contract.count({ where }),
  ]);

  const rows = contracts.map((c) => ({ ...c, corporateAccount: renterToAccount.get(c.renterId) }));
  return { rows, page: p, totalPages: Math.max(1, Math.ceil(total / PAGE_SIZE)) };
}

/** Report 7: Unallocated Corporate Units - "Unallocated", never "Vacant", since Unit.status may still be OCCUPIED (Step 37). */
export async function getUnallocatedCorporateUnitsReport(page?: number) {
  const { organizationId } = await requirePermission("corporateHousingReports.view");
  const p = pageOf(page);

  const corporateAccounts = await prisma.corporateAccount.findMany({ where: { organizationId }, select: { renterId: true, displayName: true, accountNumber: true } });
  const renterToAccount = new Map(corporateAccounts.map((a) => [a.renterId, a]));
  const renterIds = corporateAccounts.map((a) => a.renterId);
  if (renterIds.length === 0) return { rows: [], page: p, totalPages: 1 };

  const contracts = await prisma.contract.findMany({
    where: { organizationId, renterId: { in: renterIds }, status: "ACTIVE" },
    select: { unitId: true, renterId: true, contractNumber: true, unit: { select: { unitNumber: true, status: true } } },
  });
  const unitIds = contracts.map((c) => c.unitId);
  const allocations = unitIds.length ? await prisma.corporateHousingAllocation.findMany({ where: { organizationId, unitId: { in: unitIds } }, select: { unitId: true, status: true } }) : [];
  const statusesByUnit = new Map<string, CorporateHousingAllocationStatus[]>();
  for (const a of allocations) {
    const list = statusesByUnit.get(a.unitId) ?? [];
    list.push(a.status);
    statusesByUnit.set(a.unitId, list);
  }

  const unallocated = contracts
    .filter((c) => isUnitUnallocated(statusesByUnit.get(c.unitId) ?? []))
    .map((c) => ({ contractNumber: c.contractNumber, unit: c.unit, corporateAccount: renterToAccount.get(c.renterId) }));

  const total = unallocated.length;
  const rows = unallocated.slice((p - 1) * PAGE_SIZE, (p - 1) * PAGE_SIZE + PAGE_SIZE);
  return { rows, page: p, totalPages: Math.max(1, Math.ceil(total / PAGE_SIZE)) };
}

/** Report 8: Corporate Maintenance - never duplicates cost/accounting logic (Step 50). */
export async function getCorporateMaintenanceReport(page?: number) {
  const { organizationId } = await requirePermission("corporateHousingReports.view");
  const p = pageOf(page);

  const corporateAccounts = await prisma.corporateAccount.findMany({ where: { organizationId }, select: { renterId: true } });
  const renterIds = corporateAccounts.map((a) => a.renterId);
  if (renterIds.length === 0) return { rows: [], page: p, totalPages: 1 };

  const corporateUnitIds = (await prisma.contract.findMany({ where: { organizationId, renterId: { in: renterIds }, status: "ACTIVE" }, select: { unitId: true } })).map((c) => c.unitId);
  if (corporateUnitIds.length === 0) return { rows: [], page: p, totalPages: 1 };

  const where: Prisma.MaintenanceRequestWhereInput = { organizationId, unitId: { in: corporateUnitIds } };
  const [rows, total] = await Promise.all([
    prisma.maintenanceRequest.findMany({
      where,
      select: {
        id: true,
        requestNumber: true,
        category: true,
        priority: true,
        status: true,
        reportedAt: true,
        unit: { select: { unitNumber: true } },
        corporateOccupant: { select: { fullName: true, fullNameAr: true, employeeNumber: true } },
      },
      orderBy: { reportedAt: "desc" },
      skip: (p - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    prisma.maintenanceRequest.count({ where }),
  ]);

  return { rows, page: p, totalPages: Math.max(1, Math.ceil(total / PAGE_SIZE)) };
}

/** Single-account Financial Snapshot for the Account Profile page - same math as Report 9, scoped to one account. */
export async function getCorporateAccountFinancialSnapshot(accountId: string) {
  const { organizationId } = await requirePermission("corporateHousing.view");
  const account = await prisma.corporateAccount.findFirst({ where: { id: accountId, organizationId }, select: { renterId: true } });
  if (!account) throw new Error("Not found");

  const [contracts, invoices] = await Promise.all([
    prisma.contract.findMany({ where: { organizationId, renterId: account.renterId, status: "ACTIVE" }, select: { rentAmount: true } }),
    prisma.invoice.findMany({ where: { organizationId, renterId: account.renterId }, select: { totalAmount: true, paidAmount: true, status: true, dueDate: true } }),
  ]);

  const contractValue = contracts.reduce((sum, c) => sum.plus(c.rentAmount), new Prisma.Decimal(0));
  const invoiced = invoices.reduce((sum, i) => sum.plus(i.totalAmount), new Prisma.Decimal(0));
  const paid = invoices.reduce((sum, i) => sum.plus(i.paidAmount), new Prisma.Decimal(0));
  const outstanding = invoiced.minus(paid);
  const now = new Date();
  const overdue = invoices
    .filter((i) => i.status !== "CANCELLED" && i.status !== "PAID" && i.dueDate !== null && i.dueDate < now)
    .reduce((sum, i) => sum.plus(i.totalAmount.minus(i.paidAmount)), new Prisma.Decimal(0));

  return { contractValue, invoiced, paid, outstanding, overdue };
}

/** Single-account Maintenance Snapshot for the Account Profile page. */
export async function getCorporateAccountMaintenanceSnapshot(accountId: string) {
  const { organizationId } = await requirePermission("corporateHousing.view");
  const account = await prisma.corporateAccount.findFirst({ where: { id: accountId, organizationId }, select: { renterId: true } });
  if (!account) throw new Error("Not found");

  const unitIds = (await prisma.contract.findMany({ where: { organizationId, renterId: account.renterId, status: "ACTIVE" }, select: { unitId: true } })).map((c) => c.unitId);
  if (unitIds.length === 0) return { openCount: 0, recent: [] };

  const [openCount, recent] = await Promise.all([
    prisma.maintenanceRequest.count({ where: { organizationId, unitId: { in: unitIds }, status: { in: ["OPEN", "TRIAGED", "WORK_ORDER_CREATED"] } } }),
    prisma.maintenanceRequest.findMany({
      where: { organizationId, unitId: { in: unitIds } },
      select: { id: true, requestNumber: true, category: true, status: true, reportedAt: true, unit: { select: { unitNumber: true } } },
      orderBy: { reportedAt: "desc" },
      take: 5,
    }),
  ]);

  return { openCount, recent };
}

/** Printable Occupancy Roster (Step 71) - all ACTIVE allocations, internal-staff-only, never exposed publicly. */
export async function getCorporateHousingOccupancyRoster() {
  const { organizationId } = await requirePermission("corporateHousingReports.view");
  return prisma.corporateHousingAllocation.findMany({
    where: { organizationId, status: "ACTIVE" },
    select: {
      id: true,
      allocationNumber: true,
      startDate: true,
      plannedEndDate: true,
      bedroomNumber: true,
      roomLabel: true,
      corporateAccount: { select: { displayName: true, accountNumber: true } },
      occupant: { select: { fullName: true, fullNameAr: true, employeeNumber: true } },
      unit: { select: { unitNumber: true, floor: { select: { name: true, building: { select: { name: true, nameAr: true, compound: { select: { name: true, arabicName: true } } } } } } } },
    },
    orderBy: [{ corporateAccount: { displayName: "asc" } }, { unit: { unitNumber: "asc" } }],
  });
}

/** Report 9: Corporate Financial Snapshot - existing Contract/Invoice/Payment engine only, never OwnerLedgerEntry (Step 51). */
export async function getCorporateFinancialSnapshotReport(page?: number) {
  const { organizationId } = await requirePermission("corporateHousingReports.view");
  const p = pageOf(page);

  const [accounts, total] = await Promise.all([
    prisma.corporateAccount.findMany({
      where: { organizationId },
      select: { id: true, accountNumber: true, displayName: true, renterId: true },
      orderBy: { createdAt: "desc" },
      skip: (p - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    prisma.corporateAccount.count({ where: { organizationId } }),
  ]);

  const rows = await Promise.all(
    accounts.map(async (account) => {
      const [contracts, invoices] = await Promise.all([
        prisma.contract.findMany({ where: { organizationId, renterId: account.renterId, status: "ACTIVE" }, select: { rentAmount: true } }),
        prisma.invoice.findMany({ where: { organizationId, renterId: account.renterId }, select: { totalAmount: true, paidAmount: true, status: true, dueDate: true } }),
      ]);

      const contractValue = contracts.reduce((sum, c) => sum.plus(c.rentAmount), new Prisma.Decimal(0));
      const invoiced = invoices.reduce((sum, i) => sum.plus(i.totalAmount), new Prisma.Decimal(0));
      const paid = invoices.reduce((sum, i) => sum.plus(i.paidAmount), new Prisma.Decimal(0));
      const outstanding = invoiced.minus(paid);
      const now = new Date();
      const overdue = invoices
        .filter((i) => i.status !== "CANCELLED" && i.status !== "PAID" && i.dueDate !== null && i.dueDate < now)
        .reduce((sum, i) => sum.plus(i.totalAmount.minus(i.paidAmount)), new Prisma.Decimal(0));

      return { account, contractValue, invoiced, paid, outstanding, overdue };
    })
  );

  return { rows, page: p, totalPages: Math.max(1, Math.ceil(total / PAGE_SIZE)) };
}
