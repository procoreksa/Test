"use server";

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/session";
import { pickEffectiveOwnershipLevel, type AssetLevel, type OwnershipRow } from "@/lib/ownership";
import { INSTALLMENTS_PER_YEAR } from "@/lib/lease-math";

export interface OwnerStatementFilters {
  ownerId: string;
  from?: Date;
  to?: Date;
  compoundId?: string;
  unitId?: string;
}

export interface OwnerStatementRow {
  date: Date;
  reference: string;
  description: string;
  descriptionAr: string | null;
  debit: Prisma.Decimal;
  credit: Prisma.Decimal;
  runningBalance: Prisma.Decimal;
}

/** Owner Statement report: opening balance, dated ledger rows with a running balance, and closing totals. */
export async function getOwnerStatement(filters: OwnerStatementFilters) {
  const { organizationId } = await requirePermission("ownerLedger.view");
  const owner = await prisma.owner.findUniqueOrThrow({ where: { id: filters.ownerId, organizationId } });

  const scopeWhere = {
    organizationId,
    ownerId: filters.ownerId,
    compoundId: filters.compoundId,
    unitId: filters.unitId,
  };

  const [openingEntries, periodEntries] = await Promise.all([
    filters.from
      ? prisma.ownerLedgerEntry.findMany({
          where: { ...scopeWhere, entryDate: { lt: filters.from } },
          select: { debit: true, credit: true },
        })
      : Promise.resolve([]),
    prisma.ownerLedgerEntry.findMany({
      where: {
        ...scopeWhere,
        entryDate: { gte: filters.from, lte: filters.to },
      },
      orderBy: { entryDate: "asc" },
    }),
  ]);

  const openingBalance = openingEntries.reduce((sum, e) => sum.plus(e.credit).minus(e.debit), new Prisma.Decimal(0));

  let running = openingBalance;
  let totalIncome = new Prisma.Decimal(0);
  let totalExpenses = new Prisma.Decimal(0);
  let totalDistributions = new Prisma.Decimal(0);

  const rows: OwnerStatementRow[] = periodEntries.map((e) => {
    running = running.plus(e.credit).minus(e.debit);
    if (e.entryType === "RENT_INCOME" || e.entryType === "OTHER_INCOME") totalIncome = totalIncome.plus(e.credit);
    if (
      e.entryType === "MANAGEMENT_FEE" ||
      e.entryType === "MAINTENANCE_EXPENSE" ||
      e.entryType === "UTILITY_EXPENSE" ||
      e.entryType === "SERVICE_EXPENSE" ||
      e.entryType === "GOVERNMENT_FEE" ||
      e.entryType === "OTHER_EXPENSE"
    )
      totalExpenses = totalExpenses.plus(e.debit);
    if (e.entryType === "OWNER_DISTRIBUTION") totalDistributions = totalDistributions.plus(e.debit);

    return {
      date: e.entryDate,
      reference: e.referenceId ?? e.referenceType ?? e.entryType,
      description: e.description,
      descriptionAr: e.descriptionAr,
      debit: e.debit,
      credit: e.credit,
      runningBalance: running,
    };
  });

  return {
    owner,
    rows,
    openingBalance,
    closingBalance: running,
    totalIncome,
    totalExpenses,
    totalDistributions,
  };
}

export interface OwnerPortfolioRow {
  ownerId: string;
  ownerName: string;
  ownerNameAr: string | null;
  compoundName: string;
  compoundArabicName: string | null;
  buildingName: string;
  buildingNameAr: string | null;
  unitId: string;
  unitNumber: string;
  ownershipPercentage: Prisma.Decimal;
  annualRent: number | null;
  occupancyStatus: string;
  currentTenant: string | null;
  currentTenantAr: string | null;
  leaseEndDate: Date | null;
}

/** Owner Portfolio report: every unit each owner effectively owns (following inheritance), with lease/occupancy context. Optionally scoped to a single owner. */
export async function getOwnerPortfolio(ownerId?: string): Promise<OwnerPortfolioRow[]> {
  const { organizationId } = await requirePermission("ownership.view");

  const [ownershipRows, units, owners] = await Promise.all([
    prisma.propertyOwnership.findMany({
      where: { organizationId, status: "ACTIVE" },
      select: { ownerId: true, ownershipPercentage: true, compoundId: true, buildingId: true, unitId: true, id: true },
    }),
    prisma.unit.findMany({
      where: { organizationId },
      include: {
        floor: { include: { building: { include: { compound: true } } } },
        contracts: { where: { status: "ACTIVE" }, include: { renter: true }, take: 1 },
      },
    }),
    prisma.owner.findMany({ where: { organizationId, deletedAt: null }, select: { id: true, name: true, nameAr: true } }),
  ]);

  const ownerById = new Map(owners.map((o) => [o.id, o]));

  const byLevel = (level: AssetLevel) => {
    const map = new Map<string, OwnershipRow[]>();
    for (const row of ownershipRows) {
      const key = level === "COMPOUND" ? row.compoundId : level === "BUILDING" ? row.buildingId : row.unitId;
      if (!key) continue;
      const list = map.get(key) ?? [];
      list.push({ id: row.id, ownerId: row.ownerId, ownershipPercentage: row.ownershipPercentage });
      map.set(key, list);
    }
    return map;
  };
  const byUnit = byLevel("UNIT");
  const byBuilding = byLevel("BUILDING");
  const byCompound = byLevel("COMPOUND");

  const result: OwnerPortfolioRow[] = [];
  for (const unit of units) {
    const building = unit.floor.building;
    const compound = building.compound;

    const effective = pickEffectiveOwnershipLevel([
      { level: "UNIT", rows: byUnit.get(unit.id) ?? [] },
      { level: "BUILDING", rows: byBuilding.get(building.id) ?? [] },
      { level: "COMPOUND", rows: byCompound.get(compound.id) ?? [] },
    ]);

    const contract = unit.contracts[0];
    for (const ownership of effective) {
      if (ownerId && ownership.ownerId !== ownerId) continue;
      const owner = ownerById.get(ownership.ownerId);
      result.push({
        ownerId: ownership.ownerId,
        ownerName: owner?.name ?? ownership.ownerId,
        ownerNameAr: owner?.nameAr ?? null,
        compoundName: compound.name,
        compoundArabicName: compound.arabicName,
        buildingName: building.name,
        buildingNameAr: building.nameAr,
        unitId: unit.id,
        unitNumber: unit.unitNumber,
        ownershipPercentage: ownership.ownershipPercentage,
        annualRent: contract ? Number(contract.rentAmount) * INSTALLMENTS_PER_YEAR[contract.paymentFrequency] : null,
        occupancyStatus: unit.status,
        currentTenant: contract?.renter.fullName ?? null,
        currentTenantAr: contract?.renter.fullNameAr ?? null,
        leaseEndDate: contract?.endDate ?? null,
      });
    }
  }

  return result;
}
