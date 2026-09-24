import type { Prisma, PrismaClient, DocumentEntityType } from "@prisma/client";
import { getEffectiveOwners } from "@/lib/ownership";

type Tx = Prisma.TransactionClient | PrismaClient;

/**
 * The centralized Link Authorization Registry (Step 6). Every place in the
 * codebase that needs to know "does entity X exist in this organization?"
 * or "is this Tenant/Owner entitled to entity X?" goes through this file -
 * never a switch statement scattered across server actions or pages. Adding
 * a new supported DocumentEntityType means adding one entry here; nothing
 * else needs to change.
 *
 * `resolveTenantEntitlement`/`resolveOwnerEntitlement` are deliberately
 * conservative: an entity type not listed in Step 55's tenant allow-list
 * (Contract, Move-In, Move-Out, Security Deposit Settlement, and the
 * Renter's own identity) always resolves tenant entitlement to `false`,
 * even though the *code* to compute a real answer would be
 * straightforward - Private by Default (Critical Principle 4) means a new
 * entity type is closed to a portal until a deliberate decision opens it,
 * never open by default because nobody added the `false` case. Owner
 * entitlement reuses `getEffectiveOwners()` (src/lib/ownership.ts) for
 * every asset-shaped entity (UNIT/BUILDING/COMPOUND, and CONTRACT/
 * MAINTENANCE_REQUEST/MOVE_IN/MOVE_OUT/SECURITY_DEPOSIT_SETTLEMENT resolved
 * through their linked asset) - this file never reimplements ownership
 * resolution itself.
 */
export interface EntityRegistryEntry {
  /** Does an entity with this id exist in this organization at all? Used at upload time (Step 27's "validate entity context") and for link validation (Step 71). */
  existsInOrganization(tx: Tx, organizationId: string, entityId: string): Promise<boolean>;
  resolveTenantEntitlement(tx: Tx, params: { organizationId: string; renterId: string; entityId: string }): Promise<boolean>;
  resolveOwnerEntitlement(tx: Tx, params: { organizationId: string; ownerId: string; entityId: string }): Promise<boolean>;
}

const never = false;
async function alwaysFalse(): Promise<boolean> {
  return never;
}

const registry: Record<DocumentEntityType, EntityRegistryEntry> = {
  RENTER: {
    async existsInOrganization(tx, organizationId, entityId) {
      return (await tx.renter.count({ where: { id: entityId, organizationId } })) > 0;
    },
    async resolveTenantEntitlement(_tx, params) {
      return params.entityId === params.renterId;
    },
    resolveOwnerEntitlement: alwaysFalse,
  },

  OWNER: {
    async existsInOrganization(tx, organizationId, entityId) {
      return (await tx.owner.count({ where: { id: entityId, organizationId } })) > 0;
    },
    resolveTenantEntitlement: alwaysFalse,
    async resolveOwnerEntitlement(_tx, params) {
      return params.entityId === params.ownerId;
    },
  },

  CONTRACT: {
    async existsInOrganization(tx, organizationId, entityId) {
      return (await tx.contract.count({ where: { id: entityId, organizationId } })) > 0;
    },
    async resolveTenantEntitlement(tx, params) {
      const contract = await tx.contract.findUnique({ where: { id: params.entityId, organizationId: params.organizationId }, select: { renterId: true } });
      return contract?.renterId === params.renterId;
    },
    async resolveOwnerEntitlement(tx, params) {
      const contract = await tx.contract.findUnique({ where: { id: params.entityId, organizationId: params.organizationId }, select: { unitId: true } });
      if (!contract) return false;
      const owners = await getEffectiveOwners(tx, params.organizationId, "UNIT", contract.unitId);
      return owners.some((o) => o.ownerId === params.ownerId);
    },
  },

  UNIT: {
    async existsInOrganization(tx, organizationId, entityId) {
      return (await tx.unit.count({ where: { id: entityId, organizationId } })) > 0;
    },
    async resolveTenantEntitlement(tx, params) {
      const contract = await tx.contract.findFirst({
        where: { organizationId: params.organizationId, unitId: params.entityId, renterId: params.renterId },
        select: { id: true },
      });
      return contract !== null;
    },
    async resolveOwnerEntitlement(tx, params) {
      const owners = await getEffectiveOwners(tx, params.organizationId, "UNIT", params.entityId);
      return owners.some((o) => o.ownerId === params.ownerId);
    },
  },

  COMPOUND: {
    async existsInOrganization(tx, organizationId, entityId) {
      return (await tx.compound.count({ where: { id: entityId, organizationId } })) > 0;
    },
    // Compound-level documents are never in the Tenant Portal's allow-list
    // (Step 55) - a tenant's relationship is always to a Unit/Contract, not
    // to the compound as a whole.
    resolveTenantEntitlement: alwaysFalse,
    async resolveOwnerEntitlement(tx, params) {
      const owners = await getEffectiveOwners(tx, params.organizationId, "COMPOUND", params.entityId);
      return owners.some((o) => o.ownerId === params.ownerId);
    },
  },

  BUILDING: {
    async existsInOrganization(tx, organizationId, entityId) {
      return (await tx.building.count({ where: { id: entityId, organizationId } })) > 0;
    },
    resolveTenantEntitlement: alwaysFalse,
    async resolveOwnerEntitlement(tx, params) {
      const owners = await getEffectiveOwners(tx, params.organizationId, "BUILDING", params.entityId);
      return owners.some((o) => o.ownerId === params.ownerId);
    },
  },

  INVOICE: {
    async existsInOrganization(tx, organizationId, entityId) {
      return (await tx.invoice.count({ where: { id: entityId, organizationId } })) > 0;
    },
    async resolveTenantEntitlement(tx, params) {
      const invoice = await tx.invoice.findUnique({ where: { id: params.entityId, organizationId: params.organizationId }, select: { renterId: true } });
      return invoice?.renterId === params.renterId;
    },
    // Never owner-entitled (Step 53/91 Financial Isolation) - an uploaded
    // PAYMENT_RECEIPT/invoice-evidence document is tenant/internal evidence
    // only, never surfaced through the Owner Portal's separate ledger/
    // statement mechanism.
    resolveOwnerEntitlement: alwaysFalse,
  },

  PAYMENT: {
    async existsInOrganization(tx, organizationId, entityId) {
      return (await tx.payment.count({ where: { id: entityId, organizationId } })) > 0;
    },
    async resolveTenantEntitlement(tx, params) {
      const payment = await tx.payment.findUnique({ where: { id: params.entityId, organizationId: params.organizationId }, select: { renterId: true } });
      return payment?.renterId === params.renterId;
    },
    resolveOwnerEntitlement: alwaysFalse,
  },

  MAINTENANCE_REQUEST: {
    async existsInOrganization(tx, organizationId, entityId) {
      return (await tx.maintenanceRequest.count({ where: { id: entityId, organizationId } })) > 0;
    },
    async resolveTenantEntitlement(tx, params) {
      const request = await tx.maintenanceRequest.findUnique({
        where: { id: params.entityId, organizationId: params.organizationId },
        select: { renterId: true },
      });
      return request?.renterId === params.renterId;
    },
    async resolveOwnerEntitlement(tx, params) {
      const request = await tx.maintenanceRequest.findUnique({
        where: { id: params.entityId, organizationId: params.organizationId },
        select: { unitId: true, buildingId: true, compoundId: true },
      });
      if (!request) return false;
      const [level, assetId] = request.unitId
        ? (["UNIT", request.unitId] as const)
        : request.buildingId
          ? (["BUILDING", request.buildingId] as const)
          : request.compoundId
            ? (["COMPOUND", request.compoundId] as const)
            : [null, null];
      if (!level || !assetId) return false;
      const owners = await getEffectiveOwners(tx, params.organizationId, level, assetId);
      return owners.some((o) => o.ownerId === params.ownerId);
    },
  },

  MOVE_IN: {
    async existsInOrganization(tx, organizationId, entityId) {
      return (await tx.moveIn.count({ where: { id: entityId, organizationId } })) > 0;
    },
    async resolveTenantEntitlement(tx, params) {
      const moveIn = await tx.moveIn.findUnique({ where: { id: params.entityId, organizationId: params.organizationId }, select: { renterId: true } });
      return moveIn?.renterId === params.renterId;
    },
    async resolveOwnerEntitlement(tx, params) {
      const moveIn = await tx.moveIn.findUnique({ where: { id: params.entityId, organizationId: params.organizationId }, select: { unitId: true } });
      if (!moveIn) return false;
      const owners = await getEffectiveOwners(tx, params.organizationId, "UNIT", moveIn.unitId);
      return owners.some((o) => o.ownerId === params.ownerId);
    },
  },

  MOVE_OUT: {
    async existsInOrganization(tx, organizationId, entityId) {
      return (await tx.moveOut.count({ where: { id: entityId, organizationId } })) > 0;
    },
    async resolveTenantEntitlement(tx, params) {
      const moveOut = await tx.moveOut.findUnique({ where: { id: params.entityId, organizationId: params.organizationId }, select: { renterId: true } });
      return moveOut?.renterId === params.renterId;
    },
    async resolveOwnerEntitlement(tx, params) {
      const moveOut = await tx.moveOut.findUnique({ where: { id: params.entityId, organizationId: params.organizationId }, select: { unitId: true } });
      if (!moveOut) return false;
      const owners = await getEffectiveOwners(tx, params.organizationId, "UNIT", moveOut.unitId);
      return owners.some((o) => o.ownerId === params.ownerId);
    },
  },

  SECURITY_DEPOSIT_SETTLEMENT: {
    async existsInOrganization(tx, organizationId, entityId) {
      return (await tx.securityDepositSettlement.count({ where: { id: entityId, organizationId } })) > 0;
    },
    async resolveTenantEntitlement(tx, params) {
      const settlement = await tx.securityDepositSettlement.findUnique({
        where: { id: params.entityId, organizationId: params.organizationId },
        select: { renterId: true },
      });
      return settlement?.renterId === params.renterId;
    },
    async resolveOwnerEntitlement(tx, params) {
      const settlement = await tx.securityDepositSettlement.findUnique({
        where: { id: params.entityId, organizationId: params.organizationId },
        select: { unitId: true },
      });
      if (!settlement) return false;
      const owners = await getEffectiveOwners(tx, params.organizationId, "UNIT", settlement.unitId);
      return owners.some((o) => o.ownerId === params.ownerId);
    },
  },

  // Internal-only (Step 54): no Corporate Portal exists, and a
  // CorporateAccount/CorporateOccupant document is never exposed through
  // either the Tenant or Owner Portal.
  CORPORATE_ACCOUNT: {
    async existsInOrganization(tx, organizationId, entityId) {
      return (await tx.corporateAccount.count({ where: { id: entityId, organizationId } })) > 0;
    },
    resolveTenantEntitlement: alwaysFalse,
    resolveOwnerEntitlement: alwaysFalse,
  },

  CORPORATE_OCCUPANT: {
    async existsInOrganization(tx, organizationId, entityId) {
      return (await tx.corporateOccupant.count({ where: { id: entityId, organizationId } })) > 0;
    },
    resolveTenantEntitlement: alwaysFalse,
    resolveOwnerEntitlement: alwaysFalse,
  },
};

export function getEntityRegistryEntry(entityType: DocumentEntityType): EntityRegistryEntry {
  return registry[entityType];
}

export async function entityExistsInOrganization(tx: Tx, organizationId: string, entityType: DocumentEntityType, entityId: string): Promise<boolean> {
  return getEntityRegistryEntry(entityType).existsInOrganization(tx, organizationId, entityId);
}

export async function resolveTenantEntitlementForEntity(
  tx: Tx,
  params: { organizationId: string; renterId: string; entityType: DocumentEntityType; entityId: string }
): Promise<boolean> {
  return getEntityRegistryEntry(params.entityType).resolveTenantEntitlement(tx, params);
}

export async function resolveOwnerEntitlementForEntity(
  tx: Tx,
  params: { organizationId: string; ownerId: string; entityType: DocumentEntityType; entityId: string }
): Promise<boolean> {
  return getEntityRegistryEntry(params.entityType).resolveOwnerEntitlement(tx, params);
}
