"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import type { CorporateHousingAllocationStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requirePermission, requireSession } from "@/lib/session";
import { auditCreate, auditAction, requirePermissionAudited } from "@/lib/audit";
import { nextCounterValue, formatCorporateHousingAllocationNumber } from "@/lib/numbering";
import { getLocale, getDictionary } from "@/lib/i18n";
import {
  evaluateContractEligibility,
  validateAllocationDates,
  canOccupantBeAllocated,
  isValidAllocationTransition,
  canTransferFromStatus,
  type ExistingOccupantAllocation,
} from "@/lib/corporate-housing-rules";

/**
 * Housing Allocation server actions (docs/CORPORATE-HOUSING.md, "Allocation
 * vs Contract"). Every write re-verifies Contract/Unit/Account/Occupant
 * consistency fresh inside a Serializable transaction - never trusts a
 * client-supplied id combination. Never mutates Unit.status, Contract.status,
 * MoveIn, or MoveOut.
 */

const PAGE_SIZE = 25;

/** Contracts eligible to receive a NEW allocation under this Corporate Account (Step 10). */
export async function getEligibleContractsForAccount(corporateAccountId: string) {
  const { organizationId } = await requirePermission("corporateAllocation.create");
  const account = await prisma.corporateAccount.findFirst({ where: { id: corporateAccountId, organizationId } });
  if (!account) throw new Error("Not found");
  return prisma.contract.findMany({
    where: { organizationId, renterId: account.renterId, status: "ACTIVE" },
    select: { id: true, contractNumber: true, startDate: true, endDate: true, unit: { select: { id: true, unitNumber: true } } },
    orderBy: { startDate: "desc" },
  });
}

/**
 * Read-only traceability for the Contract profile page integration card
 * (docs/CORPORATE-HOUSING.md, "Contract profile integration") - never
 * exposed to the Owner Portal. Shows whether this Contract's Renter is a
 * Corporate Account and lists any allocations tied to this specific
 * Contract, without exposing anything beyond what the internal-staff
 * corporateHousing.view permission already covers.
 */
export async function getCorporateHousingContextForContract(contractId: string) {
  const { organizationId } = await requirePermission("corporateHousing.view");
  const contract = await prisma.contract.findFirst({ where: { id: contractId, organizationId }, select: { renterId: true } });
  if (!contract) return null;

  const corporateAccount = await prisma.corporateAccount.findFirst({
    where: { organizationId, renterId: contract.renterId },
    select: { id: true, accountNumber: true, displayName: true },
  });
  if (!corporateAccount) return null;

  const allocations = await prisma.corporateHousingAllocation.findMany({
    where: { organizationId, contractId },
    select: {
      id: true,
      allocationNumber: true,
      status: true,
      startDate: true,
      plannedEndDate: true,
      occupant: { select: { fullName: true, fullNameAr: true, employeeNumber: true } },
    },
    orderBy: { startDate: "desc" },
  });

  return { corporateAccount, allocations };
}

/**
 * Read-only traceability for the Unit profile page integration card -
 * never exposed to the Owner Portal. Reports the CURRENT allocation (if
 * any) on this Unit via its active Contract, without inferring anything
 * from Unit.status.
 */
export async function getCorporateHousingContextForUnit(unitId: string) {
  const { organizationId } = await requirePermission("corporateHousing.view");
  const allocation = await prisma.corporateHousingAllocation.findFirst({
    where: { organizationId, unitId, status: { in: ["ACTIVE", "PLANNED"] } },
    select: {
      id: true,
      allocationNumber: true,
      status: true,
      startDate: true,
      plannedEndDate: true,
      corporateAccount: { select: { id: true, accountNumber: true, displayName: true } },
      occupant: { select: { fullName: true, fullNameAr: true, employeeNumber: true } },
    },
    orderBy: { startDate: "desc" },
  });
  return allocation;
}

/**
 * Bulk current-allocation lookup for the Units list page integration badge
 * (docs/CORPORATE-HOUSING.md, "Unit profile integration") - mirrors the
 * existing getMoveInStatusForUnits()/getMoveOutStatusForUnits() bulk-lookup
 * pattern rather than per-row queries. Never exposed to the Owner Portal.
 */
export async function getCorporateAllocationStatusForUnits(unitIds: string[]) {
  const map = new Map<string, { allocationId: string; allocationNumber: string; status: CorporateHousingAllocationStatus } | null>();
  if (unitIds.length === 0) return map;
  const { organizationId } = await requirePermission("corporateHousing.view");

  const allocations = await prisma.corporateHousingAllocation.findMany({
    where: { organizationId, unitId: { in: unitIds }, status: { in: ["ACTIVE", "PLANNED"] } },
    select: { unitId: true, id: true, allocationNumber: true, status: true },
    orderBy: { startDate: "desc" },
  });
  for (const a of allocations) {
    if (!map.has(a.unitId)) map.set(a.unitId, { allocationId: a.id, allocationNumber: a.allocationNumber, status: a.status });
  }
  return map;
}

/**
 * Read-only traceability for the Maintenance detail page card (docs/CORPORATE-HOUSING.md,
 * "Maintenance integration") - finds the allocation (if any) tying a
 * reporting occupant to the unit the maintenance request is against. Never
 * exposed to the Tenant Portal or Owner Portal (Maintenance joins there
 * never select corporateOccupantId or this helper).
 */
export async function getCorporateHousingContextForMaintenanceRequest(occupantId: string, unitId: string) {
  const { organizationId } = await requirePermission("corporateHousing.view");
  return prisma.corporateHousingAllocation.findFirst({
    where: { organizationId, occupantId, unitId },
    select: { id: true, allocationNumber: true, status: true },
    orderBy: { startDate: "desc" },
  });
}

async function fetchOccupantBlockingAllocations(organizationId: string, occupantId: string): Promise<ExistingOccupantAllocation[]> {
  return prisma.corporateHousingAllocation.findMany({
    where: { organizationId, occupantId, status: { in: ["PLANNED", "ACTIVE"] } },
    select: { id: true, status: true, startDate: true, plannedEndDate: true, actualEndDate: true },
  });
}

export interface CorporateAllocationListFilters {
  corporateAccountId?: string;
  occupantId?: string;
  contractId?: string;
  unitId?: string;
  compoundId?: string;
  buildingId?: string;
  status?: CorporateHousingAllocationStatus;
  startFrom?: Date;
  startTo?: Date;
  endFrom?: Date;
  endTo?: Date;
  page?: number;
}

/** Server-side filtered/paginated list (Step 33). */
export async function listCorporateAllocations(filters: CorporateAllocationListFilters = {}) {
  const { organizationId } = await requirePermission("corporateHousing.view");
  const page = Math.max(1, filters.page ?? 1);

  const where: Prisma.CorporateHousingAllocationWhereInput = {
    organizationId,
    corporateAccountId: filters.corporateAccountId || undefined,
    occupantId: filters.occupantId || undefined,
    contractId: filters.contractId || undefined,
    unitId: filters.unitId || undefined,
    status: filters.status,
    startDate: filters.startFrom || filters.startTo ? { gte: filters.startFrom, lte: filters.startTo } : undefined,
    plannedEndDate: filters.endFrom || filters.endTo ? { gte: filters.endFrom, lte: filters.endTo } : undefined,
    ...(filters.compoundId || filters.buildingId
      ? { unit: { floor: { building: { id: filters.buildingId || undefined, compoundId: filters.compoundId || undefined } } } }
      : {}),
  };

  const [rows, total] = await Promise.all([
    prisma.corporateHousingAllocation.findMany({
      where,
      include: {
        corporateAccount: { select: { displayName: true, accountNumber: true } },
        occupant: { select: { fullName: true, fullNameAr: true, employeeNumber: true } },
        contract: { select: { contractNumber: true } },
        unit: { select: { unitNumber: true, floor: { select: { building: { select: { name: true, nameAr: true, compound: { select: { name: true, arabicName: true } } } } } } } },
      },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    prisma.corporateHousingAllocation.count({ where }),
  ]);

  return { rows, page, totalPages: Math.max(1, Math.ceil(total / PAGE_SIZE)) };
}

/** Full workspace data for /corporate-housing/allocations/[id] (Step 34). */
export async function getCorporateAllocationById(allocationId: string) {
  const { organizationId } = await requirePermission("corporateHousing.view");
  const allocation = await prisma.corporateHousingAllocation.findFirst({
    where: { id: allocationId, organizationId },
    include: {
      corporateAccount: { select: { id: true, displayName: true, accountNumber: true } },
      occupant: { select: { id: true, fullName: true, fullNameAr: true, employeeNumber: true } },
      contract: { select: { id: true, contractNumber: true, status: true, startDate: true, endDate: true } },
      unit: { select: { id: true, unitNumber: true, floor: { select: { name: true, building: { select: { name: true, nameAr: true, compound: { select: { name: true, arabicName: true } } } } } } } },
    },
  });
  if (!allocation) throw new Error("Not found");

  const [moveIn, maintenanceRequests] = await Promise.all([
    prisma.moveIn.findFirst({ where: { organizationId, contractId: allocation.contractId }, orderBy: { createdAt: "desc" }, select: { id: true, moveInNumber: true, status: true } }),
    prisma.maintenanceRequest.findMany({
      where: { organizationId, unitId: allocation.unitId, corporateOccupantId: allocation.occupantId },
      select: { id: true, requestNumber: true, category: true, status: true, reportedAt: true },
      orderBy: { reportedAt: "desc" },
      take: 10,
    }),
  ]);

  return { allocation, moveIn, maintenanceRequests };
}

const createSchema = z.object({
  corporateAccountId: z.string().min(1),
  occupantId: z.string().min(1),
  contractId: z.string().min(1),
  startDate: z.coerce.date(),
  plannedEndDate: z.coerce.date().optional(),
  bedroomNumber: z.string().optional(),
  roomLabel: z.string().optional(),
  notes: z.string().optional(),
});

/**
 * Step 16/9: Unit is NEVER read from the client - only ever derived from
 * the Contract itself, inside this same transaction, mirroring
 * createMoveIn()'s own "Unit/Renter must derive from Contract" pattern.
 */
export async function createCorporateAllocation(formData: FormData): Promise<string> {
  const { organizationId } = await requirePermissionAudited("corporateAllocation.create", "CorporateHousingAllocation");
  const { user } = await requireSession();
  const t = getDictionary(await getLocale());
  const parsed = createSchema.parse({
    corporateAccountId: formData.get("corporateAccountId"),
    occupantId: formData.get("occupantId"),
    contractId: formData.get("contractId"),
    startDate: formData.get("startDate"),
    plannedEndDate: formData.get("plannedEndDate") || undefined,
    bedroomNumber: formData.get("bedroomNumber") || undefined,
    roomLabel: formData.get("roomLabel") || undefined,
    notes: formData.get("notes") || undefined,
  });

  const allocationId = await prisma.$transaction(
    async (tx) => {
      const account = await tx.corporateAccount.findFirst({ where: { id: parsed.corporateAccountId, organizationId } });
      if (!account) throw new Error(t.corporateHousing.accountNotFound);

      const occupant = await tx.corporateOccupant.findFirst({ where: { id: parsed.occupantId, organizationId, corporateAccountId: parsed.corporateAccountId } });
      if (!occupant) throw new Error(t.corporateHousing.occupantNotFound);

      const contract = await tx.contract.findFirst({ where: { id: parsed.contractId, organizationId } });
      if (!contract) throw new Error(t.corporateHousing.contractNotFound);

      const eligibility = evaluateContractEligibility({
        contractOrganizationId: organizationId,
        contractRenterId: contract.renterId,
        contractStatus: contract.status,
        accountOrganizationId: organizationId,
        accountRenterId: account.renterId,
      });
      if (!eligibility.eligible) throw new Error(t.corporateHousing.contractNotEligible);

      const dateValidation = validateAllocationDates({
        contractStartDate: contract.startDate,
        contractEndDate: contract.endDate,
        startDate: parsed.startDate,
        plannedEndDate: parsed.plannedEndDate ?? null,
      });
      if (!dateValidation.valid) throw new Error(t.corporateHousing.allocationDatesInvalid);

      const existing = await fetchOccupantBlockingAllocations(organizationId, parsed.occupantId);
      if (!canOccupantBeAllocated(existing, { startDate: parsed.startDate, plannedEndDate: parsed.plannedEndDate ?? null })) {
        throw new Error(t.corporateHousing.occupantOverlap);
      }

      const seq = await nextCounterValue(tx, organizationId, "corporateHousingAllocation");
      const allocationNumber = formatCorporateHousingAllocationNumber(seq);
      const status: CorporateHousingAllocationStatus = parsed.startDate <= new Date() ? "ACTIVE" : "PLANNED";

      const created = await tx.corporateHousingAllocation.create({
        data: {
          organizationId,
          corporateAccountId: parsed.corporateAccountId,
          occupantId: parsed.occupantId,
          contractId: parsed.contractId,
          unitId: contract.unitId,
          allocationNumber,
          startDate: parsed.startDate,
          plannedEndDate: parsed.plannedEndDate,
          bedroomNumber: parsed.bedroomNumber,
          roomLabel: parsed.roomLabel,
          notes: parsed.notes,
          status,
          createdByUserId: user.id,
        },
      });

      await auditCreate(tx, {
        entityType: "CorporateHousingAllocation",
        entityId: created.id,
        entityDisplayName: created.allocationNumber,
        newValues: { corporateAccountId: parsed.corporateAccountId, occupantId: parsed.occupantId, contractId: parsed.contractId, unitId: contract.unitId, status },
      });

      return created.id;
    },
    { isolationLevel: "Serializable" }
  );

  revalidatePath("/corporate-housing/allocations");
  revalidatePath(`/corporate-housing/accounts/${parsed.corporateAccountId}`);
  return allocationId;
}

const idSchema = z.object({ allocationId: z.string().min(1) });

/** Step 17: PLANNED -> ACTIVE, re-checking every relation and the overlap rule fresh, inside a transaction, since state could have changed since the allocation was planned. */
export async function activateCorporateAllocation(formData: FormData): Promise<void> {
  const { organizationId } = await requirePermissionAudited("corporateAllocation.activate", "CorporateHousingAllocation");
  const t = getDictionary(await getLocale());
  const { allocationId } = idSchema.parse({ allocationId: formData.get("allocationId") });

  await prisma.$transaction(
    async (tx) => {
      const allocation = await tx.corporateHousingAllocation.findFirst({ where: { id: allocationId, organizationId } });
      if (!allocation) throw new Error(t.corporateHousing.allocationNotFound);
      if (!isValidAllocationTransition(allocation.status, "ACTIVE")) throw new Error(t.corporateHousing.allocationInvalidTransition);

      const [account, occupant, contract] = await Promise.all([
        tx.corporateAccount.findFirst({ where: { id: allocation.corporateAccountId, organizationId } }),
        tx.corporateOccupant.findFirst({ where: { id: allocation.occupantId, organizationId, corporateAccountId: allocation.corporateAccountId } }),
        tx.contract.findFirst({ where: { id: allocation.contractId, organizationId } }),
      ]);
      if (!account || !occupant || !contract) throw new Error(t.corporateHousing.allocationUnsafe);
      if (contract.unitId !== allocation.unitId || contract.renterId !== account.renterId) throw new Error(t.corporateHousing.allocationUnsafe);

      const existing = await fetchOccupantBlockingAllocations(organizationId, allocation.occupantId);
      if (!canOccupantBeAllocated(existing, { startDate: allocation.startDate, plannedEndDate: allocation.plannedEndDate }, allocation.id)) {
        throw new Error(t.corporateHousing.occupantOverlap);
      }

      const updated = await tx.corporateHousingAllocation.update({ where: { id: allocationId }, data: { status: "ACTIVE" } });
      await auditAction(tx, {
        action: "ACTIVATE",
        entityType: "CorporateHousingAllocation",
        entityId: updated.id,
        entityDisplayName: updated.allocationNumber,
        previousValues: { status: allocation.status },
        newValues: { status: updated.status },
      });
    },
    { isolationLevel: "Serializable" }
  );

  revalidatePath("/corporate-housing/allocations");
  revalidatePath(`/corporate-housing/allocations/${allocationId}`);
}

const endSchema = z.object({ allocationId: z.string().min(1), actualEndDate: z.coerce.date().optional() });

/**
 * Step 18 - critical invariant: ends the allocation record only. Never
 * terminates the Contract, never Moves Out the Contract, never sets
 * Unit.status = VACANT, never touches Invoice/PaymentSchedule.
 */
export async function endCorporateAllocation(formData: FormData): Promise<void> {
  const { organizationId } = await requirePermissionAudited("corporateAllocation.end", "CorporateHousingAllocation");
  const { user } = await requireSession();
  const t = getDictionary(await getLocale());
  const parsed = endSchema.parse({ allocationId: formData.get("allocationId"), actualEndDate: formData.get("actualEndDate") || undefined });

  await prisma.$transaction(async (tx) => {
    const allocation = await tx.corporateHousingAllocation.findFirst({ where: { id: parsed.allocationId, organizationId } });
    if (!allocation) throw new Error(t.corporateHousing.allocationNotFound);
    if (!isValidAllocationTransition(allocation.status, "ENDED")) throw new Error(t.corporateHousing.allocationInvalidTransition);

    const updated = await tx.corporateHousingAllocation.update({
      where: { id: parsed.allocationId },
      data: { status: "ENDED", actualEndDate: parsed.actualEndDate ?? new Date(), endedByUserId: user.id },
    });
    await auditAction(tx, {
      action: "END",
      entityType: "CorporateHousingAllocation",
      entityId: updated.id,
      entityDisplayName: updated.allocationNumber,
      previousValues: { status: allocation.status },
      newValues: { status: updated.status, actualEndDate: updated.actualEndDate },
    });
  });

  revalidatePath("/corporate-housing/allocations");
  revalidatePath(`/corporate-housing/allocations/${parsed.allocationId}`);
}

/** Step 19 - for records that should never proceed. Never deletes. */
export async function cancelCorporateAllocation(formData: FormData): Promise<void> {
  const { organizationId } = await requirePermissionAudited("corporateAllocation.cancel", "CorporateHousingAllocation");
  const t = getDictionary(await getLocale());
  const { allocationId } = idSchema.parse({ allocationId: formData.get("allocationId") });

  await prisma.$transaction(async (tx) => {
    const allocation = await tx.corporateHousingAllocation.findFirst({ where: { id: allocationId, organizationId } });
    if (!allocation) throw new Error(t.corporateHousing.allocationNotFound);
    if (!isValidAllocationTransition(allocation.status, "CANCELLED")) throw new Error(t.corporateHousing.allocationInvalidTransition);

    const updated = await tx.corporateHousingAllocation.update({ where: { id: allocationId }, data: { status: "CANCELLED" } });
    await auditAction(tx, {
      action: "CANCEL",
      entityType: "CorporateHousingAllocation",
      entityId: updated.id,
      entityDisplayName: updated.allocationNumber,
      previousValues: { status: allocation.status },
      newValues: { status: updated.status },
    });
  });

  revalidatePath("/corporate-housing/allocations");
  revalidatePath(`/corporate-housing/allocations/${allocationId}`);
}

const transferSchema = z.object({
  currentAllocationId: z.string().min(1),
  newContractId: z.string().min(1),
  newStartDate: z.coerce.date(),
  newPlannedEndDate: z.coerce.date().optional(),
  bedroomNumber: z.string().optional(),
  roomLabel: z.string().optional(),
  notes: z.string().optional(),
});

/**
 * Step 20/21: represented as ending the old allocation and creating a new
 * one, in a single atomic Serializable transaction - either both happen or
 * neither does. The new Contract must belong to the SAME Corporate
 * Account's Renter (an employee transfer stays within their employer's own
 * account in V1; moving an occupant to a different company is a new
 * occupant record, not a transfer). The historical allocation's own Unit is
 * never mutated.
 */
export async function transferCorporateOccupant(formData: FormData): Promise<string> {
  const { organizationId } = await requirePermissionAudited("corporateAllocation.transfer", "CorporateHousingAllocation");
  const { user } = await requireSession();
  const t = getDictionary(await getLocale());
  const parsed = transferSchema.parse({
    currentAllocationId: formData.get("currentAllocationId"),
    newContractId: formData.get("newContractId"),
    newStartDate: formData.get("newStartDate"),
    newPlannedEndDate: formData.get("newPlannedEndDate") || undefined,
    bedroomNumber: formData.get("bedroomNumber") || undefined,
    roomLabel: formData.get("roomLabel") || undefined,
    notes: formData.get("notes") || undefined,
  });

  const newAllocationId = await prisma.$transaction(
    async (tx) => {
      const current = await tx.corporateHousingAllocation.findFirst({ where: { id: parsed.currentAllocationId, organizationId } });
      if (!current) throw new Error(t.corporateHousing.allocationNotFound);
      if (!canTransferFromStatus(current.status)) throw new Error(t.corporateHousing.allocationInvalidTransition);

      const account = await tx.corporateAccount.findFirst({ where: { id: current.corporateAccountId, organizationId } });
      if (!account) throw new Error(t.corporateHousing.accountNotFound);

      const newContract = await tx.contract.findFirst({ where: { id: parsed.newContractId, organizationId } });
      if (!newContract) throw new Error(t.corporateHousing.contractNotFound);

      const eligibility = evaluateContractEligibility({
        contractOrganizationId: organizationId,
        contractRenterId: newContract.renterId,
        contractStatus: newContract.status,
        accountOrganizationId: organizationId,
        accountRenterId: account.renterId,
      });
      if (!eligibility.eligible) throw new Error(t.corporateHousing.contractNotEligible);

      const dateValidation = validateAllocationDates({
        contractStartDate: newContract.startDate,
        contractEndDate: newContract.endDate,
        startDate: parsed.newStartDate,
        plannedEndDate: parsed.newPlannedEndDate ?? null,
      });
      if (!dateValidation.valid) throw new Error(t.corporateHousing.allocationDatesInvalid);

      const existing = await fetchOccupantBlockingAllocations(organizationId, current.occupantId);
      if (!canOccupantBeAllocated(existing, { startDate: parsed.newStartDate, plannedEndDate: parsed.newPlannedEndDate ?? null }, current.id)) {
        throw new Error(t.corporateHousing.occupantOverlap);
      }

      const endedCurrent = await tx.corporateHousingAllocation.update({
        where: { id: current.id },
        data: { status: "ENDED", actualEndDate: parsed.newStartDate, endedByUserId: user.id },
      });

      const seq = await nextCounterValue(tx, organizationId, "corporateHousingAllocation");
      const allocationNumber = formatCorporateHousingAllocationNumber(seq);
      const newStatus: CorporateHousingAllocationStatus = parsed.newStartDate <= new Date() ? "ACTIVE" : "PLANNED";

      const created = await tx.corporateHousingAllocation.create({
        data: {
          organizationId,
          corporateAccountId: current.corporateAccountId,
          occupantId: current.occupantId,
          contractId: parsed.newContractId,
          unitId: newContract.unitId,
          allocationNumber,
          startDate: parsed.newStartDate,
          plannedEndDate: parsed.newPlannedEndDate,
          bedroomNumber: parsed.bedroomNumber,
          roomLabel: parsed.roomLabel,
          notes: parsed.notes,
          status: newStatus,
          createdByUserId: user.id,
        },
      });

      await auditAction(tx, {
        action: "TRANSFER",
        entityType: "CorporateHousingAllocation",
        entityId: endedCurrent.id,
        entityDisplayName: endedCurrent.allocationNumber,
        previousValues: { status: current.status, unitId: current.unitId },
        newValues: { status: "ENDED" },
        metadata: { transferredToAllocationId: created.id },
      });
      await auditCreate(tx, {
        action: "TRANSFER",
        entityType: "CorporateHousingAllocation",
        entityId: created.id,
        entityDisplayName: created.allocationNumber,
        newValues: { corporateAccountId: current.corporateAccountId, occupantId: current.occupantId, contractId: parsed.newContractId, unitId: newContract.unitId, status: newStatus },
        metadata: { transferredFromAllocationId: current.id },
      });

      return created.id;
    },
    { isolationLevel: "Serializable" }
  );

  revalidatePath("/corporate-housing/allocations");
  return newAllocationId;
}
