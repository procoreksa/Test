/**
 * D-010 (docs/FINAL-UAT-GO-LIVE.md): real-DB coverage for deleteUnit().
 *
 * Root cause was NOT the already-handled onDelete: Restrict / P2003 case
 * (contracts, reservations, move-ins/outs, maintenance, etc. were already
 * blocked with a friendly message before this pass) - it was two relations
 * that were NOT Restrict: property_ownerships.unitId was ON DELETE CASCADE
 * (an ownership-only Unit's ownership history was silently destroyed
 * alongside the Unit, no error, no friendly message) and
 * owner_ledger_entries.unitId defaulted to ON DELETE SET NULL (a financial
 * ledger entry silently lost its Unit reference). Both are now RESTRICT
 * (see the migration this test's fix ships with) so deleteUnit()'s
 * existing P2003 handling covers them the same way it already covers
 * every other protected relation.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { resetDatabase, seedFullOrg, createTestUnit, createTestOwner, createTestContract, createTestUser, sessionFor, type SeededOrg } from "./db-test-helpers";
import { prisma } from "@/lib/prisma";

const mockAuth = vi.fn();
vi.mock("@/lib/auth", () => ({ auth: () => mockAuth() }));

let org: SeededOrg;

beforeEach(async () => {
  await resetDatabase();
  org = await seedFullOrg("UDEL");
  mockAuth.mockResolvedValue(org.session);
});

describe("deleteUnit (D-010): safe deletion without destroying protected history", () => {
  it("succeeds for a completely empty Unit (no ownership, no rental activity, no financial records)", async () => {
    const { deleteUnit } = await import("@/lib/actions/units");
    const unit = await createTestUnit(org.organization.id, org.floor.id, { unitNumber: "EMPTY-1" });

    const result = await deleteUnit(unit.id);

    expect(result.error).toBeUndefined();
    const found = await prisma.unit.findUnique({ where: { id: unit.id } });
    expect(found).toBeNull();
  });

  it("blocks deletion of a Unit with an active Contract, with a friendly message, and deletes nothing", async () => {
    const { deleteUnit } = await import("@/lib/actions/units");
    const { unit, contract } = await createTestContract(org);

    const result = await deleteUnit(unit.id);

    expect(result.error).toBeTruthy();
    const stillThere = await prisma.unit.findUnique({ where: { id: unit.id } });
    expect(stillThere).not.toBeNull();
    const contractStillThere = await prisma.contract.findUnique({ where: { id: contract.id } });
    expect(contractStillThere).not.toBeNull();
  });

  it("blocks deletion of a Unit that has ONLY an ownership assignment and no rental history (the D-010 defect) instead of silently cascading it away", async () => {
    const { deleteUnit } = await import("@/lib/actions/units");
    const unit = await createTestUnit(org.organization.id, org.floor.id, { unitNumber: "OWNONLY-1" });
    const owner = await createTestOwner(org.organization.id, "Ownership-only Owner");
    const ownership = await prisma.propertyOwnership.create({
      data: { organizationId: org.organization.id, ownerId: owner.id, unitId: unit.id, ownershipPercentage: 100 },
    });

    const result = await deleteUnit(unit.id);

    expect(result.error).toBeTruthy();
    const unitStillThere = await prisma.unit.findUnique({ where: { id: unit.id } });
    expect(unitStillThere).not.toBeNull();
    const ownershipStillThere = await prisma.propertyOwnership.findUnique({ where: { id: ownership.id } });
    expect(ownershipStillThere).not.toBeNull();
  });

  it("blocks deletion of a Unit tagged on a financial ledger entry instead of silently detaching it", async () => {
    const { deleteUnit } = await import("@/lib/actions/units");
    const unit = await createTestUnit(org.organization.id, org.floor.id, { unitNumber: "LEDGERTAG-1" });
    const entry = await prisma.ownerLedgerEntry.create({
      data: {
        organizationId: org.organization.id,
        ownerId: org.owner.id,
        entryType: "RENT_INCOME",
        referenceType: "MANUAL",
        description: "Test rent income tagged to a unit",
        debit: 0,
        credit: 1000,
        unitId: unit.id,
      },
    });

    const result = await deleteUnit(unit.id);

    expect(result.error).toBeTruthy();
    const unitStillThere = await prisma.unit.findUnique({ where: { id: unit.id } });
    expect(unitStillThere).not.toBeNull();
    const entryAfter = await prisma.ownerLedgerEntry.findUnique({ where: { id: entry.id } });
    expect(entryAfter).not.toBeNull();
    expect(entryAfter?.unitId).toBe(unit.id);
  });

  it("rejects deletion from a role without unit.delete (MANAGER)", async () => {
    const manager = await createTestUser(org.organization.id, "MANAGER");
    mockAuth.mockResolvedValue(sessionFor(manager, org.organization.name));
    const { deleteUnit } = await import("@/lib/actions/units");
    const unit = await createTestUnit(org.organization.id, org.floor.id, { unitNumber: "RBAC-1" });

    await expect(deleteUnit(unit.id)).rejects.toThrow();

    const stillThere = await prisma.unit.findUnique({ where: { id: unit.id } });
    expect(stillThere).not.toBeNull();
  });

  it("never deletes another organization's Unit (cross-org IDOR)", async () => {
    const otherOrg = await seedFullOrg("UDELB");
    const foreignUnit = await createTestUnit(otherOrg.organization.id, otherOrg.floor.id, { unitNumber: "FOREIGN-1" });

    const { deleteUnit } = await import("@/lib/actions/units");
    // org's session is still mocked (org A) - attempting to delete org B's unit id.
    await expect(deleteUnit(foreignUnit.id)).rejects.toThrow();

    const stillThere = await prisma.unit.findUnique({ where: { id: foreignUnit.id } });
    expect(stillThere).not.toBeNull();
  });

  it("handles a nonexistent Unit id without crashing", async () => {
    const { deleteUnit } = await import("@/lib/actions/units");
    await expect(deleteUnit("does-not-exist-at-all")).rejects.toThrow();
  });
});
