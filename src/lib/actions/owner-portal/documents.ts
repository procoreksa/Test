"use server";

import { prisma } from "@/lib/prisma";
import { requireOwnerPrincipal } from "@/lib/owner-session";
import { resolveOwnerEntitlementForEntity } from "@/lib/documents/entity-registry";
import { toPortalDocumentDto, type PortalDocumentDto } from "@/lib/documents/portal-dto";

/**
 * Owner-safe document list (Step 58/61) - the same shape and the same
 * dual-gate pattern as getTenantDocuments() (src/lib/actions/portal/
 * documents.ts), reusing getEffectiveOwners() (via the entity registry)
 * for live ownership entitlement, including the override/shared-ownership
 * cases (Step 59/60) - never a second ownership resolver.
 */
export async function getOwnerDocuments(): Promise<PortalDocumentDto[]> {
  const { organizationId, ownerId } = await requireOwnerPrincipal();

  const candidates = await prisma.document.findMany({
    where: { organizationId, status: "ACTIVE", visibility: "OWNER_VISIBLE" },
    include: { currentVersion: true },
    orderBy: { createdAt: "desc" },
  });

  const entitled: PortalDocumentDto[] = [];
  for (const doc of candidates) {
    const hasAccess = await resolveOwnerEntitlementForEntity(prisma, {
      organizationId,
      ownerId,
      entityType: doc.securityContextEntityType,
      entityId: doc.securityContextEntityId,
    });
    if (hasAccess) entitled.push(toPortalDocumentDto(doc));
  }
  return entitled;
}
