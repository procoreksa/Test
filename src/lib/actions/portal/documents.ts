"use server";

import { prisma } from "@/lib/prisma";
import { requireTenantPrincipal } from "@/lib/tenant-session";
import { resolveTenantEntitlementForEntity } from "@/lib/documents/entity-registry";
import { toPortalDocumentDto, type PortalDocumentDto } from "@/lib/documents/portal-dto";

/**
 * Tenant-safe document list (Step 55/56). Re-derives entitlement for every
 * ACTIVE, TENANT_VISIBLE document in this organization rather than
 * assuming a DocumentLink or securityContext match alone is sufficient -
 * the same dual-gate every download goes through. Returns only the
 * minimized PortalDocumentDto shape (no storageKey/checksum/uploader
 * identity/historical versions/audit/internal links - see
 * src/lib/documents/portal-dto.ts).
 */
export async function getTenantDocuments(): Promise<PortalDocumentDto[]> {
  const { organizationId, renterId } = await requireTenantPrincipal();

  const candidates = await prisma.document.findMany({
    where: { organizationId, status: "ACTIVE", visibility: "TENANT_VISIBLE" },
    include: { currentVersion: true },
    orderBy: { createdAt: "desc" },
  });

  const entitled: PortalDocumentDto[] = [];
  for (const doc of candidates) {
    const hasAccess = await resolveTenantEntitlementForEntity(prisma, {
      organizationId,
      renterId,
      entityType: doc.securityContextEntityType,
      entityId: doc.securityContextEntityId,
    });
    if (hasAccess) entitled.push(toPortalDocumentDto(doc));
  }
  return entitled;
}
