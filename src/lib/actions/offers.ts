"use server";

import { z } from "zod";
import type { OfferStatus, Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requirePermission, requireSession } from "@/lib/session";
import { getLocale, getDictionary } from "@/lib/i18n";
import { auditCreate, auditUpdate, auditAction, requirePermissionAudited } from "@/lib/audit";
import { nextCounterValue, formatOfferNumber } from "@/lib/numbering";
import { computeOfferPricing } from "@/lib/crm/offer-pricing";
import { isValidOfferTransition, canEditOfferInPlace, canReviseOffer, canApproveDiscount, leadStatusAfterOfferRejection } from "@/lib/crm/offer-rules";

const PAGE_SIZE = 25;

/** Leads in these statuses cannot have a new Offer created - a converted or dead lead has nothing left to propose to (Step 10). Mirrors LEAD_STATUSES_BLOCKED_FOR_VIEWING in viewings.ts. */
const LEAD_STATUSES_BLOCKED_FOR_OFFER = new Set(["LOST", "ARCHIVED"]);

/** Offer creation only advances the Lead from these two states into OFFER_PENDING (Step 18) - a Lead already further along (NEGOTIATION/OFFER_PENDING from a prior offer) is left alone, never regressed. */
const LEAD_STATUSES_ELIGIBLE_FOR_OFFER_PENDING = new Set(["QUALIFIED", "VIEWING_COMPLETED"]);

const PAYMENT_FREQUENCY_VALUES = ["MONTHLY", "QUARTERLY", "SEMI_ANNUAL", "ANNUAL", "ONE_TIME"] as const;
const FURNISHED_STATUS_VALUES = ["FURNISHED", "SEMI_FURNISHED", "UNFURNISHED", "FLEXIBLE"] as const;
const OFFER_REJECT_REASON_VALUES = ["PRICE", "PAYMENT_TERMS", "UNIT", "LOCATION", "TIMING", "COMPETITOR", "CUSTOMER_CANCELLED", "OTHER"] as const;

/**
 * Lazily persists expiry (Step 26) - no cron job. Called at the top of every
 * read path (listOffers/getOfferById/dashboard). A plain, idempotent
 * UPDATE ... WHERE, not an individually audited user action - see
 * docs/LEASING-OFFERS.md, "Expiry".
 */
export async function syncExpiredOffers(organizationId: string): Promise<void> {
  await prisma.leasingOffer.updateMany({
    where: { organizationId, status: { in: ["SENT", "UNDER_NEGOTIATION", "APPROVED"] }, validUntil: { lt: new Date() } },
    data: { status: "EXPIRED", expiredAt: new Date() },
  });
}

function offerFormSchema() {
  return z.object({
    leadId: z.string().min(1),
    viewingId: z.string().optional(),
    unitId: z.string().min(1),
    assignedToUserId: z.string().optional(),
    validFrom: z.coerce.date(),
    validUntil: z.coerce.date(),
    annualRent: z.coerce.number().min(0),
    discountAmount: z.coerce.number().min(0).optional(),
    discountPercentage: z.coerce.number().min(0).max(100).optional(),
    securityDeposit: z.coerce.number().min(0),
    contractFee: z.coerce.number().min(0).optional(),
    leasingCommissionAmount: z.coerce.number().min(0).optional(),
    leasingCommissionRate: z.coerce.number().min(0).optional(),
    commissionVatRate: z.coerce.number().min(0).optional(),
    paymentFrequency: z.enum(PAYMENT_FREQUENCY_VALUES),
    leaseStartDate: z.coerce.date().optional(),
    leaseDurationMonths: z.coerce.number().int().min(1).optional(),
    furnishedStatus: z.enum(FURNISHED_STATUS_VALUES),
    specialTerms: z.string().optional(),
    internalNotes: z.string().optional(),
  });
}

function parseOfferForm(formData: FormData) {
  return offerFormSchema().parse({
    leadId: formData.get("leadId"),
    viewingId: formData.get("viewingId") || undefined,
    unitId: formData.get("unitId"),
    assignedToUserId: formData.get("assignedToUserId") || undefined,
    validFrom: formData.get("validFrom"),
    validUntil: formData.get("validUntil"),
    annualRent: formData.get("annualRent"),
    discountAmount: formData.get("discountAmount") || undefined,
    discountPercentage: formData.get("discountPercentage") || undefined,
    securityDeposit: formData.get("securityDeposit"),
    contractFee: formData.get("contractFee") || undefined,
    leasingCommissionAmount: formData.get("leasingCommissionAmount") || undefined,
    leasingCommissionRate: formData.get("leasingCommissionRate") || undefined,
    commissionVatRate: formData.get("commissionVatRate") || undefined,
    paymentFrequency: formData.get("paymentFrequency") || "ANNUAL",
    leaseStartDate: formData.get("leaseStartDate") || undefined,
    leaseDurationMonths: formData.get("leaseDurationMonths") || undefined,
    furnishedStatus: formData.get("furnishedStatus") || "UNFURNISHED",
    specialTerms: formData.get("specialTerms") || undefined,
    internalNotes: formData.get("internalNotes") || undefined,
  });
}

type ParsedOfferForm = ReturnType<typeof parseOfferForm>;

function pricingFromParsed(parsed: ParsedOfferForm) {
  return computeOfferPricing({
    annualRent: parsed.annualRent,
    discountAmount: parsed.discountAmount,
    discountPercentage: parsed.discountPercentage,
    commissionAmount: parsed.leasingCommissionAmount,
    commissionRate: parsed.leasingCommissionRate,
    commissionVatRate: parsed.commissionVatRate,
    securityDeposit: parsed.securityDeposit,
    contractFee: parsed.contractFee,
    paymentFrequency: parsed.paymentFrequency,
  });
}

export async function createOffer(formData: FormData) {
  const { organizationId } = await requirePermission("offer.create");
  const { user } = await requireSession();
  const t = getDictionary(await getLocale());
  const parsed = parseOfferForm(formData);

  if (parsed.validUntil <= parsed.validFrom) {
    throw new Error(t.validation.offerValidUntilAfterFrom);
  }

  const lead = await prisma.lead.findUniqueOrThrow({ where: { id: parsed.leadId, organizationId } });
  if (LEAD_STATUSES_BLOCKED_FOR_OFFER.has(lead.status)) {
    throw new Error(t.validation.offerLeadNotEligible);
  }

  const unit = await prisma.unit.findUniqueOrThrow({ where: { id: parsed.unitId, organizationId } });
  if (unit.status !== "VACANT") {
    throw new Error(t.validation.offerUnitNotEligible);
  }

  if (parsed.viewingId) {
    const viewing = await prisma.viewing.findUniqueOrThrow({ where: { id: parsed.viewingId, organizationId } });
    if (viewing.leadId !== parsed.leadId) {
      throw new Error(t.validation.offerViewingMismatch);
    }
  }

  if (parsed.assignedToUserId) {
    await prisma.user.findUniqueOrThrow({ where: { id: parsed.assignedToUserId, organizationId } });
  }

  const pricing = pricingFromParsed(parsed);

  const offerId = await prisma.$transaction(async (tx) => {
    const seq = await nextCounterValue(tx, organizationId, "offer");
    const offerNumber = formatOfferNumber(seq);

    const offer = await tx.leasingOffer.create({
      data: {
        organizationId,
        offerNumber,
        versionNumber: 1,
        leadId: parsed.leadId,
        viewingId: parsed.viewingId,
        unitId: parsed.unitId,
        assignedToUserId: parsed.assignedToUserId,
        validFrom: parsed.validFrom,
        validUntil: parsed.validUntil,
        annualRent: pricing.grossAnnualRent,
        discountAmount: pricing.discountAmount,
        discountPercentage: pricing.discountPercentage,
        netAnnualRent: pricing.netAnnualRent,
        securityDeposit: pricing.securityDeposit,
        contractFee: pricing.contractFee,
        leasingCommissionAmount: pricing.leasingCommissionAmount,
        leasingCommissionRate: parsed.leasingCommissionRate,
        commissionVatRate: pricing.commissionVatRate,
        commissionVatAmount: pricing.commissionVatAmount,
        totalInitialPayment: pricing.initialPaymentTotal,
        paymentFrequency: parsed.paymentFrequency,
        leaseStartDate: parsed.leaseStartDate,
        leaseDurationMonths: parsed.leaseDurationMonths ?? 12,
        furnishedStatus: parsed.furnishedStatus,
        specialTerms: parsed.specialTerms,
        internalNotes: parsed.internalNotes,
        createdByUserId: user.id,
      },
    });

    await auditCreate(tx, {
      entityType: "LeasingOffer",
      entityId: offer.id,
      entityDisplayName: offer.offerNumber,
      newValues: {
        leadId: parsed.leadId,
        unitId: parsed.unitId,
        viewingId: parsed.viewingId,
        annualRent: pricing.grossAnnualRent,
        netAnnualRent: pricing.netAnnualRent,
        discountPercentage: pricing.discountPercentage,
      },
    });

    if (lead.status !== "WON" && LEAD_STATUSES_ELIGIBLE_FOR_OFFER_PENDING.has(lead.status)) {
      await tx.lead.update({ where: { id: parsed.leadId }, data: { status: "OFFER_PENDING" } });
    }

    await tx.leadActivity.create({
      data: {
        organizationId,
        leadId: parsed.leadId,
        activityType: "STATUS_CHANGE",
        subject: t.offer.activityCreated(offerNumber, pricing.netAnnualRent),
        createdByUserId: user.id,
      },
    });

    return offer.id;
  });

  revalidatePath("/crm/offers");
  revalidatePath(`/crm/leads/${parsed.leadId}`);
  if (parsed.viewingId) revalidatePath(`/crm/viewings/${parsed.viewingId}`);
  revalidatePath("/crm");
  return offerId;
}

/** DRAFT-only in-place edit (Step 11) - any other status must go through reviseOffer() instead. */
export async function updateOfferDraft(formData: FormData) {
  const offerId = z.string().min(1).parse(formData.get("offerId"));
  const { organizationId } = await requirePermissionAudited("offer.update", "LeasingOffer", offerId);
  const t = getDictionary(await getLocale());
  const parsed = parseOfferForm(formData);

  if (parsed.validUntil <= parsed.validFrom) {
    throw new Error(t.validation.offerValidUntilAfterFrom);
  }

  const existing = await prisma.leasingOffer.findUniqueOrThrow({ where: { id: offerId, organizationId } });
  if (!canEditOfferInPlace(existing.status)) {
    throw new Error(t.validation.offerCannotEditNonDraft);
  }

  if (parsed.unitId !== existing.unitId) {
    const unit = await prisma.unit.findUniqueOrThrow({ where: { id: parsed.unitId, organizationId } });
    if (unit.status !== "VACANT") {
      throw new Error(t.validation.offerUnitNotEligible);
    }
  }
  if (parsed.assignedToUserId) {
    await prisma.user.findUniqueOrThrow({ where: { id: parsed.assignedToUserId, organizationId } });
  }

  const pricing = pricingFromParsed(parsed);

  await prisma.$transaction(async (tx) => {
    const updated = await tx.leasingOffer.update({
      where: { id: offerId, organizationId },
      data: {
        unitId: parsed.unitId,
        assignedToUserId: parsed.assignedToUserId,
        validFrom: parsed.validFrom,
        validUntil: parsed.validUntil,
        annualRent: pricing.grossAnnualRent,
        discountAmount: pricing.discountAmount,
        discountPercentage: pricing.discountPercentage,
        netAnnualRent: pricing.netAnnualRent,
        securityDeposit: pricing.securityDeposit,
        contractFee: pricing.contractFee,
        leasingCommissionAmount: pricing.leasingCommissionAmount,
        leasingCommissionRate: parsed.leasingCommissionRate,
        commissionVatRate: pricing.commissionVatRate,
        commissionVatAmount: pricing.commissionVatAmount,
        totalInitialPayment: pricing.initialPaymentTotal,
        paymentFrequency: parsed.paymentFrequency,
        leaseStartDate: parsed.leaseStartDate,
        leaseDurationMonths: parsed.leaseDurationMonths ?? existing.leaseDurationMonths,
        furnishedStatus: parsed.furnishedStatus,
        specialTerms: parsed.specialTerms,
        internalNotes: parsed.internalNotes,
      },
    });
    await auditUpdate(tx, { entityType: "LeasingOffer", entityId: updated.id, entityDisplayName: updated.offerNumber, before: existing, after: updated });
  });

  revalidatePath("/crm/offers");
  revalidatePath(`/crm/offers/${offerId}`);
}

export async function submitOfferForApproval(offerId: string) {
  const { organizationId } = await requirePermissionAudited("offer.submit", "LeasingOffer", offerId);
  const t = getDictionary(await getLocale());

  await prisma.$transaction(async (tx) => {
    const existing = await tx.leasingOffer.findUniqueOrThrow({ where: { id: offerId, organizationId } });
    if (!isValidOfferTransition(existing.status, "PENDING_APPROVAL")) {
      throw new Error(t.validation.offerInvalidTransition);
    }
    const updated = await tx.leasingOffer.update({ where: { id: offerId, organizationId }, data: { status: "PENDING_APPROVAL", approvalStatus: "PENDING" } });
    await auditAction(tx, {
      action: "UPDATE",
      entityType: "LeasingOffer",
      entityId: updated.id,
      entityDisplayName: updated.offerNumber,
      previousValues: { status: existing.status, approvalStatus: existing.approvalStatus },
      newValues: { status: "PENDING_APPROVAL", approvalStatus: "PENDING" },
    });
  });

  revalidatePath("/crm/offers");
  revalidatePath(`/crm/offers/${offerId}`);
}

/** Internal discount-approval sign-off (Step 12/13) - never the customer's own decision. */
export async function approveOffer(offerId: string) {
  const { organizationId, role } = await requirePermissionAudited("offer.approve", "LeasingOffer", offerId);
  const t = getDictionary(await getLocale());

  await prisma.$transaction(async (tx) => {
    const existing = await tx.leasingOffer.findUniqueOrThrow({ where: { id: offerId, organizationId } });
    if (!isValidOfferTransition(existing.status, "APPROVED")) {
      throw new Error(t.validation.offerInvalidTransition);
    }
    if (!canApproveDiscount(role, Number(existing.discountPercentage))) {
      throw new Error(t.validation.offerApprovalNotAllowed);
    }
    const updated = await tx.leasingOffer.update({ where: { id: offerId, organizationId }, data: { status: "APPROVED", approvalStatus: "APPROVED" } });
    await auditAction(tx, {
      action: "APPROVE",
      entityType: "LeasingOffer",
      entityId: updated.id,
      entityDisplayName: updated.offerNumber,
      previousValues: { status: existing.status, approvalStatus: existing.approvalStatus },
      newValues: { status: "APPROVED", approvalStatus: "APPROVED" },
    });
  });

  revalidatePath("/crm/offers");
  revalidatePath(`/crm/offers/${offerId}`);
}

/**
 * Internal approval decline (Step 12) - deliberately returns the offer to
 * DRAFT with approvalStatus=REJECTED, never OfferStatus.REJECTED (that value
 * is reserved exclusively for the customer's own decision - see
 * docs/LEASING-OFFERS.md, "Approval rules").
 */
export async function declineOfferApproval(formData: FormData) {
  const offerId = z.string().min(1).parse(formData.get("offerId"));
  const { organizationId } = await requirePermissionAudited("offer.approve", "LeasingOffer", offerId);
  const notes = (formData.get("notes") as string) || undefined;
  const t = getDictionary(await getLocale());

  await prisma.$transaction(async (tx) => {
    const existing = await tx.leasingOffer.findUniqueOrThrow({ where: { id: offerId, organizationId } });
    if (!isValidOfferTransition(existing.status, "DRAFT")) {
      throw new Error(t.validation.offerInvalidTransition);
    }
    const updated = await tx.leasingOffer.update({
      where: { id: offerId, organizationId },
      data: { status: "DRAFT", approvalStatus: "REJECTED", internalNotes: notes ?? existing.internalNotes },
    });
    await auditAction(tx, {
      action: "REJECT",
      entityType: "LeasingOffer",
      entityId: updated.id,
      entityDisplayName: updated.offerNumber,
      previousValues: { status: existing.status, approvalStatus: existing.approvalStatus },
      newValues: { status: "DRAFT", approvalStatus: "REJECTED" },
      metadata: { rejectionType: "internal_approval" },
    });
  });

  revalidatePath("/crm/offers");
  revalidatePath(`/crm/offers/${offerId}`);
}

/** "Mark as Sent" (Step 15) - no email/WhatsApp delivery exists yet; this only records that the offer was handed to the customer. */
export async function sendOffer(offerId: string) {
  const { organizationId } = await requirePermissionAudited("offer.send", "LeasingOffer", offerId);
  const { user } = await requireSession();
  const t = getDictionary(await getLocale());

  const leadId = await prisma.$transaction(async (tx) => {
    const existing = await tx.leasingOffer.findUniqueOrThrow({ where: { id: offerId, organizationId } });
    if (!isValidOfferTransition(existing.status, "SENT")) {
      throw new Error(t.validation.offerInvalidTransition);
    }
    const updated = await tx.leasingOffer.update({ where: { id: offerId, organizationId }, data: { status: "SENT", sentAt: new Date() } });
    await auditAction(tx, {
      action: "ISSUE",
      entityType: "LeasingOffer",
      entityId: updated.id,
      entityDisplayName: updated.offerNumber,
      previousValues: { status: existing.status },
      newValues: { status: "SENT", sentAt: updated.sentAt },
    });

    const lead = await tx.lead.findUniqueOrThrow({ where: { id: existing.leadId } });
    if (lead.status !== "WON") {
      await tx.lead.update({ where: { id: existing.leadId }, data: { status: "NEGOTIATION" } });
    }
    await tx.leadActivity.create({
      data: { organizationId, leadId: existing.leadId, activityType: "STATUS_CHANGE", subject: t.offer.activitySent(existing.offerNumber), createdByUserId: user.id },
    });
    return existing.leadId;
  });

  revalidatePath("/crm/offers");
  revalidatePath(`/crm/offers/${offerId}`);
  revalidatePath(`/crm/leads/${leadId}`);
  revalidatePath("/crm");
}

export async function moveOfferToNegotiation(offerId: string) {
  const { organizationId } = await requirePermissionAudited("offer.update", "LeasingOffer", offerId);
  const { user } = await requireSession();
  const t = getDictionary(await getLocale());

  const leadId = await prisma.$transaction(async (tx) => {
    const existing = await tx.leasingOffer.findUniqueOrThrow({ where: { id: offerId, organizationId } });
    if (!isValidOfferTransition(existing.status, "UNDER_NEGOTIATION")) {
      throw new Error(t.validation.offerInvalidTransition);
    }
    const updated = await tx.leasingOffer.update({ where: { id: offerId, organizationId }, data: { status: "UNDER_NEGOTIATION" } });
    await auditAction(tx, {
      action: "UPDATE",
      entityType: "LeasingOffer",
      entityId: updated.id,
      entityDisplayName: updated.offerNumber,
      previousValues: { status: existing.status },
      newValues: { status: "UNDER_NEGOTIATION" },
    });

    const lead = await tx.lead.findUniqueOrThrow({ where: { id: existing.leadId } });
    if (lead.status !== "WON") {
      await tx.lead.update({ where: { id: existing.leadId }, data: { status: "NEGOTIATION" } });
    }
    await tx.leadActivity.create({
      data: { organizationId, leadId: existing.leadId, activityType: "STATUS_CHANGE", subject: t.offer.activityNegotiation(existing.offerNumber), createdByUserId: user.id },
    });
    return existing.leadId;
  });

  revalidatePath("/crm/offers");
  revalidatePath(`/crm/offers/${offerId}`);
  revalidatePath(`/crm/leads/${leadId}`);
  revalidatePath("/crm");
}

export async function acceptOffer(offerId: string) {
  const { organizationId } = await requirePermissionAudited("offer.accept", "LeasingOffer", offerId);
  const { user } = await requireSession();
  const t = getDictionary(await getLocale());

  const leadId = await prisma.$transaction(async (tx) => {
    const existing = await tx.leasingOffer.findUniqueOrThrow({ where: { id: offerId, organizationId } });
    if (!isValidOfferTransition(existing.status, "ACCEPTED")) {
      throw new Error(t.validation.offerInvalidTransition);
    }
    const updated = await tx.leasingOffer.update({ where: { id: offerId, organizationId }, data: { status: "ACCEPTED", acceptedAt: new Date() } });
    await auditAction(tx, {
      action: "UPDATE",
      entityType: "LeasingOffer",
      entityId: updated.id,
      entityDisplayName: updated.offerNumber,
      previousValues: { status: existing.status },
      newValues: { status: "ACCEPTED", acceptedAt: updated.acceptedAt },
    });

    // Per docs/LEASING-OFFERS.md, "Lead status integration": moves the lead
    // into RESERVATION_PENDING - the Reservation module itself is not
    // implemented in this task (Step 17: "Do NOT create Reservation yet").
    const lead = await tx.lead.findUniqueOrThrow({ where: { id: existing.leadId } });
    if (lead.status !== "WON") {
      await tx.lead.update({ where: { id: existing.leadId }, data: { status: "RESERVATION_PENDING" } });
    }
    await tx.leadActivity.create({
      data: { organizationId, leadId: existing.leadId, activityType: "STATUS_CHANGE", subject: t.offer.activityAccepted(existing.offerNumber), createdByUserId: user.id },
    });
    return existing.leadId;
  });

  revalidatePath("/crm/offers");
  revalidatePath(`/crm/offers/${offerId}`);
  revalidatePath(`/crm/leads/${leadId}`);
  revalidatePath("/crm");
}

export async function rejectOffer(formData: FormData) {
  const offerId = z.string().min(1).parse(formData.get("offerId"));
  const { organizationId } = await requirePermissionAudited("offer.reject", "LeasingOffer", offerId);
  const { user } = await requireSession();
  const t = getDictionary(await getLocale());

  const rejectReason = z.enum(OFFER_REJECT_REASON_VALUES).parse(formData.get("rejectReason"));
  const rejectReasonNote = (formData.get("rejectReasonNote") as string) || undefined;
  if (rejectReason === "OTHER" && !rejectReasonNote?.trim()) {
    throw new Error(t.validation.offerRejectReasonNoteRequired);
  }

  const leadId = await prisma.$transaction(async (tx) => {
    const existing = await tx.leasingOffer.findUniqueOrThrow({ where: { id: offerId, organizationId } });
    if (!isValidOfferTransition(existing.status, "REJECTED")) {
      throw new Error(t.validation.offerInvalidTransition);
    }
    const updated = await tx.leasingOffer.update({
      where: { id: offerId, organizationId },
      data: { status: "REJECTED", rejectedAt: new Date(), rejectReason, rejectReasonNote },
    });
    await auditAction(tx, {
      action: "REJECT",
      entityType: "LeasingOffer",
      entityId: updated.id,
      entityDisplayName: updated.offerNumber,
      previousValues: { status: existing.status },
      newValues: { status: "REJECTED", rejectReason, rejectReasonNote },
      metadata: { rejectionType: "customer" },
    });

    // Per docs/LEASING-OFFERS.md, "Lead status integration": a customer
    // rejecting an Offer never marks the Lead LOST - it returns to whichever
    // stage is deterministically derivable from history (Step 18).
    const lead = await tx.lead.findUniqueOrThrow({ where: { id: existing.leadId } });
    if (lead.status !== "WON") {
      const hasCompletedViewing = (await tx.viewing.count({ where: { organizationId, leadId: existing.leadId, status: "COMPLETED" } })) > 0;
      const nextStatus = leadStatusAfterOfferRejection(hasCompletedViewing);
      await tx.lead.update({ where: { id: existing.leadId }, data: { status: nextStatus } });
    }
    await tx.leadActivity.create({
      data: {
        organizationId,
        leadId: existing.leadId,
        activityType: "STATUS_CHANGE",
        subject: t.offer.activityRejected(existing.offerNumber, t.offerRejectReason[rejectReason]),
        notes: rejectReasonNote,
        createdByUserId: user.id,
      },
    });
    return existing.leadId;
  });

  revalidatePath("/crm/offers");
  revalidatePath(`/crm/offers/${offerId}`);
  revalidatePath(`/crm/leads/${leadId}`);
  revalidatePath("/crm");
}

/** Internal withdrawal - unlike rejectOffer(), this is the agency's own decision, not a customer signal, so the Lead's status is deliberately left untouched (Step 18 documents only created/sent/accepted/rejected as Lead-status-changing events). */
export async function cancelOffer(offerId: string) {
  const { organizationId } = await requirePermissionAudited("offer.cancel", "LeasingOffer", offerId);
  const { user } = await requireSession();
  const t = getDictionary(await getLocale());

  const leadId = await prisma.$transaction(async (tx) => {
    const existing = await tx.leasingOffer.findUniqueOrThrow({ where: { id: offerId, organizationId } });
    if (!isValidOfferTransition(existing.status, "CANCELLED")) {
      throw new Error(t.validation.offerInvalidTransition);
    }
    const updated = await tx.leasingOffer.update({ where: { id: offerId, organizationId }, data: { status: "CANCELLED" } });
    await auditAction(tx, {
      action: "CANCEL",
      entityType: "LeasingOffer",
      entityId: updated.id,
      entityDisplayName: updated.offerNumber,
      previousValues: { status: existing.status },
      newValues: { status: "CANCELLED" },
    });
    await tx.leadActivity.create({
      data: { organizationId, leadId: existing.leadId, activityType: "STATUS_CHANGE", subject: t.offer.activityCancelled(existing.offerNumber), createdByUserId: user.id },
    });
    return existing.leadId;
  });

  revalidatePath("/crm/offers");
  revalidatePath(`/crm/offers/${offerId}`);
  revalidatePath(`/crm/leads/${leadId}`);
}

/**
 * Creates a new DRAFT version in the same offerNumber chain and flips the
 * current row to SUPERSEDED (Step 11) - never edits a SENT/UNDER_NEGOTIATION/
 * etc. row in place. Guarded so only the chain's current latest version can
 * be revised (Step 32's "only one active non-terminal version" safeguard):
 * a row that already has a successor (parentOfferId pointing at it) can
 * never branch again.
 */
export async function reviseOffer(offerId: string) {
  const { organizationId } = await requirePermissionAudited("offer.revise", "LeasingOffer", offerId);
  const { user } = await requireSession();
  const t = getDictionary(await getLocale());

  const newOfferId = await prisma.$transaction(async (tx) => {
    const existing = await tx.leasingOffer.findUniqueOrThrow({ where: { id: offerId, organizationId } });
    if (!canReviseOffer(existing.status)) {
      throw new Error(t.validation.offerCannotRevise);
    }
    const existingChild = await tx.leasingOffer.findUnique({ where: { parentOfferId: offerId } });
    if (existingChild) {
      throw new Error(t.validation.offerCannotRevise);
    }

    const created = await tx.leasingOffer.create({
      data: {
        organizationId,
        offerNumber: existing.offerNumber,
        versionNumber: existing.versionNumber + 1,
        leadId: existing.leadId,
        viewingId: existing.viewingId,
        unitId: existing.unitId,
        assignedToUserId: existing.assignedToUserId,
        status: "DRAFT",
        approvalStatus: "NOT_REQUIRED",
        validFrom: existing.validFrom,
        validUntil: existing.validUntil,
        currency: existing.currency,
        annualRent: existing.annualRent,
        discountAmount: existing.discountAmount,
        discountPercentage: existing.discountPercentage,
        netAnnualRent: existing.netAnnualRent,
        securityDeposit: existing.securityDeposit,
        contractFee: existing.contractFee,
        leasingCommissionAmount: existing.leasingCommissionAmount,
        leasingCommissionRate: existing.leasingCommissionRate,
        commissionVatRate: existing.commissionVatRate,
        commissionVatAmount: existing.commissionVatAmount,
        totalInitialPayment: existing.totalInitialPayment,
        paymentFrequency: existing.paymentFrequency,
        leaseStartDate: existing.leaseStartDate,
        leaseDurationMonths: existing.leaseDurationMonths,
        furnishedStatus: existing.furnishedStatus,
        specialTerms: existing.specialTerms,
        internalNotes: existing.internalNotes,
        createdByUserId: user.id,
        parentOfferId: existing.id,
      },
    });

    const superseded = await tx.leasingOffer.update({ where: { id: existing.id, organizationId }, data: { status: "SUPERSEDED" } });

    await auditCreate(tx, {
      entityType: "LeasingOffer",
      entityId: created.id,
      entityDisplayName: created.offerNumber,
      newValues: { parentOfferId: existing.id, versionNumber: created.versionNumber },
    });
    await auditAction(tx, {
      action: "UPDATE",
      entityType: "LeasingOffer",
      entityId: superseded.id,
      entityDisplayName: superseded.offerNumber,
      previousValues: { status: existing.status },
      newValues: { status: "SUPERSEDED" },
    });
    await tx.leadActivity.create({
      data: {
        organizationId,
        leadId: existing.leadId,
        activityType: "STATUS_CHANGE",
        subject: t.offer.activityRevised(existing.offerNumber, created.versionNumber),
        createdByUserId: user.id,
      },
    });

    return created.id;
  });

  revalidatePath("/crm/offers");
  revalidatePath(`/crm/offers/${offerId}`);
  revalidatePath(`/crm/offers/${newOfferId}`);
  return newOfferId;
}

export interface OfferListFilters {
  search?: string;
  status?: string;
  assignedToUserId?: string;
  compoundId?: string;
  unitId?: string;
  leadId?: string;
  dateFrom?: Date;
  dateTo?: Date;
  validUntilFrom?: Date;
  validUntilTo?: Date;
  expiredOnly?: boolean;
  acceptedOnly?: boolean;
  rejectedOnly?: boolean;
  page?: number;
}

/** Paginated, filtered offer listing - never loads the full table into memory (same pattern as listLeads/listViewings). */
export async function listOffers(filters: OfferListFilters = {}) {
  const { organizationId } = await requirePermission("offer.view");
  await syncExpiredOffers(organizationId);
  const page = Math.max(1, filters.page ?? 1);

  let statusFilter = (filters.status as OfferStatus) || undefined;
  if (filters.expiredOnly) statusFilter = "EXPIRED";
  if (filters.acceptedOnly) statusFilter = "ACCEPTED";
  if (filters.rejectedOnly) statusFilter = "REJECTED";

  const where: Prisma.LeasingOfferWhereInput = {
    organizationId,
    status: statusFilter,
    assignedToUserId: filters.assignedToUserId || undefined,
    leadId: filters.leadId || undefined,
    unitId: filters.unitId || undefined,
    createdAt: filters.dateFrom || filters.dateTo ? { gte: filters.dateFrom, lt: filters.dateTo } : undefined,
    validUntil: filters.validUntilFrom || filters.validUntilTo ? { gte: filters.validUntilFrom, lt: filters.validUntilTo } : undefined,
    unit: filters.compoundId ? { floor: { building: { compoundId: filters.compoundId } } } : undefined,
    ...(filters.search
      ? {
          OR: [
            { offerNumber: { contains: filters.search, mode: "insensitive" as const } },
            { lead: { fullName: { contains: filters.search, mode: "insensitive" as const } } },
          ],
        }
      : {}),
  };

  const [rows, total] = await Promise.all([
    prisma.leasingOffer.findMany({
      where,
      include: {
        lead: { select: { id: true, fullName: true, leadNumber: true } },
        unit: { include: { floor: { include: { building: { include: { compound: true } } } } } },
        assignedToUser: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    prisma.leasingOffer.count({ where }),
  ]);

  return { rows, total, page, pageSize: PAGE_SIZE, totalPages: Math.max(1, Math.ceil(total / PAGE_SIZE)) };
}

export async function getOfferById(offerId: string) {
  const { organizationId } = await requirePermission("offer.view");
  await syncExpiredOffers(organizationId);
  return prisma.leasingOffer.findUniqueOrThrow({
    where: { id: offerId, organizationId },
    include: {
      organization: { select: { name: true, nameAr: true, vatNumber: true, logoUrl: true, city: true, district: true } },
      lead: true,
      viewing: { select: { id: true, viewingNumber: true, scheduledStart: true, outcome: true } },
      unit: { include: { floor: { include: { building: { include: { compound: true } } } } } },
      assignedToUser: { select: { id: true, name: true, email: true } },
      parentOffer: { select: { id: true, offerNumber: true, versionNumber: true, status: true } },
      revisedInto: { select: { id: true, offerNumber: true, versionNumber: true, status: true } },
    },
  });
}

/** Every version of one offerNumber chain, oldest first (Step 23/32 "Version History"). */
export async function getOfferVersionChain(offerNumber: string) {
  const { organizationId } = await requirePermission("offer.view");
  return prisma.leasingOffer.findMany({
    where: { organizationId, offerNumber },
    orderBy: { versionNumber: "asc" },
    select: {
      id: true,
      versionNumber: true,
      status: true,
      netAnnualRent: true,
      discountAmount: true,
      discountPercentage: true,
      createdAt: true,
      updatedAt: true,
    },
  });
}

/** Every offer version for a Lead's profile page (Step 20), newest chain/version first. */
export async function getOffersForLead(leadId: string) {
  const { organizationId } = await requirePermission("offer.view");
  await syncExpiredOffers(organizationId);
  const offers = await prisma.leasingOffer.findMany({
    where: { organizationId, leadId },
    include: { unit: { select: { unitNumber: true } } },
    orderBy: [{ offerNumber: "desc" }, { versionNumber: "desc" }],
  });
  return { offers, latest: offers[0] ?? null };
}

/** Offers generated from a Viewing (Step 19) - deliberately thin (status/amount/version/date only), never duplicating the full Offer profile. */
export async function getOffersForViewing(viewingId: string) {
  const { organizationId } = await requirePermission("offer.view");
  await syncExpiredOffers(organizationId);
  return prisma.leasingOffer.findMany({
    where: { organizationId, viewingId },
    orderBy: [{ offerNumber: "desc" }, { versionNumber: "desc" }],
  });
}

/**
 * Compound -> Building -> Floor -> Unit tree, VACANT units only (Step
 * 10/7-equivalent) - drives the new/edit-offer form's unit picker, including
 * baseRentAmount so annualRent can be prefilled from the chosen unit.
 * `includeUnitId` additionally includes that one specific unit even if it is
 * no longer VACANT, so editing a Draft offer never silently drops its
 * already-chosen unit from the picker if the unit's status changed after
 * the offer was created.
 */
export async function getOfferEligibleUnitsTree(includeUnitId?: string) {
  const { organizationId } = await requirePermission("offer.create");
  return prisma.compound.findMany({
    where: { organizationId },
    select: {
      id: true,
      name: true,
      arabicName: true,
      buildings: {
        select: {
          id: true,
          name: true,
          nameAr: true,
          floors: {
            select: {
              id: true,
              name: true,
              nameAr: true,
              floorNumber: true,
              units: {
                where: includeUnitId ? { OR: [{ status: "VACANT" }, { id: includeUnitId }] } : { status: "VACANT" },
                select: { id: true, unitNumber: true, unitType: true, baseRentAmount: true },
                orderBy: { unitNumber: "asc" },
              },
            },
            orderBy: { floorNumber: "asc" },
          },
        },
        orderBy: { name: "asc" },
      },
    },
    orderBy: { name: "asc" },
  });
}

export async function listOfferAssignableUsers() {
  const { organizationId } = await requirePermission("offer.create");
  return prisma.user.findMany({
    where: { organizationId, isActive: true },
    select: { id: true, name: true, email: true, role: true },
    orderBy: { name: "asc" },
  });
}
