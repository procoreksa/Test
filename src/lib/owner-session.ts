import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/owner-auth";
import { getEffectiveOwners, type AssetLevel } from "@/lib/ownership";

/**
 * The Owner Portal's own authorization boundary - deliberately never
 * reuses src/lib/session.ts's requirePermission()/requireSession() (
 * internal-staff-only) nor src/lib/tenant-session.ts's own helpers
 * (tenant-only). See docs/OWNER-PORTAL.md, "Ownership entitlement
 * architecture". Every /owner-portal server action and every owner-safe
 * data query calls requireOwnerSession() (or one of the resource-specific
 * helpers below, which call it internally) before touching anything.
 *
 * Mirrors src/lib/tenant-session.ts's own reasoning for why this
 * `redirect()`s rather than throws: /owner-portal is deliberately excluded
 * from src/proxy.ts's internal-staff gate entirely (an owner is not an
 * internal staff user), so this is the *only* line of defense a real
 * owner can actually hit in normal use (an expired session, a bookmarked
 * page revisited after logout).
 */
export async function requireOwnerSession() {
  const session = await auth();
  if (!session?.owner) {
    redirect("/owner-portal/login");
  }
  return session;
}

export interface OwnerPrincipal {
  ownerAccountId: string;
  organizationId: string;
  ownerId: string;
}

async function principal(): Promise<OwnerPrincipal> {
  const session = await requireOwnerSession();
  return { ownerAccountId: session.owner.id, organizationId: session.owner.organizationId, ownerId: session.owner.ownerId };
}

/**
 * The one, authoritative "is this owner entitled to this asset" check -
 * always via getEffectiveOwners() (src/lib/ownership.ts), the exact same
 * resolver every internal ownership screen/report already uses. Never a
 * second ownership engine: this does not look at Contract, OwnerLedgerEntry,
 * or the URL id - only the live PropertyOwnership chain, evaluated "as of
 * now" (see docs/OWNER-PORTAL.md, "Historical ownership limitation").
 * Ownership is never cached/stored in the JWT, so a revocation made after
 * login takes effect on this exact call, with no re-login required.
 */
async function ownerHasEffectiveAccess(organizationId: string, ownerId: string, level: AssetLevel, assetId: string): Promise<boolean> {
  const owners = await getEffectiveOwners(prisma, organizationId, level, assetId);
  return owners.some((o) => o.ownerId === ownerId);
}

// ---------------------------------------------------------------------------
// Resource entitlement helpers - every one re-verifies fresh against the
// database on every call, via the authoritative ownership resolver above
// (never inferred from Contract/Unit location alone/OwnerLedgerEntry alone/
// a URL id/organizationId alone). A miss calls Next's own notFound() (same
// anti-enumeration convention as the Tenant Portal): the exact same neutral
// "Not Found" page renders whether the id is malformed, belongs to another
// owner's asset in the same organization, belongs to another organization,
// or (for a Unit) is explicitly owned by someone else even though this
// owner holds the parent Compound/Building - the override case is never
// distinguishable from "does not exist" (docs/OWNER-PORTAL.md, "Anti-
// enumeration"). See src/app/owner-portal/(portal)/not-found.tsx.
// ---------------------------------------------------------------------------

export async function requireOwnerCompoundAccess(compoundId: string) {
  const { organizationId, ownerId } = await principal();
  const compound = await prisma.compound.findFirst({ where: { id: compoundId, organizationId } });
  if (!compound) notFound();
  if (!(await ownerHasEffectiveAccess(organizationId, ownerId, "COMPOUND", compoundId))) notFound();
  return { compound, organizationId, ownerId };
}

export async function requireOwnerBuildingAccess(buildingId: string) {
  const { organizationId, ownerId } = await principal();
  const building = await prisma.building.findFirst({ where: { id: buildingId, organizationId } });
  if (!building) notFound();
  if (!(await ownerHasEffectiveAccess(organizationId, ownerId, "BUILDING", buildingId))) notFound();
  return { building, organizationId, ownerId };
}

export async function requireOwnerUnitAccess(unitId: string) {
  const { organizationId, ownerId } = await principal();
  const unit = await prisma.unit.findFirst({ where: { id: unitId, organizationId } });
  if (!unit) notFound();
  if (!(await ownerHasEffectiveAccess(organizationId, ownerId, "UNIT", unitId))) notFound();
  return { unit, organizationId, ownerId };
}

export async function requireOwnerContractAccess(contractId: string) {
  const { organizationId, ownerId } = await principal();
  const contract = await prisma.contract.findFirst({ where: { id: contractId, organizationId } });
  if (!contract) notFound();
  // A Contract is never authorized merely because organizationId matches -
  // entitlement always resolves through the Contract's own Unit.
  if (!(await ownerHasEffectiveAccess(organizationId, ownerId, "UNIT", contract.unitId))) notFound();
  return { contract, organizationId, ownerId };
}

export async function requireOwnerMaintenanceAccess(requestId: string) {
  const { organizationId, ownerId } = await principal();
  const request = await prisma.maintenanceRequest.findFirst({ where: { id: requestId, organizationId } });
  if (!request) notFound();

  const level: AssetLevel | null = request.unitId ? "UNIT" : request.buildingId ? "BUILDING" : request.compoundId ? "COMPOUND" : null;
  const assetId = request.unitId ?? request.buildingId ?? request.compoundId;
  if (!level || !assetId) notFound();
  if (!(await ownerHasEffectiveAccess(organizationId, ownerId, level, assetId))) notFound();
  return { request, organizationId, ownerId };
}

/**
 * Ledger entitlement is deliberately NOT property-based - even on a
 * shared asset, `entry.ownerId === authenticated ownerId` is the entire
 * rule (docs/OWNER-PORTAL.md, "Shared ownership": Owner A and Owner B may
 * both see the same Unit, but never each other's ledger). No asset
 * resolution happens here at all.
 */
export async function requireOwnerLedgerAccess(entryId: string) {
  const { organizationId, ownerId } = await principal();
  const entry = await prisma.ownerLedgerEntry.findFirst({ where: { id: entryId, organizationId, ownerId } });
  if (!entry) notFound();
  return { entry, organizationId, ownerId };
}

export { principal as requireOwnerPrincipal };
