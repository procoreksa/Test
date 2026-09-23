/**
 * Real, database-backed ownership-security tests for the Owner Portal
 * (docs/OWNER-PORTAL.md). Covers the four scenarios the spec calls out as
 * critical, beyond plain same-org isolation:
 *  - Cross-organization isolation.
 *  - Ownership-override: an owner of a parent Compound must NOT gain
 *    access to a Unit explicitly, entirely owned by a different owner.
 *  - Shared ownership: two owners of the same Unit each see only their own
 *    percentage and never each other's ledger.
 *  - Ownership revocation takes effect on the very next request, with no
 *    re-login (ownership is never cached in the JWT).
 */
import { describe, it, expect, vi, beforeAll } from "vitest";
import { resetDatabase, seedFullOrg, createTestOwner, createTestCompound, createTestBuilding, createTestFloor, createTestUnit, type SeededOrg } from "./db-test-helpers";
import { seedOwnerPortalOwnership, createTestOwnerPortalAccount, ownerSessionFor } from "./owner-portal-test-helpers";
import { prisma } from "@/lib/prisma";

const mockOwnerAuth = vi.fn();
vi.mock("@/lib/owner-auth", () => ({ auth: () => mockOwnerAuth() }));

let orgA: SeededOrg;
let orgB: SeededOrg;

beforeAll(async () => {
  await resetDatabase();
  orgA = await seedFullOrg("OWNSEC-A");
  orgB = await seedFullOrg("OWNSEC-B");
});

describe("Cross-organization isolation", () => {
  it("an owner in Org B cannot access Org A's unit/contract/ledger even by guessing the id", async () => {
    const ownershipA = await seedOwnerPortalOwnership(orgA, "CrossOrgA");
    const ownershipB = await seedOwnerPortalOwnership(orgB, "CrossOrgB");

    const ledgerEntry = await prisma.ownerLedgerEntry.create({
      data: { organizationId: orgA.organization.id, ownerId: ownershipA.owner.id, entryType: "RENT_INCOME", description: "Org A rent", credit: 1000, unitId: ownershipA.unit.id },
    });

    mockOwnerAuth.mockResolvedValue(ownershipB.session);
    const { requireOwnerUnitAccess, requireOwnerLedgerAccess } = await import("@/lib/owner-session");
    await expect(requireOwnerUnitAccess(ownershipA.unit.id)).rejects.toThrow();
    await expect(requireOwnerLedgerAccess(ledgerEntry.id)).rejects.toThrow();

    const { getOwnerPortalUnits } = await import("@/lib/actions/owner-portal/portfolio");
    expect((await getOwnerPortalUnits()).some((u) => u.unitId === ownershipA.unit.id)).toBe(false);
  });
});

describe("Ownership override: a parent-level owner never gains access to a Unit explicitly owned by someone else (critical)", () => {
  it("Owner A owns the Compound at 60%; Unit 101 is explicitly, entirely owned by Owner B - Owner A must NOT access Unit 101", async () => {
    const ownerA = await createTestOwner(orgA.organization.id, "Override Owner A");
    const ownerB = await createTestOwner(orgA.organization.id, "Override Owner B");
    const accountA = await createTestOwnerPortalAccount(orgA.organization.id, ownerA.id, orgA.admin.id);
    const accountB = await createTestOwnerPortalAccount(orgA.organization.id, ownerB.id, orgA.admin.id);

    const compound = await createTestCompound(orgA.organization.id, "Override Compound");
    const building = await createTestBuilding(orgA.organization.id, compound.id, "Override Building");
    const floor = await createTestFloor(orgA.organization.id, building.id, 1);
    const unit101 = await createTestUnit(orgA.organization.id, floor.id, { unitNumber: "Override-101" });

    // Owner A owns the whole Compound at 60%.
    await prisma.propertyOwnership.create({ data: { organizationId: orgA.organization.id, ownerId: ownerA.id, compoundId: compound.id, ownershipPercentage: 60 } });
    // Unit 101 is explicitly, entirely owned by Owner B - a Unit-level
    // override that must beat the Compound-level inheritance for Owner A.
    await prisma.propertyOwnership.create({ data: { organizationId: orgA.organization.id, ownerId: ownerB.id, unitId: unit101.id, ownershipPercentage: 100 } });

    const { requireOwnerUnitAccess } = await import("@/lib/owner-session");
    const { getOwnerPortalUnits, getOwnerPortalUnitDetail } = await import("@/lib/actions/owner-portal/portfolio");

    mockOwnerAuth.mockResolvedValue(ownerSessionFor(accountA));
    await expect(requireOwnerUnitAccess(unit101.id)).rejects.toThrow();
    await expect(getOwnerPortalUnitDetail(unit101.id)).rejects.toThrow();
    expect((await getOwnerPortalUnits()).some((u) => u.unitId === unit101.id)).toBe(false);

    mockOwnerAuth.mockResolvedValue(ownerSessionFor(accountB));
    const asOwnerB = await requireOwnerUnitAccess(unit101.id);
    expect(asOwnerB.unit.id).toBe(unit101.id);
    const unitsForB = await getOwnerPortalUnits();
    const row = unitsForB.find((u) => u.unitId === unit101.id);
    expect(row).toBeDefined();
    expect(Number(row?.ownershipPercentage)).toBe(100);
  });
});

describe("Shared ownership: two owners of one Unit each see only their own percentage and ledger", () => {
  it("Owner A (60%) and Owner B (40%) both see the shared Unit, with their own percentage, and never each other's ledger", async () => {
    const ownerA = await createTestOwner(orgA.organization.id, "Shared Owner A");
    const ownerB = await createTestOwner(orgA.organization.id, "Shared Owner B");
    const accountA = await createTestOwnerPortalAccount(orgA.organization.id, ownerA.id, orgA.admin.id);
    const accountB = await createTestOwnerPortalAccount(orgA.organization.id, ownerB.id, orgA.admin.id);

    const sharedUnit = await createTestUnit(orgA.organization.id, orgA.floor.id, { unitNumber: `Shared-${Date.now()}` });
    await prisma.propertyOwnership.create({ data: { organizationId: orgA.organization.id, ownerId: ownerA.id, unitId: sharedUnit.id, ownershipPercentage: 60 } });
    await prisma.propertyOwnership.create({ data: { organizationId: orgA.organization.id, ownerId: ownerB.id, unitId: sharedUnit.id, ownershipPercentage: 40 } });

    const entryA = await prisma.ownerLedgerEntry.create({
      data: { organizationId: orgA.organization.id, ownerId: ownerA.id, entryType: "RENT_INCOME", description: "Owner A's share", credit: 6000, unitId: sharedUnit.id },
    });
    const entryB = await prisma.ownerLedgerEntry.create({
      data: { organizationId: orgA.organization.id, ownerId: ownerB.id, entryType: "RENT_INCOME", description: "Owner B's share", credit: 4000, unitId: sharedUnit.id },
    });

    const { getOwnerPortalUnits } = await import("@/lib/actions/owner-portal/portfolio");
    const { getOwnerPortalLedger } = await import("@/lib/actions/owner-portal/financials");

    mockOwnerAuth.mockResolvedValue(ownerSessionFor(accountA));
    const unitsA = await getOwnerPortalUnits();
    const rowA = unitsA.find((u) => u.unitId === sharedUnit.id);
    expect(Number(rowA?.ownershipPercentage)).toBe(60);
    const ledgerA = await getOwnerPortalLedger();
    expect(ledgerA.rows.some((r) => r.id === entryA.id)).toBe(true);
    expect(ledgerA.rows.some((r) => r.id === entryB.id)).toBe(false);
    expect(Number(ledgerA.balance)).toBe(6000);

    mockOwnerAuth.mockResolvedValue(ownerSessionFor(accountB));
    const unitsB = await getOwnerPortalUnits();
    const rowB = unitsB.find((u) => u.unitId === sharedUnit.id);
    expect(Number(rowB?.ownershipPercentage)).toBe(40);
    const ledgerB = await getOwnerPortalLedger();
    expect(ledgerB.rows.some((r) => r.id === entryB.id)).toBe(true);
    expect(ledgerB.rows.some((r) => r.id === entryA.id)).toBe(false);
    expect(Number(ledgerB.balance)).toBe(4000);
  });
});

describe("Ownership revocation takes effect on the very next request, with no re-login", () => {
  it("access is granted, then denied immediately after the PropertyOwnership row is ended - the same mocked session is never re-created", async () => {
    const owner = await createTestOwner(orgA.organization.id, "Revocation Owner");
    const account = await createTestOwnerPortalAccount(orgA.organization.id, owner.id, orgA.admin.id);
    const unit = await createTestUnit(orgA.organization.id, orgA.floor.id, { unitNumber: `Revoke-${Date.now()}` });
    const ownership = await prisma.propertyOwnership.create({ data: { organizationId: orgA.organization.id, ownerId: owner.id, unitId: unit.id, ownershipPercentage: 100 } });

    mockOwnerAuth.mockResolvedValue(ownerSessionFor(account));
    const { requireOwnerUnitAccess } = await import("@/lib/owner-session");
    const before = await requireOwnerUnitAccess(unit.id);
    expect(before.unit.id).toBe(unit.id);

    // Revoke via a direct, authoritative fixture write - no new session/mock
    // is created, proving live re-resolution rather than a JWT-cached grant.
    await prisma.propertyOwnership.update({ where: { id: ownership.id }, data: { status: "ENDED" } });

    await expect(requireOwnerUnitAccess(unit.id)).rejects.toThrow();
  });
});
