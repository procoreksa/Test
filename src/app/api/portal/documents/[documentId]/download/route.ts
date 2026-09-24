import { requireTenantDocumentAccess } from "@/lib/tenant-session";
import { streamDocumentVersion } from "@/lib/documents/download";

/**
 * Tenant Portal download route (Step 55-57/96). Re-authorizes on every
 * request via requireTenantDocumentAccess() (the dual gate: visibility
 * must say TENANT_VISIBLE AND live entitlement against the document's
 * security context must confirm this exact authenticated renter) - never
 * trusts the documentId in the URL alone. Deliberately accepts no
 * `versionId` query parameter at all: a tenant can only ever reach the
 * document's current version (Step 36), enforced again inside
 * streamDocumentVersion() as a second, defense-in-depth check.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ documentId: string }> }) {
  const { documentId } = await params;
  // requireTenantDocumentAccess() calls Next's notFound() (a thrown
  // redirect-shaped error) on any miss - the same neutral 404 whether the
  // document doesn't exist, belongs to another tenant, or isn't
  // TENANT_VISIBLE, per this portal's established anti-enumeration
  // convention (src/lib/tenant-session.ts).
  const { document, organizationId, renterId } = await requireTenantDocumentAccess(documentId);

  return streamDocumentVersion({
    organizationId,
    document,
    requestedVersionId: null,
    principalType: "TENANT",
    principalId: renterId,
    inlinePreferred: true,
  });
}
