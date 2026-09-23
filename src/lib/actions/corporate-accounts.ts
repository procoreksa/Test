"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import type { CorporateAccountStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requirePermission, requireSession } from "@/lib/session";
import { auditCreate, auditUpdate, requirePermissionAudited } from "@/lib/audit";
import { nextCounterValue, formatCorporateAccountNumber } from "@/lib/numbering";
import { getLocale, getDictionary } from "@/lib/i18n";

/**
 * Corporate Account server actions (docs/CORPORATE-HOUSING.md). A
 * CorporateAccount always wraps an existing Renter (the commercial B2B
 * customer already fully supported by Invoice/Payment) - never a
 * duplicate customer model. See "Corporate Account vs Renter".
 */

const PAGE_SIZE = 25;

/** Renters eligible to become a new Corporate Account: a VAT-registered (B2B) Renter with no existing CorporateAccount yet. */
export async function getEligibleCorporateRenters() {
  const { organizationId } = await requirePermission("corporateAccount.create");
  return prisma.renter.findMany({
    where: { organizationId, vatNumber: { not: null }, corporateAccount: null },
    select: { id: true, fullName: true, fullNameAr: true, vatNumber: true },
    orderBy: { fullName: "asc" },
  });
}

/**
 * Bulk Corporate Account lookup for the Renters list page integration badge
 * (docs/CORPORATE-HOUSING.md, "Renter profile integration") - mirrors the
 * existing getMoveInStatusForRenters()/getMoveOutStatusForRenters() bulk
 * lookup pattern.
 */
export async function getCorporateAccountLinksForRenters(renterIds: string[]) {
  const map = new Map<string, { accountId: string; accountNumber: string; displayName: string } | null>();
  if (renterIds.length === 0) return map;
  const { organizationId } = await requirePermission("corporateHousing.view");

  const accounts = await prisma.corporateAccount.findMany({
    where: { organizationId, renterId: { in: renterIds } },
    select: { renterId: true, id: true, accountNumber: true, displayName: true },
  });
  for (const a of accounts) {
    map.set(a.renterId, { accountId: a.id, accountNumber: a.accountNumber, displayName: a.displayName });
  }
  return map;
}

/** Lightweight account options for occupant/allocation creation pickers. */
export async function getCorporateAccountOptions() {
  const { organizationId } = await requirePermission("corporateHousing.view");
  return prisma.corporateAccount.findMany({
    where: { organizationId },
    select: { id: true, accountNumber: true, displayName: true },
    orderBy: { displayName: "asc" },
  });
}

/** Active org users for the Account Manager picker. */
export async function getCorporateAccountManagerOptions() {
  const { organizationId } = await requirePermission("corporateHousing.view");
  return prisma.user.findMany({
    where: { organizationId, isActive: true },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
}

export interface CorporateAccountListFilters {
  search?: string;
  status?: CorporateAccountStatus;
  accountManagerUserId?: string;
  page?: number;
}

/** Server-side searched/filtered/paginated list (Step 28). Active-contract/active-allocation counts are computed via two bounded groupBy queries - never N+1 per row. */
export async function listCorporateAccounts(filters: CorporateAccountListFilters = {}) {
  const { organizationId } = await requirePermission("corporateHousing.view");
  const page = Math.max(1, filters.page ?? 1);

  const where: Prisma.CorporateAccountWhereInput = {
    organizationId,
    status: filters.status,
    accountManagerUserId: filters.accountManagerUserId || undefined,
    ...(filters.search
      ? { OR: [{ displayName: { contains: filters.search, mode: "insensitive" } }, { accountNumber: { contains: filters.search, mode: "insensitive" } }] }
      : {}),
  };

  const [rows, total] = await Promise.all([
    prisma.corporateAccount.findMany({
      where,
      include: {
        renter: { select: { fullName: true, fullNameAr: true, vatNumber: true } },
        accountManagerUser: { select: { name: true } },
      },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    prisma.corporateAccount.count({ where }),
  ]);

  const renterIds = rows.map((r) => r.renterId);
  const accountIds = rows.map((r) => r.id);
  const [contractCounts, allocationCounts] = await Promise.all([
    renterIds.length
      ? prisma.contract.groupBy({ by: ["renterId"], where: { organizationId, renterId: { in: renterIds }, status: "ACTIVE" }, _count: { _all: true } })
      : Promise.resolve([]),
    accountIds.length
      ? prisma.corporateHousingAllocation.groupBy({ by: ["corporateAccountId"], where: { organizationId, corporateAccountId: { in: accountIds }, status: "ACTIVE" }, _count: { _all: true } })
      : Promise.resolve([]),
  ]);
  const contractCountByRenter = new Map(contractCounts.map((c) => [c.renterId, c._count._all]));
  const allocationCountByAccount = new Map(allocationCounts.map((c) => [c.corporateAccountId, c._count._all]));

  const enriched = rows.map((r) => ({
    ...r,
    activeContractCount: contractCountByRenter.get(r.renterId) ?? 0,
    activeAllocationCount: allocationCountByAccount.get(r.id) ?? 0,
  }));

  return { rows: enriched, page, totalPages: Math.max(1, Math.ceil(total / PAGE_SIZE)) };
}

const createSchema = z.object({
  renterId: z.string().min(1),
  displayName: z.string().min(1),
  industry: z.string().optional(),
  website: z.string().optional(),
  accountManagerUserId: z.string().optional(),
  notes: z.string().optional(),
});

/** Manual creation only (Step 29) - CRM auto-conversion is deliberately not implemented. */
export async function createCorporateAccount(formData: FormData): Promise<string> {
  const { organizationId } = await requirePermissionAudited("corporateAccount.create", "CorporateAccount");
  const { user } = await requireSession();
  const t = getDictionary(await getLocale());
  const parsed = createSchema.parse({
    renterId: formData.get("renterId"),
    displayName: formData.get("displayName"),
    industry: formData.get("industry") || undefined,
    website: formData.get("website") || undefined,
    accountManagerUserId: formData.get("accountManagerUserId") || undefined,
    notes: formData.get("notes") || undefined,
  });

  const accountId = await prisma.$transaction(
    async (tx) => {
      const renter = await tx.renter.findFirst({ where: { id: parsed.renterId, organizationId } });
      if (!renter) throw new Error(t.corporateHousing.renterNotFound);
      if (!renter.vatNumber) throw new Error(t.corporateHousing.renterNotCorporate);

      const existing = await tx.corporateAccount.findUnique({ where: { renterId: parsed.renterId } });
      if (existing) throw new Error(t.corporateHousing.accountAlreadyExists);

      if (parsed.accountManagerUserId) {
        await tx.user.findFirstOrThrow({ where: { id: parsed.accountManagerUserId, organizationId } });
      }

      const seq = await nextCounterValue(tx, organizationId, "corporateAccount");
      const accountNumber = formatCorporateAccountNumber(seq);

      const created = await tx.corporateAccount.create({
        data: {
          organizationId,
          renterId: parsed.renterId,
          accountNumber,
          displayName: parsed.displayName,
          status: "PROSPECT",
          industry: parsed.industry,
          website: parsed.website,
          accountManagerUserId: parsed.accountManagerUserId || null,
          notes: parsed.notes,
          createdByUserId: user.id,
        },
      });

      await auditCreate(tx, {
        entityType: "CorporateAccount",
        entityId: created.id,
        entityDisplayName: created.accountNumber,
        newValues: { renterId: parsed.renterId, displayName: parsed.displayName, status: "PROSPECT" },
      });

      return created.id;
    },
    { isolationLevel: "Serializable" }
  );

  revalidatePath("/corporate-housing/accounts");
  return accountId;
}

const updateSchema = z.object({
  accountId: z.string().min(1),
  displayName: z.string().min(1),
  status: z.enum(["PROSPECT", "ACTIVE", "INACTIVE", "SUSPENDED"]),
  industry: z.string().optional(),
  website: z.string().optional(),
  accountManagerUserId: z.string().optional(),
  notes: z.string().optional(),
});

export async function updateCorporateAccount(formData: FormData): Promise<void> {
  const { organizationId } = await requirePermissionAudited("corporateAccount.update", "CorporateAccount");
  const t = getDictionary(await getLocale());
  const parsed = updateSchema.parse({
    accountId: formData.get("accountId"),
    displayName: formData.get("displayName"),
    status: formData.get("status"),
    industry: formData.get("industry") || undefined,
    website: formData.get("website") || undefined,
    accountManagerUserId: formData.get("accountManagerUserId") || undefined,
    notes: formData.get("notes") || undefined,
  });

  await prisma.$transaction(async (tx) => {
    const before = await tx.corporateAccount.findFirst({ where: { id: parsed.accountId, organizationId } });
    if (!before) throw new Error(t.corporateHousing.accountNotFound);

    if (parsed.accountManagerUserId) {
      await tx.user.findFirstOrThrow({ where: { id: parsed.accountManagerUserId, organizationId } });
    }

    const updated = await tx.corporateAccount.update({
      where: { id: parsed.accountId },
      data: {
        displayName: parsed.displayName,
        status: parsed.status,
        industry: parsed.industry,
        website: parsed.website,
        accountManagerUserId: parsed.accountManagerUserId || null,
        notes: parsed.notes,
      },
    });

    await auditUpdate(tx, {
      entityType: "CorporateAccount",
      entityId: updated.id,
      entityDisplayName: updated.accountNumber,
      before: { displayName: before.displayName, status: before.status },
      after: { displayName: updated.displayName, status: updated.status },
    });
  });

  revalidatePath("/corporate-housing/accounts");
  revalidatePath(`/corporate-housing/accounts/${parsed.accountId}`);
}

/** Full profile data for /corporate-housing/accounts/[id] (Step 27). */
export async function getCorporateAccountById(accountId: string) {
  const { organizationId } = await requirePermission("corporateHousing.view");
  const account = await prisma.corporateAccount.findFirst({
    where: { id: accountId, organizationId },
    include: {
      renter: { select: { id: true, fullName: true, fullNameAr: true, vatNumber: true, email: true, phone: true } },
      accountManagerUser: { select: { id: true, name: true } },
      contacts: { orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }] },
    },
  });
  if (!account) throw new Error("Not found");

  const [contracts, occupants, allocations] = await Promise.all([
    prisma.contract.findMany({
      where: { organizationId, renterId: account.renterId },
      select: {
        id: true,
        contractNumber: true,
        status: true,
        startDate: true,
        endDate: true,
        rentAmount: true,
        unit: { select: { id: true, unitNumber: true, floor: { select: { name: true, building: { select: { name: true, nameAr: true, compound: { select: { name: true, arabicName: true } } } } } } } },
      },
      orderBy: { startDate: "desc" },
    }),
    prisma.corporateOccupant.findMany({ where: { organizationId, corporateAccountId: accountId }, orderBy: { createdAt: "desc" } }),
    prisma.corporateHousingAllocation.findMany({
      where: { organizationId, corporateAccountId: accountId },
      include: {
        occupant: { select: { fullName: true, fullNameAr: true, employeeNumber: true } },
        unit: { select: { unitNumber: true } },
        contract: { select: { contractNumber: true } },
      },
      orderBy: { startDate: "desc" },
    }),
  ]);

  return { account, contracts, occupants, allocations };
}
