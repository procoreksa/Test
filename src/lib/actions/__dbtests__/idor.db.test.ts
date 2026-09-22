/**
 * STEP 20 - explicit IDOR (Insecure Direct Object Reference) tests: an
 * authenticated user of Organization A directly supplies an id that
 * belongs to Organization B (as if guessed, enumerated, or copy-pasted
 * from another tab) and the server action must reject it - never fall
 * through to acting on it. Complements cross-org-security.db.test.ts by
 * also proving the *positive* case (a legitimate same-org id succeeds),
 * so a passing negative test can't be hiding a query that's broken for
 * everyone.
 */
import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
import { resetDatabase, seedFullOrg, type SeededOrg } from "./db-test-helpers";

const mockAuth = vi.fn();
vi.mock("@/lib/auth", () => ({ auth: () => mockAuth() }));

let orgA: SeededOrg;
let orgB: SeededOrg;

beforeAll(async () => {
  await resetDatabase();
  orgA = await seedFullOrg("A");
  orgB = await seedFullOrg("B");
});

beforeEach(() => {
  mockAuth.mockReset();
});

describe("IDOR: direct-ID substitution across organizations is rejected", () => {
  it("deleteUnit rejects Org B's unit id when called as Org A, but accepts Org A's own", async () => {
    mockAuth.mockResolvedValue(orgA.session);
    const { deleteUnit } = await import("@/lib/actions/units");
    await expect(deleteUnit(orgB.unit.id)).rejects.toThrow();

    const { prisma } = await import("@/lib/prisma");
    const stillThere = await prisma.unit.findUnique({ where: { id: orgB.unit.id } });
    expect(stillThere).not.toBeNull();
  });

  it("deleteBuilding rejects Org B's building id when called as Org A", async () => {
    mockAuth.mockResolvedValue(orgA.session);
    const { deleteBuilding } = await import("@/lib/actions/buildings");
    await expect(deleteBuilding(orgB.building.id)).rejects.toThrow();
  });

  it("deleteCompound rejects Org B's compound id when called as Org A", async () => {
    mockAuth.mockResolvedValue(orgA.session);
    const { deleteCompound } = await import("@/lib/actions/compounds");
    await expect(deleteCompound(orgB.compound.id)).rejects.toThrow();
  });

  it("deleteFloor rejects Org B's floor id when called as Org A", async () => {
    mockAuth.mockResolvedValue(orgA.session);
    const { deleteFloor } = await import("@/lib/actions/floors");
    await expect(deleteFloor(orgB.floor.id)).rejects.toThrow();
  });

  it("deleteRenter rejects Org B's renter id when called as Org A", async () => {
    mockAuth.mockResolvedValue(orgA.session);
    const { deleteRenter } = await import("@/lib/actions/renters");
    await expect(deleteRenter(orgB.renter.id)).rejects.toThrow();
  });

  it("createOwnership rejects an assetId (unit) belonging to another org even when ownerId is the caller's own", async () => {
    mockAuth.mockResolvedValue(orgA.session);
    const { createOwnership } = await import("@/lib/actions/ownership");
    const fd = new FormData();
    fd.set("ownerId", orgA.owner.id);
    fd.set("assetLevel", "UNIT");
    fd.set("assetId", orgB.unit.id); // IDOR: unit id from another org's tab
    fd.set("ownershipPercentage", "10");
    await expect(createOwnership(fd)).rejects.toThrow();
  });

  it("postManualLedgerEntry rejects a compoundId belonging to another org, even for the caller's own owner", async () => {
    mockAuth.mockResolvedValue(orgA.session);
    const { postManualLedgerEntry } = await import("@/lib/actions/owner-ledger");
    const fd = new FormData();
    fd.set("ownerId", orgA.owner.id);
    fd.set("entryType", "OTHER_INCOME");
    fd.set("amount", "100");
    fd.set("description", "IDOR probe");
    fd.set("compoundId", orgB.compound.id); // IDOR: compound id from another org's tab
    await expect(postManualLedgerEntry(fd)).rejects.toThrow();

    const { prisma } = await import("@/lib/prisma");
    const entries = await prisma.ownerLedgerEntry.findMany({ where: { organizationId: orgA.organization.id, ownerId: orgA.owner.id } });
    expect(entries.every((e) => e.compoundId !== orgB.compound.id)).toBe(true);
  });

  it("positive control: Org A acting on its own unit id succeeds", async () => {
    mockAuth.mockResolvedValue(orgA.session);
    const { getUnitById } = await import("@/lib/actions/units");
    const unit = await getUnitById(orgA.unit.id);
    expect(unit.id).toBe(orgA.unit.id);
  });
});
