import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/tenant-auth";

/**
 * The Tenant Portal's own authorization boundary - deliberately never
 * reuses src/lib/session.ts's requirePermission()/requireSession(), which
 * are internal-staff-only (see docs/TENANT-PORTAL.md, "Entitlement
 * architecture"). Every /portal server action and every tenant-safe data
 * query calls requireTenantSession() (or one of the resource-specific
 * helpers below, which call it internally) before touching anything.
 *
 * Unlike src/lib/session.ts's own requireSession() (a bare throw, safe
 * there only because src/proxy.ts's internal-staff gate already redirects
 * any unauthenticated request to /login before an internal page ever
 * renders), /portal/* is deliberately excluded from that gate entirely
 * (see src/proxy.ts) - a tenant is not an internal staff user and must
 * never be checked against the internal session. That means this is the
 * *only* line of defense a real tenant can actually hit in normal use
 * (an expired session, a bookmarked page revisited after logout), so it
 * redirects to the tenant login page instead of throwing a raw error.
 */
export async function requireTenantSession() {
  const session = await auth();
  if (!session?.tenant) {
    redirect("/portal/login");
  }
  return session;
}

export interface TenantPrincipal {
  tenantAccountId: string;
  organizationId: string;
  renterId: string;
}

async function principal(): Promise<TenantPrincipal> {
  const session = await requireTenantSession();
  return { tenantAccountId: session.tenant.id, organizationId: session.tenant.organizationId, renterId: session.tenant.renterId };
}

// ---------------------------------------------------------------------------
// Resource entitlement helpers (Step 8/9) - every one derives access from
// TenantPortalAccount -> Renter -> Contract -> resource, re-verified fresh
// against the database on every call. None of these ever accepts or trusts
// a client-supplied organizationId/renterId - both come only from the
// signed session. A miss calls Next's own notFound() (Step 10 -
// anti-enumeration): the exact same neutral "Not Found" page renders
// whether the id is malformed, belongs to another tenant in the same
// organization, or belongs to another organization entirely - never a
// distinguishable signal either way. See src/app/portal/(portal)/not-found.tsx.
// ---------------------------------------------------------------------------

export async function requireTenantContractAccess(contractId: string) {
  const { organizationId, renterId } = await principal();
  const contract = await prisma.contract.findFirst({ where: { id: contractId, organizationId, renterId } });
  if (!contract) notFound();
  return { contract, organizationId, renterId };
}

export async function requireTenantInvoiceAccess(invoiceId: string) {
  const { organizationId, renterId } = await principal();
  const invoice = await prisma.invoice.findFirst({ where: { id: invoiceId, organizationId, renterId } });
  if (!invoice) notFound();
  return { invoice, organizationId, renterId };
}

export async function requireTenantMaintenanceAccess(requestId: string) {
  const { organizationId, renterId } = await principal();
  const request = await prisma.maintenanceRequest.findFirst({ where: { id: requestId, organizationId, renterId } });
  if (!request) notFound();
  return { request, organizationId, renterId };
}

export async function requireTenantMoveInAccess(moveInId: string) {
  const { organizationId, renterId } = await principal();
  const moveIn = await prisma.moveIn.findFirst({ where: { id: moveInId, organizationId, renterId } });
  if (!moveIn) notFound();
  return { moveIn, organizationId, renterId };
}

export async function requireTenantMoveOutAccess(moveOutId: string) {
  const { organizationId, renterId } = await principal();
  const moveOut = await prisma.moveOut.findFirst({ where: { id: moveOutId, organizationId, renterId } });
  if (!moveOut) notFound();
  return { moveOut, organizationId, renterId };
}

/**
 * Settlement ownership only - visibility-by-status (Step 45) is applied by
 * the tenant-safe DTO layer (tenant-portal-views.ts), not here, so this
 * helper stays a pure ownership check reusable by anything that needs it.
 */
export async function requireTenantSettlementAccess(settlementId: string) {
  const { organizationId, renterId } = await principal();
  const settlement = await prisma.securityDepositSettlement.findFirst({ where: { id: settlementId, organizationId, renterId } });
  if (!settlement) notFound();
  return { settlement, organizationId, renterId };
}

export { principal as requireTenantPrincipal };
