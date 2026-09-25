/**
 * D-011 (docs/FINAL-UAT-GO-LIVE.md): real-DB coverage for deleteCompound()
 * and deleteBuilding(), mirroring unit-delete.db.test.ts's D-010 coverage.
 *
 * Root cause was the same shape as D-010: property_ownerships.compoundId
 * and property_ownerships.buildingId were ON DELETE CASCADE (an ownership
 * record for a Compound/Building with no other protected child record was
 * silently deleted along with it), and owner_ledger_entries.compoundId
 * defaulted to ON DELETE SET NULL (a financial ledger entry silently lost
 * its Compound reference). All three are now RESTRICT, and
 * deleteCompound()/deleteBuilding() gained the same P2003-catch-and-
 * friendly-message handling deleteUnit() already had (they previously had
 * no try/catch at all).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  resetDatabase,
  seedFullOrg,
  createTestCompound,
  createTestBuilding,
  createTestOwner,
  createTestUser,
  sessionFor,
  type SeededOrg,
} from "./db-test-helpers";
import { prisma } from "@/lib/prisma";

const mockAuth = vi.fn();
vi.mock("@/lib/auth", () => ({ auth: () => mockAuth() }));

let org: SeededOrg;

beforeEach(async () => {
  await resetDatabase();
  org = await seedFullOrg("CBDEL");
  mockAuth.mockResolvedValue(org.session);
});

async function createTestMaintenanceRequest(organizationId: string, createdByUserId: string, location: { compoundId?: string; buildingId?: string }) {
  return prisma.maintenanceRequest.create({
    data: {
      organizationId,
      requestNumber: `MR-${Math.random().toString(36).slice(2, 8)}`,
      scopeType: location.buildingId ? "BUILDING_COMMON_AREA" : "COMPOUND_COMMON_AREA",
      compoundId: location.compoundId,
      buildingId: location.buildingId,
      category: "PLUMBING",
      title: "D-011 test maintenance request",
      reportedByType: "STAFF",
      createdByUserId,
    },
  });
}

describe("deleteCompound (D-011): safe deletion without destroying protected history", () => {
  it("succeeds for a completely empty Compound (no ownership, no rental/maintenance activity)", async () => {
    const { deleteCompound } = await import("@/lib/actions/compounds");
    const compound = await createTestCompound(org.organization.id, "Empty Compound");

    const result = await deleteCompound(compound.id);

    expect(result.error).toBeUndefined();
    const found = await prisma.compound.findUnique({ where: { id: compound.id } });
    expect(found).toBeNull();
  });

  it("blocks deletion of a Compound with a Maintenance Request, with a friendly message, and deletes nothing", async () => {
    const { deleteCompound } = await import("@/lib/actions/compounds");
    const compound = await createTestCompound(org.organization.id, "Compound With Maintenance");
    const request = await createTestMaintenanceRequest(org.organization.id, org.admin.id, { compoundId: compound.id });

    const result = await deleteCompound(compound.id);

    expect(result.error).toBeTruthy();
    expect(await prisma.compound.findUnique({ where: { id: compound.id } })).not.toBeNull();
    expect(await prisma.maintenanceRequest.findUnique({ where: { id: request.id } })).not.toBeNull();
  });

  it("blocks deletion of a Compound that has ONLY an ownership assignment (the D-011 defect) instead of silently cascading it away", async () => {
    const { deleteCompound } = await import("@/lib/actions/compounds");
    const compound = await createTestCompound(org.organization.id, "Ownership-only Compound");
    const owner = await createTestOwner(org.organization.id, "Ownership-only Owner (Compound)");
    const ownership = await prisma.propertyOwnership.create({
      data: { organizationId: org.organization.id, ownerId: owner.id, compoundId: compound.id, ownershipPercentage: 100 },
    });

    const result = await deleteCompound(compound.id);

    expect(result.error).toBeTruthy();
    expect(await prisma.compound.findUnique({ where: { id: compound.id } })).not.toBeNull();
    expect(await prisma.propertyOwnership.findUnique({ where: { id: ownership.id } })).not.toBeNull();
  });

  it("blocks deletion of a Compound tagged on a financial ledger entry instead of silently detaching it", async () => {
    const { deleteCompound } = await import("@/lib/actions/compounds");
    const compound = await createTestCompound(org.organization.id, "Ledger-tagged Compound");
    const entry = await prisma.ownerLedgerEntry.create({
      data: {
        organizationId: org.organization.id,
        ownerId: org.owner.id,
        entryType: "RENT_INCOME",
        referenceType: "MANUAL",
        description: "D-011 test rent income tagged to a compound",
        debit: 0,
        credit: 1000,
        compoundId: compound.id,
      },
    });

    const result = await deleteCompound(compound.id);

    expect(result.error).toBeTruthy();
    expect(await prisma.compound.findUnique({ where: { id: compound.id } })).not.toBeNull();
    const entryAfter = await prisma.ownerLedgerEntry.findUnique({ where: { id: entry.id } });
    expect(entryAfter).not.toBeNull();
    expect(entryAfter?.compoundId).toBe(compound.id);
  });

  it("rejects deletion from a role without property.delete (MANAGER)", async () => {
    const manager = await createTestUser(org.organization.id, "MANAGER");
    mockAuth.mockResolvedValue(sessionFor(manager, org.organization.name));
    const { deleteCompound } = await import("@/lib/actions/compounds");
    const compound = await createTestCompound(org.organization.id, "RBAC Compound");

    await expect(deleteCompound(compound.id)).rejects.toThrow();
    expect(await prisma.compound.findUnique({ where: { id: compound.id } })).not.toBeNull();
  });

  it("never deletes another organization's Compound (cross-org IDOR)", async () => {
    const otherOrg = await seedFullOrg("CBDELB");
    const foreignCompound = await createTestCompound(otherOrg.organization.id, "Foreign Compound");

    const { deleteCompound } = await import("@/lib/actions/compounds");
    await expect(deleteCompound(foreignCompound.id)).rejects.toThrow();
    expect(await prisma.compound.findUnique({ where: { id: foreignCompound.id } })).not.toBeNull();
  });

  it("handles a nonexistent Compound id without crashing", async () => {
    const { deleteCompound } = await import("@/lib/actions/compounds");
    await expect(deleteCompound("does-not-exist-at-all")).rejects.toThrow();
  });
});

describe("deleteBuilding (D-011): safe deletion without destroying protected history", () => {
  it("succeeds for a completely empty Building (no ownership, no rental/maintenance activity)", async () => {
    const { deleteBuilding } = await import("@/lib/actions/buildings");
    const building = await createTestBuilding(org.organization.id, org.compound.id, "Empty Building");

    const result = await deleteBuilding(building.id);

    expect(result.error).toBeUndefined();
    expect(await prisma.building.findUnique({ where: { id: building.id } })).toBeNull();
  });

  it("blocks deletion of a Building with a Maintenance Request, with a friendly message, and deletes nothing", async () => {
    const { deleteBuilding } = await import("@/lib/actions/buildings");
    const building = await createTestBuilding(org.organization.id, org.compound.id, "Building With Maintenance");
    const request = await createTestMaintenanceRequest(org.organization.id, org.admin.id, { buildingId: building.id });

    const result = await deleteBuilding(building.id);

    expect(result.error).toBeTruthy();
    expect(await prisma.building.findUnique({ where: { id: building.id } })).not.toBeNull();
    expect(await prisma.maintenanceRequest.findUnique({ where: { id: request.id } })).not.toBeNull();
  });

  it("blocks deletion of a Building that has ONLY an ownership assignment (the D-011 defect) instead of silently cascading it away", async () => {
    const { deleteBuilding } = await import("@/lib/actions/buildings");
    const building = await createTestBuilding(org.organization.id, org.compound.id, "Ownership-only Building");
    const owner = await createTestOwner(org.organization.id, "Ownership-only Owner (Building)");
    const ownership = await prisma.propertyOwnership.create({
      data: { organizationId: org.organization.id, ownerId: owner.id, buildingId: building.id, ownershipPercentage: 100 },
    });

    const result = await deleteBuilding(building.id);

    expect(result.error).toBeTruthy();
    expect(await prisma.building.findUnique({ where: { id: building.id } })).not.toBeNull();
    expect(await prisma.propertyOwnership.findUnique({ where: { id: ownership.id } })).not.toBeNull();
  });

  it("rejects deletion from a role without property.delete (MANAGER)", async () => {
    const manager = await createTestUser(org.organization.id, "MANAGER");
    mockAuth.mockResolvedValue(sessionFor(manager, org.organization.name));
    const { deleteBuilding } = await import("@/lib/actions/buildings");
    const building = await createTestBuilding(org.organization.id, org.compound.id, "RBAC Building");

    await expect(deleteBuilding(building.id)).rejects.toThrow();
    expect(await prisma.building.findUnique({ where: { id: building.id } })).not.toBeNull();
  });

  it("never deletes another organization's Building (cross-org IDOR)", async () => {
    const otherOrg = await seedFullOrg("CBDELC");
    const foreignBuilding = await createTestBuilding(otherOrg.organization.id, otherOrg.compound.id, "Foreign Building");

    const { deleteBuilding } = await import("@/lib/actions/buildings");
    await expect(deleteBuilding(foreignBuilding.id)).rejects.toThrow();
    expect(await prisma.building.findUnique({ where: { id: foreignBuilding.id } })).not.toBeNull();
  });

  it("handles a nonexistent Building id without crashing", async () => {
    const { deleteBuilding } = await import("@/lib/actions/buildings");
    await expect(deleteBuilding("does-not-exist-at-all")).rejects.toThrow();
  });
});
