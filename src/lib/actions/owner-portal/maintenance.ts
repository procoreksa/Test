"use server";

import { prisma } from "@/lib/prisma";
import { requireOwnerPrincipal, requireOwnerMaintenanceAccess } from "@/lib/owner-session";
import { resolveOwnerEffectiveScope } from "@/lib/owner-portfolio-query";

/**
 * Owner-safe Maintenance DTOs (Step 68-73). Read-only in V1 - no create/
 * triage/assign/status-change action exists anywhere in this file, matching
 * the spec's explicit "no feature creep" instruction. Data minimization:
 * never exposes tenant contact info, internal staff notes, or vendor
 * confidential terms (labor/parts cost breakdowns, vendor names/contract
 * terms) - only the owner-safe field list the spec names explicitly.
 */
const OWNER_SAFE_MAINTENANCE_SELECT = {
  id: true,
  requestNumber: true,
  category: true,
  priority: true,
  status: true,
  description: true,
  reportedAt: true,
  resolvedAt: true,
  compound: { select: { name: true, arabicName: true } },
  building: { select: { name: true, nameAr: true } },
  unit: { select: { unitNumber: true } },
  workOrders: { select: { status: true, completedAt: true, costResponsibility: true, actualCost: true } },
} as const;

export async function getOwnerPortalMaintenanceRequests() {
  const { organizationId, ownerId } = await requireOwnerPrincipal();
  const scope = await resolveOwnerEffectiveScope(organizationId, ownerId);

  const unitIds = Array.from(scope.unitIds);
  const buildingIds = Array.from(scope.buildingIds);
  const compoundIds = Array.from(scope.compoundIds);
  if (unitIds.length === 0 && buildingIds.length === 0 && compoundIds.length === 0) return [];

  return prisma.maintenanceRequest.findMany({
    where: {
      organizationId,
      OR: [{ unitId: { in: unitIds } }, { buildingId: { in: buildingIds } }, { compoundId: { in: compoundIds } }],
    },
    orderBy: { reportedAt: "desc" },
    select: OWNER_SAFE_MAINTENANCE_SELECT,
  });
}

/**
 * "Operational Maintenance Cost" vs "Owner Expense" (Step 71/74): the
 * caller is always shown the Work Order's own `actualCost` labeled as the
 * operational cost of the work performed - it never by itself becomes an
 * "Owner Expense" claim. An actual Owner Expense only exists once a real
 * OwnerLedgerEntry records it (checked here by entryType MAINTENANCE_EXPENSE
 * against this request's own unit/compound and owner); if none exists yet
 * (the common case today - Security Deposit Settlement audit confirmed no
 * automatic maintenance-to-ledger posting exists), `ownerExpenseAmount` is
 * null and the UI must say so plainly rather than implying one exists.
 */
export async function getOwnerPortalMaintenanceRequestDetail(requestId: string) {
  const { request, organizationId, ownerId } = await requireOwnerMaintenanceAccess(requestId);
  const detail = await prisma.maintenanceRequest.findFirstOrThrow({ where: { id: requestId, organizationId }, select: OWNER_SAFE_MAINTENANCE_SELECT });

  const ledgerMatch = await prisma.ownerLedgerEntry.findFirst({
    where: {
      organizationId,
      ownerId,
      entryType: "MAINTENANCE_EXPENSE",
      referenceType: "MaintenanceRequest",
      referenceId: request.id,
    },
    select: { debit: true },
  });

  return { request: detail, ownerExpenseAmount: ledgerMatch?.debit ?? null };
}
