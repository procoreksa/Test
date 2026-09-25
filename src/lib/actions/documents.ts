"use server";

import { z } from "zod";
import { Prisma } from "@prisma/client";
import type { DocumentEntityType, DocumentCategory, DocumentStatus } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requirePermission, requireSession } from "@/lib/session";
import { getLocale, getDictionary } from "@/lib/i18n";
import { logWarn } from "@/lib/logging";
import { auditCreate, auditUpdate, auditAction } from "@/lib/audit";
import { nextCounterValue, formatDocumentNumber } from "@/lib/numbering";
import { sanitizeFileName } from "@/lib/documents/filename";
import { validateUploadedFile, type FileValidationError } from "@/lib/documents/file-validation";
import { computeSha256 } from "@/lib/documents/checksum";
import { generateStorageKey, extensionForMimeType } from "@/lib/documents/storage-key";
import { entityExistsInOrganization } from "@/lib/documents/entity-registry";
import { getDefaultStorageProviderKind, getStorageProviderByKind } from "@/lib/documents/providers/factory";
import type { DocumentStorageProvider } from "@/lib/documents/providers/types";

const DOCUMENT_ENTITY_TYPES = [
  "RENTER",
  "OWNER",
  "CONTRACT",
  "UNIT",
  "COMPOUND",
  "BUILDING",
  "INVOICE",
  "PAYMENT",
  "MAINTENANCE_REQUEST",
  "MOVE_IN",
  "MOVE_OUT",
  "SECURITY_DEPOSIT_SETTLEMENT",
  "CORPORATE_ACCOUNT",
  "CORPORATE_OCCUPANT",
] as const;
const documentEntityTypeEnum = z.enum(DOCUMENT_ENTITY_TYPES);

const DOCUMENT_CATEGORIES = [
  "CONTRACT",
  "IDENTITY",
  "OWNERSHIP_DEED",
  "BANK_DETAIL",
  "MOVE_IN_EVIDENCE",
  "MOVE_OUT_EVIDENCE",
  "SECURITY_DEPOSIT_EVIDENCE",
  "MAINTENANCE_EVIDENCE",
  "PAYMENT_RECEIPT",
  "CORPORATE_ACCOUNT_DOCUMENT",
  "BUILDING_PLAN",
  "GENERAL",
  "OTHER",
] as const;
const documentCategoryEnum = z.enum(DOCUMENT_CATEGORIES);

const documentVisibilityEnum = z.enum(["INTERNAL_ONLY", "TENANT_VISIBLE", "OWNER_VISIBLE"]);

/** Dependency-injection seam used only by tests (real-DB tests inject a MockStorageProvider so they can exercise storage-failure/DB-failure scenarios without touching a real filesystem). Production call sites always omit this and get the factory-resolved provider. */
export interface DocumentActionDeps {
  storageProvider?: DocumentStorageProvider;
}

async function fileValidationMessage(error: FileValidationError): Promise<string> {
  const t = getDictionary(await getLocale());
  switch (error) {
    case "EMPTY_FILE":
      return t.validation.documentFileEmpty;
    case "TOO_LARGE":
      return t.validation.documentFileTooLarge;
    case "MIME_NOT_ALLOWED":
      return t.validation.documentFileTypeNotAllowed;
    case "EXTENSION_MISMATCH":
      return t.validation.documentFileExtensionMismatch;
    case "SIGNATURE_MISMATCH":
      return t.validation.documentFileSignatureMismatch;
  }
}

function isUniqueConstraintError(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002";
}

/**
 * Reads a FormData field as a raw, un-normalized string (empty string if
 * absent/not a string) - used only to detect whether normalization changed
 * a user-supplied value, for diagnostic logging. Never used for the actual
 * validated value itself (that always comes from the parsed zod schema).
 */
function rawStringField(formData: FormData, field: string): string {
  const value = formData.get(field);
  return typeof value === "string" ? value : "";
}

/**
 * Diagnostic-only logging for the one failure mode this module's
 * organization-scoped entity-existence check can hit: "no such id in this
 * organization." Fired at every call site that resolves a security-context
 * entity id (create/change-context/link) so a future recurrence can be
 * root-caused from logs alone, without weakening the user-facing message
 * (still the same generic "not found" - see each call site) or ever
 * revealing whether the id exists in a *different* organization. Logs only
 * the normalized (post-trim) entity id, the entity type, the authenticated
 * organizationId, and whether normalization actually changed the
 * user-supplied value - never the raw value itself, never any other form
 * field, never a file/PII.
 */
function logDocumentEntityValidationFailure(params: {
  stage: string;
  organizationId: string;
  entityType: DocumentEntityType;
  entityId: string;
  rawEntityId: string;
}): void {
  logWarn("document.entity_validation_failed", {
    stage: params.stage,
    organizationId: params.organizationId,
    entityType: params.entityType,
    entityId: params.entityId,
    entityIdWasNormalized: params.rawEntityId !== params.entityId,
  });
}

/**
 * Extracts only the safe, non-identifying pieces of a thrown storage-adapter
 * error - the AWS SDK v3 error `name` (the S3/R2 error code, e.g.
 * "AccessDenied") and its `$metadata` (HTTP status, request id, extended
 * request id). Mirrors the same defensive property access
 * s3-compatible.ts's own isNotFoundError() already uses. Deliberately never
 * reads `.message` (provider-specific free text - the literal reason a raw
 * "Access Denied" string was reaching the browser before this diagnostic
 * existed) and never returns the error object itself.
 */
function extractStorageErrorMetadata(error: unknown): {
  errorName: string | undefined;
  httpStatusCode: number | undefined;
  requestId: string | undefined;
  extendedRequestId: string | undefined;
} {
  if (typeof error !== "object" || error === null) {
    return { errorName: undefined, httpStatusCode: undefined, requestId: undefined, extendedRequestId: undefined };
  }
  const errorName = "name" in error ? String((error as { name: unknown }).name) : undefined;
  const metadata =
    "$metadata" in error && typeof (error as { $metadata?: unknown }).$metadata === "object"
      ? (error as { $metadata?: { httpStatusCode?: number; requestId?: string; extendedRequestId?: string } }).$metadata
      : undefined;
  return {
    errorName,
    httpStatusCode: metadata?.httpStatusCode,
    requestId: metadata?.requestId,
    extendedRequestId: metadata?.extendedRequestId,
  };
}

/**
 * Diagnostic-only logging for a failed storage-adapter putObject() call
 * (Step: production incident where an uncaught R2/S3 AccessDenied error's
 * raw .message reached the browser verbatim, with zero server-side log
 * trace). Logs only the entity type, the authenticated organizationId, the
 * active storage provider kind, and the error's own name/HTTP-status/
 * request-id metadata - never the error's message text, the storage key,
 * the endpoint, the bucket, any credential, or the file itself. The caller
 * always replaces the raw error with a generic, localized message before
 * it can reach the user - see each call site.
 */
function logDocumentStoragePutObjectFailure(params: {
  organizationId: string;
  entityType: DocumentEntityType;
  storageProviderKind: string;
  error: unknown;
}): void {
  const meta = extractStorageErrorMetadata(params.error);
  logWarn("document.storage.putObject_failed", {
    stage: "storage.putObject",
    storageProviderKind: params.storageProviderKind,
    organizationId: params.organizationId,
    entityType: params.entityType,
    errorName: meta.errorName,
    httpStatusCode: meta.httpStatusCode,
    requestId: meta.requestId,
    extendedRequestId: meta.extendedRequestId,
  });
}

const createDocumentSchema = z.object({
  title: z.string().min(1),
  category: documentCategoryEnum,
  securityContextEntityType: documentEntityTypeEnum,
  // .trim() before .min(1): a whitespace-only value is correctly treated as
  // empty, and incidental leading/trailing whitespace (most plausibly from
  // manual copy/paste into the entity-id field) never causes an otherwise-
  // valid, same-organization id to fail the exact-match existence lookup
  // below. Organization scoping itself is untouched - only the id's own
  // text is normalized before it reaches that lookup.
  securityContextEntityId: z.string().trim().min(1),
  visibility: documentVisibilityEnum.default("INTERNAL_ONLY"),
});

/**
 * The single centralized upload entry point every module must go through
 * (Step 30) - never reimplemented per-module. Follows the exact flow Step
 * 27 mandates: authorize -> validate entity context -> validate metadata ->
 * validate file -> write storage -> finalize in one DB transaction.
 *
 * Storage/DB consistency strategy (Step 28, documented in full in
 * docs/DOCUMENT-MANAGEMENT.md, "Storage/DB consistency strategy"): the
 * storage write happens BEFORE the DB transaction. If the transaction then
 * fails for any reason, the just-written object is compensating-deleted
 * (Step 29) - best-effort, since true cross-system atomicity between
 * Postgres and an object store is not achievable. A storage-write failure
 * itself never reaches the DB at all, so no Document/DocumentVersion row is
 * ever created without real bytes behind it.
 */
export async function createDocumentWithFile(formData: FormData, deps: DocumentActionDeps = {}): Promise<{ documentId: string }> {
  const { organizationId } = await requirePermission("document.create");
  const { user } = await requireSession();
  const t = getDictionary(await getLocale());

  const rawEntityId = rawStringField(formData, "securityContextEntityId");
  const parsed = createDocumentSchema.parse({
    title: formData.get("title"),
    category: formData.get("category"),
    securityContextEntityType: formData.get("securityContextEntityType"),
    securityContextEntityId: formData.get("securityContextEntityId"),
    visibility: formData.get("visibility") || undefined,
  });

  const entityExists = await entityExistsInOrganization(prisma, organizationId, parsed.securityContextEntityType, parsed.securityContextEntityId);
  if (!entityExists) {
    logDocumentEntityValidationFailure({
      stage: "document.create",
      organizationId,
      entityType: parsed.securityContextEntityType,
      entityId: parsed.securityContextEntityId,
      rawEntityId,
    });
    throw new Error(t.validation.documentEntityNotFound);
  }

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) throw new Error(t.validation.documentFileRequired);

  const rawFileName = sanitizeFileName(file.name);
  const buffer = Buffer.from(await file.arrayBuffer());
  const validation = validateUploadedFile({ fileName: rawFileName, claimedMimeType: file.type, size: buffer.length, buffer });
  if (!validation.valid || !validation.mimeType) throw new Error(await fileValidationMessage(validation.error!));

  const checksum = computeSha256(buffer);
  const storageProviderKind = getDefaultStorageProviderKind();
  const storageProvider = deps.storageProvider ?? getStorageProviderByKind(storageProviderKind);
  const storageKey = generateStorageKey({
    organizationId,
    entityType: parsed.securityContextEntityType,
    entityId: parsed.securityContextEntityId,
    fileExtension: extensionForMimeType(validation.mimeType),
  });

  try {
    await storageProvider.putObject({ key: storageKey, body: buffer, contentType: validation.mimeType });
  } catch (error) {
    logDocumentStoragePutObjectFailure({
      organizationId,
      entityType: parsed.securityContextEntityType,
      storageProviderKind,
      error,
    });
    throw new Error(t.validation.documentStorageUnavailable);
  }

  try {
    const documentId = await prisma.$transaction(async (tx) => {
      const documentSeq = await nextCounterValue(tx, organizationId, "document");
      const document = await tx.document.create({
        data: {
          organizationId,
          documentNumber: formatDocumentNumber(documentSeq),
          title: parsed.title,
          category: parsed.category,
          visibility: parsed.visibility,
          securityContextEntityType: parsed.securityContextEntityType,
          securityContextEntityId: parsed.securityContextEntityId,
          createdByUserId: user.id,
        },
      });

      // Step 14/32: the very first version's number is also drawn from the
      // same per-document Counter key addDocumentVersion() uses for every
      // subsequent version, so the two numbering paths can never collide.
      const versionSeq = await nextCounterValue(tx, organizationId, `documentVersion:${document.id}`);
      const version = await tx.documentVersion.create({
        data: {
          organizationId,
          documentId: document.id,
          versionNumber: versionSeq,
          fileName: rawFileName,
          mimeType: validation.mimeType!,
          fileSize: buffer.length,
          checksumSha256: checksum,
          storageProvider: storageProviderKind,
          storageKey,
          uploadedByUserId: user.id,
        },
      });

      await tx.document.update({ where: { id: document.id }, data: { currentVersionId: version.id } });

      await auditCreate(tx, {
        entityType: "Document",
        entityId: document.id,
        entityDisplayName: document.title,
        newValues: {
          documentNumber: document.documentNumber,
          category: document.category,
          visibility: document.visibility,
          securityContextEntityType: document.securityContextEntityType,
          securityContextEntityId: document.securityContextEntityId,
        },
        metadata: { versionNumber: versionSeq, fileName: rawFileName, mimeType: validation.mimeType, fileSize: buffer.length, checksumSha256: checksum },
      });

      return document.id;
    });

    revalidatePath("/documents");
    return { documentId };
  } catch (err) {
    await storageProvider.deleteObject({ key: storageKey }).catch(() => {});
    throw err;
  }
}

/**
 * Uploads a new, immutable version of an existing Document and re-points
 * currentVersionId to it (Step 31) - never overwrites or deletes a prior
 * version's row. Same storage-before-DB-transaction consistency strategy
 * as createDocumentWithFile() above. Version numbering reuses the existing
 * Counter infrastructure (Step 14/32), keyed per-document, so two
 * concurrent uploads against the same Document can never be assigned the
 * same version number (the Counter row's own atomic upsert-increment
 * serializes them), and DocumentVersion's own
 * `@@unique([documentId, versionNumber])` constraint is a second,
 * DB-enforced backstop against ever creating a duplicate.
 */
export async function addDocumentVersion(formData: FormData, deps: DocumentActionDeps = {}): Promise<{ versionId: string }> {
  const { organizationId } = await requirePermission("document.version.create");
  const { user } = await requireSession();
  const t = getDictionary(await getLocale());

  const documentId = z.string().min(1).parse(formData.get("documentId"));
  const document = await prisma.document.findFirst({ where: { id: documentId, organizationId } });
  if (!document) throw new Error(t.validation.documentNotFound);

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) throw new Error(t.validation.documentFileRequired);

  const rawFileName = sanitizeFileName(file.name);
  const buffer = Buffer.from(await file.arrayBuffer());
  const validation = validateUploadedFile({ fileName: rawFileName, claimedMimeType: file.type, size: buffer.length, buffer });
  if (!validation.valid || !validation.mimeType) throw new Error(await fileValidationMessage(validation.error!));

  const checksum = computeSha256(buffer);
  const storageProviderKind = getDefaultStorageProviderKind();
  const storageProvider = deps.storageProvider ?? getStorageProviderByKind(storageProviderKind);
  const storageKey = generateStorageKey({
    organizationId,
    entityType: document.securityContextEntityType,
    entityId: document.securityContextEntityId,
    fileExtension: extensionForMimeType(validation.mimeType),
  });

  try {
    await storageProvider.putObject({ key: storageKey, body: buffer, contentType: validation.mimeType });
  } catch (error) {
    logDocumentStoragePutObjectFailure({
      organizationId,
      entityType: document.securityContextEntityType,
      storageProviderKind,
      error,
    });
    throw new Error(t.validation.documentStorageUnavailable);
  }

  try {
    const versionId = await prisma.$transaction(async (tx) => {
      const versionNumber = await nextCounterValue(tx, organizationId, `documentVersion:${documentId}`);

      const version = await tx.documentVersion.create({
        data: {
          organizationId,
          documentId,
          versionNumber,
          fileName: rawFileName,
          mimeType: validation.mimeType!,
          fileSize: buffer.length,
          checksumSha256: checksum,
          storageProvider: storageProviderKind,
          storageKey,
          uploadedByUserId: user.id,
        },
      });

      await tx.document.update({ where: { id: documentId }, data: { currentVersionId: version.id } });

      await auditUpdate(tx, {
        entityType: "Document",
        entityId: documentId,
        entityDisplayName: document.title,
        before: { currentVersionId: document.currentVersionId },
        after: { currentVersionId: version.id },
        metadata: { versionNumber, fileName: rawFileName, mimeType: validation.mimeType, fileSize: buffer.length, checksumSha256: checksum },
      });

      return version.id;
    });

    revalidatePath(`/documents/${documentId}`);
    return { versionId };
  } catch (err) {
    await storageProvider.deleteObject({ key: storageKey }).catch(() => {});
    throw err;
  }
}

/**
 * Visibility is server-enforced and changeable independently of the
 * security context (Step 10/74) - taking effect immediately for the next
 * portal request, since portal entitlement is always resolved fresh
 * per-request (never cached in a session/JWT).
 */
export async function changeDocumentVisibility(formData: FormData): Promise<void> {
  const { organizationId } = await requirePermission("document.visibility.manage");
  const t = getDictionary(await getLocale());
  const documentId = z.string().min(1).parse(formData.get("documentId"));
  const visibility = documentVisibilityEnum.parse(formData.get("visibility"));

  await prisma.$transaction(async (tx) => {
    const document = await tx.document.findFirst({ where: { id: documentId, organizationId } });
    if (!document) throw new Error(t.validation.documentNotFound);
    await tx.document.update({ where: { id: documentId }, data: { visibility } });
    await auditUpdate(tx, {
      entityType: "Document",
      entityId: documentId,
      entityDisplayName: document.title,
      before: { visibility: document.visibility },
      after: { visibility },
    });
  });

  revalidatePath(`/documents/${documentId}`);
}

const changeSecurityContextSchema = z.object({
  documentId: z.string().min(1),
  securityContextEntityType: documentEntityTypeEnum,
  securityContextEntityId: z.string().trim().min(1),
});

/**
 * Security-context immutability policy (Step 73): changing a Document's
 * authoritative security context is possible, but deliberately gated
 * behind `document.visibility.manage` - held only by OWNER/ADMIN in this
 * codebase's RBAC (src/lib/permissions.ts) - and always fully audited with
 * both the old and new context. Because portal entitlement is resolved
 * fresh on every request (never cached), the recalculation this implies
 * for Tenant/Owner Portal access is immediate and automatic - there is no
 * separate "recalculate access" step to run.
 */
export async function changeDocumentSecurityContext(formData: FormData): Promise<void> {
  const { organizationId } = await requirePermission("document.visibility.manage");
  const t = getDictionary(await getLocale());
  const { user } = await requireSession();

  const rawEntityId = rawStringField(formData, "securityContextEntityId");
  const parsed = changeSecurityContextSchema.parse({
    documentId: formData.get("documentId"),
    securityContextEntityType: formData.get("securityContextEntityType"),
    securityContextEntityId: formData.get("securityContextEntityId"),
  });

  const entityExists = await entityExistsInOrganization(prisma, organizationId, parsed.securityContextEntityType, parsed.securityContextEntityId);
  if (!entityExists) {
    logDocumentEntityValidationFailure({
      stage: "document.changeSecurityContext",
      organizationId,
      entityType: parsed.securityContextEntityType,
      entityId: parsed.securityContextEntityId,
      rawEntityId,
    });
    throw new Error(t.validation.documentEntityNotFound);
  }

  await prisma.$transaction(async (tx) => {
    const document = await tx.document.findFirst({ where: { id: parsed.documentId, organizationId } });
    if (!document) throw new Error(t.validation.documentNotFound);

    await tx.document.update({
      where: { id: parsed.documentId },
      data: {
        securityContextEntityType: parsed.securityContextEntityType,
        securityContextEntityId: parsed.securityContextEntityId,
        securityContextChangedAt: new Date(),
        securityContextChangedByUserId: user.id,
      },
    });

    await auditUpdate(tx, {
      entityType: "Document",
      entityId: parsed.documentId,
      entityDisplayName: document.title,
      before: { securityContextEntityType: document.securityContextEntityType, securityContextEntityId: document.securityContextEntityId },
      after: { securityContextEntityType: parsed.securityContextEntityType, securityContextEntityId: parsed.securityContextEntityId },
    });
  });

  revalidatePath(`/documents/${parsed.documentId}`);
}

export async function archiveDocument(formData: FormData): Promise<void> {
  const { organizationId } = await requirePermission("document.archive");
  const { user } = await requireSession();
  const t = getDictionary(await getLocale());
  const documentId = z.string().min(1).parse(formData.get("documentId"));

  await prisma.$transaction(async (tx) => {
    const document = await tx.document.findFirst({ where: { id: documentId, organizationId } });
    if (!document) throw new Error(t.validation.documentNotFound);
    if (document.status === "ARCHIVED") return;

    await tx.document.update({ where: { id: documentId }, data: { status: "ARCHIVED", archivedAt: new Date(), archivedByUserId: user.id } });
    await auditAction(tx, { action: "ARCHIVE", entityType: "Document", entityId: documentId, entityDisplayName: document.title });
  });

  revalidatePath(`/documents/${documentId}`);
  revalidatePath("/documents");
}

export async function restoreDocument(formData: FormData): Promise<void> {
  const { organizationId } = await requirePermission("document.restore");
  const { user } = await requireSession();
  const t = getDictionary(await getLocale());
  const documentId = z.string().min(1).parse(formData.get("documentId"));

  await prisma.$transaction(async (tx) => {
    const document = await tx.document.findFirst({ where: { id: documentId, organizationId } });
    if (!document) throw new Error(t.validation.documentNotFound);
    if (document.status === "ACTIVE") return;

    await tx.document.update({ where: { id: documentId }, data: { status: "ACTIVE", restoredAt: new Date(), restoredByUserId: user.id } });
    await auditAction(tx, { action: "RESTORE", entityType: "Document", entityId: documentId, entityDisplayName: document.title });
  });

  revalidatePath(`/documents/${documentId}`);
  revalidatePath("/documents");
}

const linkSchema = z.object({
  documentId: z.string().min(1),
  entityType: documentEntityTypeEnum,
  entityId: z.string().trim().min(1),
});

/**
 * Adds a secondary, NON-authorizing discoverability link (Step 11/12/71) -
 * never consulted by any authorization check, only used so a Document can
 * also surface on another related page (e.g. showing a Contract's Document
 * on the linked Renter's profile too). The DB-level unique constraint
 * (Step 72) makes a resubmitted/duplicate link request a silent no-op
 * rather than an error.
 */
export async function addDocumentLink(formData: FormData): Promise<void> {
  const { organizationId } = await requirePermission("document.link.manage");
  const { user } = await requireSession();
  const t = getDictionary(await getLocale());

  const rawEntityId = rawStringField(formData, "entityId");
  const parsed = linkSchema.parse({
    documentId: formData.get("documentId"),
    entityType: formData.get("entityType"),
    entityId: formData.get("entityId"),
  });

  const entityExists = await entityExistsInOrganization(prisma, organizationId, parsed.entityType, parsed.entityId);
  if (!entityExists) {
    logDocumentEntityValidationFailure({
      stage: "document.addLink",
      organizationId,
      entityType: parsed.entityType,
      entityId: parsed.entityId,
      rawEntityId,
    });
    throw new Error(t.validation.documentEntityNotFound);
  }

  await prisma.$transaction(async (tx) => {
    const document = await tx.document.findFirst({ where: { id: parsed.documentId, organizationId } });
    if (!document) throw new Error(t.validation.documentNotFound);

    try {
      await tx.documentLink.create({
        data: { organizationId, documentId: parsed.documentId, entityType: parsed.entityType, entityId: parsed.entityId, createdByUserId: user.id },
      });
    } catch (err) {
      if (isUniqueConstraintError(err)) return;
      throw err;
    }

    await auditCreate(tx, {
      entityType: "DocumentLink",
      entityId: parsed.documentId,
      newValues: { entityType: parsed.entityType, entityId: parsed.entityId },
    });
  });

  revalidatePath(`/documents/${parsed.documentId}`);
}

export async function removeDocumentLink(formData: FormData): Promise<void> {
  const { organizationId } = await requirePermission("document.link.manage");
  const linkId = z.string().min(1).parse(formData.get("linkId"));

  let documentId: string | null = null;
  await prisma.$transaction(async (tx) => {
    const link = await tx.documentLink.findFirst({ where: { id: linkId, organizationId } });
    if (!link) return;
    documentId = link.documentId;
    await tx.documentLink.delete({ where: { id: linkId } });
    await auditAction(tx, {
      action: "DELETE",
      entityType: "DocumentLink",
      entityId: link.documentId,
      metadata: { entityType: link.entityType, entityId: link.entityId },
    });
  });

  if (documentId) revalidatePath(`/documents/${documentId}`);
}

export interface DocumentListFilters {
  category?: DocumentCategory;
  status?: DocumentStatus;
  entityType?: DocumentEntityType;
  entityId?: string;
  q?: string;
  page?: number;
  pageSize?: number;
}

/**
 * Server-side paginated list (Step 41/85) - a Document list can grow
 * unbounded, so this always paginates in the database rather than fetching
 * everything and slicing in memory. Never fetches binary data - only
 * metadata columns plus the current version's own small metadata (Step
 * 86). Archived documents are hidden by default (Step 33), only shown when
 * `status: "ARCHIVED"` is explicitly requested.
 */
export async function listDocuments(filters: DocumentListFilters) {
  const { organizationId } = await requirePermission("document.view");
  const page = Math.max(1, filters.page ?? 1);
  const pageSize = Math.min(Math.max(filters.pageSize ?? 20, 1), 100);

  const where: Prisma.DocumentWhereInput = {
    organizationId,
    status: filters.status ?? "ACTIVE",
    ...(filters.category ? { category: filters.category } : {}),
    ...(filters.entityType && filters.entityId ? { securityContextEntityType: filters.entityType, securityContextEntityId: filters.entityId } : {}),
    ...(filters.q ? { title: { contains: filters.q, mode: "insensitive" as const } } : {}),
  };

  const [rows, total] = await Promise.all([
    prisma.document.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: { currentVersion: { select: { fileName: true, mimeType: true, fileSize: true, createdAt: true } } },
    }),
    prisma.document.count({ where }),
  ]);

  return { rows, total, page, pageSize, totalPages: Math.max(1, Math.ceil(total / pageSize)) };
}

/** Full internal detail view (Step 44) - version history, links, and the audit trail, all internal-only (never reused for a portal DTO - see src/lib/documents/portal-dto.ts for that minimized shape). */
export async function getDocumentDetail(documentId: string) {
  const { organizationId } = await requirePermission("document.view");

  const document = await prisma.document.findFirst({
    where: { id: documentId, organizationId },
    include: {
      currentVersion: true,
      versions: { orderBy: { versionNumber: "desc" } },
      links: { orderBy: { createdAt: "desc" } },
    },
  });
  if (!document) {
    const t = getDictionary(await getLocale());
    throw new Error(t.validation.documentNotFound);
  }

  const auditTrail = await prisma.auditLog.findMany({
    where: { organizationId, entityType: { in: ["Document", "DocumentLink"] }, entityId: documentId },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  return { document, auditTrail };
}

/** Documents linked to a given entity (Step 45-48's integration cards) - internal-only, RBAC-gated same as every other document read. */
export async function listDocumentsForEntity(entityType: DocumentEntityType, entityId: string) {
  const { organizationId } = await requirePermission("document.view");
  return prisma.document.findMany({
    where: { organizationId, status: "ACTIVE", securityContextEntityType: entityType, securityContextEntityId: entityId },
    orderBy: { createdAt: "desc" },
    include: { currentVersion: { select: { fileName: true, mimeType: true, fileSize: true, createdAt: true } } },
  });
}
