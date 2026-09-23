"use server";

import { prisma } from "@/lib/prisma";
import { requireTenantPrincipal, requireTenantContractAccess } from "@/lib/tenant-session";
import { selectCurrentTenancy } from "@/lib/portal/tenancy-rules";

/**
 * Tenant-safe Contract data (Step 17/63): a dedicated select, never a full
 * Prisma record - excludes `notes` (internal), owner/ownership data, and
 * every other internal-only Contract field. Reused by the dashboard,
 * /portal/contracts, and /portal/contracts/[id].
 */
const TENANT_CONTRACT_SELECT = {
  id: true,
  contractNumber: true,
  status: true,
  startDate: true,
  endDate: true,
  rentAmount: true,
  paymentFrequency: true,
  securityDeposit: true,
  commissionAmount: true,
  cleaningAmount: true,
  renewedFromContractId: true,
  renewedIntoContract: { select: { id: true, contractNumber: true } },
  unit: {
    select: {
      id: true,
      unitNumber: true,
      floor: { select: { name: true, building: { select: { name: true, nameAr: true, compound: { select: { name: true, arabicName: true } } } } } },
    },
  },
} as const;

export async function getTenantContracts() {
  const { renterId, organizationId } = await requireTenantPrincipal();
  const contracts = await prisma.contract.findMany({
    where: { organizationId, renterId },
    select: TENANT_CONTRACT_SELECT,
    orderBy: { startDate: "desc" },
  });
  return selectCurrentTenancy(contracts);
}

export async function getTenantContractDetail(contractId: string) {
  await requireTenantContractAccess(contractId);
  const { renterId, organizationId } = await requireTenantPrincipal();
  return prisma.contract.findFirstOrThrow({ where: { id: contractId, organizationId, renterId }, select: TENANT_CONTRACT_SELECT });
}

/** Step 13 - only the safe, already-public-facing branding subset (name/logo), never any internal organization configuration (VAT number, commercial registration, etc). */
export async function getTenantOrganizationBranding() {
  const { organizationId } = await requireTenantPrincipal();
  return prisma.organization.findUniqueOrThrow({ where: { id: organizationId }, select: { name: true, nameAr: true, logoUrl: true } });
}
