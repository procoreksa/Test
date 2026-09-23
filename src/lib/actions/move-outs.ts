"use server";

import { z } from "zod";
import type { Prisma, MoveOutStatus, ConditionRating, KeyType, MeterType, MoveInAttachmentType } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requirePermission, requireSession } from "@/lib/session";
import { getLocale, getDictionary } from "@/lib/i18n";
import { auditCreate, auditAction, requirePermissionAudited } from "@/lib/audit";
import { nextCounterValue, formatMoveOutNumber } from "@/lib/numbering";
import {
  blocksNewMoveOutForContract,
  isValidMoveOutTransition,
  isMoveOutEditable,
  isFindingsReviewEligible,
  isReadyForClosureEligible,
  isUnsafeToVacate,
  isMoveOutOverdue,
  reconcileKeyReturns,
  validateMoveOutCompletion,
  computeInspectionProgress,
  computeDefectSummary,
  diffInventoryItems,
  computeMeterConsumption,
} from "@/lib/operations/move-out-rules";
import { getDefaultInspectionChecklist } from "@/lib/operations/move-in-rules";

const PAGE_SIZE = 25;

const FULL_MOVE_OUT_INCLUDE = {
  contract: { select: { id: true, contractNumber: true, status: true, startDate: true, endDate: true } },
  unit: { include: { floor: { include: { building: { include: { compound: true } } } } } },
  renter: { select: { id: true, fullName: true, fullNameAr: true, phone: true } },
  moveIn: { select: { id: true, moveInNumber: true, status: true, handoverDate: true } },
  inspectedByUser: { select: { id: true, name: true } },
  handedOverByUser: { select: { id: true, name: true } },
  findingsReviewedByUser: { select: { id: true, name: true } },
  inspectionItems: {
    orderBy: [{ category: "asc" }, { sequence: "asc" }] as const,
    // Baseline condition for the direct before/after delta (UI presentation
    // only - never written to, see docs/MOVE-OUT-MANAGEMENT.md), plus the
    // Maintenance Requests already traced to this finding (UI traceability
    // only - never re-derived, see createMaintenanceRequestFromMoveOut()).
    include: {
      moveInInspectionItem: { select: { condition: true } },
      maintenanceRequests: { select: { id: true, requestNumber: true, status: true } },
    },
  },
  inventoryItems: { orderBy: { createdAt: "asc" } as const },
  meterReadings: { orderBy: { createdAt: "asc" } as const },
  keyItems: { orderBy: { createdAt: "asc" } as const },
  attachments: { orderBy: { createdAt: "asc" } as const },
  maintenanceRequests: {
    orderBy: { reportedAt: "asc" } as const,
    select: { id: true, requestNumber: true, status: true, priority: true, category: true, title: true },
  },
} satisfies Prisma.MoveOutInclude;

/** Contract statuses eligible to start a Move-Out (Decision 2): ACTIVE (handover may be prepared before the Contract formally ends - including the existing expiry-gap window) or TERMINATED. DRAFT and RENEWED are never eligible. */
const MOVE_OUT_ELIGIBLE_CONTRACT_STATUSES = new Set(["ACTIVE", "TERMINATED"]);

// ---------------------------------------------------------------------------
// Create (requirement 2/5) - unitId/renterId are ALWAYS derived server-side
// from the verified Contract inside the same transaction, never trusted from
// the client. When the Contract already has a non-cancelled Move-In, its
// inspection checklist is cloned as this Move-Out's baseline (each item
// linked via moveInInspectionItemId for a direct before/after diff);
// otherwise the same centralized default template Move-In itself uses is
// seeded fresh (Decision: "reuse, don't duplicate" - see move-in-rules.ts).
// ---------------------------------------------------------------------------

export async function createMoveOut(formData: FormData): Promise<string> {
  const { organizationId } = await requirePermission("moveOut.create");
  const { user } = await requireSession();
  const t = getDictionary(await getLocale());

  const contractId = z.string().min(1).parse(formData.get("contractId"));
  const scheduledAtRaw = formData.get("scheduledAt");
  const scheduledAt = scheduledAtRaw ? z.coerce.date().parse(scheduledAtRaw) : null;

  const moveOutId = await prisma.$transaction(
    async (tx) => {
      // Requirement 2: unitId/renterId are NEVER read from the client - only
      // ever derived from the Contract itself, inside this same transaction.
      const contract = await tx.contract.findUniqueOrThrow({ where: { id: contractId, organizationId } });

      // Decision 2: ACTIVE or TERMINATED only - DRAFT and RENEWED (including
      // a RENEWED contract, per requirement 4) are rejected by this single check.
      if (!MOVE_OUT_ELIGIBLE_CONTRACT_STATUSES.has(contract.status)) {
        throw new Error(t.validation.moveOutContractNotEligible);
      }

      // Requirement 5: one active Move-Out per Contract - app-layer predicate
      // inside a Serializable transaction, mirroring Move-In's own
      // blocksNewMoveInForContract() precedent exactly. A CANCELLED Move-Out
      // never blocks a fresh attempt.
      const existingMoveOuts = await tx.moveOut.findMany({ where: { organizationId, contractId }, select: { status: true } });
      if (existingMoveOuts.some((m) => blocksNewMoveOutForContract(m.status))) {
        throw new Error(t.validation.moveOutAlreadyExistsForContract);
      }

      // Optional baseline Move-In - read-only reference, never mutated by
      // anything in this module. Prefers a non-cancelled Move-In, same
      // "most relevant record" rule Move-In's own getMoveInForContract() uses.
      const candidateMoveIns = await tx.moveIn.findMany({
        where: { organizationId, contractId },
        orderBy: { createdAt: "desc" },
        include: { inspectionItems: { orderBy: [{ category: "asc" }, { sequence: "asc" }] } },
      });
      const baselineMoveIn = candidateMoveIns.find((m) => m.status !== "CANCELLED") ?? candidateMoveIns[0] ?? null;

      const seq = await nextCounterValue(tx, organizationId, "moveOut");
      const moveOutNumber = formatMoveOutNumber(seq);

      const created = await tx.moveOut.create({
        data: {
          organizationId,
          moveOutNumber,
          contractId: contract.id,
          unitId: contract.unitId,
          renterId: contract.renterId,
          moveInId: baselineMoveIn?.id,
          status: scheduledAt ? "SCHEDULED" : "DRAFT",
          scheduledAt,
          createdByUserId: user.id,
        },
      });

      if (baselineMoveIn && baselineMoveIn.inspectionItems.length > 0) {
        await tx.moveOutInspectionItem.createMany({
          data: baselineMoveIn.inspectionItems.map((item, index) => ({
            organizationId,
            moveOutId: created.id,
            category: item.category,
            itemName: item.itemName,
            itemNameAr: item.itemNameAr,
            isApplicable: item.isApplicable,
            sequence: index,
            moveInInspectionItemId: item.id,
          })),
        });
      } else {
        const checklist = getDefaultInspectionChecklist();
        await tx.moveOutInspectionItem.createMany({
          data: checklist.map((item, index) => ({
            organizationId,
            moveOutId: created.id,
            category: item.category,
            itemName: item.itemName,
            itemNameAr: item.itemNameAr,
            isApplicable: item.isApplicable,
            sequence: index,
          })),
        });
      }

      await auditCreate(tx, {
        entityType: "MoveOut",
        entityId: created.id,
        entityDisplayName: created.moveOutNumber,
        newValues: { contractId: contract.id, unitId: contract.unitId, renterId: contract.renterId, moveInId: baselineMoveIn?.id ?? null, status: created.status, scheduledAt },
        metadata: { contractId: contract.id, contractNumber: contract.contractNumber },
      });

      return created.id;
    },
    { isolationLevel: "Serializable" }
  );

  revalidatePath("/operations/move-outs");
  revalidatePath("/operations");
  revalidatePath(`/contracts/${contractId}`);
  revalidatePath(`/contracts/${contractId}/edit`);
  return moveOutId;
}

// ---------------------------------------------------------------------------
// Schedule / start
// ---------------------------------------------------------------------------

export async function scheduleMoveOut(formData: FormData) {
  const moveOutId = String(formData.get("moveOutId"));
  const { organizationId } = await requirePermission("moveOut.update");
  const t = getDictionary(await getLocale());
  const scheduledAt = z.coerce.date().parse(formData.get("scheduledAt"));

  await prisma.$transaction(async (tx) => {
    const moveOut = await tx.moveOut.findUniqueOrThrow({ where: { id: moveOutId, organizationId } });
    const nextStatus: MoveOutStatus = moveOut.status === "DRAFT" ? "SCHEDULED" : moveOut.status;
    if (nextStatus !== moveOut.status && !isValidMoveOutTransition(moveOut.status, nextStatus)) {
      throw new Error(t.validation.moveOutInvalidTransition);
    }
    if (moveOut.status !== "DRAFT" && moveOut.status !== "SCHEDULED") {
      throw new Error(t.validation.moveOutNotEditable);
    }
    const updated = await tx.moveOut.update({ where: { id: moveOutId }, data: { scheduledAt, status: nextStatus } });
    await auditAction(tx, {
      action: "UPDATE",
      entityType: "MoveOut",
      entityId: updated.id,
      entityDisplayName: updated.moveOutNumber,
      previousValues: { scheduledAt: moveOut.scheduledAt, status: moveOut.status },
      newValues: { scheduledAt: updated.scheduledAt, status: updated.status },
    });
  });

  revalidatePath(`/operations/move-outs/${moveOutId}`);
  revalidatePath("/operations/move-outs");
  revalidatePath("/operations");
}

export async function startMoveOut(moveOutId: string) {
  const { organizationId } = await requirePermissionAudited("moveOut.start", "MoveOut", moveOutId);
  const { user } = await requireSession();
  const t = getDictionary(await getLocale());

  await prisma.$transaction(async (tx) => {
    const moveOut = await tx.moveOut.findUniqueOrThrow({ where: { id: moveOutId, organizationId } });
    if (!isValidMoveOutTransition(moveOut.status, "IN_PROGRESS")) {
      throw new Error(t.validation.moveOutInvalidTransition);
    }
    const updated = await tx.moveOut.update({
      where: { id: moveOutId },
      data: { status: "IN_PROGRESS", startedAt: moveOut.startedAt ?? new Date(), inspectedByUserId: moveOut.inspectedByUserId ?? user.id },
    });
    await auditAction(tx, {
      action: "UPDATE",
      entityType: "MoveOut",
      entityId: updated.id,
      entityDisplayName: updated.moveOutNumber,
      previousValues: { status: moveOut.status },
      newValues: { status: updated.status, startedAt: updated.startedAt },
    });
  });

  revalidatePath(`/operations/move-outs/${moveOutId}`);
  revalidatePath("/operations/move-outs");
  revalidatePath("/operations");
}

// ---------------------------------------------------------------------------
// Inspection workspace - all gated by moveOutInspection.update and blocked
// once the Move-Out is no longer editable. Move-Out may READ its baseline
// Move-In (and every child table) but this module never writes to any
// MoveIn* table - see docs/MOVE-OUT-MANAGEMENT.md.
// ---------------------------------------------------------------------------

async function assertMoveOutEditableTx(
  tx: Prisma.TransactionClient,
  organizationId: string,
  moveOutId: string,
  notEditableMessage: string
) {
  const moveOut = await tx.moveOut.findUniqueOrThrow({ where: { id: moveOutId, organizationId } });
  if (!isMoveOutEditable(moveOut.status)) {
    throw new Error(notEditableMessage);
  }
  return moveOut;
}

export async function updateInspectionItem(formData: FormData) {
  const itemId = String(formData.get("itemId"));
  const { organizationId } = await requirePermission("moveOutInspection.update");
  const t = getDictionary(await getLocale());
  const conditionRaw = formData.get("condition");
  const condition = conditionRaw ? (z.enum(["NEW", "EXCELLENT", "GOOD", "FAIR", "POOR", "DAMAGED", "NOT_WORKING", "NOT_APPLICABLE"]).parse(conditionRaw) as ConditionRating) : null;
  const notes = formData.get("notes") ? String(formData.get("notes")) : null;
  const requiresAttention = formData.get("requiresAttention") === "on";

  let moveOutId = "";
  await prisma.$transaction(async (tx) => {
    const item = await tx.moveOutInspectionItem.findUniqueOrThrow({ where: { id: itemId, organizationId } });
    moveOutId = item.moveOutId;
    await assertMoveOutEditableTx(tx, organizationId, item.moveOutId, t.validation.moveOutNotEditable);
    await tx.moveOutInspectionItem.update({ where: { id: itemId }, data: { condition, notes, requiresAttention } });
  });

  revalidatePath(`/operations/move-outs/${moveOutId}`);
}

export async function addInventoryItem(formData: FormData) {
  const moveOutId = String(formData.get("moveOutId"));
  const { organizationId } = await requirePermission("moveOutInspection.update");
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
    await assertMoveOutEditableTx(tx, organizationId, moveOutId, t.validation.moveOutNotEditable);
    await tx.moveOutInventoryItem.create({
      data: { organizationId, moveOutId, category, itemName, quantity, condition, serialNumber, brand, model, notes },
    });
  });

  revalidatePath(`/operations/move-outs/${moveOutId}`);
}

export async function addMeterReading(formData: FormData) {
  const moveOutId = String(formData.get("moveOutId"));
  const { organizationId } = await requirePermission("moveOutInspection.update");
  const t = getDictionary(await getLocale());
  const meterType = z.enum(["ELECTRICITY", "WATER", "GAS", "OTHER"]).parse(formData.get("meterType")) as MeterType;
  const meterNumber = formData.get("meterNumber") ? String(formData.get("meterNumber")) : undefined;
  const reading = z.coerce.number().min(0).parse(formData.get("reading"));
  const unitOfMeasure = formData.get("unitOfMeasure") ? String(formData.get("unitOfMeasure")) : undefined;
  const notes = formData.get("notes") ? String(formData.get("notes")) : undefined;

  await prisma.$transaction(async (tx) => {
    await assertMoveOutEditableTx(tx, organizationId, moveOutId, t.validation.moveOutNotEditable);
    await tx.moveOutMeterReading.create({
      data: { organizationId, moveOutId, meterType, meterNumber, reading, unitOfMeasure, notes },
    });
  });

  revalidatePath(`/operations/move-outs/${moveOutId}`);
}

export async function addKeyItem(formData: FormData) {
  const moveOutId = String(formData.get("moveOutId"));
  const { organizationId } = await requirePermission("moveOutInspection.update");
  const t = getDictionary(await getLocale());
  const keyType = z.enum(["KEY", "ACCESS_CARD", "REMOTE", "PARKING_REMOTE", "OTHER"]).parse(formData.get("keyType")) as KeyType;
  const description = z.string().min(1).parse(formData.get("description"));
  const quantity = formData.get("quantity") ? z.coerce.number().int().positive().parse(formData.get("quantity")) : 1;
  const identifier = formData.get("identifier") ? String(formData.get("identifier")) : undefined;
  const notes = formData.get("notes") ? String(formData.get("notes")) : undefined;

  await prisma.$transaction(async (tx) => {
    await assertMoveOutEditableTx(tx, organizationId, moveOutId, t.validation.moveOutNotEditable);
    await tx.moveOutKeyItem.create({
      data: { organizationId, moveOutId, keyType, description, quantity, identifier, notes },
    });
  });

  revalidatePath(`/operations/move-outs/${moveOutId}`);
}

/** Explicitly marks "no keys to return" - toggled off automatically the moment a real MoveOutKeyItem is added. */
export async function setNoKeysToReturn(moveOutId: string, value: boolean) {
  const { organizationId } = await requirePermission("moveOutInspection.update");
  const t = getDictionary(await getLocale());
  await prisma.$transaction(async (tx) => {
    await assertMoveOutEditableTx(tx, organizationId, moveOutId, t.validation.moveOutNotEditable);
    await tx.moveOut.update({ where: { id: moveOutId }, data: { noKeysToReturn: value } });
  });
  revalidatePath(`/operations/move-outs/${moveOutId}`);
}

/** Attachment METADATA only - no binary upload exists yet, same as Move-In's own addAttachmentMetadata(). */
export async function addAttachmentMetadata(formData: FormData) {
  const moveOutId = String(formData.get("moveOutId"));
  const { organizationId } = await requirePermission("moveOutInspection.update");
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
    await assertMoveOutEditableTx(tx, organizationId, moveOutId, t.validation.moveOutNotEditable);
    if (inspectionItemId) {
      await tx.moveOutInspectionItem.findUniqueOrThrow({ where: { id: inspectionItemId, organizationId, moveOutId } });
    }
    if (inventoryItemId) {
      await tx.moveOutInventoryItem.findUniqueOrThrow({ where: { id: inventoryItemId, organizationId, moveOutId } });
    }
    await tx.moveOutAttachment.create({
      data: { organizationId, moveOutId, attachmentType, fileName, mimeType, fileSize, caption, inspectionItemId, inventoryItemId, uploadedByUserId: user.id },
    });
  });

  revalidatePath(`/operations/move-outs/${moveOutId}`);
}

/** Sets the vacate/handover date ahead of completion - a separate small action, same pattern as Move-In's own setHandoverDate(). */
export async function setVacateDate(formData: FormData) {
  const moveOutId = String(formData.get("moveOutId"));
  const { organizationId } = await requirePermission("moveOut.update");
  const t = getDictionary(await getLocale());
  const vacateDate = z.coerce.date().parse(formData.get("vacateDate"));

  await prisma.$transaction(async (tx) => {
    await assertMoveOutEditableTx(tx, organizationId, moveOutId, t.validation.moveOutNotEditable);
    await tx.moveOut.update({ where: { id: moveOutId }, data: { vacateDate } });
  });

  revalidatePath(`/operations/move-outs/${moveOutId}`);
}

// ---------------------------------------------------------------------------
// Findings review (no Move-In equivalent) - IN_PROGRESS -> PENDING_FINDINGS_
// REVIEW requires the checklist fully recorded; PENDING_FINDINGS_REVIEW ->
// READY_FOR_CLOSURE requires that review to actually happen and stamps
// findingsReviewedAt/By. reopenMoveOutStage() lets staff step back one stage
// for corrections (the same reopen allowance move-in-rules.ts grants
// READY_FOR_HANDOVER -> IN_PROGRESS), clearing the review stamp when
// stepping back out of READY_FOR_CLOSURE since it must be redone.
// ---------------------------------------------------------------------------

export async function advanceToFindingsReview(moveOutId: string) {
  const { organizationId } = await requirePermission("moveOut.update");
  const t = getDictionary(await getLocale());

  await prisma.$transaction(async (tx) => {
    const moveOut = await tx.moveOut.findUniqueOrThrow({ where: { id: moveOutId, organizationId }, include: { inspectionItems: true } });
    if (!isValidMoveOutTransition(moveOut.status, "PENDING_FINDINGS_REVIEW")) {
      throw new Error(t.validation.moveOutInvalidTransition);
    }
    if (!isFindingsReviewEligible(moveOut.inspectionItems)) {
      throw new Error(t.validation.moveOutFindingsReviewIncomplete);
    }
    const updated = await tx.moveOut.update({ where: { id: moveOutId }, data: { status: "PENDING_FINDINGS_REVIEW" } });
    await auditAction(tx, {
      action: "UPDATE",
      entityType: "MoveOut",
      entityId: updated.id,
      entityDisplayName: updated.moveOutNumber,
      previousValues: { status: moveOut.status },
      newValues: { status: updated.status },
    });
  });

  revalidatePath(`/operations/move-outs/${moveOutId}`);
  revalidatePath("/operations/move-outs");
  revalidatePath("/operations");
}

/** Records that findings/damages have been reviewed and advances to READY_FOR_CLOSURE. Damage/findings are operational records only (Decision 4) - this never creates a charge, invoice, or ledger entry. */
export async function reviewMoveOutFindings(moveOutId: string) {
  const { organizationId } = await requirePermissionAudited("moveOut.update", "MoveOut", moveOutId);
  const { user } = await requireSession();
  const t = getDictionary(await getLocale());

  await prisma.$transaction(async (tx) => {
    const moveOut = await tx.moveOut.findUniqueOrThrow({ where: { id: moveOutId, organizationId } });
    if (!isValidMoveOutTransition(moveOut.status, "READY_FOR_CLOSURE")) {
      throw new Error(t.validation.moveOutInvalidTransition);
    }
    const updated = await tx.moveOut.update({
      where: { id: moveOutId },
      data: { status: "READY_FOR_CLOSURE", findingsReviewedAt: new Date(), findingsReviewedByUserId: user.id },
    });
    await auditAction(tx, {
      action: "UPDATE",
      entityType: "MoveOut",
      entityId: updated.id,
      entityDisplayName: updated.moveOutNumber,
      previousValues: { status: moveOut.status, findingsReviewedAt: moveOut.findingsReviewedAt },
      newValues: { status: updated.status, findingsReviewedAt: updated.findingsReviewedAt, findingsReviewedByUserId: user.id },
    });
  });

  revalidatePath(`/operations/move-outs/${moveOutId}`);
  revalidatePath("/operations/move-outs");
  revalidatePath("/operations");
}

/** Steps back one stage for corrections (PENDING_FINDINGS_REVIEW -> IN_PROGRESS, or READY_FOR_CLOSURE -> PENDING_FINDINGS_REVIEW, clearing the review stamp since it must be redone). */
export async function reopenMoveOutStage(moveOutId: string) {
  const { organizationId } = await requirePermission("moveOut.update");
  const t = getDictionary(await getLocale());

  await prisma.$transaction(async (tx) => {
    const moveOut = await tx.moveOut.findUniqueOrThrow({ where: { id: moveOutId, organizationId } });
    const target: MoveOutStatus | null =
      moveOut.status === "PENDING_FINDINGS_REVIEW" ? "IN_PROGRESS" : moveOut.status === "READY_FOR_CLOSURE" ? "PENDING_FINDINGS_REVIEW" : null;
    if (!target || !isValidMoveOutTransition(moveOut.status, target)) {
      throw new Error(t.validation.moveOutInvalidTransition);
    }
    const clearingReview = moveOut.status === "READY_FOR_CLOSURE";
    const updated = await tx.moveOut.update({
      where: { id: moveOutId },
      data: { status: target, ...(clearingReview ? { findingsReviewedAt: null, findingsReviewedByUserId: null } : {}) },
    });
    await auditAction(tx, {
      action: "UPDATE",
      entityType: "MoveOut",
      entityId: updated.id,
      entityDisplayName: updated.moveOutNumber,
      previousValues: { status: moveOut.status },
      newValues: { status: updated.status },
    });
  });

  revalidatePath(`/operations/move-outs/${moveOutId}`);
  revalidatePath("/operations/move-outs");
  revalidatePath("/operations");
}

// ---------------------------------------------------------------------------
// Acknowledgements - operational, never framed as a legal e-signature, same
// pattern as Move-In's own acknowledgement actions.
// ---------------------------------------------------------------------------

export async function recordTenantAcknowledgement(formData: FormData) {
  const moveOutId = String(formData.get("moveOutId"));
  const { organizationId } = await requirePermission("moveOut.update");
  const t = getDictionary(await getLocale());
  const tenantRepresentativeName = z.string().min(1).parse(formData.get("tenantRepresentativeName"));
  const tenantRepresentativeId = formData.get("tenantRepresentativeId") ? String(formData.get("tenantRepresentativeId")) : undefined;
  const tenantComments = formData.get("tenantComments") ? String(formData.get("tenantComments")) : undefined;

  await prisma.$transaction(async (tx) => {
    const moveOut = await assertMoveOutEditableTx(tx, organizationId, moveOutId, t.validation.moveOutNotEditable);
    const updated = await tx.moveOut.update({
      where: { id: moveOutId },
      data: { tenantRepresentativeName, tenantRepresentativeId, tenantComments, tenantAcknowledgedAt: new Date() },
    });
    await auditAction(tx, {
      action: "UPDATE",
      entityType: "MoveOut",
      entityId: updated.id,
      entityDisplayName: updated.moveOutNumber,
      previousValues: { tenantAcknowledgedAt: moveOut.tenantAcknowledgedAt },
      newValues: { tenantAcknowledgedAt: updated.tenantAcknowledgedAt, tenantRepresentativeName },
    });
  });

  revalidatePath(`/operations/move-outs/${moveOutId}`);
}

/** Authorized override of the tenant-acknowledgement requirement - gated by moveOut.complete since it removes a completion prerequisite, always paired with a reason. */
export async function setTenantAcknowledgementOverride(formData: FormData) {
  const moveOutId = String(formData.get("moveOutId"));
  const { organizationId } = await requirePermission("moveOut.complete");
  const t = getDictionary(await getLocale());
  const override = formData.get("override") === "on";
  const reason = formData.get("reason") ? String(formData.get("reason")) : undefined;
  if (override && !reason) {
    throw new Error(t.validation.moveOutOverrideReasonRequired);
  }

  await prisma.$transaction(async (tx) => {
    await assertMoveOutEditableTx(tx, organizationId, moveOutId, t.validation.moveOutNotEditable);
    await tx.moveOut.update({
      where: { id: moveOutId },
      data: { tenantAcknowledgementOverride: override, tenantAcknowledgementOverrideReason: override ? reason : null },
    });
  });

  revalidatePath(`/operations/move-outs/${moveOutId}`);
}

export async function recordStaffAcknowledgement(moveOutId: string) {
  const { organizationId } = await requirePermission("moveOut.update");
  const { user } = await requireSession();
  const t = getDictionary(await getLocale());

  await prisma.$transaction(async (tx) => {
    await assertMoveOutEditableTx(tx, organizationId, moveOutId, t.validation.moveOutNotEditable);
    const updated = await tx.moveOut.update({
      where: { id: moveOutId },
      data: { staffAcknowledgedAt: new Date(), handedOverByUserId: user.id },
    });
    await auditAction(tx, {
      action: "UPDATE",
      entityType: "MoveOut",
      entityId: updated.id,
      entityDisplayName: updated.moveOutNumber,
      newValues: { staffAcknowledgedAt: updated.staffAcknowledgedAt, handedOverByUserId: user.id },
    });
  });

  revalidatePath(`/operations/move-outs/${moveOutId}`);
}

// ---------------------------------------------------------------------------
// Complete / cancel (requirement 3 - the critical, strictly re-validated
// vacancy transition) and cancel.
// ---------------------------------------------------------------------------

/** Builds the reconcileKeyReturns() input from a (possibly null) baseline Move-In's returnedExpected key items. */
function buildKeyExpectations(moveInKeyItems: readonly { keyType: KeyType; description: string; quantity: number; returnedExpected: boolean }[]) {
  return moveInKeyItems.filter((k) => k.returnedExpected).map((k) => ({ keyType: k.keyType, description: k.description, quantity: k.quantity }));
}

/**
 * Completes the Move-Out (requirement 3): re-validates every completion
 * requirement AND the occupancy-safety invariant inside one Serializable
 * transaction, then atomically marks COMPLETED, sets completedAt, sets
 * Unit.status = VACANT only when safe, and writes the audit entry. Never
 * touches Contract (Decision 2) or any financial record (Decision 3/4).
 * Idempotent: a second call on an already-COMPLETED Move-Out returns the
 * same id without re-running any side effect or re-checking vacancy safety.
 *
 * The occupancy-conflict rule (isUnsafeToVacate()) is the single, explicit,
 * pure-tested definition of "unsafe to vacate": another ACTIVE Contract
 * already exists for the Unit (besides this Move-Out's own), or the Unit is
 * currently held by a live (PENDING/CONFIRMED) Reservation. Either means a
 * newer occupancy/reservation state has appeared since this Move-Out was
 * prepared, so completion is rejected and every record - Move-Out, Contract,
 * Unit - is left exactly as it was; there is no partial write.
 */
export async function completeMoveOut(moveOutId: string): Promise<string> {
  const { organizationId } = await requirePermissionAudited("moveOut.complete", "MoveOut", moveOutId);
  const { user } = await requireSession();
  const t = getDictionary(await getLocale());

  let contractIdForRevalidate = "";

  const resultId = await prisma.$transaction(
    async (tx) => {
      const moveOut = await tx.moveOut.findUniqueOrThrow({
        where: { id: moveOutId, organizationId },
        include: {
          inspectionItems: true,
          meterReadings: true,
          keyItems: true,
          inventoryItems: true,
          moveIn: { include: { keyItems: true } },
        },
      });
      contractIdForRevalidate = moveOut.contractId;

      // Idempotent - no duplicated side effects, and no re-run of the
      // vacancy-safety check, on a repeat call.
      if (moveOut.status === "COMPLETED") {
        return moveOut.id;
      }

      // READY_FOR_CLOSURE -> COMPLETED is the only legal move here, which
      // enforces "Move-Out is in READY_FOR_CLOSURE" as part of the same check.
      if (!isValidMoveOutTransition(moveOut.status, "COMPLETED")) {
        throw new Error(t.validation.moveOutInvalidTransition);
      }

      // Re-verify every relation this transaction depends on, fresh, inside
      // this same transaction - never trust anything read before it started.
      const contract = await tx.contract.findUniqueOrThrow({ where: { id: moveOut.contractId, organizationId } });
      if (contract.unitId !== moveOut.unitId || contract.renterId !== moveOut.renterId) {
        throw new Error(t.validation.moveOutUnsafeToVacate);
      }
      if (moveOut.moveInId) {
        const moveIn = await tx.moveIn.findUniqueOrThrow({ where: { id: moveOut.moveInId, organizationId } });
        if (moveIn.contractId !== moveOut.contractId) {
          throw new Error(t.validation.moveOutUnsafeToVacate);
        }
      }
      const unit = await tx.unit.findUniqueOrThrow({ where: { id: moveOut.unitId, organizationId } });

      const keyReconciliation = reconcileKeyReturns(
        buildKeyExpectations(moveOut.moveIn?.keyItems ?? []),
        moveOut.keyItems.map((k) => ({ keyType: k.keyType, description: k.description, quantity: k.quantity }))
      );

      const validation = validateMoveOutCompletion({
        vacateDate: moveOut.vacateDate,
        inspectionItems: moveOut.inspectionItems,
        findingsReviewedAt: moveOut.findingsReviewedAt,
        meterReadingTypes: moveOut.meterReadings.map((m) => m.meterType),
        keyReconciliation,
        recordedKeyCount: moveOut.keyItems.length,
        noKeysToReturn: moveOut.noKeysToReturn,
        tenantAcknowledgedAt: moveOut.tenantAcknowledgedAt,
        tenantAcknowledgementOverride: moveOut.tenantAcknowledgementOverride,
        staffAcknowledgedAt: moveOut.staffAcknowledgedAt,
      });
      if (!validation.canComplete) {
        throw new Error(`${t.validation.moveOutCompletionMissingRequirements}: ${validation.missing.join(", ")}`);
      }

      // Conflicting-occupancy check (requirement 3's "no conflicting
      // occupancy state has appeared") - computed fresh, inside this same
      // Serializable transaction, immediately before the write.
      const [otherActiveContractCount, activeReservationCount] = await Promise.all([
        tx.contract.count({ where: { organizationId, unitId: moveOut.unitId, status: "ACTIVE", id: { not: moveOut.contractId } } }),
        tx.reservation.count({ where: { organizationId, unitId: moveOut.unitId, status: { in: ["PENDING", "CONFIRMED"] } } }),
      ]);
      const unsafe = isUnsafeToVacate({ otherActiveContractCount, activeReservationCount });
      if (unsafe) {
        throw new Error(t.validation.moveOutUnsafeToVacate);
      }

      const updated = await tx.moveOut.update({
        where: { id: moveOutId },
        data: {
          status: "COMPLETED",
          completedAt: new Date(),
          handedOverByUserId: moveOut.handedOverByUserId ?? user.id,
        },
      });

      // The sole, authoritative trigger that may set Unit.status = VACANT
      // (Decision 1) - only reached once every safety check above has
      // passed, and only ever writes VACANT (never any other Unit status).
      if (unit.status !== "VACANT") {
        await tx.unit.update({ where: { id: unit.id }, data: { status: "VACANT" } });
      }

      await auditAction(tx, {
        action: "UPDATE",
        entityType: "MoveOut",
        entityId: updated.id,
        entityDisplayName: updated.moveOutNumber,
        previousValues: { status: moveOut.status, unitStatus: unit.status },
        newValues: { status: "COMPLETED", completedAt: updated.completedAt, unitStatus: "VACANT", unitId: unit.id },
      });

      return updated.id;
    },
    { isolationLevel: "Serializable" }
  );

  revalidatePath(`/operations/move-outs/${moveOutId}`);
  revalidatePath("/operations/move-outs");
  revalidatePath("/operations");
  revalidatePath("/units");
  if (contractIdForRevalidate) {
    revalidatePath(`/contracts/${contractIdForRevalidate}`);
    revalidatePath(`/contracts/${contractIdForRevalidate}/edit`);
  }
  return resultId;
}

/** Cancellation - never deletes the record; OTHER requires a note. A cancelled Move-Out never blocks a future Move-Out or Contract renewal (requirements 4/5). */
export async function cancelMoveOut(formData: FormData) {
  const moveOutId = String(formData.get("moveOutId"));
  const { organizationId } = await requirePermissionAudited("moveOut.cancel", "MoveOut", moveOutId);
  const t = getDictionary(await getLocale());
  const reason = z.enum(["CONTRACT_REINSTATED", "TENANT_REQUEST", "RESCHEDULED", "DATA_ERROR", "OTHER"]).parse(formData.get("reason"));
  const note = formData.get("note") ? String(formData.get("note")) : undefined;
  if (reason === "OTHER" && !note) {
    throw new Error(t.validation.moveOutCancelNoteRequired);
  }

  await prisma.$transaction(async (tx) => {
    const moveOut = await tx.moveOut.findUniqueOrThrow({ where: { id: moveOutId, organizationId } });
    if (!isValidMoveOutTransition(moveOut.status, "CANCELLED")) {
      throw new Error(t.validation.moveOutInvalidTransition);
    }
    const updated = await tx.moveOut.update({
      where: { id: moveOutId },
      data: { status: "CANCELLED", cancelReason: reason, cancelReasonNote: note ?? null, cancelledAt: new Date() },
    });
    await auditAction(tx, {
      action: "CANCEL",
      entityType: "MoveOut",
      entityId: updated.id,
      entityDisplayName: updated.moveOutNumber,
      previousValues: { status: moveOut.status },
      newValues: { status: "CANCELLED", cancelReason: reason, cancelReasonNote: note },
    });
  });

  revalidatePath(`/operations/move-outs/${moveOutId}`);
  revalidatePath("/operations/move-outs");
  revalidatePath("/operations");
}

// ---------------------------------------------------------------------------
// Reads: profile (with baseline comparison), list + filters, Contract
// integration.
// ---------------------------------------------------------------------------

export async function getMoveOutById(moveOutId: string) {
  const { organizationId } = await requirePermission("moveOut.view");
  const moveOut = await prisma.moveOut.findUniqueOrThrow({
    where: { id: moveOutId, organizationId },
    include: FULL_MOVE_OUT_INCLUDE,
  });

  const progress = computeInspectionProgress(moveOut.inspectionItems);
  const defects = computeDefectSummary(moveOut.inspectionItems);
  const findingsReviewEligible = isFindingsReviewEligible(moveOut.inspectionItems);
  const readyForClosureEligible = isReadyForClosureEligible(moveOut.findingsReviewedAt);
  const overdue = isMoveOutOverdue(moveOut.scheduledAt, moveOut.status);

  // Baseline comparison against the linked Move-In, when one exists - reads
  // only, never written back to any MoveIn* table.
  let baselineMoveIn = null;
  let inventoryDiff: ReturnType<typeof diffInventoryItems> = [];
  let meterConsumption: ReturnType<typeof computeMeterConsumption> = [];
  let keyReconciliation: ReturnType<typeof reconcileKeyReturns> = { lines: [], hasExpectations: false, allReturned: true };

  if (moveOut.moveInId) {
    baselineMoveIn = await prisma.moveIn.findUniqueOrThrow({
      where: { id: moveOut.moveInId, organizationId },
      include: { inventoryItems: true, meterReadings: true, keyItems: true },
    });
    inventoryDiff = diffInventoryItems(baselineMoveIn.inventoryItems, moveOut.inventoryItems);
    meterConsumption = computeMeterConsumption(
      baselineMoveIn.meterReadings.map((m) => ({ meterType: m.meterType, reading: Number(m.reading) })),
      moveOut.meterReadings.map((m) => ({ meterType: m.meterType, reading: Number(m.reading) }))
    );
    keyReconciliation = reconcileKeyReturns(
      buildKeyExpectations(baselineMoveIn.keyItems),
      moveOut.keyItems.map((k) => ({ keyType: k.keyType, description: k.description, quantity: k.quantity }))
    );
  } else {
    keyReconciliation = reconcileKeyReturns([], moveOut.keyItems.map((k) => ({ keyType: k.keyType, description: k.description, quantity: k.quantity })));
  }

  const completion = validateMoveOutCompletion({
    vacateDate: moveOut.vacateDate,
    inspectionItems: moveOut.inspectionItems,
    findingsReviewedAt: moveOut.findingsReviewedAt,
    meterReadingTypes: moveOut.meterReadings.map((m) => m.meterType),
    keyReconciliation,
    recordedKeyCount: moveOut.keyItems.length,
    noKeysToReturn: moveOut.noKeysToReturn,
    tenantAcknowledgedAt: moveOut.tenantAcknowledgedAt,
    tenantAcknowledgementOverride: moveOut.tenantAcknowledgementOverride,
    staffAcknowledgedAt: moveOut.staffAcknowledgedAt,
  });

  return {
    moveOut,
    progress,
    defects,
    findingsReviewEligible,
    readyForClosureEligible,
    completion,
    overdue,
    baselineMoveIn,
    inventoryDiff,
    meterConsumption,
    keyReconciliation,
  };
}

export interface MoveOutListFilters {
  search?: string;
  status?: string;
  compoundId?: string;
  buildingId?: string;
  unitId?: string;
  renterId?: string;
  contractId?: string;
  inspectedByUserId?: string;
  scheduledFrom?: Date;
  scheduledTo?: Date;
  vacateFrom?: Date;
  vacateTo?: Date;
  hasFindings?: boolean;
  hasMaintenanceRequests?: boolean;
  completedOnly?: boolean;
  cancelledOnly?: boolean;
  overdueOnly?: boolean;
  page?: number;
}

/** Applicable-item findings, same definition computeDefectSummary() itself uses (requiresAttention or a DAMAGED/NOT_WORKING/POOR condition) - never duplicated as a separate formula. */
const FINDING_CONDITIONS = ["DAMAGED", "NOT_WORKING", "POOR"] as const;

export async function listMoveOuts(filters: MoveOutListFilters = {}) {
  const { organizationId } = await requirePermission("moveOut.view");
  const page = Math.max(1, filters.page ?? 1);

  let statusFilter = (filters.status as MoveOutStatus) || undefined;
  if (filters.completedOnly) statusFilter = "COMPLETED";
  if (filters.cancelledOnly) statusFilter = "CANCELLED";

  const where: Prisma.MoveOutWhereInput = {
    organizationId,
    status: statusFilter,
    unitId: filters.unitId || undefined,
    renterId: filters.renterId || undefined,
    contractId: filters.contractId || undefined,
    inspectedByUserId: filters.inspectedByUserId || undefined,
    unit: filters.compoundId || filters.buildingId ? { floor: { buildingId: filters.buildingId || undefined, building: filters.compoundId ? { compoundId: filters.compoundId } : undefined } } : undefined,
    scheduledAt: filters.overdueOnly
      ? { lt: new Date() }
      : filters.scheduledFrom || filters.scheduledTo
        ? { gte: filters.scheduledFrom, lt: filters.scheduledTo }
        : undefined,
    ...(filters.overdueOnly ? { status: { notIn: ["COMPLETED", "CANCELLED"] } } : {}),
    vacateDate: filters.vacateFrom || filters.vacateTo ? { gte: filters.vacateFrom, lt: filters.vacateTo } : undefined,
    ...(filters.hasFindings
      ? { inspectionItems: { some: { isApplicable: true, OR: [{ requiresAttention: true }, { condition: { in: [...FINDING_CONDITIONS] } }] } } }
      : {}),
    ...(filters.hasMaintenanceRequests ? { maintenanceRequests: { some: {} } } : {}),
    ...(filters.search
      ? {
          OR: [
            { moveOutNumber: { contains: filters.search, mode: "insensitive" as const } },
            { renter: { fullName: { contains: filters.search, mode: "insensitive" as const } } },
            { unit: { unitNumber: { contains: filters.search, mode: "insensitive" as const } } },
            { contract: { contractNumber: { contains: filters.search, mode: "insensitive" as const } } },
          ],
        }
      : {}),
  };

  const [rows, total] = await Promise.all([
    prisma.moveOut.findMany({
      where,
      include: {
        contract: { select: { id: true, contractNumber: true } },
        unit: { include: { floor: { include: { building: { include: { compound: true } } } } } },
        renter: { select: { id: true, fullName: true, fullNameAr: true } },
        inspectedByUser: { select: { id: true, name: true } },
        inspectionItems: { select: { isApplicable: true, condition: true, requiresAttention: true } },
        _count: { select: { maintenanceRequests: true } },
      },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    prisma.moveOut.count({ where }),
  ]);

  const rowsWithProgress = rows.map((row) => ({
    ...row,
    progress: computeInspectionProgress(row.inspectionItems),
    defects: computeDefectSummary(row.inspectionItems),
    overdue: isMoveOutOverdue(row.scheduledAt, row.status),
  }));

  return { rows: rowsWithProgress, total, page, pageSize: PAGE_SIZE, totalPages: Math.max(1, Math.ceil(total / PAGE_SIZE)) };
}

/** Contracts eligible to start a new Move-Out (Decision 2) - ACTIVE or TERMINATED contracts with no currently-blocking Move-Out. */
export async function listEligibleContractsForMoveOut(search?: string) {
  const { organizationId } = await requirePermission("moveOut.create");
  const contracts = await prisma.contract.findMany({
    where: {
      organizationId,
      status: { in: ["ACTIVE", "TERMINATED"] },
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
      moveOuts: { select: { status: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
  return contracts.filter((c) => !c.moveOuts.some((m) => blocksNewMoveOutForContract(m.status)));
}

/** The most relevant Move-Out for a Contract - prefers a live/completed one over a cancelled one, same "most relevant record" rule Move-In's own getMoveInForContract() uses. */
export async function getMoveOutForContract(contractId: string) {
  const { organizationId } = await requirePermission("moveOut.view");
  const moveOuts = await prisma.moveOut.findMany({
    where: { organizationId, contractId },
    orderBy: { createdAt: "desc" },
    select: { id: true, moveOutNumber: true, status: true, scheduledAt: true, vacateDate: true, completedAt: true },
  });
  return moveOuts.find((m) => m.status !== "CANCELLED") ?? moveOuts[0] ?? null;
}

/** Bulk Move-Out status for a list of Units (Units-list integration) - one query pair for the whole page, mirroring getMoveInStatusForUnits()'s own bulk pattern rather than N+1 per-row lookups. */
export async function getMoveOutStatusForUnits(unitIds: string[]) {
  const { organizationId } = await requirePermission("moveOut.view");
  const map = new Map<string, { moveOutId: string; moveOutNumber: string; status: MoveOutStatus; vacateDate: Date | null } | null>();
  if (unitIds.length === 0) return map;

  const moveOuts = await prisma.moveOut.findMany({
    where: { organizationId, unitId: { in: unitIds } },
    orderBy: { createdAt: "desc" },
    select: { unitId: true, id: true, moveOutNumber: true, status: true, vacateDate: true },
  });

  const byUnit = new Map<string, typeof moveOuts>();
  for (const m of moveOuts) {
    const arr = byUnit.get(m.unitId) ?? [];
    arr.push(m);
    byUnit.set(m.unitId, arr);
  }
  for (const [unitId, list] of byUnit) {
    const moveOut = list.find((m) => m.status !== "CANCELLED") ?? list[0] ?? null;
    map.set(unitId, moveOut ? { moveOutId: moveOut.id, moveOutNumber: moveOut.moveOutNumber, status: moveOut.status, vacateDate: moveOut.vacateDate } : null);
  }
  return map;
}

/** Bulk Move-Out status for a list of Renters (Renters-list integration). */
export async function getMoveOutStatusForRenters(renterIds: string[]) {
  const { organizationId } = await requirePermission("moveOut.view");
  const map = new Map<string, { moveOutId: string; moveOutNumber: string; status: MoveOutStatus; vacateDate: Date | null } | null>();
  if (renterIds.length === 0) return map;

  const moveOuts = await prisma.moveOut.findMany({
    where: { organizationId, renterId: { in: renterIds } },
    orderBy: { createdAt: "desc" },
    select: { renterId: true, id: true, moveOutNumber: true, status: true, vacateDate: true },
  });

  const byRenter = new Map<string, typeof moveOuts>();
  for (const m of moveOuts) {
    const arr = byRenter.get(m.renterId) ?? [];
    arr.push(m);
    byRenter.set(m.renterId, arr);
  }
  for (const [renterId, list] of byRenter) {
    const moveOut = list.find((m) => m.status !== "CANCELLED") ?? list[0] ?? null;
    map.set(renterId, moveOut ? { moveOutId: moveOut.id, moveOutNumber: moveOut.moveOutNumber, status: moveOut.status, vacateDate: moveOut.vacateDate } : null);
  }
  return map;
}

/**
 * Operations dashboard KPIs (requirement: bounded DB aggregates, no
 * unbounded history reads) - mirrors getOperationsDashboard()'s
 * (move-ins.ts) and getMaintenanceDashboardKpis()'s (maintenance.ts) own
 * bounded-count pattern exactly.
 */
export async function getMoveOutDashboardKpis() {
  const { organizationId } = await requirePermission("moveOut.view");

  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const endOfToday = new Date(startOfToday);
  endOfToday.setDate(endOfToday.getDate() + 1);
  const endOfWeek = new Date(startOfToday);
  endOfWeek.setDate(endOfWeek.getDate() + 7);
  const startOfMonth = new Date(startOfToday.getFullYear(), startOfToday.getMonth(), 1);
  const startOfNextMonth = new Date(startOfToday.getFullYear(), startOfToday.getMonth() + 1, 1);

  const [today, upcoming, inProgress, pendingFindingsReview, readyForClosure, completedThisMonth, notTerminal, withFindings, withMaintenance] = await Promise.all([
    prisma.moveOut.count({ where: { organizationId, scheduledAt: { gte: startOfToday, lt: endOfToday } } }),
    prisma.moveOut.count({ where: { organizationId, scheduledAt: { gte: endOfToday, lt: endOfWeek } } }),
    prisma.moveOut.count({ where: { organizationId, status: "IN_PROGRESS" } }),
    prisma.moveOut.count({ where: { organizationId, status: "PENDING_FINDINGS_REVIEW" } }),
    prisma.moveOut.count({ where: { organizationId, status: "READY_FOR_CLOSURE" } }),
    prisma.moveOut.count({ where: { organizationId, status: "COMPLETED", completedAt: { gte: startOfMonth, lt: startOfNextMonth } } }),
    // Overdue = scheduledAt < now AND not terminal (isMoveOutOverdue()'s own
    // definition) - computed over a bounded, already-narrow set, never the
    // whole table.
    prisma.moveOut.count({ where: { organizationId, scheduledAt: { lt: new Date() }, status: { notIn: ["COMPLETED", "CANCELLED"] } } }),
    prisma.moveOut.count({
      where: {
        organizationId,
        status: { notIn: ["CANCELLED"] },
        inspectionItems: { some: { isApplicable: true, OR: [{ requiresAttention: true }, { condition: { in: [...FINDING_CONDITIONS] } }] } },
      },
    }),
    prisma.moveOut.count({ where: { organizationId, status: { notIn: ["CANCELLED"] }, maintenanceRequests: { some: {} } } }),
  ]);

  return {
    moveOutsToday: today,
    upcomingThisWeek: upcoming,
    inProgress,
    pendingFindingsReview,
    readyForClosure,
    completedThisMonth,
    overdueMoveOuts: notTerminal,
    moveOutsWithFindings: withFindings,
    moveOutsWithMaintenanceRequests: withMaintenance,
  };
}
