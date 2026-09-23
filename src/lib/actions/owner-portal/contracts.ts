"use server";

import { prisma } from "@/lib/prisma";
import { requireOwnerPrincipal, requireOwnerContractAccess } from "@/lib/owner-session";
import { resolveOwnerEffectiveUnits } from "@/lib/owner-portfolio-query";

/**
 * Owner-safe Contract/Renter DTOs (Step 46-49). Deliberately excludes every
 * tenant-PII field the spec's "do not expose" list names - Renter's
 * idType/idNumber/vatNumber/phone/email/address, and any CRM/Lead/Viewing
 * history - selecting only `fullName`/`fullNameAr`. Rent-collection detail
 * (invoices/payments/schedules) is likewise never surfaced here or
 * anywhere in the Owner Portal - that boundary belongs to the Tenant
 * Portal and the internal app only; the owner's own financial picture
 * comes exclusively from the Owner Ledger (src/lib/actions/owner-portal/financials.ts).
 */
const OWNER_SAFE_CONTRACT_SELECT = {
  id: true,
  contractNumber: true,
  status: true,
  startDate: true,
  endDate: true,
  rentAmount: true,
  paymentFrequency: true,
  unit: { select: { id: true, unitNumber: true, floor: { select: { building: { select: { name: true, nameAr: true, compound: { select: { name: true, arabicName: true } } } } } } } },
  renter: { select: { fullName: true, fullNameAr: true } },
} as const;

export async function getOwnerPortalContracts() {
  const { organizationId, ownerId } = await requireOwnerPrincipal();
  const units = await resolveOwnerEffectiveUnits(organizationId, ownerId);
  const unitIds = units.map((u) => u.unitId);
  if (unitIds.length === 0) return [];

  return prisma.contract.findMany({
    where: { organizationId, unitId: { in: unitIds } },
    select: OWNER_SAFE_CONTRACT_SELECT,
    orderBy: { startDate: "desc" },
  });
}

export async function getOwnerPortalContractDetail(contractId: string) {
  const { organizationId } = await requireOwnerContractAccess(contractId);
  return prisma.contract.findFirstOrThrow({ where: { id: contractId, organizationId }, select: OWNER_SAFE_CONTRACT_SELECT });
}
