/**
 * The single authoritative location-resolution helper for Maintenance
 * (Step 5/11/12) - every action that creates or re-derives a Maintenance
 * Request's location calls this instead of re-implementing hierarchy
 * validation ad hoc. Never trusts a client-supplied compoundId/buildingId
 * (or a client-supplied Contract/Renter pairing) at face value - every id
 * is re-verified against the authoritative Prisma relations, scoped to the
 * caller's own organization, inside whatever transaction the caller is
 * already running.
 */
import { Prisma, type PrismaClient, type MaintenanceScopeType } from "@prisma/client";

type Tx = Prisma.TransactionClient | PrismaClient;

export interface ResolvedMaintenanceLocation {
  scopeType: MaintenanceScopeType;
  compoundId: string | null;
  buildingId: string | null;
  unitId: string | null;
  contractId: string | null;
  renterId: string | null;
}

export interface ResolveMaintenanceLocationInput {
  organizationId: string;
  scopeType: MaintenanceScopeType;
  compoundId?: string | null;
  buildingId?: string | null;
  unitId?: string | null;
  contractId?: string | null;
  renterId?: string | null;
}

/** Message set the caller supplies (normally `t.validation` from its own dictionary) so this module stays decoupled from the full Dictionary type while still raising already-translated errors, matching every other action's own throw-with-t.validation convention. */
export interface MaintenanceLocationMessages {
  maintenanceUnitRequired: string;
  maintenanceUnitNotFound: string;
  maintenanceBuildingRequired: string;
  maintenanceBuildingMustNotHaveUnit: string;
  maintenanceBuildingNotFound: string;
  maintenanceCompoundRequired: string;
  maintenanceCompoundMustNotHaveBuildingOrUnit: string;
  maintenanceCompoundNotFound: string;
  maintenanceContractMismatch: string;
  maintenanceRenterMismatch: string;
  maintenanceRenterRequiresContract: string;
}

export async function resolveMaintenanceLocation(
  tx: Tx,
  messages: MaintenanceLocationMessages,
  input: ResolveMaintenanceLocationInput
): Promise<ResolvedMaintenanceLocation> {
  const { organizationId, scopeType } = input;

  if (scopeType === "UNIT") {
    if (!input.unitId) throw new Error(messages.maintenanceUnitRequired);

    // Canonical location going forward: Unit -> Floor -> Building ->
    // Compound (see prisma/schema.prisma's own property-hierarchy header
    // comment) - never trust a client-supplied compoundId/buildingId for
    // UNIT scope, always derive both from the Unit itself.
    const unit = await tx.unit.findFirst({
      where: { id: input.unitId, organizationId },
      select: { id: true, floor: { select: { building: { select: { id: true, compoundId: true } } } } },
    });
    if (!unit) throw new Error(messages.maintenanceUnitNotFound);

    let contractId: string | null = null;
    let renterId: string | null = null;

    if (input.contractId) {
      // Contract must belong to the same org AND the same Unit (Step 12) -
      // never Unit A + a Contract actually tied to Unit B.
      const contract = await tx.contract.findFirst({
        where: { id: input.contractId, organizationId, unitId: unit.id },
        select: { id: true, renterId: true },
      });
      if (!contract) throw new Error(messages.maintenanceContractMismatch);
      contractId = contract.id;

      if (input.renterId) {
        // Renter must be the one actually tied to that Contract (Step 12) -
        // never an unrelated Renter attached to the same Unit's Request.
        if (input.renterId !== contract.renterId) throw new Error(messages.maintenanceRenterMismatch);
        renterId = input.renterId;
      }
    } else if (input.renterId) {
      throw new Error(messages.maintenanceRenterRequiresContract);
    }

    return {
      scopeType,
      compoundId: unit.floor.building.compoundId,
      buildingId: unit.floor.building.id,
      unitId: unit.id,
      contractId,
      renterId,
    };
  }

  if (scopeType === "BUILDING_COMMON_AREA") {
    if (!input.buildingId) throw new Error(messages.maintenanceBuildingRequired);
    if (input.unitId) throw new Error(messages.maintenanceBuildingMustNotHaveUnit);

    const building = await tx.building.findFirst({
      where: { id: input.buildingId, organizationId },
      select: { id: true, compoundId: true },
    });
    if (!building) throw new Error(messages.maintenanceBuildingNotFound);

    return { scopeType, compoundId: building.compoundId, buildingId: building.id, unitId: null, contractId: null, renterId: null };
  }

  // COMPOUND_COMMON_AREA
  if (!input.compoundId) throw new Error(messages.maintenanceCompoundRequired);
  if (input.buildingId || input.unitId) throw new Error(messages.maintenanceCompoundMustNotHaveBuildingOrUnit);

  const compound = await tx.compound.findFirst({ where: { id: input.compoundId, organizationId }, select: { id: true } });
  if (!compound) throw new Error(messages.maintenanceCompoundNotFound);

  return { scopeType, compoundId: compound.id, buildingId: null, unitId: null, contractId: null, renterId: null };
}
