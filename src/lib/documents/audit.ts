import type { Prisma, PrismaClient } from "@prisma/client";
import { writeAuditLog } from "@/lib/audit";
import type { DocumentPrincipalType } from "@/lib/documents/visibility";

type Tx = Prisma.TransactionClient | PrismaClient;

/**
 * Records a document download/preview attempt (Step 64-66) - the one
 * mandatory download-audit path. Deliberately bypasses the generic
 * auditCreate()/auditAction() helpers in src/lib/audit.ts: those call
 * requireSession() internally to source identity, which only exists for
 * the INTERNAL principal type. A Tenant/Owner Portal download has no
 * internal session at all (they're separate NextAuth instances - see
 * src/lib/tenant-auth.ts / src/lib/owner-auth.ts), so this writes the
 * AuditLog row directly with whichever principal identity the caller
 * already resolved, always distinguishing INTERNAL/TENANT/OWNER via
 * `metadata.principalType` and never merging them into one shape. Never
 * logs file contents - only documentId/versionId/principal reference.
 */
export async function auditDocumentDownload(
  tx: Tx,
  params: {
    organizationId: string;
    principalType: DocumentPrincipalType;
    principalId: string;
    principalEmail?: string | null;
    documentId: string;
    versionId: string;
    documentTitle?: string;
  }
): Promise<void> {
  await writeAuditLog(tx, {
    organizationId: params.organizationId,
    userId: params.principalType === "INTERNAL" ? params.principalId : null,
    userEmail: params.principalEmail ?? null,
    userRole: params.principalType === "INTERNAL" ? null : params.principalType,
    action: "DOWNLOAD",
    entityType: "Document",
    entityId: params.documentId,
    entityDisplayName: params.documentTitle,
    metadata: {
      principalType: params.principalType,
      principalId: params.principalId,
      versionId: params.versionId,
    },
  });
}
