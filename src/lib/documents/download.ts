import { prisma } from "@/lib/prisma";
import { getStorageProviderByKind } from "@/lib/documents/providers/factory";
import { isInlinePreviewable, isVersionDownloadAllowed, type DocumentPrincipalType } from "@/lib/documents/visibility";
import { safeContentDisposition } from "@/lib/documents/filename";
import { auditDocumentDownload } from "@/lib/documents/audit";
import type { Document, DocumentVersion } from "@prisma/client";

/**
 * Shared streaming/authorization-tail logic behind every one of the three
 * download routes (internal/tenant/owner - Step 35/66). Each route's own
 * job is only to authenticate its own principal type and resolve+authorize
 * the Document itself (via requirePermission()/requireTenantDocumentAccess()/
 * requireOwnerDocumentAccess()); by the time this function is called, that
 * decision has already been made. This function's own job is everything
 * after: which version, streamed how, with which headers - the parts that
 * must behave identically no matter which principal type asked.
 */
export async function streamDocumentVersion(params: {
  organizationId: string;
  document: Document;
  requestedVersionId?: string | null;
  principalType: DocumentPrincipalType;
  principalId: string;
  principalEmail?: string | null;
  inlinePreferred: boolean;
}): Promise<Response> {
  const targetVersionId = params.requestedVersionId ?? params.document.currentVersionId;
  if (!targetVersionId) return new Response("Not Found", { status: 404 });

  // Step 36: portals may only ever reach the document's current version -
  // a historical versionId in the query string is rejected outright for
  // non-INTERNAL principals, never silently redirected to the current one
  // (that would mask the fact that a different version was requested).
  if (!isVersionDownloadAllowed({ principalType: params.principalType, requestedVersionId: targetVersionId, currentVersionId: params.document.currentVersionId })) {
    return new Response("Not Found", { status: 404 });
  }

  const version: DocumentVersion | null = await prisma.documentVersion.findFirst({
    where: { id: targetVersionId, organizationId: params.organizationId, documentId: params.document.id },
  });
  if (!version) return new Response("Not Found", { status: 404 });

  const provider = getStorageProviderByKind(version.storageProvider);
  const bytes = await provider.getObject({ key: version.storageKey });
  if (!bytes) {
    // Step 81: DB metadata exists but the storage object is missing - a
    // safe, non-leaking 404 rather than a 500 that might hint at internal
    // state. Best-effort integrity audit; never blocks the response.
    await auditDocumentDownload(prisma, {
      organizationId: params.organizationId,
      principalType: params.principalType,
      principalId: params.principalId,
      principalEmail: params.principalEmail,
      documentId: params.document.id,
      versionId: version.id,
      documentTitle: `${params.document.title} [STORAGE OBJECT MISSING]`,
    }).catch(() => {});
    return new Response("Not Found", { status: 404 });
  }

  const inline = params.inlinePreferred && isInlinePreviewable(version.mimeType);

  await auditDocumentDownload(prisma, {
    organizationId: params.organizationId,
    principalType: params.principalType,
    principalId: params.principalId,
    principalEmail: params.principalEmail,
    documentId: params.document.id,
    versionId: version.id,
    documentTitle: params.document.title,
  });

  return new Response(new Uint8Array(bytes), {
    status: 200,
    headers: {
      "Content-Type": version.mimeType,
      "Content-Length": String(bytes.length),
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, no-store",
      "Content-Disposition": safeContentDisposition(version.fileName, inline ? "inline" : "attachment"),
    },
  });
}
