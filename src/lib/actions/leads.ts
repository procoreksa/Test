"use server";

import { z } from "zod";
import type { LeadStatus, LeadSource, LeadType, Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requirePermission, requireSession } from "@/lib/session";
import { getLocale, getDictionary } from "@/lib/i18n";
import { auditCreate, auditUpdate, auditAction, requirePermissionAudited } from "@/lib/audit";
import { nextCounterValue, formatLeadNumber } from "@/lib/numbering";
import { normalizeSaudiMobile, isSameMobile } from "@/lib/crm/phone";
import { buildLeadFullName, findDuplicateMatches, validateLostReason, type DuplicateCandidate } from "@/lib/crm/lead-rules";

const PAGE_SIZE = 25;

const ACTIVE_STATUSES = ["NEW", "CONTACTED", "QUALIFIED", "VIEWING_PENDING", "VIEWING_COMPLETED", "OFFER_PENDING", "NEGOTIATION", "RESERVATION_PENDING"] as const;
const MOVABLE_STATUSES = ACTIVE_STATUSES; // WON/LOST/ARCHIVED only ever set via their own dedicated actions (see markLeadLost/convertLeadToRenter/archiveLead), never the generic changeLeadStatus.

function leadSchema(t: ReturnType<typeof getDictionary>) {
  return z.object({
    leadType: z.enum(["INDIVIDUAL", "CORPORATE", "AGENT_REFERRAL"]),
    firstName: z.string().optional(),
    lastName: z.string().optional(),
    mobile: z.string().min(1, t.validation.leadMobileRequired),
    alternateMobile: z.string().optional(),
    email: z.string().email().optional().or(z.literal("")),
    nationality: z.string().optional(),
    employer: z.string().optional(),
    jobTitle: z.string().optional(),
    companyName: z.string().optional(),
    contactPersonName: z.string().optional(),
    contactPersonMobile: z.string().optional(),
    contactPersonEmail: z.string().email().optional().or(z.literal("")),
    employeeCount: z.coerce.number().int().optional(),
    requiredUnits: z.coerce.number().int().optional(),
    requestedCity: z.string().optional(),
    projectName: z.string().optional(),
    housingStartDate: z.coerce.date().optional(),
    housingEndDate: z.coerce.date().optional(),
    familySize: z.coerce.number().int().optional(),
    budgetMin: z.coerce.number().min(0).optional(),
    budgetMax: z.coerce.number().min(0).optional(),
    preferredBedrooms: z.coerce.number().int().optional(),
    preferredUnitType: z.enum(["APARTMENT", "VILLA", "OFFICE", "SHOP", "WAREHOUSE", "OTHER"]).optional(),
    preferredCompoundId: z.string().optional(),
    moveInDate: z.coerce.date().optional(),
    leaseDurationMonths: z.coerce.number().int().optional(),
    furnishedPreference: z.enum(["FURNISHED", "SEMI_FURNISHED", "UNFURNISHED", "FLEXIBLE"]).optional(),
    notes: z.string().optional(),
    source: z.enum(["FACEBOOK", "INSTAGRAM", "GOOGLE", "WHATSAPP", "WEBSITE", "REFERRAL", "WALK_IN", "CORPORATE", "AGENT", "PHONE", "OTHER"]),
    assignedToUserId: z.string().optional(),
  });
}

function readLeadFields(formData: FormData) {
  return {
    leadType: formData.get("leadType") || "INDIVIDUAL",
    firstName: formData.get("firstName") || undefined,
    lastName: formData.get("lastName") || undefined,
    mobile: formData.get("mobile"),
    alternateMobile: formData.get("alternateMobile") || undefined,
    email: formData.get("email") || undefined,
    nationality: formData.get("nationality") || undefined,
    employer: formData.get("employer") || undefined,
    jobTitle: formData.get("jobTitle") || undefined,
    companyName: formData.get("companyName") || undefined,
    contactPersonName: formData.get("contactPersonName") || undefined,
    contactPersonMobile: formData.get("contactPersonMobile") || undefined,
    contactPersonEmail: formData.get("contactPersonEmail") || undefined,
    employeeCount: formData.get("employeeCount") || undefined,
    requiredUnits: formData.get("requiredUnits") || undefined,
    requestedCity: formData.get("requestedCity") || undefined,
    projectName: formData.get("projectName") || undefined,
    housingStartDate: formData.get("housingStartDate") || undefined,
    housingEndDate: formData.get("housingEndDate") || undefined,
    familySize: formData.get("familySize") || undefined,
    budgetMin: formData.get("budgetMin") || undefined,
    budgetMax: formData.get("budgetMax") || undefined,
    preferredBedrooms: formData.get("preferredBedrooms") || undefined,
    preferredUnitType: formData.get("preferredUnitType") || undefined,
    preferredCompoundId: formData.get("preferredCompoundId") || undefined,
    moveInDate: formData.get("moveInDate") || undefined,
    leaseDurationMonths: formData.get("leaseDurationMonths") || undefined,
    furnishedPreference: formData.get("furnishedPreference") || undefined,
    notes: formData.get("notes") || undefined,
    source: formData.get("source") || "OTHER",
    assignedToUserId: formData.get("assignedToUserId") || undefined,
  };
}

/** Verifies a compound/user id (if supplied) belongs to the caller's own organization before it's ever persisted - the same IDOR guard already used by createOwnership/postManualLedgerEntry. */
async function assertCrossOrgSafeRefs(organizationId: string, refs: { preferredCompoundId?: string; assignedToUserId?: string }) {
  if (refs.preferredCompoundId) {
    await prisma.compound.findUniqueOrThrow({ where: { id: refs.preferredCompoundId, organizationId } });
  }
  if (refs.assignedToUserId) {
    await prisma.user.findUniqueOrThrow({ where: { id: refs.assignedToUserId, organizationId } });
  }
}

export async function createLead(formData: FormData) {
  const { organizationId } = await requirePermission("lead.create");
  const { user } = await requireSession();
  const t = getDictionary(await getLocale());
  const parsed = leadSchema(t).parse(readLeadFields(formData));

  await assertCrossOrgSafeRefs(organizationId, parsed);

  const fullName = buildLeadFullName(parsed);
  const normalizedMobile = normalizeSaudiMobile(parsed.mobile);

  await prisma.$transaction(async (tx) => {
    const seq = await nextCounterValue(tx, organizationId, "lead");
    const leadNumber = formatLeadNumber(seq);

    const lead = await tx.lead.create({
      data: {
        organizationId,
        leadNumber,
        fullName,
        normalizedMobile,
        createdByUserId: user.id,
        ...parsed,
        email: parsed.email || undefined,
        contactPersonEmail: parsed.contactPersonEmail || undefined,
      },
    });

    await auditCreate(tx, {
      entityType: "Lead",
      entityId: lead.id,
      entityDisplayName: lead.leadNumber,
      newValues: { leadNumber, fullName, mobile: parsed.mobile, leadType: parsed.leadType, source: parsed.source, status: "NEW" },
    });
  });

  revalidatePath("/crm/leads");
  revalidatePath("/crm");
}

/** Non-blocking duplicate warning (Step 12) - used by the new-lead form before submit. Never blocks creation. */
export async function findPossibleDuplicateLeads(mobile: string, email?: string) {
  const { organizationId } = await requirePermission("lead.create");
  if (!mobile && !email) return [];

  const normalizedMobile = normalizeSaudiMobile(mobile);
  const candidates = await prisma.lead.findMany({
    where: {
      organizationId,
      OR: [
        normalizedMobile ? { normalizedMobile } : undefined,
        email ? { email: { equals: email, mode: "insensitive" as const } } : undefined,
      ].filter((c): c is NonNullable<typeof c> => Boolean(c)),
    },
    select: {
      id: true,
      leadNumber: true,
      fullName: true,
      mobile: true,
      normalizedMobile: true,
      email: true,
      status: true,
      assignedToUserId: true,
    },
    take: 10,
  });

  return findDuplicateMatches(candidates satisfies DuplicateCandidate[], { mobile, email });
}

export async function updateLead(formData: FormData) {
  const { organizationId } = await requirePermission("lead.update");
  const t = getDictionary(await getLocale());
  const leadId = z.string().min(1).parse(formData.get("leadId"));
  const parsed = leadSchema(t).parse(readLeadFields(formData));

  await assertCrossOrgSafeRefs(organizationId, parsed);
  const fullName = buildLeadFullName(parsed);
  const normalizedMobile = normalizeSaudiMobile(parsed.mobile);

  await prisma.$transaction(async (tx) => {
    const existing = await tx.lead.findUniqueOrThrow({ where: { id: leadId, organizationId } });
    const updated = await tx.lead.update({
      where: { id: leadId, organizationId },
      data: {
        ...parsed,
        fullName,
        normalizedMobile,
        email: parsed.email || undefined,
        contactPersonEmail: parsed.contactPersonEmail || undefined,
      },
    });
    await auditUpdate(tx, { entityType: "Lead", entityId: updated.id, entityDisplayName: updated.leadNumber, before: existing, after: updated });
  });

  revalidatePath("/crm/leads");
  revalidatePath(`/crm/leads/${leadId}`);
}

/** Moves a lead between pipeline stages only - WON/LOST/ARCHIVED are set exclusively by convertLeadToRenter/markLeadLost/archiveLead, never here. */
export async function changeLeadStatus(leadId: string, status: string) {
  const { organizationId } = await requirePermission("lead.update");
  const { user } = await requireSession();
  const t = getDictionary(await getLocale());

  if (!MOVABLE_STATUSES.includes(status as (typeof MOVABLE_STATUSES)[number])) {
    throw new Error(t.validation.leadInvalidStatusTransition);
  }

  await prisma.$transaction(async (tx) => {
    const existing = await tx.lead.findUniqueOrThrow({ where: { id: leadId, organizationId } });
    const updated = await tx.lead.update({ where: { id: leadId, organizationId }, data: { status: status as LeadStatus } });
    await auditAction(tx, {
      action: "UPDATE",
      entityType: "Lead",
      entityId: updated.id,
      entityDisplayName: updated.leadNumber,
      previousValues: { status: existing.status },
      newValues: { status: updated.status },
    });
    await tx.leadActivity.create({
      data: {
        organizationId,
        leadId,
        activityType: "STATUS_CHANGE",
        subject: t.crm.activityStatusChanged(existing.status, updated.status),
        createdByUserId: user.id,
      },
    });
  });

  revalidatePath("/crm/pipeline");
  revalidatePath("/crm/leads");
  revalidatePath(`/crm/leads/${leadId}`);
}

export async function assignLead(leadId: string, assignedToUserId: string) {
  const { organizationId } = await requirePermissionAudited("lead.assign", "Lead", leadId);
  const { user } = await requireSession();
  const t = getDictionary(await getLocale());

  const targetUser = assignedToUserId
    ? await prisma.user.findUniqueOrThrow({ where: { id: assignedToUserId, organizationId } })
    : null;

  await prisma.$transaction(async (tx) => {
    const existing = await tx.lead.findUniqueOrThrow({ where: { id: leadId, organizationId } });
    const updated = await tx.lead.update({
      where: { id: leadId, organizationId },
      data: { assignedToUserId: assignedToUserId || null },
    });
    await auditAction(tx, {
      action: "UPDATE",
      entityType: "Lead",
      entityId: updated.id,
      entityDisplayName: updated.leadNumber,
      previousValues: { assignedToUserId: existing.assignedToUserId },
      newValues: { assignedToUserId: updated.assignedToUserId },
    });
    await tx.leadActivity.create({
      data: {
        organizationId,
        leadId,
        activityType: "STATUS_CHANGE",
        subject: targetUser ? t.crm.activityAssigned(targetUser.name) : t.crm.activityUnassigned,
        createdByUserId: user.id,
      },
    });
  });

  revalidatePath("/crm/leads");
  revalidatePath(`/crm/leads/${leadId}`);
  revalidatePath("/crm/pipeline");
}

export async function markLeadLost(formData: FormData) {
  const leadId = z.string().min(1).parse(formData.get("leadId"));
  const { organizationId } = await requirePermissionAudited("lead.update", "Lead", leadId);
  const { user } = await requireSession();
  const t = getDictionary(await getLocale());

  const lostReason = z
    .enum(["PRICE", "NO_AVAILABILITY", "LOCATION", "COMPETITOR", "NO_RESPONSE", "BUDGET", "TIMING", "CUSTOMER_CANCELLED", "OTHER"])
    .parse(formData.get("lostReason"));
  const lostReasonNote = (formData.get("lostReasonNote") as string) || undefined;

  const validationError = validateLostReason(lostReason, lostReasonNote);
  if (validationError) {
    throw new Error(t.validation.lostReasonNoteRequired);
  }

  await prisma.$transaction(async (tx) => {
    const existing = await tx.lead.findUniqueOrThrow({ where: { id: leadId, organizationId } });
    const updated = await tx.lead.update({
      where: { id: leadId, organizationId },
      data: { status: "LOST", lostReason, lostReasonNote },
    });
    await auditAction(tx, {
      action: "REJECT",
      entityType: "Lead",
      entityId: updated.id,
      entityDisplayName: updated.leadNumber,
      previousValues: { status: existing.status },
      newValues: { status: "LOST", lostReason, lostReasonNote },
    });
    await tx.leadActivity.create({
      data: {
        organizationId,
        leadId,
        activityType: "STATUS_CHANGE",
        subject: t.crm.activityMarkedLost,
        notes: lostReasonNote,
        createdByUserId: user.id,
      },
    });
  });

  revalidatePath("/crm/leads");
  revalidatePath(`/crm/leads/${leadId}`);
  revalidatePath("/crm/pipeline");
}

export async function archiveLead(leadId: string) {
  const { organizationId } = await requirePermissionAudited("lead.archive", "Lead", leadId);
  const { user } = await requireSession();
  const t = getDictionary(await getLocale());

  await prisma.$transaction(async (tx) => {
    const existing = await tx.lead.findUniqueOrThrow({ where: { id: leadId, organizationId } });
    const updated = await tx.lead.update({ where: { id: leadId, organizationId }, data: { status: "ARCHIVED" } });
    await auditAction(tx, {
      action: "DEACTIVATE",
      entityType: "Lead",
      entityId: updated.id,
      entityDisplayName: updated.leadNumber,
      previousValues: { status: existing.status },
      newValues: { status: "ARCHIVED" },
    });
    await tx.leadActivity.create({
      data: { organizationId, leadId, activityType: "STATUS_CHANGE", subject: t.crm.activityArchived, createdByUserId: user.id },
    });
  });

  revalidatePath("/crm/leads");
  revalidatePath(`/crm/leads/${leadId}`);
}

/** Pre-check for the conversion UI (Step 5) - surfaces existing renters that look like the same person, so the user can link instead of duplicating. */
export async function findPossibleRenterMatches(leadId: string) {
  const { organizationId } = await requirePermission("lead.convert");
  const lead = await prisma.lead.findUniqueOrThrow({ where: { id: leadId, organizationId } });

  const candidates = await prisma.renter.findMany({
    where: { organizationId, OR: [{ phone: { not: null } }, { email: { not: null } }] },
    select: { id: true, fullName: true, phone: true, email: true },
  });

  return candidates.filter(
    (r) =>
      (r.phone && isSameMobile(r.phone, lead.mobile)) ||
      (r.email && lead.email && r.email.trim().toLowerCase() === lead.email.trim().toLowerCase())
  );
}

export async function convertLeadToRenter(formData: FormData) {
  const leadId = z.string().min(1).parse(formData.get("leadId"));
  const { organizationId } = await requirePermissionAudited("lead.convert", "Lead", leadId);
  const { user } = await requireSession();
  const t = getDictionary(await getLocale());

  const mode = z.enum(["new", "link"]).parse(formData.get("mode"));
  const linkRenterId = (formData.get("renterId") as string) || undefined;
  const forceNewRenter = formData.get("forceNewRenter") === "on";

  const renterId = await prisma.$transaction(async (tx) => {
    const lead = await tx.lead.findUniqueOrThrow({ where: { id: leadId, organizationId } });
    if (lead.convertedRenterId || lead.status === "WON") {
      throw new Error(t.validation.leadAlreadyConverted);
    }

    let resolvedRenterId: string;
    if (mode === "link") {
      if (!linkRenterId) throw new Error(t.validation.leadAlreadyConverted);
      const renter = await tx.renter.findUniqueOrThrow({ where: { id: linkRenterId, organizationId } });
      resolvedRenterId = renter.id;
    } else {
      if (!forceNewRenter) {
        const candidates = await tx.renter.findMany({
          where: { organizationId, OR: [{ phone: { not: null } }, { email: { not: null } }] },
          select: { id: true, phone: true, email: true },
        });
        const hasMatch = candidates.some(
          (r) =>
            (r.phone && isSameMobile(r.phone, lead.mobile)) ||
            (r.email && lead.email && r.email.trim().toLowerCase() === lead.email.trim().toLowerCase())
        );
        if (hasMatch) throw new Error(t.validation.possibleDuplicateRenter);
      }
      const renter = await tx.renter.create({
        data: {
          organizationId,
          fullName: lead.fullName,
          phone: lead.mobile,
          email: lead.email || undefined,
        },
      });
      await auditCreate(tx, { entityType: "Renter", entityId: renter.id, entityDisplayName: renter.fullName, newValues: { fullName: renter.fullName, phone: renter.phone, source: "CRM lead conversion" } });
      resolvedRenterId = renter.id;
    }

    const updated = await tx.lead.update({
      where: { id: leadId, organizationId },
      data: { status: "WON", convertedRenterId: resolvedRenterId },
    });

    await auditAction(tx, {
      action: "APPROVE",
      entityType: "Lead",
      entityId: updated.id,
      entityDisplayName: updated.leadNumber,
      previousValues: { status: lead.status },
      newValues: { status: "WON", convertedRenterId: resolvedRenterId },
    });
    await tx.leadActivity.create({
      data: { organizationId, leadId, activityType: "STATUS_CHANGE", subject: t.crm.activityConverted, createdByUserId: user.id },
    });

    return resolvedRenterId;
  });

  revalidatePath("/crm/leads");
  revalidatePath(`/crm/leads/${leadId}`);
  revalidatePath("/renters");
  return renterId;
}

export interface LeadListFilters {
  search?: string;
  status?: string;
  source?: string;
  leadType?: string;
  assignedToUserId?: string;
  preferredCompoundId?: string;
  moveInFrom?: Date;
  moveInTo?: Date;
  createdFrom?: Date;
  createdTo?: Date;
  followUp?: "today" | "overdue" | "upcoming";
  page?: number;
}

/** Paginated, filtered lead listing - never loads the full table into memory (same pattern as listAuditLogs). */
export async function listLeads(filters: LeadListFilters = {}) {
  const { organizationId } = await requirePermission("lead.view");
  const page = Math.max(1, filters.page ?? 1);
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfTomorrow = new Date(startOfToday.getTime() + 24 * 60 * 60 * 1000);

  const followUpWhere =
    filters.followUp === "overdue"
      ? { nextFollowUpAt: { lt: startOfToday } }
      : filters.followUp === "today"
        ? { nextFollowUpAt: { gte: startOfToday, lt: startOfTomorrow } }
        : filters.followUp === "upcoming"
          ? { nextFollowUpAt: { gte: startOfTomorrow } }
          : {};

  const where: Prisma.LeadWhereInput = {
    organizationId,
    status: (filters.status as LeadStatus) || undefined,
    source: (filters.source as LeadSource) || undefined,
    leadType: (filters.leadType as LeadType) || undefined,
    assignedToUserId: filters.assignedToUserId || undefined,
    preferredCompoundId: filters.preferredCompoundId || undefined,
    moveInDate: filters.moveInFrom || filters.moveInTo ? { gte: filters.moveInFrom, lte: filters.moveInTo } : undefined,
    createdAt: filters.createdFrom || filters.createdTo ? { gte: filters.createdFrom, lte: filters.createdTo } : undefined,
    ...followUpWhere,
    ...(filters.search
      ? {
          OR: [
            { fullName: { contains: filters.search, mode: "insensitive" as const } },
            { mobile: { contains: filters.search } },
            { email: { contains: filters.search, mode: "insensitive" as const } },
            { leadNumber: { contains: filters.search, mode: "insensitive" as const } },
            { companyName: { contains: filters.search, mode: "insensitive" as const } },
          ],
        }
      : {}),
  };

  const [rows, total] = await Promise.all([
    prisma.lead.findMany({
      where,
      include: { assignedToUser: { select: { id: true, name: true } }, preferredCompound: { select: { id: true, name: true, arabicName: true } } },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    prisma.lead.count({ where }),
  ]);

  return { rows, total, page, pageSize: PAGE_SIZE, totalPages: Math.max(1, Math.ceil(total / PAGE_SIZE)) };
}

export async function getLeadById(leadId: string) {
  const { organizationId } = await requirePermission("lead.view");
  return prisma.lead.findUniqueOrThrow({
    where: { id: leadId, organizationId },
    include: {
      assignedToUser: { select: { id: true, name: true, email: true } },
      preferredCompound: { select: { id: true, name: true, arabicName: true } },
      convertedRenter: { select: { id: true, fullName: true } },
    },
  });
}

/** Active org users for the assignment picker (Step 9) - "for now use existing roles," so every active user is listed, not filtered by role. */
export async function listAssignableUsers() {
  const { organizationId } = await requirePermission("lead.create");
  return prisma.user.findMany({
    where: { organizationId, isActive: true },
    select: { id: true, name: true, email: true, role: true },
    orderBy: { name: "asc" },
  });
}

export async function getLeadFollowUps(bucket: "today" | "overdue" | "upcoming") {
  const { rows } = await listLeads({ followUp: bucket, page: 1 });
  return rows;
}
