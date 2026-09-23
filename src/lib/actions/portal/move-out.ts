"use server";

import { prisma } from "@/lib/prisma";
import { requireTenantPrincipal, requireTenantContractAccess } from "@/lib/tenant-session";

/**
 * Step 38-42 - tenant-safe Move-Out view: excludes internalNotes,
 * findingsReviewedByUserId/findingsReviewedAt (internal workflow
 * timestamp), and staff identity. A finding is shown as an observed
 * condition only (Step 40 - never labeled "Tenant Charge"; that label only
 * ever appears on an APPROVED SecurityDepositSettlement assessment, a
 * completely separate read in security-deposit.ts). Read-only - the
 * tenant never initiates a Move-Out (Step 41).
 */
export async function getTenantMoveOut(contractId: string) {
  await requireTenantContractAccess(contractId);
  const { organizationId } = await requireTenantPrincipal();

  return prisma.moveOut.findFirst({
    where: { organizationId, contractId },
    select: {
      id: true,
      moveOutNumber: true,
      status: true,
      scheduledAt: true,
      startedAt: true,
      completedAt: true,
      vacateDate: true,
      tenantComments: true,
      tenantAcknowledgedAt: true,
      staffAcknowledgedAt: true,
      noKeysToReturn: true,
      inspectionItems: {
        where: { isApplicable: true },
        orderBy: [{ category: "asc" }, { sequence: "asc" }],
        select: { id: true, category: true, itemName: true, itemNameAr: true, condition: true, notes: true, requiresAttention: true },
      },
      inventoryItems: { select: { id: true, category: true, itemName: true, quantity: true, condition: true } },
      meterReadings: { select: { id: true, meterType: true, reading: true, unitOfMeasure: true, readingDate: true } },
      keyItems: { select: { id: true, keyType: true, description: true, quantity: true } },
      maintenanceRequests: { select: { id: true, requestNumber: true, status: true, category: true, title: true } },
    },
  });
}
