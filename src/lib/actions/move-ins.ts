"use server";

import { z } from "zod";
import type { Prisma, MoveInStatus, ConditionRating, KeyType, MeterType, MoveInAttachmentType } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requirePermission, requireSession } from "@/lib/session";
import { getLocale, getDictionary } from "@/lib/i18n";
import { auditCreate, auditAction, requirePermissionAudited } from "@/lib/audit";
import { nextCounterValue, formatMoveInNumber } from "@/lib/numbering";
import { buildRenterRecipient } from "@/lib/communications/recipients";
import { resolveNotificationLanguage } from "@/lib/communications/language";
import { emitCommunicationEventTx } from "@/lib/automation/outbox-emit";
import { moveInScheduledKey } from "@/lib/automation/outbox-keys";
import {
  blocksNewMoveInForContract,
  isValidMoveInTransition,
  isMoveInEditable,
  isReadyForHandoverEligible,
  validateMoveInCompletion,
  computeInspectionProgress,
  computeDefectSummary,
  isMoveInOverdue,
  getDefaultInspectionChecklist,
} from "@/lib/operations/move-in-rules";

const PAGE_SIZE = 25;

const FULL_MOVE_IN_INCLUDE = {
  contract: { select: { id: true, contractNumber: true, status: true, startDate: true, endDate: true } },
  unit: { include: { floor: { include: { building: { include: { compound: true } } } } } },
  renter: { select: { id: true, fullName: true, fullNameAr: true, phone: true } },
  inspectedByUser: { select: { id: true, name: true } },
  handedOverByUser: { select: { id: true, name: true } },
  inspectionItems: { orderBy: [{ category: "asc" }, { sequence: "asc" }] as const },
  inventoryItems: { orderBy: { createdAt: "asc" } as const },
  meterReadings: { orderBy: { createdAt: "asc" } as const },
  keyItems: { orderBy: { createdAt: "asc" } as const },
  attachments: { orderBy: { createdAt: "asc" } as const },
} satisfies Prisma.MoveInInclude;

/**
 * Derives isFurnished from the originating Offer's furnishedStatus when the
 * Contract came from a Reservation conversion (Step 23) - null/UNFURNISHED/
 * FLEXIBLE all default to false; staff can still override at creation.
 */
function deriveIsFurnished(furnishedStatus: string | undefined): boolean {
  return furnishedStatus === "FURNISHED" || furnishedStatus === "SEMI_FURNISHED";
}

// ---------------------------------------------------------------------------
// Create (Step 6/7/24/50)
// ---------------------------------------------------------------------------

export async function createMoveIn(formData: FormData): Promise<string> {
  const { organizationId } = await requirePermission("moveIn.create");
  const { user } = await requireSession();
  const t = getDictionary(await getLocale());

  const contractId = z.string().min(1).parse(formData.get("contractId"));
  const scheduledAtRaw = formData.get("scheduledAt");
  const scheduledAt = scheduledAtRaw ? z.coerce.date().parse(scheduledAtRaw) : null;
  const isFurnishedOverrideRaw = formData.get("isFurnished");
  const isFurnishedOverride = isFurnishedOverrideRaw === "on" ? true : isFurnishedOverrideRaw === "off" ? false : undefined;

  const moveInId = await prisma.$transaction(
    async (tx) => {
      // Step 50: Unit/Renter are NEVER read from the client - only ever
      // derived from the Contract itself, inside this same transaction.
      const contract = await tx.contract.findUniqueOrThrow({
        where: { id: contractId, organizationId },
        include: {
          reservation: { select: { leadId: true, offer: { select: { furnishedStatus: true } } } },
        },
      });

      // Step 7: eligibility - ACTIVE Contract only (see docs/
      // MOVE-IN-HANDOVER.md, "Contract eligibility" for why this single
      // check covers TERMINATED/EXPIRED/RENEWED/DRAFT all at once).
      if (contract.status !== "ACTIVE") {
        throw new Error(t.validation.moveInContractNotEligible);
      }

      // Step 6: one active/completed Move-In per Contract - app-layer
      // predicate inside a Serializable transaction, mirroring
      // blocksNewReservationForOffer()'s own precedent exactly.
      const existingMoveIns = await tx.moveIn.findMany({ where: { organizationId, contractId }, select: { status: true } });
      if (existingMoveIns.some((m) => blocksNewMoveInForContract(m.status))) {
        throw new Error(t.validation.moveInAlreadyExistsForContract);
      }

      const seq = await nextCounterValue(tx, organizationId, "moveIn");
      const moveInNumber = formatMoveInNumber(seq);
      const isFurnished = isFurnishedOverride ?? deriveIsFurnished(contract.reservation?.offer?.furnishedStatus);

      const created = await tx.moveIn.create({
        data: {
          organizationId,
          moveInNumber,
          contractId: contract.id,
          unitId: contract.unitId,
          renterId: contract.renterId,
          status: scheduledAt ? "SCHEDULED" : "DRAFT",
          scheduledAt,
          isFurnished,
          createdByUserId: user.id,
        },
      });

      // Step 24: seed the default checklist from the centralized template -
      // never hardcoded per-page.
      const checklist = getDefaultInspectionChecklist();
      await tx.moveInInspectionItem.createMany({
        data: checklist.map((item, index) => ({
          organizationId,
          moveInId: created.id,
          category: item.category,
          itemName: item.itemName,
          itemNameAr: item.itemNameAr,
          isApplicable: item.isApplicable,
          sequence: index,
        })),
      });

      await auditCreate(tx, {
        entityType: "MoveIn",
        entityId: created.id,
        entityDisplayName: created.moveInNumber,
        newValues: { contractId: contract.id, unitId: contract.unitId, renterId: contract.renterId, status: created.status, scheduledAt },
        metadata: { contractId: contract.id, contractNumber: contract.contractNumber },
      });

      return created.id;
    },
    { isolationLevel: "Serializable" }
  );

  revalidatePath("/operations/move-ins");
  revalidatePath("/operations");
  revalidatePath(`/contracts/${contractId}`);
  revalidatePath(`/contracts/${contractId}/edit`);
  return moveInId;
}

// ---------------------------------------------------------------------------
// Schedule / start (Step 4/28)
// ---------------------------------------------------------------------------

export async function scheduleMoveIn(formData: FormData) {
  const moveInId = String(formData.get("moveInId"));
  const { organizationId } = await requirePermission("moveIn.update");
  const t = getDictionary(await getLocale());
  const locale = await getLocale();
  const scheduledAt = z.coerce.date().parse(formData.get("scheduledAt"));

  await prisma.$transaction(async (tx) => {
    const moveIn = await tx.moveIn.findUniqueOrThrow({ where: { id: moveInId, organizationId } });
    const nextStatus: MoveInStatus = moveIn.status === "DRAFT" ? "SCHEDULED" : moveIn.status;
    if (nextStatus !== moveIn.status && !isValidMoveInTransition(moveIn.status, nextStatus)) {
      throw new Error(t.validation.moveInInvalidTransition);
    }
    if (moveIn.status !== "DRAFT" && moveIn.status !== "SCHEDULED") {
      throw new Error(t.validation.moveInNotEditable);
    }
    const updated = await tx.moveIn.update({ where: { id: moveInId }, data: { scheduledAt, status: nextStatus } });
    await auditAction(tx, {
      action: "UPDATE",
      entityType: "MoveIn",
      entityId: updated.id,
      entityDisplayName: updated.moveInNumber,
      previousValues: { scheduledAt: moveIn.scheduledAt, status: moveIn.status },
      newValues: { scheduledAt: updated.scheduledAt, status: updated.status },
    });

    const [renter, unit, contract] = await Promise.all([
      tx.renter.findUnique({ where: { id: updated.renterId } }),
      tx.unit.findUnique({ where: { id: updated.unitId } }),
      tx.contract.findUnique({ where: { id: updated.contractId } }),
    ]);
    if (renter) {
      // Durable intent, same transaction as the MoveIn mutation above
      // (Critical Principle 1) - see docs/AUTOMATION-SCHEDULED-JOBS.md.
      await emitCommunicationEventTx(tx, {
        organizationId,
        eventType: "MOVE_IN_SCHEDULED",
        eventKey: moveInScheduledKey(updated.id, scheduledAt),
        businessEntityType: "MoveIn",
        businessEntityId: updated.id,
        language: resolveNotificationLanguage(locale),
        variables: {
          moveInNumber: updated.moveInNumber,
          scheduledAt: scheduledAt.toISOString().slice(0, 10),
          unitNumber: unit?.unitNumber ?? "",
          contractNumber: contract?.contractNumber ?? "",
        },
        recipients: [buildRenterRecipient(renter)],
      });
    }
  });

  revalidatePath(`/operations/move-ins/${moveInId}`);
  revalidatePath("/operations/move-ins");
  revalidatePath("/operations");
}

export async function startMoveIn(moveInId: string) {
  const { organizationId } = await requirePermissionAudited("moveIn.start", "MoveIn", moveInId);
  const { user } = await requireSession();
  const t = getDictionary(await getLocale());

  await prisma.$transaction(async (tx) => {
    const moveIn = await tx.moveIn.findUniqueOrThrow({ where: { id: moveInId, organizationId } });
    if (!isValidMoveInTransition(moveIn.status, "IN_PROGRESS")) {
      throw new Error(t.validation.moveInInvalidTransition);
    }
    const updated = await tx.moveIn.update({
      where: { id: moveInId },
      data: { status: "IN_PROGRESS", startedAt: moveIn.startedAt ?? new Date(), inspectedByUserId: moveIn.inspectedByUserId ?? user.id },
    });
    await auditAction(tx, {
      action: "UPDATE",
      entityType: "MoveIn",
      entityId: updated.id,
      entityDisplayName: updated.moveInNumber,
      previousValues: { status: moveIn.status },
      newValues: { status: updated.status, startedAt: updated.startedAt },
    });
  });

  revalidatePath(`/operations/move-ins/${moveInId}`);
  revalidatePath("/operations/move-ins");
  revalidatePath("/operations");
}

// ---------------------------------------------------------------------------
// Inspection workspace (Step 28/32) - all gated by moveInInspection.update
// and blocked once the Move-In is no longer editable (COMPLETED/CANCELLED,
// or not yet started).
// ---------------------------------------------------------------------------

async function assertMoveInEditableTx(
  tx: Prisma.TransactionClient,
  organizationId: string,
  moveInId: string,
  notEditableMessage: string
) {
  const moveIn = await tx.moveIn.findUniqueOrThrow({ where: { id: moveInId, organizationId } });
  if (!isMoveInEditable(moveIn.status)) {
    throw new Error(notEditableMessage);
  }
  return moveIn;
}

export async function updateInspectionItem(formData: FormData) {
  const itemId = String(formData.get("itemId"));
  const { organizationId } = await requirePermission("moveInInspection.update");
  const t = getDictionary(await getLocale());
  const conditionRaw = formData.get("condition");
  const condition = conditionRaw ? (z.enum(["NEW", "EXCELLENT", "GOOD", "FAIR", "POOR", "DAMAGED", "NOT_WORKING", "NOT_APPLICABLE"]).parse(conditionRaw) as ConditionRating) : null;
  const notes = formData.get("notes") ? String(formData.get("notes")) : null;
  const requiresAttention = formData.get("requiresAttention") === "on";

  let moveInId = "";
  await prisma.$transaction(async (tx) => {
    const item = await tx.moveInInspectionItem.findUniqueOrThrow({ where: { id: itemId, organizationId } });
    moveInId = item.moveInId;
    await assertMoveInEditableTx(tx, organizationId, item.moveInId, t.validation.moveInNotEditable);
    await tx.moveInInspectionItem.update({ where: { id: itemId }, data: { condition, notes, requiresAttention } });
  });

  revalidatePath(`/operations/move-ins/${moveInId}`);
}

export async function addInventoryItem(formData: FormData) {
  const moveInId = String(formData.get("moveInId"));
  const { organizationId } = await requirePermission("moveInInspection.update");
  const t = getDictionary(await getLocale());
  const category = z
    .enum(["ENTRANCE", "LIVING_ROOM", "DINING_ROOM", "KITCHEN", "BEDROOM", "BATHROOM", "BALCONY", "WINDOWS_DOORS", "FLOORING", "WALLS_CEILINGS", "LIGHTING", "ELECTRICAL", "PLUMBING", "AIR_CONDITIONING", "APPLIANCES", "FURNITURE", "SAFETY", "OTHER"])
    .parse(formData.get("category"));
  const itemName = z.string().min(1).parse(formData.get("itemName"));
  const quantity = formData.get("quantity") ? z.coerce.number().int().positive().parse(formData.get("quantity")) : 1;
  const condition = formData.get("condition") ? (z.enum(["NEW", "EXCELLENT", "GOOD", "FAIR", "POOR", "DAMAGED", "NOT_WORKING", "NOT_APPLICABLE"]).parse(formData.get("condition")) as ConditionRating) : null;
  const serialNumber = formData.get("serialNumber") ? String(formData.get("serialNumber")) : undefined;
  const brand = formData.get("brand") ? String(formData.get("brand")) : undefined;
  const model = formData.get("model") ? String(formData.get("model")) : undefined;
  const notes = formData.get("notes") ? String(formData.get("notes")) : undefined;

  await prisma.$transaction(async (tx) => {
    await assertMoveInEditableTx(tx, organizationId, moveInId, t.validation.moveInNotEditable);
    await tx.moveInInventoryItem.create({
      data: { organizationId, moveInId, category, itemName, quantity, condition, serialNumber, brand, model, notes },
    });
  });

  revalidatePath(`/operations/move-ins/${moveInId}`);
}

export async function addMeterReading(formData: FormData) {
  const moveInId = String(formData.get("moveInId"));
  const { organizationId } = await requirePermission("moveInInspection.update");
  const t = getDictionary(await getLocale());
  const meterType = z.enum(["ELECTRICITY", "WATER", "GAS", "OTHER"]).parse(formData.get("meterType")) as MeterType;
  const meterNumber = formData.get("meterNumber") ? String(formData.get("meterNumber")) : undefined;
  const reading = z.coerce.number().min(0).parse(formData.get("reading"));
  const unitOfMeasure = formData.get("unitOfMeasure") ? String(formData.get("unitOfMeasure")) : undefined;
  const notes = formData.get("notes") ? String(formData.get("notes")) : undefined;

  await prisma.$transaction(async (tx) => {
    await assertMoveInEditableTx(tx, organizationId, moveInId, t.validation.moveInNotEditable);
    await tx.moveInMeterReading.create({
      data: { organizationId, moveInId, meterType, meterNumber, reading, unitOfMeasure, notes },
    });
  });

  revalidatePath(`/operations/move-ins/${moveInId}`);
}

export async function addKeyItem(formData: FormData) {
  const moveInId = String(formData.get("moveInId"));
  const { organizationId } = await requirePermission("moveInInspection.update");
  const t = getDictionary(await getLocale());
  const keyType = z.enum(["KEY", "ACCESS_CARD", "REMOTE", "PARKING_REMOTE", "OTHER"]).parse(formData.get("keyType")) as KeyType;
  const description = z.string().min(1).parse(formData.get("description"));
  const quantity = formData.get("quantity") ? z.coerce.number().int().positive().parse(formData.get("quantity")) : 1;
  const identifier = formData.get("identifier") ? String(formData.get("identifier")) : undefined;
  const returnedExpected = formData.get("returnedExpected") !== "off";
  const notes = formData.get("notes") ? String(formData.get("notes")) : undefined;

  await prisma.$transaction(async (tx) => {
    await assertMoveInEditableTx(tx, organizationId, moveInId, t.validation.moveInNotEditable);
    await tx.moveInKeyItem.create({
      data: { organizationId, moveInId, keyType, description, quantity, identifier, returnedExpected, notes },
    });
  });

  revalidatePath(`/operations/move-ins/${moveInId}`);
}

/** Explicitly marks "no keys to record" (Step 22) - toggled off automatically the moment a real MoveInKeyItem is added. */
export async function setNoKeysToRecord(moveInId: string, value: boolean) {
  const { organizationId } = await requirePermission("moveInInspection.update");
  const t = getDictionary(await getLocale());
  await prisma.$transaction(async (tx) => {
    await assertMoveInEditableTx(tx, organizationId, moveInId, t.validation.moveInNotEditable);
    await tx.moveIn.update({ where: { id: moveInId }, data: { noKeysToRecord: value } });
  });
  revalidatePath(`/operations/move-ins/${moveInId}`);
}

/**
 * Attachment METADATA only (Step 19/20) - no binary upload exists yet. This
 * records what a future object-storage integration would need
 * (fileName/mimeType/fileSize/caption + optional inspection/inventory item
 * link) with `storageKey` left null, so the schema and this action are
 * ready to receive a real upload later without another migration.
 */
export async function addAttachmentMetadata(formData: FormData) {
  const moveInId = String(formData.get("moveInId"));
  const { organizationId } = await requirePermission("moveInInspection.update");
  const { user } = await requireSession();
  const t = getDictionary(await getLocale());
  const attachmentType = z.enum(["PHOTO", "DOCUMENT", "OTHER"]).parse(formData.get("attachmentType")) as MoveInAttachmentType;
  const fileName = z.string().min(1).max(255).parse(formData.get("fileName"));
  const mimeType = z.string().min(1).max(127).parse(formData.get("mimeType"));
  const fileSize = formData.get("fileSize") ? z.coerce.number().int().positive().parse(formData.get("fileSize")) : undefined;
  const caption = formData.get("caption") ? String(formData.get("caption")) : undefined;
  const inspectionItemId = formData.get("inspectionItemId") ? String(formData.get("inspectionItemId")) : undefined;
  const inventoryItemId = formData.get("inventoryItemId") ? String(formData.get("inventoryItemId")) : undefined;

  await prisma.$transaction(async (tx) => {
    await assertMoveInEditableTx(tx, organizationId, moveInId, t.validation.moveInNotEditable);
    if (inspectionItemId) {
      await tx.moveInInspectionItem.findUniqueOrThrow({ where: { id: inspectionItemId, organizationId, moveInId } });
    }
    if (inventoryItemId) {
      await tx.moveInInventoryItem.findUniqueOrThrow({ where: { id: inventoryItemId, organizationId, moveInId } });
    }
    await tx.moveInAttachment.create({
      data: { organizationId, moveInId, attachmentType, fileName, mimeType, fileSize, caption, inspectionItemId, inventoryItemId, uploadedByUserId: user.id },
    });
  });

  revalidatePath(`/operations/move-ins/${moveInId}`);
}

/** Operational readiness confirmations (Step 34) - never a Maintenance Work Order. */
export async function updateReadinessFlags(formData: FormData) {
  const moveInId = String(formData.get("moveInId"));
  const { organizationId } = await requirePermission("moveIn.update");
  const t = getDictionary(await getLocale());

  await prisma.$transaction(async (tx) => {
    await assertMoveInEditableTx(tx, organizationId, moveInId, t.validation.moveInNotEditable);
    await tx.moveIn.update({
      where: { id: moveInId },
      data: {
        utilitiesReady: formData.get("utilitiesReady") === "on",
        keysReady: formData.get("keysReady") === "on",
        cleaningComplete: formData.get("cleaningComplete") === "on",
        unitReady: formData.get("unitReady") === "on",
      },
    });
  });

  revalidatePath(`/operations/move-ins/${moveInId}`);
}

// ---------------------------------------------------------------------------
// Acknowledgements (Step 21/22) - operational, never framed as a legal
// e-signature.
// ---------------------------------------------------------------------------

export async function recordTenantAcknowledgement(formData: FormData) {
  const moveInId = String(formData.get("moveInId"));
  const { organizationId } = await requirePermission("moveIn.update");
  const t = getDictionary(await getLocale());
  const tenantRepresentativeName = z.string().min(1).parse(formData.get("tenantRepresentativeName"));
  const tenantRepresentativeId = formData.get("tenantRepresentativeId") ? String(formData.get("tenantRepresentativeId")) : undefined;
  const tenantComments = formData.get("tenantComments") ? String(formData.get("tenantComments")) : undefined;

  await prisma.$transaction(async (tx) => {
    const moveIn = await assertMoveInEditableTx(tx, organizationId, moveInId, t.validation.moveInNotEditable);
    const updated = await tx.moveIn.update({
      where: { id: moveInId },
      data: { tenantRepresentativeName, tenantRepresentativeId, tenantComments, tenantAcknowledgedAt: new Date() },
    });
    await auditAction(tx, {
      action: "UPDATE",
      entityType: "MoveIn",
      entityId: updated.id,
      entityDisplayName: updated.moveInNumber,
      previousValues: { tenantAcknowledgedAt: moveIn.tenantAcknowledgedAt },
      newValues: { tenantAcknowledgedAt: updated.tenantAcknowledgedAt, tenantRepresentativeName },
    });
  });

  revalidatePath(`/operations/move-ins/${moveInId}`);
}

/** Authorized override of the tenant-acknowledgement requirement (Step 22) - gated by moveIn.complete since it removes a completion prerequisite, always paired with a reason. */
export async function setTenantAcknowledgementOverride(formData: FormData) {
  const moveInId = String(formData.get("moveInId"));
  const { organizationId } = await requirePermission("moveIn.complete");
  const t = getDictionary(await getLocale());
  const override = formData.get("override") === "on";
  const reason = formData.get("reason") ? String(formData.get("reason")) : undefined;
  if (override && !reason) {
    throw new Error(t.validation.moveInOverrideReasonRequired);
  }

  await prisma.$transaction(async (tx) => {
    await assertMoveInEditableTx(tx, organizationId, moveInId, t.validation.moveInNotEditable);
    await tx.moveIn.update({
      where: { id: moveInId },
      data: { tenantAcknowledgementOverride: override, tenantAcknowledgementOverrideReason: override ? reason : null },
    });
  });

  revalidatePath(`/operations/move-ins/${moveInId}`);
}

export async function recordStaffAcknowledgement(moveInId: string) {
  const { organizationId } = await requirePermission("moveIn.update");
  const { user } = await requireSession();
  const t = getDictionary(await getLocale());

  await prisma.$transaction(async (tx) => {
    await assertMoveInEditableTx(tx, organizationId, moveInId, t.validation.moveInNotEditable);
    const updated = await tx.moveIn.update({
      where: { id: moveInId },
      data: { staffAcknowledgedAt: new Date(), handedOverByUserId: user.id },
    });
    await auditAction(tx, {
      action: "UPDATE",
      entityType: "MoveIn",
      entityId: updated.id,
      entityDisplayName: updated.moveInNumber,
      newValues: { staffAcknowledgedAt: updated.staffAcknowledgedAt, handedOverByUserId: user.id },
    });
  });

  revalidatePath(`/operations/move-ins/${moveInId}`);
}

// ---------------------------------------------------------------------------
// Ready-for-handover / complete / cancel (Step 30/31/32/33/46/47)
// ---------------------------------------------------------------------------

export async function markReadyForHandover(moveInId: string) {
  const { organizationId } = await requirePermission("moveIn.update");
  const t = getDictionary(await getLocale());

  await prisma.$transaction(async (tx) => {
    const moveIn = await tx.moveIn.findUniqueOrThrow({ where: { id: moveInId, organizationId }, include: { inspectionItems: true } });
    if (!isValidMoveInTransition(moveIn.status, "READY_FOR_HANDOVER")) {
      throw new Error(t.validation.moveInInvalidTransition);
    }
    if (!isReadyForHandoverEligible(moveIn.inspectionItems)) {
      throw new Error(t.validation.moveInChecklistIncomplete);
    }
    const updated = await tx.moveIn.update({ where: { id: moveInId }, data: { status: "READY_FOR_HANDOVER" } });
    await auditAction(tx, {
      action: "UPDATE",
      entityType: "MoveIn",
      entityId: updated.id,
      entityDisplayName: updated.moveInNumber,
      previousValues: { status: moveIn.status },
      newValues: { status: updated.status },
    });
  });

  revalidatePath(`/operations/move-ins/${moveInId}`);
  revalidatePath("/operations/move-ins");
  revalidatePath("/operations");
}

/**
 * Completes the Move-In (Step 31/46/47): validates every requirement in one
 * place, writes COMPLETED/completedAt/handoverDate, records the completion
 * audit entry, and creates a LeadActivity only when the originating
 * Contract traces back to a Lead (Reservation-originated contracts only -
 * manual contracts have no Lead linkage). Never touches Unit.status or
 * Contract.status (Step 8's decision: occupancy is already correct from
 * Contract creation). Idempotent (Step 47): a second call on an
 * already-COMPLETED Move-In returns the same id without re-running any
 * side effect.
 */
export async function completeMoveIn(moveInId: string): Promise<string> {
  const { organizationId } = await requirePermissionAudited("moveIn.complete", "MoveIn", moveInId);
  const { user } = await requireSession();
  const t = getDictionary(await getLocale());

  let contractIdForRevalidate = "";

  const resultId = await prisma.$transaction(
    async (tx) => {
      const moveIn = await tx.moveIn.findUniqueOrThrow({
        where: { id: moveInId, organizationId },
        include: {
          inspectionItems: true,
          meterReadings: true,
          keyItems: true,
          inventoryItems: true,
          contract: { select: { id: true, reservation: { select: { leadId: true } } } },
        },
      });
      contractIdForRevalidate = moveIn.contract.id;

      // Step 47: idempotent - no duplicated side effects on a repeat call.
      if (moveIn.status === "COMPLETED") {
        return moveIn.id;
      }

      if (!isValidMoveInTransition(moveIn.status, "COMPLETED")) {
        throw new Error(t.validation.moveInInvalidTransition);
      }

      const validation = validateMoveInCompletion({
        handoverDate: moveIn.handoverDate,
        inspectionItems: moveIn.inspectionItems,
        meterReadingTypes: moveIn.meterReadings.map((m) => m.meterType),
        keyItemCount: moveIn.keyItems.length,
        noKeysToRecord: moveIn.noKeysToRecord,
        isFurnished: moveIn.isFurnished,
        inventoryItemCount: moveIn.inventoryItems.length,
        tenantAcknowledgedAt: moveIn.tenantAcknowledgedAt,
        tenantAcknowledgementOverride: moveIn.tenantAcknowledgementOverride,
        staffAcknowledgedAt: moveIn.staffAcknowledgedAt,
      });
      if (!validation.canComplete) {
        throw new Error(`${t.validation.moveInCompletionMissingRequirements}: ${validation.missing.join(", ")}`);
      }

      const updated = await tx.moveIn.update({
        where: { id: moveInId },
        data: {
          status: "COMPLETED",
          completedAt: new Date(),
          handedOverByUserId: moveIn.handedOverByUserId ?? user.id,
        },
      });

      // Step 32: this is the last write any normal app action ever makes to
      // inspectionItems/meterReadings/inventoryItems/keyItems/
      // acknowledgement timestamps for this Move-In - every mutation above
      // is already gated by isMoveInEditable(), which excludes COMPLETED.
      await auditAction(tx, {
        action: "UPDATE",
        entityType: "MoveIn",
        entityId: updated.id,
        entityDisplayName: updated.moveInNumber,
        previousValues: { status: moveIn.status },
        newValues: { status: "COMPLETED", completedAt: updated.completedAt, handoverDate: updated.handoverDate },
      });

      if (moveIn.contract.reservation?.leadId) {
        await tx.leadActivity.create({
          data: {
            organizationId,
            leadId: moveIn.contract.reservation.leadId,
            activityType: "STATUS_CHANGE",
            subject: t.moveIn.activityCompleted(updated.moveInNumber),
            createdByUserId: user.id,
          },
        });
      }

      return updated.id;
    },
    { isolationLevel: "Serializable" }
  );

  revalidatePath(`/operations/move-ins/${moveInId}`);
  revalidatePath("/operations/move-ins");
  revalidatePath("/operations");
  if (contractIdForRevalidate) {
    revalidatePath(`/contracts/${contractIdForRevalidate}`);
    revalidatePath(`/contracts/${contractIdForRevalidate}/edit`);
  }
  return resultId;
}

/** Sets the handover date ahead of completion - a separate small action so the workspace can save it independently of the other acknowledgement fields. */
export async function setHandoverDate(formData: FormData) {
  const moveInId = String(formData.get("moveInId"));
  const { organizationId } = await requirePermission("moveIn.update");
  const t = getDictionary(await getLocale());
  const handoverDate = z.coerce.date().parse(formData.get("handoverDate"));

  await prisma.$transaction(async (tx) => {
    await assertMoveInEditableTx(tx, organizationId, moveInId, t.validation.moveInNotEditable);
    await tx.moveIn.update({ where: { id: moveInId }, data: { handoverDate } });
  });

  revalidatePath(`/operations/move-ins/${moveInId}`);
}

/** Cancellation (Step 33) - never deletes the record; OTHER requires a note. */
export async function cancelMoveIn(formData: FormData) {
  const moveInId = String(formData.get("moveInId"));
  const { organizationId } = await requirePermissionAudited("moveIn.cancel", "MoveIn", moveInId);
  const t = getDictionary(await getLocale());
  const reason = z
    .enum(["CONTRACT_CANCELLED", "CUSTOMER_REQUEST", "UNIT_NOT_READY", "RESCHEDULED", "DATA_ERROR", "OTHER"])
    .parse(formData.get("reason"));
  const note = formData.get("note") ? String(formData.get("note")) : undefined;
  if (reason === "OTHER" && !note) {
    throw new Error(t.validation.moveInCancelNoteRequired);
  }

  await prisma.$transaction(async (tx) => {
    const moveIn = await tx.moveIn.findUniqueOrThrow({ where: { id: moveInId, organizationId } });
    if (!isValidMoveInTransition(moveIn.status, "CANCELLED")) {
      throw new Error(t.validation.moveInInvalidTransition);
    }
    const updated = await tx.moveIn.update({
      where: { id: moveInId },
      data: { status: "CANCELLED", cancelReason: reason, cancelReasonNote: note ?? null, cancelledAt: new Date() },
    });
    await auditAction(tx, {
      action: "CANCEL",
      entityType: "MoveIn",
      entityId: updated.id,
      entityDisplayName: updated.moveInNumber,
      previousValues: { status: moveIn.status },
      newValues: { status: "CANCELLED", cancelReason: reason, cancelReasonNote: note },
    });
  });

  revalidatePath(`/operations/move-ins/${moveInId}`);
  revalidatePath("/operations/move-ins");
  revalidatePath("/operations");
}

// ---------------------------------------------------------------------------
// Reads: profile, list + filters (Step 25/26/27), Contract/Unit/Renter
// integration (Step 36/37/38)
// ---------------------------------------------------------------------------

export async function getMoveInById(moveInId: string) {
  const { organizationId } = await requirePermission("moveIn.view");
  const moveIn = await prisma.moveIn.findUniqueOrThrow({
    where: { id: moveInId, organizationId },
    include: FULL_MOVE_IN_INCLUDE,
  });
  const progress = computeInspectionProgress(moveIn.inspectionItems);
  const defects = computeDefectSummary(moveIn.inspectionItems);
  const overdue = isMoveInOverdue(moveIn.scheduledAt, moveIn.status);
  const readyEligible = isReadyForHandoverEligible(moveIn.inspectionItems);
  const completion = validateMoveInCompletion({
    handoverDate: moveIn.handoverDate,
    inspectionItems: moveIn.inspectionItems,
    meterReadingTypes: moveIn.meterReadings.map((m) => m.meterType),
    keyItemCount: moveIn.keyItems.length,
    noKeysToRecord: moveIn.noKeysToRecord,
    isFurnished: moveIn.isFurnished,
    inventoryItemCount: moveIn.inventoryItems.length,
    tenantAcknowledgedAt: moveIn.tenantAcknowledgedAt,
    tenantAcknowledgementOverride: moveIn.tenantAcknowledgementOverride,
    staffAcknowledgedAt: moveIn.staffAcknowledgedAt,
  });
  return { moveIn, progress, defects, overdue, readyEligible, completion };
}

export interface MoveInListFilters {
  search?: string;
  status?: string;
  compoundId?: string;
  buildingId?: string;
  unitId?: string;
  renterId?: string;
  inspectedByUserId?: string;
  scheduledFrom?: Date;
  scheduledTo?: Date;
  handoverFrom?: Date;
  handoverTo?: Date;
  todayOnly?: boolean;
  upcomingOnly?: boolean;
  completedOnly?: boolean;
  overdueOnly?: boolean;
  page?: number;
}

export async function listMoveIns(filters: MoveInListFilters = {}) {
  const { organizationId } = await requirePermission("moveIn.view");
  const page = Math.max(1, filters.page ?? 1);

  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const endOfToday = new Date(startOfToday);
  endOfToday.setDate(endOfToday.getDate() + 1);

  let statusFilter = (filters.status as MoveInStatus) || undefined;
  if (filters.completedOnly) statusFilter = "COMPLETED";

  const where: Prisma.MoveInWhereInput = {
    organizationId,
    status: statusFilter,
    unitId: filters.unitId || undefined,
    renterId: filters.renterId || undefined,
    inspectedByUserId: filters.inspectedByUserId || undefined,
    unit: filters.compoundId || filters.buildingId ? { floor: { buildingId: filters.buildingId || undefined, building: filters.compoundId ? { compoundId: filters.compoundId } : undefined } } : undefined,
    scheduledAt: filters.todayOnly
      ? { gte: startOfToday, lt: endOfToday }
      : filters.scheduledFrom || filters.scheduledTo
        ? { gte: filters.scheduledFrom, lt: filters.scheduledTo }
        : filters.upcomingOnly
          ? { gte: startOfToday }
          : undefined,
    handoverDate: filters.handoverFrom || filters.handoverTo ? { gte: filters.handoverFrom, lt: filters.handoverTo } : undefined,
    ...(filters.overdueOnly
      ? { scheduledAt: { lt: new Date() }, status: { notIn: ["COMPLETED", "CANCELLED"] } }
      : {}),
    ...(filters.search
      ? {
          OR: [
            { moveInNumber: { contains: filters.search, mode: "insensitive" as const } },
            { renter: { fullName: { contains: filters.search, mode: "insensitive" as const } } },
            { unit: { unitNumber: { contains: filters.search, mode: "insensitive" as const } } },
          ],
        }
      : {}),
  };

  const [rows, total] = await Promise.all([
    prisma.moveIn.findMany({
      where,
      include: {
        contract: { select: { id: true, contractNumber: true } },
        unit: { include: { floor: { include: { building: { include: { compound: true } } } } } },
        renter: { select: { id: true, fullName: true, fullNameAr: true } },
        inspectedByUser: { select: { id: true, name: true } },
        inspectionItems: { select: { isApplicable: true, condition: true } },
      },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    prisma.moveIn.count({ where }),
  ]);

  const rowsWithProgress = rows.map((row) => ({
    ...row,
    progress: computeInspectionProgress(row.inspectionItems),
    overdue: isMoveInOverdue(row.scheduledAt, row.status),
  }));

  return { rows: rowsWithProgress, total, page, pageSize: PAGE_SIZE, totalPages: Math.max(1, Math.ceil(total / PAGE_SIZE)) };
}

/** Contracts eligible to start a new Move-In (Step 24's picker on /operations/move-ins/new) - ACTIVE contracts with no currently-blocking Move-In. */
export async function listEligibleContractsForMoveIn(search?: string) {
  const { organizationId } = await requirePermission("moveIn.create");
  const contracts = await prisma.contract.findMany({
    where: {
      organizationId,
      status: "ACTIVE",
      ...(search
        ? {
            OR: [
              { contractNumber: { contains: search, mode: "insensitive" as const } },
              { renter: { fullName: { contains: search, mode: "insensitive" as const } } },
              { unit: { unitNumber: { contains: search, mode: "insensitive" as const } } },
            ],
          }
        : {}),
    },
    include: {
      unit: { include: { floor: { include: { building: { include: { compound: true } } } } } },
      renter: { select: { id: true, fullName: true, fullNameAr: true } },
      moveIns: { select: { status: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
  return contracts.filter((c) => !c.moveIns.some((m) => blocksNewMoveInForContract(m.status)));
}

/** The most relevant Move-In for a Contract (Step 36's Contract-detail integration) - prefers a live/completed one over a cancelled one. */
export async function getMoveInForContract(contractId: string) {
  const { organizationId } = await requirePermission("moveIn.view");
  const moveIns = await prisma.moveIn.findMany({
    where: { organizationId, contractId },
    orderBy: { createdAt: "desc" },
    select: { id: true, moveInNumber: true, status: true, scheduledAt: true, handoverDate: true, completedAt: true },
  });
  return moveIns.find((m) => m.status !== "CANCELLED") ?? moveIns[0] ?? null;
}

/** Current Contract's Move-In summary for a Unit (Step 37) - via that Unit's own currently-ACTIVE contract, never a second occupancy source of truth. */
export async function getCurrentMoveInForUnit(unitId: string) {
  const { organizationId } = await requirePermission("moveIn.view");
  const contract = await prisma.contract.findFirst({
    where: { organizationId, unitId, status: "ACTIVE" },
    select: { id: true, contractNumber: true },
    orderBy: { createdAt: "desc" },
  });
  if (!contract) return null;
  const moveIn = await getMoveInForContract(contract.id);
  return { contract, moveIn };
}

/** Bulk Move-In status for a list of Units (Step 37's Units-list integration) - one query pair for the whole page, mirroring getActiveReservationsForUnits()'s own bulk pattern rather than N+1 per-row lookups. */
export async function getMoveInStatusForUnits(unitIds: string[]) {
  const { organizationId } = await requirePermission("moveIn.view");
  const map = new Map<string, { moveInId: string; moveInNumber: string; status: MoveInStatus; handoverDate: Date | null } | null>();
  if (unitIds.length === 0) return map;

  const contracts = await prisma.contract.findMany({
    where: { organizationId, unitId: { in: unitIds }, status: "ACTIVE" },
    select: {
      unitId: true,
      moveIns: { orderBy: { createdAt: "desc" }, select: { id: true, moveInNumber: true, status: true, handoverDate: true } },
    },
  });

  for (const contract of contracts) {
    const moveIn = contract.moveIns.find((m) => m.status !== "CANCELLED") ?? contract.moveIns[0] ?? null;
    map.set(contract.unitId, moveIn ? { moveInId: moveIn.id, moveInNumber: moveIn.moveInNumber, status: moveIn.status, handoverDate: moveIn.handoverDate } : null);
  }
  return map;
}

/** Bulk Move-In status for a list of Renters (Step 38's Renters-list integration). */
export async function getMoveInStatusForRenters(renterIds: string[]) {
  const { organizationId } = await requirePermission("moveIn.view");
  const map = new Map<string, { moveInId: string; moveInNumber: string; status: MoveInStatus; handoverDate: Date | null; unitNumber: string } | null>();
  if (renterIds.length === 0) return map;

  const contracts = await prisma.contract.findMany({
    where: { organizationId, renterId: { in: renterIds }, status: "ACTIVE" },
    select: {
      renterId: true,
      unit: { select: { unitNumber: true } },
      moveIns: { orderBy: { createdAt: "desc" }, select: { id: true, moveInNumber: true, status: true, handoverDate: true } },
    },
  });

  for (const contract of contracts) {
    const moveIn = contract.moveIns.find((m) => m.status !== "CANCELLED") ?? contract.moveIns[0] ?? null;
    map.set(
      contract.renterId,
      moveIn ? { moveInId: moveIn.id, moveInNumber: moveIn.moveInNumber, status: moveIn.status, handoverDate: moveIn.handoverDate, unitNumber: contract.unit.unitNumber } : null
    );
  }
  return map;
}

/** Current Contract's Move-In summary for a Renter (Step 38). */
export async function getCurrentMoveInForRenter(renterId: string) {
  const { organizationId } = await requirePermission("moveIn.view");
  const contract = await prisma.contract.findFirst({
    where: { organizationId, renterId, status: "ACTIVE" },
    select: { id: true, contractNumber: true, unit: { select: { id: true, unitNumber: true } } },
    orderBy: { createdAt: "desc" },
  });
  if (!contract) return null;
  const moveIn = await getMoveInForContract(contract.id);
  return { contract, moveIn };
}

/** Operations dashboard KPIs (Step 39) - separate from the CRM dashboard. */
export async function getOperationsDashboard() {
  const { organizationId } = await requirePermission("moveIn.view");

  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const endOfToday = new Date(startOfToday);
  endOfToday.setDate(endOfToday.getDate() + 1);
  const endOfWeek = new Date(startOfToday);
  endOfWeek.setDate(endOfWeek.getDate() + 7);
  const startOfMonth = new Date(startOfToday.getFullYear(), startOfToday.getMonth(), 1);
  const startOfNextMonth = new Date(startOfToday.getFullYear(), startOfToday.getMonth() + 1, 1);

  const [today, upcoming, inProgress, readyForHandover, completedThisMonth, notCancelledNotCompleted, unitsWithDefects] = await Promise.all([
    prisma.moveIn.count({ where: { organizationId, scheduledAt: { gte: startOfToday, lt: endOfToday } } }),
    prisma.moveIn.count({ where: { organizationId, scheduledAt: { gte: endOfToday, lt: endOfWeek } } }),
    prisma.moveIn.count({ where: { organizationId, status: "IN_PROGRESS" } }),
    prisma.moveIn.count({ where: { organizationId, status: "READY_FOR_HANDOVER" } }),
    prisma.moveIn.count({ where: { organizationId, status: "COMPLETED", completedAt: { gte: startOfMonth, lt: startOfNextMonth } } }),
    // Step 40: overdue = scheduledAt < now AND status not COMPLETED/CANCELLED.
    prisma.moveIn.findMany({
      where: { organizationId, scheduledAt: { lt: new Date() }, status: { notIn: ["COMPLETED", "CANCELLED"] } },
      select: { id: true },
    }),
    prisma.moveIn.findMany({
      where: { organizationId, status: { notIn: ["CANCELLED"] } },
      select: { unitId: true, inspectionItems: { select: { isApplicable: true, requiresAttention: true } } },
    }),
  ]);

  const unitsWithDefectsCount = new Set(
    unitsWithDefects.filter((m) => m.inspectionItems.some((i) => i.isApplicable && i.requiresAttention)).map((m) => m.unitId)
  ).size;

  return {
    moveInsToday: today,
    upcomingThisWeek: upcoming,
    inspectionsInProgress: inProgress,
    readyForHandover,
    completedThisMonth,
    unitsWithHandoverDefects: unitsWithDefectsCount,
    overdueScheduledMoveIns: notCancelledNotCompleted.length,
  };
}
