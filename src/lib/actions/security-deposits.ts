"use server";

import { z } from "zod";
import { Prisma } from "@prisma/client";
import type { SettlementResponsibility, SettlementDeductionCategory, AssessmentSourceType, SettlementDisputeStatus, PaymentMethod } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requirePermission, requireSession } from "@/lib/session";
import { getLocale, getDictionary } from "@/lib/i18n";
import { auditCreate, auditAction, requirePermissionAudited } from "@/lib/audit";
import { nextCounterValue, formatSecurityDepositSettlementNumber } from "@/lib/numbering";
import { issueInvoice } from "@/lib/invoicing";
import {
  isValidSettlementTransition,
  isSettlementEditable,
  isSettlementCancellable,
  isMoveOutEligibleForSettlement,
  ledgerEntryDebitCredit,
  reversalDebitCredit,
  createAdjustmentDebitCredit,
  computeAvailableDepositBalance,
  validateAssessmentAmounts,
  sumProposedTenantAmount,
  sumApprovedTenantDeductions,
  sumWaivedTenantAmount,
  getApprovalBlockers,
  computeSettlementOutcome,
  computeInvoiceDepositPortion,
  computeRefundRemaining,
  isRefundAmountAllowed,
  computeSettlementCompletionStatus,
} from "@/lib/security-deposit-rules";
import { buildRenterRecipient } from "@/lib/communications/recipients";
import { resolveNotificationLanguage } from "@/lib/communications/language";
import { emitCommunicationEventTx } from "@/lib/automation/outbox-emit";
import { securityDepositSettlementPostedKey, securityDepositRefundRecordedKey } from "@/lib/automation/outbox-keys";

const PAGE_SIZE = 25;

const FULL_SETTLEMENT_INCLUDE = {
  contract: { select: { id: true, contractNumber: true, status: true, securityDeposit: true } },
  moveOut: { select: { id: true, moveOutNumber: true, status: true, completedAt: true } },
  unit: { include: { floor: { include: { building: { include: { compound: true } } } } } },
  renter: { select: { id: true, fullName: true, fullNameAr: true, phone: true } },
  liabilityAssessments: {
    orderBy: { createdAt: "asc" } as const,
    include: {
      moveOutInspectionItem: { select: { id: true, itemName: true, itemNameAr: true, category: true, condition: true } },
      moveOutInventoryItem: { select: { id: true, itemName: true, category: true, condition: true } },
      moveOutKeyItem: { select: { id: true, keyType: true, description: true } },
      maintenanceRequest: { select: { id: true, requestNumber: true, title: true, category: true } },
    },
  },
  refunds: { orderBy: { createdAt: "asc" } as const },
  notesLog: { orderBy: { createdAt: "asc" } as const },
  additionalDueInvoices: { select: { id: true, invoiceNumber: true, status: true, totalAmount: true, paidAmount: true } },
} satisfies Prisma.SecurityDepositSettlementInclude;

// ---------------------------------------------------------------------------
// Deposit position (Step 7/8/39) - server-authoritative, ledger-derived,
// never trusted from the client. requiredDeposit is display-only context
// (Contract.securityDeposit) and is NEVER treated as "available."
// ---------------------------------------------------------------------------

export async function getDepositPositionForContract(contractId: string) {
  const { organizationId } = await requirePermission("securityDeposit.view");
  const [contract, ledgerEntries] = await Promise.all([
    prisma.contract.findUniqueOrThrow({ where: { id: contractId, organizationId }, select: { securityDeposit: true } }),
    prisma.securityDepositLedgerEntry.findMany({ where: { organizationId, contractId }, select: { debit: true, credit: true } }),
  ]);
  const availableDeposit = computeAvailableDepositBalance(ledgerEntries);
  const requiredDeposit = contract.securityDeposit ?? new Prisma.Decimal(0);
  return {
    requiredDeposit,
    availableDeposit,
    // Step 21 - an anomaly worth surfacing in the UI, never silently clamped.
    isOverCollected: availableDeposit.greaterThan(requiredDeposit),
  };
}

/**
 * One-time sync (Step 26-28) of COLLECTION ledger entries from the
 * Contract's existing, unmodified paid SECURITY_DEPOSIT invoice lines - see
 * docs/SECURITY-DEPOSIT-SETTLEMENT.md, "Why collection is derived, not
 * manually entered" and its documented limitation (a deposit invoice paid
 * MORE after this sync runs is not automatically topped up in V1 - an
 * authorized user can post a manual ADJUSTMENT entry for that rare case).
 * Idempotent via the @@unique([organizationId, referenceType, referenceId])
 * constraint on the ledger - safe to call more than once for the same
 * Contract, but in practice only ever called once, at settlement creation.
 */
async function syncDepositCollectionLedgerOnce(tx: Prisma.TransactionClient, organizationId: string, contractId: string, actorUserId: string) {
  const invoices = await tx.invoice.findMany({
    where: { organizationId, contractId, status: { not: "CANCELLED" }, lines: { some: { kind: "SECURITY_DEPOSIT" } } },
    select: { id: true, invoiceNumber: true, totalAmount: true, paidAmount: true, lines: { where: { kind: "SECURITY_DEPOSIT" }, select: { lineTotal: true } } },
  });

  for (const invoice of invoices) {
    const depositLineTotal = invoice.lines.reduce((sum, l) => sum.plus(l.lineTotal), new Prisma.Decimal(0));
    const portion = computeInvoiceDepositPortion({ totalAmount: invoice.totalAmount, paidAmount: invoice.paidAmount, depositLineTotal });
    if (portion.lessThanOrEqualTo(0)) continue;

    const existing = await tx.securityDepositLedgerEntry.findUnique({
      where: { organizationId_referenceType_referenceId: { organizationId, referenceType: "Invoice", referenceId: invoice.id } },
    });
    if (existing) continue;

    const { debit, credit } = ledgerEntryDebitCredit("COLLECTION", portion);
    await tx.securityDepositLedgerEntry.create({
      data: {
        organizationId,
        contractId,
        entryType: "COLLECTION",
        debit,
        credit,
        referenceType: "Invoice",
        referenceId: invoice.id,
        description: `Security deposit collected - Invoice ${invoice.invoiceNumber}`,
        createdBy: actorUserId,
      },
    });
  }
}

const adjustmentSchema = z.object({
  contractId: z.string().min(1),
  amount: z.coerce.number().positive(),
  side: z.enum(["debit", "credit"]),
  description: z.string().min(1),
});

/**
 * Step 26 - "a rare, explicit, audited correction" (e.g. fixing a
 * collection-sync error, or recording a genuinely off-system historical
 * collection an authorized user has independently verified - Step 28). This
 * is the ONLY way to add a ledger entry outside of the automated
 * COLLECTION sync / APPLICATION-at-posting / REFUND-at-recording paths, and
 * it is never reachable from a finding or an assessment - it exists purely
 * for correcting the ledger itself.
 */
export async function postSecurityDepositLedgerAdjustment(formData: FormData) {
  const { organizationId } = await requirePermissionAudited("securityDeposit.post", "SecurityDepositLedgerEntry", "adjustment");
  const { user } = await requireSession();
  const parsed = adjustmentSchema.parse(Object.fromEntries(formData));

  await prisma.contract.findUniqueOrThrow({ where: { id: parsed.contractId, organizationId } });
  const { debit, credit } = createAdjustmentDebitCredit(parsed.amount, parsed.side);

  await prisma.$transaction(async (tx) => {
    const entry = await tx.securityDepositLedgerEntry.create({
      data: { organizationId, contractId: parsed.contractId, entryType: "ADJUSTMENT", debit, credit, description: parsed.description, createdBy: user.id },
    });
    await auditCreate(tx, {
      entityType: "SecurityDepositLedgerEntry",
      entityId: entry.id,
      entityDisplayName: parsed.description,
      newValues: { contractId: parsed.contractId, side: parsed.side, amount: parsed.amount },
    });
  });

  revalidatePath("/operations/settlements");
}

/** Step 62 - never deletes/edits a posted ledger row; posts a mirroring REVERSAL entry instead, referencing the original (one-to-one, DB-unique). */
export async function reverseSecurityDepositLedgerEntry(entryId: string) {
  const { organizationId } = await requirePermissionAudited("securityDeposit.post", "SecurityDepositLedgerEntry", entryId);
  const { user } = await requireSession();
  const t = getDictionary(await getLocale());

  await prisma.$transaction(async (tx) => {
    const original = await tx.securityDepositLedgerEntry.findUniqueOrThrow({ where: { id: entryId, organizationId } });
    const alreadyReversed = await tx.securityDepositLedgerEntry.findUnique({ where: { reversalOfEntryId: entryId } });
    if (alreadyReversed) throw new Error(t.validation.settlementAlreadyPosted);

    const { debit, credit } = reversalDebitCredit({ debit: original.debit, credit: original.credit });
    const reversal = await tx.securityDepositLedgerEntry.create({
      data: {
        organizationId,
        contractId: original.contractId,
        settlementId: original.settlementId,
        entryType: "REVERSAL",
        debit,
        credit,
        description: `Reversal of: ${original.description}`,
        reversalOfEntryId: original.id,
        createdBy: user.id,
      },
    });
    await auditCreate(tx, {
      entityType: "SecurityDepositLedgerEntry",
      entityId: reversal.id,
      entityDisplayName: reversal.description,
      newValues: { reversalOfEntryId: original.id },
    });
  });

  revalidatePath("/operations/settlements");
}

// ---------------------------------------------------------------------------
// Settlement lifecycle (Steps 4-6, 37, 49-52, 61-63)
// ---------------------------------------------------------------------------

/** Step 4/37: only from a COMPLETED MoveOut, at most one ever (DB-unique on moveOutId). */
export async function createSecurityDepositSettlement(moveOutId: string): Promise<string> {
  const { organizationId } = await requirePermissionAudited("securityDeposit.create", "MoveOut", moveOutId);
  const { user } = await requireSession();
  const t = getDictionary(await getLocale());

  const settlementId = await prisma.$transaction(
    async (tx) => {
      const moveOut = await tx.moveOut.findUniqueOrThrow({ where: { id: moveOutId, organizationId } });
      if (!isMoveOutEligibleForSettlement(moveOut.status)) {
        throw new Error(t.validation.settlementMoveOutNotEligible);
      }

      const existing = await tx.securityDepositSettlement.findUnique({ where: { moveOutId } });
      if (existing) {
        throw new Error(t.validation.settlementAlreadyExistsForMoveOut);
      }

      // Never trusted from the client - re-derived from the Contract itself,
      // inside this same transaction, mirroring MoveOut's own unitId/
      // renterId-from-Contract derivation exactly.
      const contract = await tx.contract.findUniqueOrThrow({ where: { id: moveOut.contractId, organizationId } });

      const seq = await nextCounterValue(tx, organizationId, "securityDepositSettlement");
      const settlementNumber = formatSecurityDepositSettlementNumber(seq);

      const created = await tx.securityDepositSettlement.create({
        data: {
          organizationId,
          settlementNumber,
          contractId: contract.id,
          moveOutId: moveOut.id,
          unitId: moveOut.unitId,
          renterId: moveOut.renterId,
          status: "DRAFT",
          preparedByUserId: user.id,
        },
      });

      await syncDepositCollectionLedgerOnce(tx, organizationId, contract.id, user.id);

      await auditCreate(tx, {
        entityType: "SecurityDepositSettlement",
        entityId: created.id,
        entityDisplayName: created.settlementNumber,
        newValues: { moveOutId: moveOut.id, contractId: contract.id, status: "DRAFT" },
      });

      return created.id;
    },
    { isolationLevel: "Serializable" }
  );

  revalidatePath(`/operations/move-outs/${moveOutId}`);
  revalidatePath(`/operations/move-outs/${moveOutId}/settlement`);
  revalidatePath("/operations/settlements");
  return settlementId;
}

async function loadSettlementForTransition(tx: Prisma.TransactionClient, id: string, organizationId: string) {
  return tx.securityDepositSettlement.findUniqueOrThrow({ where: { id, organizationId }, include: { liabilityAssessments: true } });
}

export async function submitSettlementForReview(settlementId: string) {
  const { organizationId } = await requirePermissionAudited("securityDeposit.assess", "SecurityDepositSettlement", settlementId);
  const t = getDictionary(await getLocale());
  await prisma.$transaction(async (tx) => {
    const settlement = await loadSettlementForTransition(tx, settlementId, organizationId);
    if (!isValidSettlementTransition(settlement.status, "UNDER_REVIEW")) throw new Error(t.validation.settlementInvalidTransition);
    await tx.securityDepositSettlement.update({ where: { id: settlementId }, data: { status: "UNDER_REVIEW" } });
    await auditAction(tx, {
      action: "UPDATE",
      entityType: "SecurityDepositSettlement",
      entityId: settlementId,
      entityDisplayName: settlement.settlementNumber,
      previousValues: { status: settlement.status },
      newValues: { status: "UNDER_REVIEW" },
    });
  });
  revalidatePath(`/operations/settlements/${settlementId}`);
}

export async function reviewSettlement(settlementId: string, decision: "FORWARD" | "BACK") {
  const { organizationId } = await requirePermissionAudited("securityDeposit.review", "SecurityDepositSettlement", settlementId);
  const { user } = await requireSession();
  const t = getDictionary(await getLocale());
  const target = decision === "FORWARD" ? "PENDING_APPROVAL" : "DRAFT";
  await prisma.$transaction(async (tx) => {
    const settlement = await loadSettlementForTransition(tx, settlementId, organizationId);
    if (!isValidSettlementTransition(settlement.status, target)) throw new Error(t.validation.settlementInvalidTransition);
    await tx.securityDepositSettlement.update({
      where: { id: settlementId },
      data: { status: target, ...(decision === "FORWARD" ? { reviewedByUserId: user.id, reviewedAt: new Date() } : {}) },
    });
    await auditAction(tx, {
      action: "UPDATE",
      entityType: "SecurityDepositSettlement",
      entityId: settlementId,
      entityDisplayName: settlement.settlementNumber,
      previousValues: { status: settlement.status },
      newValues: { status: target },
    });
  });
  revalidatePath(`/operations/settlements/${settlementId}`);
}

/**
 * Step 48-50: freezes the commercial snapshot. Recomputes the available
 * deposit and total approved tenant deductions fresh, inside this same
 * transaction, from the ledger and the assessments as they stand right now
 * - never reuses a previously-displayed number. Refuses if any approval
 * blocker (Step 48/98) is still open. Also stamps approvedByUserId/
 * approvedAt onto every TENANT assessment carrying a non-zero approved
 * amount, preserving per-line approval traceability (Step 11) alongside
 * the settlement-level decision.
 */
export async function approveSettlement(settlementId: string) {
  const { organizationId } = await requirePermissionAudited("securityDeposit.approve", "SecurityDepositSettlement", settlementId);
  const { user } = await requireSession();
  const t = getDictionary(await getLocale());

  await prisma.$transaction(
    async (tx) => {
      const settlement = await loadSettlementForTransition(tx, settlementId, organizationId);
      if (!isValidSettlementTransition(settlement.status, "APPROVED")) throw new Error(t.validation.settlementInvalidTransition);

      const blockers = getApprovalBlockers(settlement.liabilityAssessments);
      if (blockers.includes("UNDETERMINED_RESPONSIBILITY_EXISTS")) throw new Error(t.validation.settlementApprovalBlockedUndetermined);
      if (blockers.includes("UNRESOLVED_DISPUTE_EXISTS")) throw new Error(t.validation.settlementApprovalBlockedDispute);

      const ledgerEntries = await tx.securityDepositLedgerEntry.findMany({ where: { organizationId, contractId: settlement.contractId }, select: { debit: true, credit: true } });
      const availableDeposit = computeAvailableDepositBalance(ledgerEntries);
      const totalApprovedTenantDeductions = sumApprovedTenantDeductions(settlement.liabilityAssessments);
      const outcome = computeSettlementOutcome(availableDeposit, totalApprovedTenantDeductions);

      await tx.securityDepositSettlement.update({
        where: { id: settlementId },
        data: {
          status: "APPROVED",
          approvedAvailableDeposit: availableDeposit,
          approvedTenantDeductions: totalApprovedTenantDeductions,
          approvedDepositApplied: outcome.depositApplied,
          approvedRefundDue: outcome.refundDue,
          approvedAdditionalDue: outcome.additionalDue,
          approvedByUserId: user.id,
          approvedAt: new Date(),
        },
      });

      const tenantAssessmentIds = settlement.liabilityAssessments
        .filter((a) => a.responsibility === "TENANT" && a.approvedAmount !== null && Number(a.approvedAmount) > 0)
        .map((a) => a.id);
      if (tenantAssessmentIds.length > 0) {
        await tx.moveOutLiabilityAssessment.updateMany({
          where: { id: { in: tenantAssessmentIds } },
          data: { approvedByUserId: user.id, approvedAt: new Date() },
        });
      }

      await auditAction(tx, {
        action: "UPDATE",
        entityType: "SecurityDepositSettlement",
        entityId: settlementId,
        entityDisplayName: settlement.settlementNumber,
        previousValues: { status: settlement.status },
        newValues: {
          status: "APPROVED",
          approvedAvailableDeposit: availableDeposit.toString(),
          approvedTenantDeductions: totalApprovedTenantDeductions.toString(),
          approvedDepositApplied: outcome.depositApplied.toString(),
          approvedRefundDue: outcome.refundDue.toString(),
          approvedAdditionalDue: outcome.additionalDue.toString(),
        },
      });
    },
    { isolationLevel: "Serializable" }
  );

  revalidatePath(`/operations/settlements/${settlementId}`);
}

/** Step 49 - controlled reopen from PENDING_APPROVAL or APPROVED back to UNDER_REVIEW, clearing any approved snapshot. Never a silent edit of approved figures. */
export async function reopenSettlementForCorrection(settlementId: string) {
  const { organizationId } = await requirePermissionAudited("securityDeposit.approve", "SecurityDepositSettlement", settlementId);
  const t = getDictionary(await getLocale());
  await prisma.$transaction(async (tx) => {
    const settlement = await loadSettlementForTransition(tx, settlementId, organizationId);
    if (!isValidSettlementTransition(settlement.status, "UNDER_REVIEW")) throw new Error(t.validation.settlementInvalidTransition);
    await tx.securityDepositSettlement.update({
      where: { id: settlementId },
      data: {
        status: "UNDER_REVIEW",
        approvedAvailableDeposit: null,
        approvedTenantDeductions: null,
        approvedDepositApplied: null,
        approvedRefundDue: null,
        approvedAdditionalDue: null,
        approvedByUserId: null,
        approvedAt: null,
      },
    });
    await auditAction(tx, {
      action: "UPDATE",
      entityType: "SecurityDepositSettlement",
      entityId: settlementId,
      entityDisplayName: settlement.settlementNumber,
      previousValues: { status: settlement.status },
      newValues: { status: "UNDER_REVIEW", approvalCleared: true },
    });
  });
  revalidatePath(`/operations/settlements/${settlementId}`);
}

export async function cancelSettlement(formData: FormData) {
  const settlementId = String(formData.get("settlementId"));
  const { organizationId } = await requirePermissionAudited("securityDeposit.review", "SecurityDepositSettlement", settlementId);
  const { user } = await requireSession();
  const t = getDictionary(await getLocale());
  const reason = String(formData.get("reason") ?? "").trim();
  if (!reason) throw new Error(t.validation.settlementCancelReasonRequired);

  await prisma.$transaction(async (tx) => {
    const settlement = await loadSettlementForTransition(tx, settlementId, organizationId);
    if (!isSettlementCancellable(settlement.status)) throw new Error(t.validation.settlementInvalidTransition);
    await tx.securityDepositSettlement.update({
      where: { id: settlementId },
      data: { status: "CANCELLED", cancelledByUserId: user.id, cancelledAt: new Date(), cancelReason: reason },
    });
    await auditAction(tx, {
      action: "CANCEL",
      entityType: "SecurityDepositSettlement",
      entityId: settlementId,
      entityDisplayName: settlement.settlementNumber,
      previousValues: { status: settlement.status },
      newValues: { status: "CANCELLED", cancelReason: reason },
    });
  });
  revalidatePath(`/operations/settlements/${settlementId}`);
}

// ---------------------------------------------------------------------------
// Liability assessment (Steps 9-17, 40-45)
// ---------------------------------------------------------------------------

const assessmentSchema = z.object({
  settlementId: z.string().min(1),
  sourceType: z.enum(["INSPECTION_ITEM", "INVENTORY_ITEM", "KEY_ITEM", "MAINTENANCE_REQUEST", "OTHER"]),
  moveOutInspectionItemId: z.string().optional(),
  moveOutInventoryItemId: z.string().optional(),
  moveOutKeyItemId: z.string().optional(),
  maintenanceRequestId: z.string().optional(),
  description: z.string().min(1),
  category: z.enum(["DAMAGE", "MISSING_INVENTORY", "MISSING_KEY_OR_ACCESS_DEVICE", "CLEANING", "MAINTENANCE", "OTHER_CONTRACTUAL_CHARGE", "OTHER"]),
  responsibility: z.enum(["TENANT", "OWNER", "PROPERTY_MANAGEMENT", "VENDOR", "WARRANTY", "UNDETERMINED", "NO_CHARGE", "OTHER"]).default("UNDETERMINED"),
  assessmentReason: z.string().optional(),
  proposedAmount: z.coerce.number().min(0).default(0),
});

/** Step 40/41/45 - an authorized human deliberately adds an assessment; never auto-generated from a finding. Works both for Move-Out-evidenced (sourceType != OTHER, exactly one of the four *Id fields set) and manual (sourceType = OTHER, none set) entries. */
export async function addLiabilityAssessment(formData: FormData) {
  const { organizationId } = await requirePermission("securityDeposit.assess");
  const { user } = await requireSession();
  const t = getDictionary(await getLocale());
  const parsed = assessmentSchema.parse(Object.fromEntries(formData));

  await prisma.$transaction(async (tx) => {
    const settlement = await tx.securityDepositSettlement.findUniqueOrThrow({ where: { id: parsed.settlementId, organizationId } });
    if (!isSettlementEditable(settlement.status)) throw new Error(t.validation.settlementNotEditable);

    // Never trust an evidence id without re-verifying it belongs to this
    // settlement's own MoveOut, same-organization (Step 82/83 - relation
    // injection defense).
    if (parsed.sourceType === "INSPECTION_ITEM" && parsed.moveOutInspectionItemId) {
      await tx.moveOutInspectionItem.findUniqueOrThrow({ where: { id: parsed.moveOutInspectionItemId, organizationId, moveOutId: settlement.moveOutId } });
    }
    if (parsed.sourceType === "INVENTORY_ITEM" && parsed.moveOutInventoryItemId) {
      await tx.moveOutInventoryItem.findUniqueOrThrow({ where: { id: parsed.moveOutInventoryItemId, organizationId, moveOutId: settlement.moveOutId } });
    }
    if (parsed.sourceType === "KEY_ITEM" && parsed.moveOutKeyItemId) {
      await tx.moveOutKeyItem.findUniqueOrThrow({ where: { id: parsed.moveOutKeyItemId, organizationId, moveOutId: settlement.moveOutId } });
    }
    if (parsed.sourceType === "MAINTENANCE_REQUEST" && parsed.maintenanceRequestId) {
      await tx.maintenanceRequest.findUniqueOrThrow({ where: { id: parsed.maintenanceRequestId, organizationId, moveOutId: settlement.moveOutId } });
    }

    const validation = validateAssessmentAmounts({ responsibility: parsed.responsibility, proposedAmount: parsed.proposedAmount, approvedAmount: null, waivedAmount: 0 });
    if (!validation.valid) throw new Error(t.validation.settlementNegativeAmount);

    const created = await tx.moveOutLiabilityAssessment.create({
      data: {
        organizationId,
        settlementId: parsed.settlementId,
        sourceType: parsed.sourceType,
        moveOutInspectionItemId: parsed.sourceType === "INSPECTION_ITEM" ? parsed.moveOutInspectionItemId ?? null : null,
        moveOutInventoryItemId: parsed.sourceType === "INVENTORY_ITEM" ? parsed.moveOutInventoryItemId ?? null : null,
        moveOutKeyItemId: parsed.sourceType === "KEY_ITEM" ? parsed.moveOutKeyItemId ?? null : null,
        maintenanceRequestId: parsed.sourceType === "MAINTENANCE_REQUEST" ? parsed.maintenanceRequestId ?? null : null,
        description: parsed.description,
        category: parsed.category,
        responsibility: parsed.responsibility,
        assessmentReason: parsed.assessmentReason,
        proposedAmount: parsed.proposedAmount,
        assessedByUserId: user.id,
      },
    });

    await auditCreate(tx, {
      entityType: "MoveOutLiabilityAssessment",
      entityId: created.id,
      entityDisplayName: parsed.description,
      newValues: { settlementId: parsed.settlementId, category: parsed.category, responsibility: parsed.responsibility, proposedAmount: parsed.proposedAmount },
    });
  });

  revalidatePath(`/operations/settlements/${parsed.settlementId}`);
}

const updateAssessmentSchema = z.object({
  assessmentId: z.string().min(1),
  responsibility: z.enum(["TENANT", "OWNER", "PROPERTY_MANAGEMENT", "VENDOR", "WARRANTY", "UNDETERMINED", "NO_CHARGE", "OTHER"]),
  proposedAmount: z.coerce.number().min(0),
  approvedAmount: z.coerce.number().min(0).optional(),
  waivedAmount: z.coerce.number().min(0).default(0),
  waiverReason: z.string().optional(),
  assessmentReason: z.string().optional(),
});

/** Step 15/16/42 - the preparer/reviewer's explicit decision on this one assessment. approvedAmount is never silently derived from proposedAmount, and never itself overwrites proposedAmount. */
export async function updateLiabilityAssessment(formData: FormData) {
  const { organizationId } = await requirePermission("securityDeposit.assess");
  const t = getDictionary(await getLocale());
  const parsed = updateAssessmentSchema.parse(Object.fromEntries(formData));

  const settlementId = await prisma.$transaction(async (tx) => {
    const assessment = await tx.moveOutLiabilityAssessment.findUniqueOrThrow({ where: { id: parsed.assessmentId, organizationId }, include: { settlement: true } });
    if (!isSettlementEditable(assessment.settlement.status)) throw new Error(t.validation.settlementNotEditable);

    const approvedAmount = parsed.approvedAmount === undefined ? null : parsed.approvedAmount;
    const validation = validateAssessmentAmounts({ responsibility: parsed.responsibility, proposedAmount: parsed.proposedAmount, approvedAmount, waivedAmount: parsed.waivedAmount });
    if (!validation.valid) {
      if (validation.errors.includes("NON_TENANT_RESPONSIBILITY_CANNOT_HAVE_APPROVED_AMOUNT")) throw new Error(t.validation.settlementNonTenantCannotHaveApprovedAmount);
      if (validation.errors.includes("APPROVED_PLUS_WAIVED_EXCEEDS_PROPOSED")) throw new Error(t.validation.settlementApprovedPlusWaivedExceedsProposed);
      throw new Error(t.validation.settlementNegativeAmount);
    }

    await tx.moveOutLiabilityAssessment.update({
      where: { id: parsed.assessmentId },
      data: {
        responsibility: parsed.responsibility,
        proposedAmount: parsed.proposedAmount,
        approvedAmount,
        waivedAmount: parsed.waivedAmount,
        waiverReason: parsed.waiverReason,
        assessmentReason: parsed.assessmentReason,
      },
    });

    await auditAction(tx, {
      action: "UPDATE",
      entityType: "MoveOutLiabilityAssessment",
      entityId: parsed.assessmentId,
      entityDisplayName: assessment.description,
      previousValues: { responsibility: assessment.responsibility, proposedAmount: assessment.proposedAmount.toString(), approvedAmount: assessment.approvedAmount?.toString() ?? null },
      newValues: { responsibility: parsed.responsibility, proposedAmount: parsed.proposedAmount, approvedAmount },
    });

    return assessment.settlementId;
  });

  revalidatePath(`/operations/settlements/${settlementId}`);
}

const disputeSchema = z.object({
  assessmentId: z.string().min(1),
  disputeStatus: z.enum(["NONE", "RAISED", "UNDER_REVIEW", "RESOLVED"]),
  disputeNote: z.string().optional(),
});

/** Step 17/98 - dispute tracking only. Never itself creates or changes any accounting entry. */
export async function updateAssessmentDispute(formData: FormData) {
  const { organizationId } = await requirePermission("securityDeposit.dispute.manage");
  const t = getDictionary(await getLocale());
  const parsed = disputeSchema.parse(Object.fromEntries(formData));

  const settlementId = await prisma.$transaction(async (tx) => {
    const assessment = await tx.moveOutLiabilityAssessment.findUniqueOrThrow({ where: { id: parsed.assessmentId, organizationId }, include: { settlement: true } });
    if (!isSettlementEditable(assessment.settlement.status)) throw new Error(t.validation.settlementNotEditable);

    await tx.moveOutLiabilityAssessment.update({
      where: { id: parsed.assessmentId },
      data: { disputeStatus: parsed.disputeStatus as SettlementDisputeStatus, disputeNote: parsed.disputeNote },
    });
    await auditAction(tx, {
      action: "UPDATE",
      entityType: "MoveOutLiabilityAssessment",
      entityId: parsed.assessmentId,
      entityDisplayName: assessment.description,
      previousValues: { disputeStatus: assessment.disputeStatus },
      newValues: { disputeStatus: parsed.disputeStatus },
    });
    return assessment.settlementId;
  });

  revalidatePath(`/operations/settlements/${settlementId}`);
}

// ---------------------------------------------------------------------------
// Notes (Step 80) - append-only, separate from AuditLog.
// ---------------------------------------------------------------------------

export async function addSettlementNote(formData: FormData) {
  const settlementId = String(formData.get("settlementId"));
  const { organizationId } = await requirePermission("securityDeposit.view");
  const { user } = await requireSession();
  const note = String(formData.get("note") ?? "").trim();
  if (!note) return;

  await prisma.securityDepositSettlement.findUniqueOrThrow({ where: { id: settlementId, organizationId } });
  await prisma.securityDepositSettlementNote.create({
    data: { organizationId, settlementId, authorUserId: user.id, note },
  });
  revalidatePath(`/operations/settlements/${settlementId}`);
}

// ---------------------------------------------------------------------------
// Posting (Steps 25, 32-33, 51-52, 57) - idempotent, Serializable.
// ---------------------------------------------------------------------------

/**
 * APPROVED -> POSTED (or SETTLED directly, if there's nothing left to
 * refund/collect). Re-validates status fresh inside the transaction (Step
 * 52 - idempotent: calling this again once already POSTED/beyond simply
 * returns without creating a second set of movements). Reuses the exact
 * approved* snapshot from approveSettlement() - never recalculates a new
 * outcome at posting time.
 */
export async function postSecurityDepositSettlement(settlementId: string): Promise<string> {
  const { organizationId } = await requirePermissionAudited("securityDeposit.post", "SecurityDepositSettlement", settlementId);
  const { user } = await requireSession();
  const t = getDictionary(await getLocale());
  const locale = await getLocale();

  const result = await prisma.$transaction(
    async (tx) => {
      const settlement = await tx.securityDepositSettlement.findUniqueOrThrow({ where: { id: settlementId, organizationId } });

      // Idempotent - a repeat call after posting is a safe no-op, and must
      // never re-enqueue a second notification for the same posting.
      if (settlement.status === "POSTED" || settlement.status === "PARTIALLY_SETTLED" || settlement.status === "SETTLED") {
        return { id: settlement.id, posted: false, refundDue: null as null | typeof settlement.approvedRefundDue, additionalDue: null as null | typeof settlement.approvedAdditionalDue };
      }
      if (settlement.status !== "APPROVED") {
        throw new Error(t.validation.settlementNotApproved);
      }
      if (settlement.approvedDepositApplied === null || settlement.approvedRefundDue === null || settlement.approvedAdditionalDue === null) {
        throw new Error(t.validation.settlementNotApproved);
      }

      const depositApplied = settlement.approvedDepositApplied;
      const refundDue = settlement.approvedRefundDue;
      const additionalDue = settlement.approvedAdditionalDue;

      if (depositApplied.greaterThan(0)) {
        const { debit, credit } = ledgerEntryDebitCredit("APPLICATION", depositApplied);
        await tx.securityDepositLedgerEntry.create({
          data: {
            organizationId,
            contractId: settlement.contractId,
            settlementId: settlement.id,
            entryType: "APPLICATION",
            debit,
            credit,
            description: `Deposit applied to approved deductions - ${settlement.settlementNumber}`,
            createdBy: user.id,
          },
        });
      }

      if (additionalDue.greaterThan(0)) {
        await issueInvoice(
          {
            organizationId,
            renterId: settlement.renterId,
            contractId: settlement.contractId,
            settlementId: settlement.id,
            lines: [
              {
                description: `Move-Out Settlement - Additional Amount Due (${settlement.settlementNumber})`,
                descriptionAr: `تسوية الإخلاء - مبلغ إضافي مستحق (${settlement.settlementNumber})`,
                quantity: 1,
                unitPrice: additionalDue.toNumber(),
                // Tax-neutral (Step 23) - a settlement receivable is
                // compensation, not itself a proven taxable supply; treated
                // as 0% pending an explicit future tax-policy decision, same
                // reasoning issueInvoiceForSchedule() already applies to the
                // deposit collection line itself.
                vatRate: 0,
                kind: "OTHER",
              },
            ],
          },
          tx
        );
      }

      const newStatus = computeSettlementCompletionStatus(refundDue, 0);
      await tx.securityDepositSettlement.update({
        where: { id: settlementId },
        data: {
          status: newStatus,
          postedByUserId: user.id,
          postedAt: new Date(),
          settledAt: newStatus === "SETTLED" ? new Date() : null,
        },
      });

      await auditAction(tx, {
        action: "UPDATE",
        entityType: "SecurityDepositSettlement",
        entityId: settlementId,
        entityDisplayName: settlement.settlementNumber,
        previousValues: { status: "APPROVED" },
        newValues: { status: newStatus, depositApplied: depositApplied.toString(), refundDue: refundDue.toString(), additionalDue: additionalDue.toString() },
      });

      const [renter, unit] = await Promise.all([
        tx.renter.findUnique({ where: { id: settlement.renterId } }),
        tx.unit.findUnique({ where: { id: settlement.unitId } }),
      ]);
      if (renter) {
        // Durable intent, same transaction as the settlement posting above
        // (Critical Principle 1) - see docs/AUTOMATION-SCHEDULED-JOBS.md.
        await emitCommunicationEventTx(tx, {
          organizationId,
          eventType: "SECURITY_DEPOSIT_SETTLEMENT_POSTED",
          eventKey: securityDepositSettlementPostedKey(settlement.id),
          businessEntityType: "SecurityDepositSettlement",
          businessEntityId: settlement.id,
          language: resolveNotificationLanguage(locale),
          variables: {
            settlementNumber: settlement.settlementNumber,
            refundDue: refundDue.toString(),
            additionalDue: additionalDue.toString(),
            currency: "SAR",
            unitNumber: unit?.unitNumber ?? "",
          },
          recipients: [buildRenterRecipient(renter)],
        });
      }

      return { id: settlement.id, posted: true, refundDue, additionalDue };
    },
    { isolationLevel: "Serializable" }
  );

  revalidatePath(`/operations/settlements/${settlementId}`);
  return result.id;
}

// ---------------------------------------------------------------------------
// Refund (Steps 30-31, 54-56, 99)
// ---------------------------------------------------------------------------

const refundSchema = z.object({
  settlementId: z.string().min(1),
  amount: z.coerce.number().positive(),
  method: z.enum(["CASH", "BANK_TRANSFER", "CHEQUE", "CARD", "ONLINE"]).optional(),
  referenceNumber: z.string().optional(),
  notes: z.string().optional(),
});

/**
 * Step 55 - records an already-executed refund payment. Recomputes
 * refundPaid fresh from existing PAID refunds inside this same Serializable
 * transaction and re-validates the requested amount against the remaining
 * balance immediately before inserting, so two concurrent submissions can
 * never together over-refund (Step 56/AV/AW).
 */
export async function recordSecurityDepositRefund(formData: FormData): Promise<string> {
  const parsed = refundSchema.parse(Object.fromEntries(formData));
  const { organizationId } = await requirePermissionAudited("securityDeposit.refund.manage", "SecurityDepositSettlement", parsed.settlementId);
  const { user } = await requireSession();
  const t = getDictionary(await getLocale());
  const locale = await getLocale();

  const refundId = await prisma.$transaction(
    async (tx) => {
      const settlement = await tx.securityDepositSettlement.findUniqueOrThrow({ where: { id: parsed.settlementId, organizationId } });
      if (settlement.status !== "POSTED" && settlement.status !== "PARTIALLY_SETTLED") {
        throw new Error(t.validation.settlementAlreadyPosted);
      }
      if (settlement.approvedRefundDue === null) throw new Error(t.validation.settlementNotApproved);

      const existingRefunds = await tx.securityDepositRefund.findMany({ where: { organizationId, settlementId: parsed.settlementId, status: "PAID" }, select: { amount: true } });
      const refundPaidSoFar = existingRefunds.reduce((sum, r) => sum.plus(r.amount), new Prisma.Decimal(0));

      if (!isRefundAmountAllowed(parsed.amount, settlement.approvedRefundDue, refundPaidSoFar)) {
        throw new Error(t.validation.settlementRefundExceedsRemaining);
      }

      const refund = await tx.securityDepositRefund.create({
        data: {
          organizationId,
          settlementId: parsed.settlementId,
          amount: parsed.amount,
          status: "PAID",
          method: parsed.method as PaymentMethod | undefined,
          referenceNumber: parsed.referenceNumber,
          notes: parsed.notes,
          paidAt: new Date(),
          createdBy: user.id,
        },
      });

      const { debit, credit } = ledgerEntryDebitCredit("REFUND", parsed.amount);
      await tx.securityDepositLedgerEntry.create({
        data: {
          organizationId,
          contractId: settlement.contractId,
          settlementId: settlement.id,
          refundId: refund.id,
          entryType: "REFUND",
          debit,
          credit,
          description: `Security deposit refund paid - ${settlement.settlementNumber}`,
          createdBy: user.id,
        },
      });

      const newRefundPaid = refundPaidSoFar.plus(parsed.amount);
      const newStatus = computeSettlementCompletionStatus(settlement.approvedRefundDue, newRefundPaid);
      await tx.securityDepositSettlement.update({
        where: { id: parsed.settlementId },
        data: { status: newStatus, settledAt: newStatus === "SETTLED" ? new Date() : null },
      });

      await auditCreate(tx, {
        entityType: "SecurityDepositRefund",
        entityId: refund.id,
        entityDisplayName: settlement.settlementNumber,
        newValues: { amount: parsed.amount, settlementId: parsed.settlementId, newStatus },
      });

      const [renter, unit] = await Promise.all([
        tx.renter.findUnique({ where: { id: settlement.renterId } }),
        tx.unit.findUnique({ where: { id: settlement.unitId } }),
      ]);
      if (renter) {
        // Durable intent, same transaction as the refund creation above
        // (Critical Principle 1) - see docs/AUTOMATION-SCHEDULED-JOBS.md.
        await emitCommunicationEventTx(tx, {
          organizationId,
          eventType: "SECURITY_DEPOSIT_REFUND_RECORDED",
          eventKey: securityDepositRefundRecordedKey(refund.id),
          businessEntityType: "SecurityDepositRefund",
          businessEntityId: refund.id,
          language: resolveNotificationLanguage(locale),
          variables: {
            settlementNumber: settlement.settlementNumber,
            refundAmount: parsed.amount.toString(),
            currency: "SAR",
            method: parsed.method ?? "",
            unitNumber: unit?.unitNumber ?? "",
          },
          recipients: [buildRenterRecipient(renter)],
        });
      }

      return refund.id;
    },
    { isolationLevel: "Serializable" }
  );

  revalidatePath(`/operations/settlements/${parsed.settlementId}`);
  return refundId;
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

export async function getSecurityDepositSettlementById(id: string) {
  const { organizationId } = await requirePermission("securityDeposit.view");
  const settlement = await prisma.securityDepositSettlement.findUniqueOrThrow({ where: { id, organizationId }, include: FULL_SETTLEMENT_INCLUDE });

  const ledgerEntries = await prisma.securityDepositLedgerEntry.findMany({ where: { organizationId, contractId: settlement.contractId }, select: { debit: true, credit: true } });
  const liveAvailableDeposit = computeAvailableDepositBalance(ledgerEntries);
  const requiredDeposit = settlement.contract.securityDeposit ?? new Prisma.Decimal(0);

  const proposedTenantAmount = sumProposedTenantAmount(settlement.liabilityAssessments);
  const approvedTenantAmountLive = sumApprovedTenantDeductions(settlement.liabilityAssessments);
  const waivedTenantAmount = sumWaivedTenantAmount(settlement.liabilityAssessments);
  const approvalBlockers = getApprovalBlockers(settlement.liabilityAssessments);

  const liveOutcome = computeSettlementOutcome(liveAvailableDeposit, approvedTenantAmountLive);

  const refundPaid = settlement.refunds.filter((r) => r.status === "PAID").reduce((sum, r) => sum.plus(r.amount), new Prisma.Decimal(0));
  const refundDue = settlement.approvedRefundDue ?? liveOutcome.refundDue;
  const refundRemaining = computeRefundRemaining(refundDue, refundPaid);

  return {
    settlement,
    requiredDeposit,
    availableDeposit: liveAvailableDeposit,
    proposedTenantAmount,
    approvedTenantAmountLive,
    waivedTenantAmount,
    approvalBlockers,
    liveOutcome,
    refundPaid,
    refundRemaining,
  };
}

export async function getSettlementForMoveOut(moveOutId: string) {
  const { organizationId } = await requirePermission("securityDeposit.view");
  return prisma.securityDepositSettlement.findFirst({
    where: { organizationId, moveOutId },
    select: { id: true, settlementNumber: true, status: true },
  });
}

export async function getSettlementForContract(contractId: string) {
  const { organizationId } = await requirePermission("securityDeposit.view");
  return prisma.securityDepositSettlement.findFirst({
    where: { organizationId, contractId },
    orderBy: { createdAt: "desc" },
    select: { id: true, settlementNumber: true, status: true },
  });
}

export interface SettlementListFilters {
  search?: string;
  status?: string;
  disputedOnly?: boolean;
  page?: number;
}

export async function listSecurityDepositSettlements(filters: SettlementListFilters = {}) {
  const { organizationId } = await requirePermission("securityDeposit.view");
  const page = Math.max(1, filters.page ?? 1);

  const where: Prisma.SecurityDepositSettlementWhereInput = {
    organizationId,
    ...(filters.status ? { status: filters.status as never } : {}),
    ...(filters.search
      ? {
          OR: [
            { settlementNumber: { contains: filters.search, mode: "insensitive" } },
            { contract: { contractNumber: { contains: filters.search, mode: "insensitive" } } },
            { renter: { fullName: { contains: filters.search, mode: "insensitive" } } },
            { unit: { unitNumber: { contains: filters.search, mode: "insensitive" } } },
          ],
        }
      : {}),
    ...(filters.disputedOnly ? { liabilityAssessments: { some: { disputeStatus: { in: ["RAISED", "UNDER_REVIEW"] } } } } : {}),
  };

  const [rows, total] = await Promise.all([
    prisma.securityDepositSettlement.findMany({
      where,
      include: {
        contract: { select: { contractNumber: true } },
        unit: { select: { unitNumber: true } },
        renter: { select: { fullName: true, fullNameAr: true } },
        moveOut: { select: { moveOutNumber: true } },
      },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    prisma.securityDepositSettlement.count({ where }),
  ]);

  return { rows, page, totalPages: Math.max(1, Math.ceil(total / PAGE_SIZE)) };
}

/** Step 72 - bounded aggregates only, mirroring getMoveOutDashboardKpis()'s own Promise.all pattern exactly. */
export async function getSecurityDepositDashboardKpis() {
  const { organizationId } = await requirePermission("securityDeposit.view");

  const [pendingReview, pendingApproval, approvedNotPosted, disputedSettlements, postedAndPartial] = await Promise.all([
    prisma.securityDepositSettlement.count({ where: { organizationId, status: "UNDER_REVIEW" } }),
    prisma.securityDepositSettlement.count({ where: { organizationId, status: "PENDING_APPROVAL" } }),
    prisma.securityDepositSettlement.count({ where: { organizationId, status: "APPROVED" } }),
    prisma.securityDepositSettlement.count({ where: { organizationId, liabilityAssessments: { some: { disputeStatus: { in: ["RAISED", "UNDER_REVIEW"] } } } } }),
    prisma.securityDepositSettlement.findMany({
      where: { organizationId, status: { in: ["POSTED", "PARTIALLY_SETTLED"] } },
      select: { approvedRefundDue: true, approvedAdditionalDue: true, refunds: { where: { status: "PAID" }, select: { amount: true } } },
    }),
  ]);

  let refundsDueCount = 0;
  let refundAmountOutstanding = new Prisma.Decimal(0);
  let additionalTenantAmountDue = new Prisma.Decimal(0);
  for (const s of postedAndPartial) {
    const due = s.approvedRefundDue ?? new Prisma.Decimal(0);
    const paid = s.refunds.reduce((sum, r) => sum.plus(r.amount), new Prisma.Decimal(0));
    const remaining = computeRefundRemaining(due, paid);
    if (remaining.greaterThan(0)) {
      refundsDueCount += 1;
      refundAmountOutstanding = refundAmountOutstanding.plus(remaining);
    }
    additionalTenantAmountDue = additionalTenantAmountDue.plus(s.approvedAdditionalDue ?? 0);
  }

  return {
    pendingReview,
    pendingApproval,
    approvedNotPosted,
    disputedSettlements,
    refundsDueCount,
    refundAmountOutstanding,
    additionalTenantAmountDue,
  };
}

export type { SettlementResponsibility, SettlementDeductionCategory, AssessmentSourceType };
