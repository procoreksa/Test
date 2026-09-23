"use server";

import { prisma } from "@/lib/prisma";
import { requireTenantPrincipal, requireTenantContractAccess } from "@/lib/tenant-session";

/** Step 27/39 - tenant-safe Move-In view: excludes internalNotes, staff identity, and every other internal-only field. Read-only (Step 41: tenant never initiates or edits a Move-In). */
export async function getTenantMoveIn(contractId: string) {
  await requireTenantContractAccess(contractId);
  const { organizationId } = await requireTenantPrincipal();

  return prisma.moveIn.findFirst({
    where: { organizationId, contractId },
    select: {
      id: true,
      moveInNumber: true,
      status: true,
      scheduledAt: true,
      startedAt: true,
      completedAt: true,
      handoverDate: true,
      overallCondition: true,
      tenantComments: true,
      tenantAcknowledgedAt: true,
      staffAcknowledgedAt: true,
      isFurnished: true,
      utilitiesReady: true,
      keysReady: true,
      cleaningComplete: true,
      unitReady: true,
      inspectionItems: {
        where: { isApplicable: true },
        orderBy: [{ category: "asc" }, { sequence: "asc" }],
        select: { id: true, category: true, itemName: true, itemNameAr: true, condition: true, notes: true, requiresAttention: true },
      },
      inventoryItems: { select: { id: true, category: true, itemName: true, quantity: true, condition: true, brand: true } },
      meterReadings: { select: { id: true, meterType: true, reading: true, unitOfMeasure: true, readingDate: true } },
      keyItems: { select: { id: true, keyType: true, description: true, quantity: true } },
    },
  });
}
