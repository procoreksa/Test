"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requirePermission, requireSession, AuthorizationError } from "@/lib/session";
import { can, type Permission } from "@/lib/permissions";
import { getLocale, getDictionary } from "@/lib/i18n";
import { auditCreate, auditAction } from "@/lib/audit";
import { nextCounterValue } from "@/lib/numbering";
import type { CommunicationChannel, CommunicationEventType, CommunicationRecipientStrategy, CommunicationMessageStatus } from "@prisma/client";
import { getEventDefinition, COMMUNICATION_EVENT_REGISTRY } from "@/lib/communications/events";
import { assertTemplateVariablesAllowed, renderTemplate } from "@/lib/communications/render";
import { assertValidStatusTransition } from "@/lib/communications/status";
import { maskDestination } from "@/lib/communications/masking";
import { getProviderForChannel } from "@/lib/communications/providers/factory";

const PAGE_SIZE = 50;

// ---------------------------------------------------------------------------
// Dashboard
// ---------------------------------------------------------------------------

export async function getCommunicationsDashboard() {
  const { organizationId } = await requirePermission("communications.view");

  const [statusCounts, recentMessages] = await Promise.all([
    prisma.communicationMessage.groupBy({
      by: ["status"],
      where: { organizationId },
      _count: { _all: true },
    }),
    prisma.communicationMessage.findMany({
      where: { organizationId },
      orderBy: { createdAt: "desc" },
      take: 10,
      select: {
        id: true,
        eventType: true,
        channel: true,
        status: true,
        destinationMasked: true,
        createdAt: true,
      },
    }),
  ]);

  const countsByStatus: Record<CommunicationMessageStatus, number> = {
    QUEUED: 0,
    PROCESSING: 0,
    SENT: 0,
    DELIVERED: 0,
    READ: 0,
    FAILED: 0,
    CANCELLED: 0,
  };
  for (const row of statusCounts) {
    countsByStatus[row.status] = row._count._all;
  }

  return { countsByStatus, recentMessages };
}

// ---------------------------------------------------------------------------
// Messages
// ---------------------------------------------------------------------------

export interface CommunicationMessageListFilters {
  status?: CommunicationMessageStatus;
  channel?: CommunicationChannel;
  eventType?: CommunicationEventType;
}

export async function listCommunicationMessages(filters: CommunicationMessageListFilters = {}) {
  const { organizationId } = await requirePermission("communications.message.view");

  return prisma.communicationMessage.findMany({
    where: {
      organizationId,
      ...(filters.status ? { status: filters.status } : {}),
      ...(filters.channel ? { channel: filters.channel } : {}),
      ...(filters.eventType ? { eventType: filters.eventType } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: PAGE_SIZE,
    select: {
      id: true,
      eventType: true,
      channel: true,
      language: true,
      status: true,
      recipientType: true,
      destinationMasked: true,
      attemptCount: true,
      createdAt: true,
    },
  });
}

export async function getCommunicationMessageById(id: string) {
  const { organizationId } = await requirePermission("communications.message.view");
  const t = getDictionary(await getLocale());

  // Defense in depth: destinationRaw is deliberately left out of this
  // `select` (rather than fetched and stripped) so the raw destination can
  // never leave this function and reach the UI layer even by accident -
  // callers render destinationMasked only (Step 63's privacy requirement).
  const message = await prisma.communicationMessage.findUnique({
    where: { id, organizationId },
    select: {
      id: true,
      eventType: true,
      channel: true,
      language: true,
      status: true,
      recipientType: true,
      destinationMasked: true,
      renderedSubject: true,
      renderedBody: true,
      businessEntityType: true,
      businessEntityId: true,
      attemptCount: true,
      maxAttempts: true,
      lastAttemptAt: true,
      nextAttemptAt: true,
      sentAt: true,
      deliveredAt: true,
      readAt: true,
      failedAt: true,
      cancelledAt: true,
      lastErrorCode: true,
      lastErrorMessage: true,
      createdAt: true,
      templateVersion: true,
      template: { select: { id: true, eventType: true, channel: true, language: true, version: true } },
      deliveryAttempts: { orderBy: { attemptNumber: "asc" } },
    },
  });
  if (!message) throw new Error(t.communications.messageNotFound);
  return message;
}

export async function retryCommunicationMessage(messageId: string): Promise<void> {
  const { organizationId } = await requirePermission("communications.retry");
  const t = getDictionary(await getLocale());

  const message = await prisma.communicationMessage.findUnique({ where: { id: messageId, organizationId } });
  if (!message) throw new Error(t.communications.messageNotFound);
  if (message.status !== "FAILED") throw new Error(t.communications.cannotRetryNotFailed);

  assertValidStatusTransition(message.status, "QUEUED");

  await prisma.$transaction(async (tx) => {
    // attemptCount is deliberately NOT reset - the existing max-attempts
    // check in the processor applies unchanged to the next attempt.
    await tx.communicationMessage.update({
      where: { id: messageId },
      data: { status: "QUEUED", nextAttemptAt: null, lastErrorCode: null, lastErrorMessage: null },
    });
    await auditAction(tx, {
      action: "UPDATE",
      entityType: "CommunicationMessage",
      entityId: messageId,
      entityDisplayName: `${message.eventType} / ${message.channel}`,
      newValues: { status: "QUEUED", manualRetry: true },
    });
  });

  revalidatePath("/communications/messages");
  revalidatePath(`/communications/messages/${messageId}`);
}

export async function cancelCommunicationMessage(messageId: string): Promise<void> {
  const { organizationId } = await requirePermission("communications.cancel");
  const t = getDictionary(await getLocale());

  const claim = await prisma.communicationMessage.updateMany({
    where: { id: messageId, organizationId, status: "QUEUED" },
    data: { status: "CANCELLED", cancelledAt: new Date() },
  });
  if (claim.count !== 1) throw new Error(t.communications.cannotCancelNotQueued);

  const message = await prisma.communicationMessage.findUniqueOrThrow({ where: { id: messageId } });
  await auditAction(prisma, {
    action: "CANCEL",
    entityType: "CommunicationMessage",
    entityId: messageId,
    entityDisplayName: `${message.eventType} / ${message.channel}`,
  });

  revalidatePath("/communications/messages");
  revalidatePath(`/communications/messages/${messageId}`);
}

// ---------------------------------------------------------------------------
// Templates
// ---------------------------------------------------------------------------

export async function listCommunicationTemplates() {
  const { organizationId } = await requirePermission("communicationTemplate.view");
  return prisma.communicationTemplate.findMany({
    where: { organizationId },
    orderBy: [{ eventType: "asc" }, { channel: "asc" }, { language: "asc" }, { version: "desc" }],
  });
}

export async function getCommunicationTemplateById(id: string) {
  const { organizationId } = await requirePermission("communicationTemplate.view");
  const t = getDictionary(await getLocale());

  const template = await prisma.communicationTemplate.findUnique({ where: { id, organizationId } });
  if (!template) throw new Error(t.communications.templateNotFound);

  const versionHistory = await prisma.communicationTemplate.findMany({
    where: { organizationId, eventType: template.eventType, channel: template.channel, language: template.language },
    orderBy: { version: "desc" },
    select: { id: true, version: true, status: true, createdAt: true, activatedAt: true, archivedAt: true },
  });

  return { template, versionHistory };
}

/**
 * Creates a new CommunicationTemplate version for (eventType, channel,
 * language). Gated by communicationTemplate.create when this is the first
 * version ever created for that key, or communicationTemplate.version for
 * every subsequent one - both permissions currently map to the same
 * OWNER/ADMIN-only role tier (see src/lib/permissions.ts), but the
 * distinction is enforced here rather than collapsed into one permission so
 * a future role split does not require touching this action.
 */
export async function createCommunicationTemplateVersion(formData: FormData): Promise<string> {
  const { user } = await requireSession();
  const organizationId = user.organizationId;
  const t = getDictionary(await getLocale());

  const eventType = String(formData.get("eventType")) as CommunicationEventType;
  const channel = String(formData.get("channel")) as CommunicationChannel;
  const language = String(formData.get("language"));
  const subject = formData.get("subject") ? String(formData.get("subject")) : null;
  const bodyText = String(formData.get("bodyText"));
  const bodyHtml = formData.get("bodyHtml") ? String(formData.get("bodyHtml")) : null;
  const notes = formData.get("notes") ? String(formData.get("notes")) : null;

  const existingCount = await prisma.communicationTemplate.count({ where: { organizationId, eventType, channel, language } });
  const requiredPermission: Permission = existingCount === 0 ? "communicationTemplate.create" : "communicationTemplate.version";
  if (!can(requiredPermission, user.role as Parameters<typeof can>[1])) {
    throw new AuthorizationError(t.validation.notAuthorized);
  }

  const definition = getEventDefinition(eventType);
  const allowedVariables = [...definition.variables];

  // Fail fast at save time (defense in depth - renderTemplate() re-checks
  // this again at every actual render).
  assertTemplateVariablesAllowed(bodyText, allowedVariables);
  if (bodyHtml) assertTemplateVariablesAllowed(bodyHtml, allowedVariables);
  if (subject) assertTemplateVariablesAllowed(subject, allowedVariables);

  const template = await prisma.$transaction(async (tx) => {
    const version = await nextCounterValue(tx, organizationId, `communicationTemplate:${eventType}:${channel}:${language}`);
    const created = await tx.communicationTemplate.create({
      data: {
        organizationId,
        eventType,
        channel,
        language,
        version,
        status: "DRAFT",
        subject,
        bodyText,
        bodyHtml,
        variables: allowedVariables,
        notes,
        createdByUserId: user.id,
      },
    });
    await auditCreate(tx, {
      action: "CREATE",
      entityType: "CommunicationTemplate",
      entityId: created.id,
      entityDisplayName: `${eventType} / ${channel} / ${language} v${version}`,
      newValues: { eventType, channel, language, version },
    });
    return created;
  });

  revalidatePath("/communications/templates");
  return template.id;
}

/**
 * Activates a DRAFT template version, archiving whatever version was
 * previously ACTIVE for the same (eventType, channel, language) key in the
 * same transaction - the DB-level partial unique index
 * (communication_templates_one_active_per_key, added by hand in the
 * migration) is the real backstop against two concurrent activations ever
 * leaving two ACTIVE rows for one key.
 */
export async function activateCommunicationTemplate(templateId: string): Promise<void> {
  const { organizationId, role } = await requirePermission("communicationTemplate.activate");
  const { user } = await requireSession();
  const t = getDictionary(await getLocale());
  void role;

  const template = await prisma.communicationTemplate.findUnique({ where: { id: templateId, organizationId } });
  if (!template) throw new Error(t.communications.templateNotFound);

  await prisma.$transaction(async (tx) => {
    await tx.communicationTemplate.updateMany({
      where: { organizationId, eventType: template.eventType, channel: template.channel, language: template.language, status: "ACTIVE" },
      data: { status: "ARCHIVED", archivedAt: new Date() },
    });
    await tx.communicationTemplate.update({
      where: { id: templateId },
      data: { status: "ACTIVE", activatedAt: new Date(), activatedByUserId: user.id },
    });
    await auditAction(tx, {
      action: "ACTIVATE",
      entityType: "CommunicationTemplate",
      entityId: templateId,
      entityDisplayName: `${template.eventType} / ${template.channel} / ${template.language} v${template.version}`,
    });
  });

  revalidatePath("/communications/templates");
  revalidatePath(`/communications/templates/${templateId}`);
}

export async function archiveCommunicationTemplate(templateId: string): Promise<void> {
  const { organizationId } = await requirePermission("communicationTemplate.activate");
  const t = getDictionary(await getLocale());

  const template = await prisma.communicationTemplate.findUnique({ where: { id: templateId, organizationId } });
  if (!template) throw new Error(t.communications.templateNotFound);

  await prisma.$transaction(async (tx) => {
    await tx.communicationTemplate.update({ where: { id: templateId }, data: { status: "ARCHIVED", archivedAt: new Date() } });
    await auditAction(tx, {
      action: "CANCEL",
      entityType: "CommunicationTemplate",
      entityId: templateId,
      entityDisplayName: `${template.eventType} / ${template.channel} / ${template.language} v${template.version}`,
    });
  });

  revalidatePath("/communications/templates");
  revalidatePath(`/communications/templates/${templateId}`);
}

// ---------------------------------------------------------------------------
// Rules
// ---------------------------------------------------------------------------

export async function listCommunicationRules() {
  const { organizationId } = await requirePermission("communicationRule.view");
  return prisma.communicationRule.findMany({
    where: { organizationId },
    orderBy: [{ eventType: "asc" }, { channel: "asc" }],
    include: { specificUser: { select: { id: true, name: true } } },
  });
}

export async function createCommunicationRule(formData: FormData): Promise<string> {
  const { organizationId, user } = await requirePermissionAndUser("communicationRule.create");
  const t = getDictionary(await getLocale());

  const eventType = String(formData.get("eventType")) as CommunicationEventType;
  const channel = String(formData.get("channel")) as CommunicationChannel;
  const recipientStrategy = String(formData.get("recipientStrategy")) as CommunicationRecipientStrategy;
  const specificUserId = recipientStrategy === "SPECIFIC_INTERNAL_USER" ? String(formData.get("specificUserId")) : null;

  const existing = await prisma.communicationRule.findUnique({
    where: { organizationId_eventType_channel_recipientStrategy: { organizationId, eventType, channel, recipientStrategy } },
  });
  if (existing) throw new Error(t.communications.ruleAlreadyExists);

  const rule = await prisma.$transaction(async (tx) => {
    const created = await tx.communicationRule.create({
      data: { organizationId, eventType, channel, recipientStrategy, specificUserId, isEnabled: true, createdByUserId: user.id },
    });
    await auditCreate(tx, {
      action: "CREATE",
      entityType: "CommunicationRule",
      entityId: created.id,
      entityDisplayName: `${eventType} / ${channel} / ${recipientStrategy}`,
      newValues: { eventType, channel, recipientStrategy },
    });
    return created;
  });

  revalidatePath("/communications/rules");
  return rule.id;
}

export async function setCommunicationRuleEnabled(ruleId: string, isEnabled: boolean): Promise<void> {
  const { organizationId } = await requirePermission("communicationRule.update");
  const t = getDictionary(await getLocale());

  const rule = await prisma.communicationRule.findUnique({ where: { id: ruleId, organizationId } });
  if (!rule) throw new Error(t.communications.ruleNotFound);

  await prisma.$transaction(async (tx) => {
    await tx.communicationRule.update({ where: { id: ruleId }, data: { isEnabled } });
    await auditAction(tx, {
      action: isEnabled ? "ACTIVATE" : "DEACTIVATE",
      entityType: "CommunicationRule",
      entityId: ruleId,
      entityDisplayName: `${rule.eventType} / ${rule.channel} / ${rule.recipientStrategy}`,
    });
  });

  revalidatePath("/communications/rules");
}

export async function listAssignableInternalUsers() {
  const { organizationId } = await requirePermission("communicationRule.create");
  return prisma.user.findMany({
    where: { organizationId, isActive: true },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });
}

// ---------------------------------------------------------------------------
// Event registry (read-only, for the template/rule admin UI dropdowns)
// ---------------------------------------------------------------------------

export async function listCommunicationEventDefinitions() {
  await requirePermission("communicationRule.view");
  return Object.values(COMMUNICATION_EVENT_REGISTRY);
}

// ---------------------------------------------------------------------------
// Manual test-send (restricted) - Step: an optional, restricted way to
// verify a template renders and a provider round-trips, WITHOUT going
// through the queue (immediate, synchronous, and clearly distinguished from
// a real business-triggered message via businessEntityType "ManualTest").
// ---------------------------------------------------------------------------

export async function sendCommunicationTestMessage(formData: FormData): Promise<{ success: boolean; errorMessage?: string }> {
  const { organizationId, user } = await requirePermissionAndUser("communicationTest.send");
  const t = getDictionary(await getLocale());

  const eventType = String(formData.get("eventType")) as CommunicationEventType;
  const channel = String(formData.get("channel")) as CommunicationChannel;
  const language = String(formData.get("language"));
  const destination = String(formData.get("destination"));

  const template = await prisma.communicationTemplate.findFirst({
    where: { organizationId, eventType, channel, language, status: "ACTIVE" },
  });
  if (!template) throw new Error(t.communications.templateNotFound);

  const definition = getEventDefinition(eventType);
  const sampleVariables = Object.fromEntries(definition.variables.map((name) => [name, `[${name}]`]));

  const rendered = renderTemplate({
    subject: template.subject,
    bodyText: template.bodyText,
    bodyHtml: template.bodyHtml,
    variables: sampleVariables,
    allowedVariables: template.variables,
  });

  const provider = getProviderForChannel(channel);
  const startedAt = new Date();
  const result = await provider.send({
    destination,
    subject: rendered.subject,
    body: rendered.bodyHtml ?? rendered.bodyText,
    language: language === "ar" ? "ar" : "en",
  });
  const finishedAt = new Date();

  const message = await prisma.communicationMessage.create({
    data: {
      organizationId,
      eventType,
      channel,
      language,
      status: result.success ? "SENT" : "FAILED",
      recipientType: "INTERNAL_USER",
      internalUserId: user.id,
      destinationRaw: destination,
      destinationMasked: maskDestination(destination, channel),
      templateId: template.id,
      templateVersion: template.version,
      renderedSubject: rendered.subject,
      renderedBody: rendered.bodyHtml ?? rendered.bodyText,
      variablesSnapshot: sampleVariables,
      businessEntityType: "ManualTest",
      businessEntityId: user.id,
      idempotencyKey: `MANUAL_TEST:${eventType}:${channel}:${language}:${Date.now()}`,
      attemptCount: 1,
      lastAttemptAt: finishedAt,
      sentAt: result.success ? finishedAt : null,
      failedAt: result.success ? null : finishedAt,
      lastErrorCode: result.errorCode,
      lastErrorMessage: result.errorMessage,
    },
  });

  await prisma.communicationDeliveryAttempt.create({
    data: {
      organizationId,
      messageId: message.id,
      attemptNumber: 1,
      status: result.success ? "SENT" : "FAILED",
      providerName: provider.name,
      providerMessageId: result.providerMessageId,
      errorCode: result.errorCode,
      errorMessage: result.errorMessage,
      startedAt,
      finishedAt,
    },
  });

  revalidatePath("/communications/messages");
  return { success: result.success, errorMessage: result.errorMessage };
}

async function requirePermissionAndUser(permission: Permission) {
  const { organizationId } = await requirePermission(permission);
  const { user } = await requireSession();
  return { organizationId, user };
}
