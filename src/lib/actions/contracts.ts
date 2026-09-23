"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/session";
import { createContractWithSchedule, generateAndCreateSchedule } from "@/lib/contract-schedule";
import { getLocale, getDictionary } from "@/lib/i18n";
import { auditCreate, auditUpdate, auditAction, requirePermissionAudited } from "@/lib/audit";
import { moveOutBlocksContractRenewal } from "@/lib/operations/move-out-rules";

function contractFieldsSchema(t: ReturnType<typeof getDictionary>) {
  return z.object({
    startDate: z.coerce.date(),
    endDate: z.coerce.date(),
    rentAmount: z.coerce.number().positive(t.validation.installmentAmountPositive),
    paymentFrequency: z.enum(["MONTHLY", "QUARTERLY", "SEMI_ANNUAL", "ANNUAL", "ONE_TIME"]),
    securityDeposit: z.coerce.number().optional(),
    commissionAmount: z.coerce.number().min(0).optional(),
    cleaningAmount: z.coerce.number().min(0).optional(),
    extraChargesMode: z.enum(["ONE_TIME", "SPLIT"]),
    vatApplicable: z.coerce.boolean().optional(),
    notes: z.string().optional(),
  });
}

function readContractFields(formData: FormData) {
  return {
    startDate: formData.get("startDate"),
    endDate: formData.get("endDate"),
    rentAmount: formData.get("rentAmount"),
    paymentFrequency: formData.get("paymentFrequency"),
    securityDeposit: formData.get("securityDeposit") || undefined,
    commissionAmount: formData.get("commissionAmount") || undefined,
    cleaningAmount: formData.get("cleaningAmount") || undefined,
    extraChargesMode: formData.get("extraChargesMode") || "ONE_TIME",
    vatApplicable: formData.get("vatApplicable") === "on",
    notes: formData.get("notes") || undefined,
  };
}

const COMMERCIAL_UNIT_TYPES = new Set(["OFFICE", "SHOP", "WAREHOUSE"]);

function inlineUnitSchema(t: ReturnType<typeof getDictionary>) {
  return z.object({
    floorId: z.string().min(1, t.validation.floorRequired),
    unitNumber: z.string().min(1, t.validation.unitNumberRequired),
    unitType: z.enum(["APARTMENT", "VILLA", "OFFICE", "SHOP", "WAREHOUSE", "OTHER"]),
    baseRentAmount: z.coerce.number().positive(t.validation.rentAmountPositive),
    vatApplicable: z.coerce.boolean().optional(),
  });
}

function inlineRenterSchema(t: ReturnType<typeof getDictionary>) {
  return z.object({
    fullName: z.string().min(1, t.validation.nameRequired),
    fullNameAr: z.string().optional(),
    idType: z.enum(["NATIONAL_ID", "IQAMA", "COMMERCIAL_REGISTRATION", "PASSPORT", "GCC_ID"]),
    idNumber: z.string().optional(),
    phone: z.string().optional(),
  });
}

export async function createContract(formData: FormData) {
  const { organizationId } = await requirePermission("contract.create");
  const t = getDictionary(await getLocale());
  const contractFields = contractFieldsSchema(t).parse(readContractFields(formData));

  if (contractFields.endDate <= contractFields.startDate) {
    throw new Error(t.validation.contractEndAfterStart);
  }

  await prisma.$transaction(async (tx) => {
    let unitId: string;
    if (formData.get("createNewUnit") === "true") {
      await requirePermission("unit.create");
      const newUnit = inlineUnitSchema(t).parse({
        floorId: formData.get("newUnitFloorId"),
        unitNumber: formData.get("newUnitNumber"),
        unitType: formData.get("newUnitType"),
        baseRentAmount: formData.get("newUnitBaseRentAmount"),
        vatApplicable: formData.get("newUnitVatApplicable") === "on",
      });
      await tx.floor.findUniqueOrThrow({ where: { id: newUnit.floorId, organizationId } });
      const created = await tx.unit.create({
        data: {
          organizationId,
          floorId: newUnit.floorId,
          unitNumber: newUnit.unitNumber,
          unitType: newUnit.unitType,
          baseRentAmount: newUnit.baseRentAmount,
          vatApplicable: newUnit.vatApplicable ?? COMMERCIAL_UNIT_TYPES.has(newUnit.unitType),
        },
      });
      await auditCreate(tx, { entityType: "Unit", entityId: created.id, entityDisplayName: created.unitNumber, newValues: newUnit });
      unitId = created.id;
    } else {
      unitId = z.string().min(1).parse(formData.get("unitId"));
    }

    let renterId: string;
    if (formData.get("createNewRenter") === "true") {
      await requirePermission("renter.create");
      const newRenter = inlineRenterSchema(t).parse({
        fullName: formData.get("newRenterFullName"),
        fullNameAr: formData.get("newRenterFullNameAr") || undefined,
        idType: formData.get("newRenterIdType"),
        idNumber: formData.get("newRenterIdNumber") || undefined,
        phone: formData.get("newRenterPhone") || undefined,
      });
      const created = await tx.renter.create({ data: { ...newRenter, organizationId } });
      await auditCreate(tx, { entityType: "Renter", entityId: created.id, entityDisplayName: created.fullName, newValues: newRenter });
      renterId = created.id;
    } else {
      renterId = z.string().min(1).parse(formData.get("renterId"));
    }

    const unit = await tx.unit.findUniqueOrThrow({ where: { id: unitId, organizationId } });
    // Hardening (docs/SECURITY-REVIEW.md, "Cross-org relation injection"):
    // unitId was already verified above, but renterId was previously taken
    // straight from client input with no organization check at all - a
    // caller could link a Contract to another organization's Renter by
    // submitting that Renter's id. Verified the same way unitId already is.
    if (formData.get("createNewRenter") !== "true") {
      await tx.renter.findUniqueOrThrow({ where: { id: renterId, organizationId } });
    }
    const vatApplicable = contractFields.vatApplicable ?? unit.vatApplicable;
    const contract = await createContractWithSchedule(tx, organizationId, { ...contractFields, unitId, renterId, vatApplicable });
    await auditCreate(tx, {
      entityType: "Contract",
      entityId: contract.id,
      entityDisplayName: contract.contractNumber,
      newValues: { unitId, renterId, ...contractFields, vatApplicable },
    });
  });

  revalidatePath("/contracts");
  revalidatePath("/units");
  revalidatePath("/renters");
  revalidatePath("/dashboard");
}

/**
 * Terminates a Contract. Move-Out Management Phase 2, Decision 1: physical
 * vacancy belongs to Move-Out, not Contract termination - Unit.status must
 * represent confirmed physical hand-back, so a Unit must not become VACANT
 * merely because its Contract was terminated (only a COMPLETED Move-Out's
 * own strictly re-validated completeMoveOut() may do that - see
 * docs/MOVE-OUT-MANAGEMENT.md). This intentionally tightens this action's
 * previous behavior, which used to set the Unit VACANT here unconditionally;
 * every other effect (Contract status, pending PaymentSchedule cancellation)
 * is unchanged - no financial side effect was introduced or removed.
 */
export async function terminateContract(contractId: string) {
  const { organizationId } = await requirePermissionAudited("contract.terminate", "Contract", contractId);
  await prisma.$transaction(async (tx) => {
    const before = await tx.contract.findUniqueOrThrow({ where: { id: contractId, organizationId } });
    const contract = await tx.contract.update({
      where: { id: contractId, organizationId },
      data: { status: "TERMINATED" },
    });
    await tx.paymentSchedule.updateMany({
      where: { contractId, organizationId, status: "PENDING" },
      data: { status: "CANCELLED" },
    });
    await auditAction(tx, {
      action: "TERMINATE",
      entityType: "Contract",
      entityId: contract.id,
      entityDisplayName: contract.contractNumber,
      previousValues: { status: before.status },
      newValues: { status: contract.status },
    });
  });
  revalidatePath("/contracts");
  revalidatePath("/units");
  revalidatePath("/dashboard");
}

export async function renewContract(formData: FormData) {
  const { organizationId } = await requirePermissionAudited(
    "contract.renew",
    "Contract",
    String(formData.get("contractId") ?? "")
  );
  const t = getDictionary(await getLocale());
  const parsed = contractFieldsSchema(t).extend({ contractId: z.string().min(1) }).parse({
    ...readContractFields(formData),
    contractId: formData.get("contractId"),
  });

  if (parsed.endDate <= parsed.startDate) {
    throw new Error(t.validation.contractEndAfterStart);
  }

  await prisma.$transaction(
    async (tx) => {
      const oldContract = await tx.contract.findUniqueOrThrow({
        where: { id: parsed.contractId, organizationId },
      });

      // Move-Out Management Phase 2, requirement 4: a Contract with a
      // non-terminal or COMPLETED Move-Out must not be silently renewed -
      // renewing it would create a second, live Contract for a Unit that
      // either still has an in-progress physical hand-back, or has already
      // been physically handed back. A CANCELLED Move-Out never blocks
      // renewal. Checked inside this same Serializable transaction (see
      // createMoveOut()'s own use of Serializable for the same Contract/
      // MoveOut tables) so a renewal racing a brand-new Move-Out creation
      // can never both succeed.
      const moveOuts = await tx.moveOut.findMany({ where: { organizationId, contractId: oldContract.id }, select: { status: true } });
      if (moveOuts.some((m) => moveOutBlocksContractRenewal(m.status))) {
        throw new Error(t.validation.contractRenewalBlockedByMoveOut);
      }

      await tx.contract.update({ where: { id: oldContract.id }, data: { status: "RENEWED" } });
      await tx.paymentSchedule.updateMany({
        where: { contractId: oldContract.id, organizationId, status: "PENDING" },
        data: { status: "CANCELLED" },
      });

      const newContract = await createContractWithSchedule(tx, organizationId, {
        unitId: oldContract.unitId,
        renterId: oldContract.renterId,
        startDate: parsed.startDate,
        endDate: parsed.endDate,
        rentAmount: parsed.rentAmount,
        paymentFrequency: parsed.paymentFrequency,
        securityDeposit: parsed.securityDeposit,
        commissionAmount: parsed.commissionAmount,
        cleaningAmount: parsed.cleaningAmount,
        extraChargesMode: parsed.extraChargesMode,
        vatApplicable: parsed.vatApplicable ?? oldContract.vatApplicable,
        notes: parsed.notes,
      });
      await tx.contract.update({ where: { id: newContract.id }, data: { renewedFromContractId: oldContract.id } });

      await auditAction(tx, {
        action: "RENEW",
        entityType: "Contract",
        entityId: oldContract.id,
        entityDisplayName: oldContract.contractNumber,
        previousValues: { status: oldContract.status, endDate: oldContract.endDate },
        newValues: { status: "RENEWED", renewedIntoContractId: newContract.id, renewedIntoContractNumber: newContract.contractNumber },
      });
      await auditCreate(tx, {
        action: "RENEW",
        entityType: "Contract",
        entityId: newContract.id,
        entityDisplayName: newContract.contractNumber,
        newValues: { renewedFromContractId: oldContract.id, renewedFromContractNumber: oldContract.contractNumber, ...parsed },
      });
    },
    { isolationLevel: "Serializable" }
  );

  revalidatePath("/contracts");
  revalidatePath("/units");
  revalidatePath("/dashboard");
  redirect("/contracts");
}

export async function getContractById(contractId: string) {
  const { organizationId } = await requirePermission("contract.view");
  return prisma.contract.findUniqueOrThrow({
    where: { id: contractId, organizationId },
    include: {
      unit: { include: { floor: { include: { building: { include: { compound: true } } } } } },
      renter: true,
    },
  });
}

/** Whether any (non-cancelled) invoice has ever been issued against this contract - once true, its billable terms are locked. */
export async function getContractEditContext(contractId: string) {
  const { organizationId } = await requirePermission("contract.view");
  const [contract, invoiceCount] = await Promise.all([
    prisma.contract.findUniqueOrThrow({
      where: { id: contractId, organizationId },
      include: {
        unit: { include: { floor: { include: { building: { include: { compound: true } } } } } },
        renter: true,
        // Null for a manually created (or renewed) contract - set only when
        // this Contract resulted from convertReservationToContract() (see
        // docs/RESERVATION-TO-CONTRACT.md) - drives this page's "Source" box.
        reservation: { select: { id: true, reservationNumber: true, leadId: true, offer: { select: { id: true, offerNumber: true } }, lead: { select: { id: true, fullName: true } } } },
      },
    }),
    prisma.invoice.count({ where: { organizationId, contractId, status: { not: "CANCELLED" } } }),
  ]);
  return { contract, hasBilling: invoiceCount > 0 };
}

export async function updateContract(formData: FormData) {
  const { organizationId } = await requirePermission("contract.update");
  const t = getDictionary(await getLocale());
  const contractId = String(formData.get("contractId"));

  await prisma.$transaction(async (tx) => {
    const existing = await tx.contract.findUniqueOrThrow({ where: { id: contractId, organizationId } });
    const hasBilling = (await tx.invoice.count({ where: { organizationId, contractId, status: { not: "CANCELLED" } } })) > 0;

    if (!hasBilling) {
      const parsed = contractFieldsSchema(t)
        .extend({ unitId: z.string().min(1), renterId: z.string().min(1) })
        .parse({ ...readContractFields(formData), unitId: formData.get("unitId"), renterId: formData.get("renterId") });

      if (parsed.endDate <= parsed.startDate) {
        throw new Error(t.validation.contractEndAfterStart);
      }

      if (parsed.unitId !== existing.unitId) {
        const newUnit = await tx.unit.findUniqueOrThrow({ where: { id: parsed.unitId, organizationId } });
        if (newUnit.status === "OCCUPIED") {
          throw new Error(t.validation.unitAlreadyOccupied);
        }
        await tx.unit.update({ where: { id: existing.unitId }, data: { status: "VACANT" } });
        await tx.unit.update({ where: { id: parsed.unitId }, data: { status: "OCCUPIED" } });
      }
      // Hardening (docs/SECURITY-REVIEW.md, "Cross-org relation injection"):
      // unitId is verified above when changed, but renterId had no
      // organization check at all before being written to Contract.renterId
      // below - a caller could re-point a Contract at another
      // organization's Renter by submitting that Renter's id.
      if (parsed.renterId !== existing.renterId) {
        await tx.renter.findUniqueOrThrow({ where: { id: parsed.renterId, organizationId } });
      }

      const updated = await tx.contract.update({
        where: { id: contractId },
        data: {
          unitId: parsed.unitId,
          renterId: parsed.renterId,
          startDate: parsed.startDate,
          endDate: parsed.endDate,
          rentAmount: parsed.rentAmount,
          paymentFrequency: parsed.paymentFrequency,
          securityDeposit: parsed.securityDeposit,
          commissionAmount: parsed.commissionAmount,
          cleaningAmount: parsed.cleaningAmount,
          extraChargesMode: parsed.extraChargesMode,
          vatApplicable: parsed.vatApplicable ?? existing.vatApplicable,
          vatRate: (parsed.vatApplicable ?? existing.vatApplicable) ? 15 : 0,
          notes: parsed.notes,
        },
      });

      await tx.paymentSchedule.deleteMany({ where: { contractId } });
      await generateAndCreateSchedule(tx, organizationId, updated);
      await auditUpdate(tx, {
        entityType: "Contract",
        entityId: updated.id,
        entityDisplayName: updated.contractNumber,
        before: existing,
        after: updated,
      });
    } else {
      // Once a contract has been billed, its financial terms and schedule are locked -
      // only fields with no effect on already-issued invoices/schedules stay editable.
      const vatApplicable = formData.get("vatApplicable") === "on";
      const notes = (formData.get("notes") as string) || undefined;
      const updated = await tx.contract.update({ where: { id: contractId }, data: { vatApplicable, notes } });
      await auditUpdate(tx, {
        entityType: "Contract",
        entityId: updated.id,
        entityDisplayName: updated.contractNumber,
        before: existing,
        after: updated,
      });
    }
  });

  revalidatePath("/contracts");
  revalidatePath("/units");
  revalidatePath("/dashboard");
  redirect("/contracts");
}

export async function listContracts() {
  const { organizationId } = await requirePermission("contract.view");
  return prisma.contract.findMany({
    where: { organizationId },
    include: {
      unit: { include: { floor: { include: { building: { include: { compound: true } } } } } },
      renter: true,
      paymentSchedules: true,
    },
    orderBy: { createdAt: "desc" },
  });
}
