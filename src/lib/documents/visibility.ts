/**
 * Pure visibility/access rules (Steps 9-10, 36, 40, 76-77). None of these
 * touch the database - they take already-resolved facts (visibility flag,
 * live entitlement boolean, document/version status) and answer a yes/no
 * question. The actual entitlement checks themselves (does this Tenant/
 * Owner really have live access to the linked entity?) live in
 * src/lib/documents/entity-registry.ts and src/lib/tenant-session.ts /
 * src/lib/owner-session.ts - never here.
 */

export type DocumentPrincipalType = "INTERNAL" | "TENANT" | "OWNER";
export type DocumentVisibilityValue = "INTERNAL_ONLY" | "TENANT_VISIBLE" | "OWNER_VISIBLE";
export type DocumentStatusValue = "ACTIVE" | "ARCHIVED";

/**
 * Step 10's dual gate: a portal principal may access a document only if
 * BOTH (a) its visibility flag permits that portal type AND (b) the caller
 * has already confirmed live entitlement against the security context.
 * `hasLiveEntitlement` must never be hardcoded true - it is the result of a
 * fresh, per-request DB check (getEffectiveOwners()/requireTenant*Access()).
 */
export function isDocumentAccessible(params: {
  principalType: DocumentPrincipalType;
  visibility: DocumentVisibilityValue;
  status: DocumentStatusValue;
  hasLiveEntitlement: boolean;
}): boolean {
  if (params.principalType === "INTERNAL") return true; // internal staff authorization is requirePermission(), applied separately
  if (!params.hasLiveEntitlement) return false;
  if (params.principalType === "TENANT") return params.visibility === "TENANT_VISIBLE";
  if (params.principalType === "OWNER") return params.visibility === "OWNER_VISIBLE";
  return false;
}

/**
 * A portal principal may only ever attempt to download while the document
 * is ACTIVE (Step 76) - an archived document is not portal-downloadable by
 * default, even if it would otherwise pass isDocumentAccessible(). Internal
 * staff with the right permission may still reach archived documents
 * (historical access), so this only applies to non-INTERNAL principals.
 */
export function isPortalDownloadAllowedForStatus(principalType: DocumentPrincipalType, status: DocumentStatusValue): boolean {
  if (principalType === "INTERNAL") return true;
  return status === "ACTIVE";
}

/**
 * Conservative version-download policy (Step 36/77): portals only ever get
 * the CURRENT version. Internal staff may request a specific historical
 * version id (governed by a separate permission at the call site), but a
 * portal request for any versionId other than the document's current one
 * is denied outright.
 */
export function isVersionDownloadAllowed(params: {
  principalType: DocumentPrincipalType;
  requestedVersionId: string;
  currentVersionId: string | null;
}): boolean {
  if (params.principalType === "INTERNAL") return true;
  return params.requestedVersionId === params.currentVersionId;
}

const INLINE_PREVIEWABLE_MIME_TYPES = new Set(["application/pdf", "image/jpeg", "image/png", "image/webp"]);

/**
 * Step 40: only these four types may ever be rendered inline; anything else
 * (even if somehow stored) is always forced to `attachment` disposition -
 * never arbitrary HTML/SVG rendered inline in the browser.
 */
export function isInlinePreviewable(mimeType: string): boolean {
  return INLINE_PREVIEWABLE_MIME_TYPES.has(mimeType);
}
