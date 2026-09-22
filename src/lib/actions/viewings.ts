"use server";

import { z } from "zod";
import type { ViewingStatus, ViewingOutcome, Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requirePermission, requireSession } from "@/lib/session";
import { getLocale, getDictionary } from "@/lib/i18n";
import { auditCreate, auditUpdate, auditAction, requirePermissionAudited } from "@/lib/audit";
import { nextCounterValue, formatViewingNumber } from "@/lib/numbering";
import { hasTimeOverlap, isValidViewingTransition, BLOCKING_VIEWING_STATUSES } from "@/lib/crm/viewing-rules";

const PAGE_SIZE = 25;

/** Leads in these statuses cannot have a new viewing scheduled - a converted or dead lead has nothing left to view for. Per the brief's literal Step 6 wording ("must not be LOST or ARCHIVED"), WON is deliberately not blocked here beyond what the brief specified, but createViewing separately never regresses a WON lead's status - see the guard below. */
const LEAD_STATUSES_BLOCKED_FOR_VIEWING = new Set(["LOST", "ARCHIVED"]);

export interface AvailabilityConflict {
  viewingId: string;
  viewingNumber: string;
  leadFullName: string;
  scheduledStart: Date;
  scheduledEnd: Date;
  unitNumber?: string;
}

type Tx = Prisma.TransactionClient | typeof prisma;

/** Server-side double-booking guard for the assigned agent (Step 8/9) - never trust a UI-only check. */
export async function checkAgentAvailability(
  tx: Tx,
  organizationId: string,
  assignedToUserId: string,
  scheduledStart: Date,
  scheduledEnd: Date,
  excludeViewingId?: string
): Promise<AvailabilityConflict | null> {
  const candidates = await tx.viewing.findMany({
    where: {
      organizationId,
      assignedToUserId,
      status: { in: [...BLOCKING_VIEWING_STATUSES] },
      id: excludeViewingId ? { not: excludeViewingId } : undefined,
    },
    include: { lead: { select: { fullName: true } } },
  });

  const conflict = candidates.find((c) => hasTimeOverlap(c.scheduledStart, c.scheduledEnd, scheduledStart, scheduledEnd));
  if (!conflict) return null;
  return {
    viewingId: conflict.id,
    viewingNumber: conflict.viewingNumber,
    leadFullName: conflict.lead.fullName,
    scheduledStart: conflict.scheduledStart,
    scheduledEnd: conflict.scheduledEnd,
  };
}

/** Server-side double-booking guard for a single unit (Step 8/9) - never trust a UI-only check. */
export async function checkUnitAvailability(
  tx: Tx,
  organizationId: string,
  unitId: string,
  scheduledStart: Date,
  scheduledEnd: Date,
  excludeViewingId?: string
): Promise<AvailabilityConflict | null> {
  const candidates = await tx.viewingUnit.findMany({
    where: {
      organizationId,
      unitId,
      viewing: {
        status: { in: [...BLOCKING_VIEWING_STATUSES] },
        id: excludeViewingId ? { not: excludeViewingId } : undefined,
      },
    },
    include: { viewing: { include: { lead: { select: { fullName: true } } } }, unit: { select: { unitNumber: true } } },
  });

  const conflict = candidates.find((c) => hasTimeOverlap(c.viewing.scheduledStart, c.viewing.scheduledEnd, scheduledStart, scheduledEnd));
  if (!conflict) return null;
  return {
    viewingId: conflict.viewing.id,
    viewingNumber: conflict.viewing.viewingNumber,
    leadFullName: conflict.viewing.lead.fullName,
    scheduledStart: conflict.viewing.scheduledStart,
    scheduledEnd: conflict.viewing.scheduledEnd,
    unitNumber: conflict.unit.unitNumber,
  };
}

function conflictMessage(t: ReturnType<typeof getDictionary>, conflict: AvailabilityConflict): string {
  return t.viewing.conflictMessage(conflict.viewingNumber, conflict.leadFullName, conflict.scheduledStart.toLocaleString(), conflict.unitNumber);
}

function createViewingSchema() {
  return z.object({
    leadId: z.string().min(1),
    assignedToUserId: z.string().min(1),
    scheduledStart: z.coerce.date(),
    scheduledEnd: z.coerce.date(),
    customerNotes: z.string().optional(),
  });
}

export async function createViewing(formData: FormData) {
  const { organizationId } = await requirePermission("viewing.create");
  const { user } = await requireSession();
  const t = getDictionary(await getLocale());

  const parsed = createViewingSchema().parse({
    leadId: formData.get("leadId"),
    assignedToUserId: formData.get("assignedToUserId"),
    scheduledStart: formData.get("scheduledStart"),
    scheduledEnd: formData.get("scheduledEnd"),
    customerNotes: formData.get("customerNotes") || undefined,
  });
  const unitIds = formData.getAll("unitIds").map(String).filter(Boolean);

  if (parsed.scheduledEnd <= parsed.scheduledStart) {
    throw new Error(t.validation.viewingEndAfterStart);
  }
  if (unitIds.length === 0) {
    throw new Error(t.validation.viewingAtLeastOneUnit);
  }

  const lead = await prisma.lead.findUniqueOrThrow({ where: { id: parsed.leadId, organizationId } });
  if (LEAD_STATUSES_BLOCKED_FOR_VIEWING.has(lead.status)) {
    throw new Error(t.validation.viewingLeadNotEligible);
  }
  await prisma.user.findUniqueOrThrow({ where: { id: parsed.assignedToUserId, organizationId } });

  const units = await prisma.unit.findMany({ where: { id: { in: unitIds }, organizationId } });
  if (units.length !== unitIds.length) {
    throw new Error(t.validation.viewingUnitNotEligible);
  }
  if (units.some((u) => u.status !== "VACANT")) {
    throw new Error(t.validation.viewingUnitNotEligible);
  }

  const agentConflict = await checkAgentAvailability(prisma, organizationId, parsed.assignedToUserId, parsed.scheduledStart, parsed.scheduledEnd);
  if (agentConflict) throw new Error(conflictMessage(t, agentConflict));

  for (const unitId of unitIds) {
    const unitConflict = await checkUnitAvailability(prisma, organizationId, unitId, parsed.scheduledStart, parsed.scheduledEnd);
    if (unitConflict) throw new Error(conflictMessage(t, unitConflict));
  }

  const viewingId = await prisma.$transaction(async (tx) => {
    const seq = await nextCounterValue(tx, organizationId, "viewing");
    const viewingNumber = formatViewingNumber(seq);

    const viewing = await tx.viewing.create({
      data: {
        organizationId,
        viewingNumber,
        leadId: parsed.leadId,
        assignedToUserId: parsed.assignedToUserId,
        scheduledStart: parsed.scheduledStart,
        scheduledEnd: parsed.scheduledEnd,
        customerNotes: parsed.customerNotes,
        createdByUserId: user.id,
      },
    });

    await tx.viewingUnit.createMany({
      data: unitIds.map((unitId, index) => ({ organizationId, viewingId: viewing.id, unitId, sequence: index + 1 })),
    });

    await auditCreate(tx, {
      entityType: "Viewing",
      entityId: viewing.id,
      entityDisplayName: viewing.viewingNumber,
      newValues: { leadId: parsed.leadId, assignedToUserId: parsed.assignedToUserId, scheduledStart: parsed.scheduledStart, scheduledEnd: parsed.scheduledEnd, unitIds },
    });

    // Per docs/VIEWING-MANAGEMENT.md, "Lead status integration": moves the
    // lead forward into VIEWING_PENDING, but never regresses an already-WON
    // lead (the brief's own example starts from QUALIFIED; WON is left
    // alone as a safety guard beyond the brief's literal wording).
    if (lead.status !== "WON") {
      await tx.lead.update({ where: { id: parsed.leadId }, data: { status: "VIEWING_PENDING" } });
    }

    await tx.leadActivity.create({
      data: {
        organizationId,
        leadId: parsed.leadId,
        activityType: "MEETING",
        subject: t.viewing.activityScheduled(viewingNumber, parsed.scheduledStart.toLocaleString()),
        createdByUserId: user.id,
      },
    });

    return viewing.id;
  });

  revalidatePath("/crm/viewings");
  revalidatePath("/crm/viewings/calendar");
  revalidatePath(`/crm/leads/${parsed.leadId}`);
  revalidatePath("/crm");
  return viewingId;
}

/** Shared org-scoped status-move helper for the simple transitions (confirm/start) that need no side effects beyond the audit row. */
async function moveViewingStatus(viewingId: string, organizationId: string, toStatus: ViewingStatus) {
  const t = getDictionary(await getLocale());
  await prisma.$transaction(async (tx) => {
    const existing = await tx.viewing.findUniqueOrThrow({ where: { id: viewingId, organizationId } });
    if (!isValidViewingTransition(existing.status, toStatus)) {
      throw new Error(t.validation.viewingInvalidTransition);
    }
    const updated = await tx.viewing.update({ where: { id: viewingId, organizationId }, data: { status: toStatus } });
    await auditAction(tx, {
      action: "UPDATE",
      entityType: "Viewing",
      entityId: updated.id,
      entityDisplayName: updated.viewingNumber,
      previousValues: { status: existing.status },
      newValues: { status: toStatus },
    });
  });
}

export async function confirmViewing(viewingId: string) {
  const { organizationId } = await requirePermission("viewing.update");
  await moveViewingStatus(viewingId, organizationId, "CONFIRMED");
  revalidatePath("/crm/viewings");
  revalidatePath(`/crm/viewings/${viewingId}`);
}

export async function startViewing(viewingId: string) {
  const { organizationId } = await requirePermission("viewing.update");
  await moveViewingStatus(viewingId, organizationId, "IN_PROGRESS");
  revalidatePath("/crm/viewings");
  revalidatePath(`/crm/viewings/${viewingId}`);
}

const OUTCOME_VALUES = ["INTERESTED", "FOLLOW_UP_REQUIRED", "NOT_INTERESTED", "OFFER_REQUESTED", "RESERVATION_REQUESTED", "OTHER"] as const;

export async function completeViewing(formData: FormData) {
  const viewingId = z.string().min(1).parse(formData.get("viewingId"));
  const { organizationId } = await requirePermissionAudited("viewing.complete", "Viewing", viewingId);
  const { user } = await requireSession();
  const t = getDictionary(await getLocale());

  const outcome = z.enum(OUTCOME_VALUES).parse(formData.get("outcome"));
  const feedbackSummary = (formData.get("feedbackSummary") as string) || undefined;
  const internalNotes = (formData.get("internalNotes") as string) || undefined;

  await prisma.$transaction(async (tx) => {
    const existing = await tx.viewing.findUniqueOrThrow({ where: { id: viewingId, organizationId } });
    if (!isValidViewingTransition(existing.status, "COMPLETED")) {
      throw new Error(t.validation.viewingInvalidTransition);
    }
    const updated = await tx.viewing.update({
      where: { id: viewingId, organizationId },
      data: { status: "COMPLETED", outcome, feedbackSummary, internalNotes, completedAt: new Date() },
    });
    await auditAction(tx, {
      action: "UPDATE",
      entityType: "Viewing",
      entityId: updated.id,
      entityDisplayName: updated.viewingNumber,
      previousValues: { status: existing.status },
      newValues: { status: "COMPLETED", outcome, completedAt: updated.completedAt },
    });

    const lead = await tx.lead.findUniqueOrThrow({ where: { id: existing.leadId } });
    // Per docs/VIEWING-MANAGEMENT.md, "Lead status integration": outcome
    // never auto-advances the lead into OFFER_PENDING/RESERVATION_PENDING -
    // those modules don't exist yet. The lead always lands on
    // VIEWING_COMPLETED regardless of outcome (unless already WON).
    if (lead.status !== "WON") {
      await tx.lead.update({ where: { id: existing.leadId }, data: { status: "VIEWING_COMPLETED" } });
    }

    await tx.leadActivity.create({
      data: {
        organizationId,
        leadId: existing.leadId,
        activityType: "MEETING",
        subject: t.viewing.activityCompleted(existing.viewingNumber, t.viewingOutcome[outcome]),
        notes: feedbackSummary,
        createdByUserId: user.id,
      },
    });
  });

  revalidatePath("/crm/viewings");
  revalidatePath(`/crm/viewings/${viewingId}`);
}

const CANCEL_REASON_VALUES = ["CUSTOMER_REQUEST", "AGENT_UNAVAILABLE", "UNIT_UNAVAILABLE", "RESCHEDULED", "NO_RESPONSE", "OTHER"] as const;

export async function cancelViewing(formData: FormData) {
  const viewingId = z.string().min(1).parse(formData.get("viewingId"));
  const { organizationId } = await requirePermissionAudited("viewing.cancel", "Viewing", viewingId);
  const { user } = await requireSession();
  const t = getDictionary(await getLocale());

  const cancelReason = z.enum(CANCEL_REASON_VALUES).parse(formData.get("cancelReason"));
  const cancelReasonNote = (formData.get("cancelReasonNote") as string) || undefined;
  if (cancelReason === "OTHER" && !cancelReasonNote?.trim()) {
    throw new Error(t.validation.viewingCancelReasonNoteRequired);
  }

  await prisma.$transaction(async (tx) => {
    const existing = await tx.viewing.findUniqueOrThrow({ where: { id: viewingId, organizationId } });
    if (!isValidViewingTransition(existing.status, "CANCELLED")) {
      throw new Error(t.validation.viewingInvalidTransition);
    }
    const updated = await tx.viewing.update({
      where: { id: viewingId, organizationId },
      data: { status: "CANCELLED", cancelReason, cancelReasonNote },
    });
    await auditAction(tx, {
      action: "CANCEL",
      entityType: "Viewing",
      entityId: updated.id,
      entityDisplayName: updated.viewingNumber,
      previousValues: { status: existing.status },
      newValues: { status: "CANCELLED", cancelReason, cancelReasonNote },
    });
    await tx.leadActivity.create({
      data: {
        organizationId,
        leadId: existing.leadId,
        activityType: "STATUS_CHANGE",
        subject: t.viewing.activityCancelled(existing.viewingNumber),
        notes: cancelReasonNote,
        createdByUserId: user.id,
      },
    });
  });

  revalidatePath("/crm/viewings");
  revalidatePath(`/crm/viewings/${viewingId}`);
  revalidatePath("/crm/viewings/calendar");
}

export async function markViewingNoShow(viewingId: string) {
  const { organizationId } = await requirePermissionAudited("viewing.cancel", "Viewing", viewingId);
  const { user } = await requireSession();
  const t = getDictionary(await getLocale());

  await prisma.$transaction(async (tx) => {
    const existing = await tx.viewing.findUniqueOrThrow({ where: { id: viewingId, organizationId } });
    if (!isValidViewingTransition(existing.status, "NO_SHOW")) {
      throw new Error(t.validation.viewingInvalidTransition);
    }
    const updated = await tx.viewing.update({ where: { id: viewingId, organizationId }, data: { status: "NO_SHOW" } });
    await auditAction(tx, {
      action: "REJECT",
      entityType: "Viewing",
      entityId: updated.id,
      entityDisplayName: updated.viewingNumber,
      previousValues: { status: existing.status },
      newValues: { status: "NO_SHOW" },
    });
    await tx.leadActivity.create({
      data: {
        organizationId,
        leadId: existing.leadId,
        activityType: "STATUS_CHANGE",
        subject: t.viewing.activityNoShow(existing.viewingNumber),
        createdByUserId: user.id,
      },
    });
  });

  revalidatePath("/crm/viewings");
  revalidatePath(`/crm/viewings/${viewingId}`);
  revalidatePath("/crm/viewings/calendar");
}

export async function rescheduleViewing(formData: FormData) {
  const viewingId = z.string().min(1).parse(formData.get("viewingId"));
  const { organizationId } = await requirePermissionAudited("viewing.update", "Viewing", viewingId);
  const { user } = await requireSession();
  const t = getDictionary(await getLocale());

  const scheduledStart = z.coerce.date().parse(formData.get("scheduledStart"));
  const scheduledEnd = z.coerce.date().parse(formData.get("scheduledEnd"));
  if (scheduledEnd <= scheduledStart) {
    throw new Error(t.validation.viewingEndAfterStart);
  }

  const existing = await prisma.viewing.findUniqueOrThrow({ where: { id: viewingId, organizationId }, include: { units: true } });
  if (!isValidViewingTransition(existing.status, "RESCHEDULED")) {
    throw new Error(t.validation.viewingInvalidTransition);
  }

  if (existing.assignedToUserId) {
    const agentConflict = await checkAgentAvailability(prisma, organizationId, existing.assignedToUserId, scheduledStart, scheduledEnd, viewingId);
    if (agentConflict) throw new Error(conflictMessage(t, agentConflict));
  }
  for (const vu of existing.units) {
    const unitConflict = await checkUnitAvailability(prisma, organizationId, vu.unitId, scheduledStart, scheduledEnd, viewingId);
    if (unitConflict) throw new Error(conflictMessage(t, unitConflict));
  }

  const newStatus: ViewingStatus = existing.status === "CONFIRMED" ? "CONFIRMED" : "SCHEDULED";

  await prisma.$transaction(async (tx) => {
    const updated = await tx.viewing.update({
      where: { id: viewingId, organizationId },
      data: { scheduledStart, scheduledEnd, status: newStatus },
    });
    await auditAction(tx, {
      action: "UPDATE",
      entityType: "Viewing",
      entityId: updated.id,
      entityDisplayName: updated.viewingNumber,
      previousValues: { scheduledStart: existing.scheduledStart, scheduledEnd: existing.scheduledEnd, status: existing.status },
      newValues: { scheduledStart, scheduledEnd, status: newStatus },
    });
    await tx.leadActivity.create({
      data: {
        organizationId,
        leadId: existing.leadId,
        activityType: "STATUS_CHANGE",
        subject: t.viewing.activityRescheduled(existing.viewingNumber, existing.scheduledStart.toLocaleString(), scheduledStart.toLocaleString()),
        createdByUserId: user.id,
      },
    });
  });

  revalidatePath("/crm/viewings");
  revalidatePath(`/crm/viewings/${viewingId}`);
  revalidatePath("/crm/viewings/calendar");
}

export async function reassignViewingAgent(viewingId: string, assignedToUserId: string) {
  const { organizationId } = await requirePermissionAudited("viewing.assign", "Viewing", viewingId);
  const t = getDictionary(await getLocale());

  await prisma.user.findUniqueOrThrow({ where: { id: assignedToUserId, organizationId } });
  const existing = await prisma.viewing.findUniqueOrThrow({ where: { id: viewingId, organizationId } });

  const conflict = await checkAgentAvailability(prisma, organizationId, assignedToUserId, existing.scheduledStart, existing.scheduledEnd, viewingId);
  if (conflict) throw new Error(conflictMessage(t, conflict));

  await prisma.$transaction(async (tx) => {
    const updated = await tx.viewing.update({ where: { id: viewingId, organizationId }, data: { assignedToUserId } });
    await auditAction(tx, {
      action: "UPDATE",
      entityType: "Viewing",
      entityId: updated.id,
      entityDisplayName: updated.viewingNumber,
      previousValues: { assignedToUserId: existing.assignedToUserId },
      newValues: { assignedToUserId },
    });
  });

  revalidatePath("/crm/viewings");
  revalidatePath(`/crm/viewings/${viewingId}`);
}

export async function updateViewingNotes(formData: FormData) {
  const viewingId = z.string().min(1).parse(formData.get("viewingId"));
  const { organizationId } = await requirePermission("viewing.update");
  const customerNotes = (formData.get("customerNotes") as string) || undefined;
  const internalNotes = (formData.get("internalNotes") as string) || undefined;

  await prisma.$transaction(async (tx) => {
    const existing = await tx.viewing.findUniqueOrThrow({ where: { id: viewingId, organizationId } });
    const updated = await tx.viewing.update({ where: { id: viewingId, organizationId }, data: { customerNotes, internalNotes } });
    await auditUpdate(tx, { entityType: "Viewing", entityId: updated.id, entityDisplayName: updated.viewingNumber, before: existing, after: updated });
  });

  revalidatePath(`/crm/viewings/${viewingId}`);
}

export interface ViewingListFilters {
  search?: string;
  status?: string;
  outcome?: string;
  assignedToUserId?: string;
  compoundId?: string;
  unitId?: string;
  leadId?: string;
  dateFrom?: Date;
  dateTo?: Date;
  mine?: boolean;
  page?: number;
}

/** Paginated, filtered viewing listing - never loads the full table into memory (same pattern as listLeads/listAuditLogs). */
export async function listViewings(filters: ViewingListFilters = {}) {
  const { organizationId } = await requirePermission("viewing.view");
  const { user } = await requireSession();
  const page = Math.max(1, filters.page ?? 1);

  const where: Prisma.ViewingWhereInput = {
    organizationId,
    status: (filters.status as ViewingStatus) || undefined,
    outcome: (filters.outcome as ViewingOutcome) || undefined,
    assignedToUserId: filters.mine ? user.id : filters.assignedToUserId || undefined,
    leadId: filters.leadId || undefined,
    scheduledStart: filters.dateFrom || filters.dateTo ? { gte: filters.dateFrom, lt: filters.dateTo } : undefined,
    units: filters.unitId || filters.compoundId ? { some: { unitId: filters.unitId || undefined, unit: filters.compoundId ? { floor: { building: { compoundId: filters.compoundId } } } : undefined } } : undefined,
    ...(filters.search
      ? {
          OR: [
            { viewingNumber: { contains: filters.search, mode: "insensitive" as const } },
            { lead: { fullName: { contains: filters.search, mode: "insensitive" as const } } },
          ],
        }
      : {}),
  };

  const [rows, total] = await Promise.all([
    prisma.viewing.findMany({
      where,
      include: {
        lead: { select: { id: true, fullName: true, leadNumber: true } },
        assignedToUser: { select: { id: true, name: true } },
        units: { include: { unit: { include: { floor: { include: { building: { include: { compound: true } } } } } } } },
      },
      orderBy: { scheduledStart: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    prisma.viewing.count({ where }),
  ]);

  return { rows, total, page, pageSize: PAGE_SIZE, totalPages: Math.max(1, Math.ceil(total / PAGE_SIZE)) };
}

export async function getViewingById(viewingId: string) {
  const { organizationId } = await requirePermission("viewing.view");
  return prisma.viewing.findUniqueOrThrow({
    where: { id: viewingId, organizationId },
    include: {
      lead: true,
      assignedToUser: { select: { id: true, name: true, email: true } },
      units: { include: { unit: { include: { floor: { include: { building: { include: { compound: true } } } } } } }, orderBy: { sequence: "asc" } },
    },
  });
}

/** Upcoming + past viewings for a Lead's profile page (Step 21) - never the full detail, just enough to link out to the Viewing profile. */
export async function getViewingsForLead(leadId: string) {
  const { organizationId } = await requirePermission("viewing.view");
  const now = new Date();
  const viewings = await prisma.viewing.findMany({
    where: { organizationId, leadId },
    include: { assignedToUser: { select: { name: true } }, units: { include: { unit: { select: { unitNumber: true } } } } },
    orderBy: { scheduledStart: "desc" },
  });

  const upcoming = viewings.filter((v) => v.scheduledStart >= now && v.status !== "CANCELLED" && v.status !== "COMPLETED" && v.status !== "NO_SHOW");
  const past = viewings.filter((v) => !upcoming.includes(v));
  const lastCompleted = viewings.find((v) => v.status === "COMPLETED");

  return {
    upcoming,
    past,
    lastOutcome: lastCompleted?.outcome ?? null,
    nextViewingDate: upcoming[0]?.scheduledStart ?? null,
  };
}

/** Compound -> Building -> Floor -> Unit tree, VACANT units only (Step 7) - drives the new-viewing cascading picker. */
export async function getViewingEligibleUnitsTree() {
  const { organizationId } = await requirePermission("viewing.create");
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
                where: { status: "VACANT" },
                select: { id: true, unitNumber: true, unitType: true },
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

/** Per-unit viewing counts for the units list page (Step 27) - a single grouped query, not N+1, kept intentionally minimal per "do not redesign the Unit module." */
export async function getUnitViewingCounts(unitIds: string[]) {
  const { organizationId } = await requirePermission("viewing.view");
  if (unitIds.length === 0) return new Map<string, number>();
  const rows = await prisma.viewingUnit.groupBy({
    by: ["unitId"],
    where: { organizationId, unitId: { in: unitIds } },
    _count: { _all: true },
  });
  return new Map(rows.map((r) => [r.unitId, r._count._all]));
}
