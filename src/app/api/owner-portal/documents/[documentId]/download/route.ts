import { requireOwnerDocumentAccess } from "@/lib/owner-session";
import { streamDocumentVersion } from "@/lib/documents/download";

/**
 * Owner Portal download route (Step 58-60/97) - the same shape as the
 * Tenant Portal route, re-authorizing via requireOwnerDocumentAccess() on
 * every request (visibility must say OWNER_VISIBLE AND live ownership
 * entitlement, via getEffectiveOwners(), must confirm this exact owner).
 * No `versionId` query parameter accepted - an owner only ever reaches the
 * document's current version.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ documentId: string }> }) {
  const { documentId } = await params;
  const { document, organizationId, ownerId } = await requireOwnerDocumentAccess(documentId);

  return streamDocumentVersion({
    organizationId,
    document,
    requestedVersionId: null,
    principalType: "OWNER",
    principalId: ownerId,
    inlinePreferred: true,
  });
}
