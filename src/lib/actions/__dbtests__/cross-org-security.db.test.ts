/**
 * STEP 19 (mandatory) - real, database-backed cross-organization security
 * tests. Two real organizations (with real Admin users) are created in the
 * disposable test database (see vitest.db.config.mts / .env.test /
 * src/lib/test-db-guard.ts); every assertion below calls the actual server
 * action against the actual database - nothing here is mocked except the
 * NextAuth session boundary (the same pattern already used by
 * src/lib/actions/rbac.integration.test.ts), so a passing test proves the
 * organizationId filter in the action's own Prisma query, not a mock.
 */
import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
import {
  resetDatabase,
  seedFullOrg,
  seedFinancialsForOrg,
  type SeededOrg,
  type SeededFinancials,
} from "./db-test-helpers";

const mockAuth = vi.fn();
vi.mock("@/lib/auth", () => ({ auth: () => mockAuth() }));

let orgA: SeededOrg;
let orgB: SeededOrg;
let finA: SeededFinancials;
let finB: SeededFinancials;

beforeAll(async () => {
  await resetDatabase();
  orgA = await seedFullOrg("A");
  orgB = await seedFullOrg("B");
  finA = await seedFinancialsForOrg(orgA);
  finB = await seedFinancialsForOrg(orgB);
});

beforeEach(() => {
  mockAuth.mockReset();
});

describe("Cross-organization isolation: Admin A cannot read/modify Organization B's data", () => {
  it("cannot read Owner B", async () => {
    mockAuth.mockResolvedValue(orgA.session);
    const { getOwnerById } = await import("@/lib/actions/owners");
    await expect(getOwnerById(orgB.owner.id)).rejects.toThrow();
  });

  it("cannot update Owner B", async () => {
    mockAuth.mockResolvedValue(orgA.session);
    const { updateOwner } = await import("@/lib/actions/owners");
    const fd = new FormData();
    fd.set("ownerId", orgB.owner.id);
    fd.set("ownerType", "INDIVIDUAL");
    fd.set("name", "Hijacked Name");
    await expect(updateOwner(fd)).rejects.toThrow();

    const stillIntact = await (await import("@/lib/prisma")).prisma.owner.findUniqueOrThrow({ where: { id: orgB.owner.id } });
    expect(stillIntact.name).toBe(orgB.owner.name);
  });

  it("cannot deactivate or delete Owner B", async () => {
    mockAuth.mockResolvedValue(orgA.session);
    const { deactivateOwner, deleteOwner } = await import("@/lib/actions/owners");
    await expect(deactivateOwner(orgB.owner.id)).rejects.toThrow();
    await expect(deleteOwner(orgB.owner.id)).rejects.toThrow();
  });

  it("cannot list PropertyOwnership for Unit B, and gets no rows back", async () => {
    mockAuth.mockResolvedValue(orgA.session);
    const { listOwnershipForAsset, getEffectiveOwnersForAsset } = await import("@/lib/actions/ownership");
    await expect(listOwnershipForAsset("UNIT", orgB.unit.id)).resolves.toEqual([]);
    await expect(getEffectiveOwnersForAsset("UNIT", orgB.unit.id)).resolves.toEqual([]);
  });

  it("cannot attach Owner A to Unit B (createOwnership)", async () => {
    mockAuth.mockResolvedValue(orgA.session);
    const { createOwnership } = await import("@/lib/actions/ownership");
    const fd = new FormData();
    fd.set("ownerId", orgA.owner.id);
    fd.set("assetLevel", "UNIT");
    fd.set("assetId", orgB.unit.id);
    fd.set("ownershipPercentage", "50");
    await expect(createOwnership(fd)).rejects.toThrow();
  });

  it("cannot end Ownership B", async () => {
    mockAuth.mockResolvedValue(orgA.session);
    const { endOwnership } = await import("@/lib/actions/ownership");
    await expect(endOwnership(orgB.ownership.id)).rejects.toThrow();
  });

  it("cannot terminate Contract B", async () => {
    mockAuth.mockResolvedValue(orgA.session);
    const { terminateContract, getContractById } = await import("@/lib/actions/contracts");
    await expect(terminateContract(finB.contract.id)).rejects.toThrow();
    await expect(getContractById(finB.contract.id)).rejects.toThrow();
  });

  it("cannot cancel Invoice B", async () => {
    mockAuth.mockResolvedValue(orgA.session);
    const { cancelInvoice, getInvoiceById } = await import("@/lib/actions/invoices");
    await expect(cancelInvoice(finB.invoice.id)).rejects.toThrow();
    await expect(getInvoiceById(finB.invoice.id)).rejects.toThrow();

    const stillIssued = await (await import("@/lib/prisma")).prisma.invoice.findUniqueOrThrow({ where: { id: finB.invoice.id } });
    expect(stillIssued.status).not.toBe("CANCELLED");
  });

  it("cannot reverse Payment B", async () => {
    mockAuth.mockResolvedValue(orgA.session);
    const { reversePayment } = await import("@/lib/actions/payments");
    await expect(reversePayment(finB.payment.id)).rejects.toThrow();

    const stillPosted = await (await import("@/lib/prisma")).prisma.payment.findUniqueOrThrow({ where: { id: finB.payment.id } });
    expect(stillPosted.status).toBe("POSTED");
  });

  it("cannot post a manual owner-ledger entry against Owner B", async () => {
    mockAuth.mockResolvedValue(orgA.session);
    const { postManualLedgerEntry } = await import("@/lib/actions/owner-ledger");
    const fd = new FormData();
    fd.set("ownerId", orgB.owner.id);
    fd.set("entryType", "OTHER_INCOME");
    fd.set("amount", "500");
    fd.set("description", "Cross-org attempt");
    await expect(postManualLedgerEntry(fd)).rejects.toThrow();
  });

  it("cannot reverse Owner Ledger Entry B", async () => {
    mockAuth.mockResolvedValue(orgA.session);
    const { reverseLedgerEntry } = await import("@/lib/actions/owner-ledger");
    await expect(reverseLedgerEntry(finB.ledgerEntry.id)).rejects.toThrow();
  });

  it("cannot read Compound B / Building B / Unit B directly", async () => {
    mockAuth.mockResolvedValue(orgA.session);
    const { getCompoundById } = await import("@/lib/actions/compounds");
    const { getBuildingById } = await import("@/lib/actions/buildings");
    const { getUnitById } = await import("@/lib/actions/units");
    await expect(getCompoundById(orgB.compound.id)).rejects.toThrow();
    await expect(getBuildingById(orgB.building.id)).rejects.toThrow();
    await expect(getUnitById(orgB.unit.id)).rejects.toThrow();
  });

  it("Org A's lists never contain Org B's rows", async () => {
    mockAuth.mockResolvedValue(orgA.session);
    const { listOwners } = await import("@/lib/actions/owners");
    const { listCompounds } = await import("@/lib/actions/compounds");
    const { listPayments } = await import("@/lib/actions/payments");

    const owners = await listOwners();
    const compounds = await listCompounds();
    const payments = await listPayments();

    expect(owners.some((o) => o.id === orgB.owner.id)).toBe(false);
    expect(compounds.some((c) => c.id === orgB.compound.id)).toBe(false);
    expect(payments.some((p) => p.id === finB.payment.id)).toBe(false);
  });
});

describe("Cross-organization isolation: Admin B cannot read/modify Organization A's data (reverse direction)", () => {
  it("cannot read or delete Owner A", async () => {
    mockAuth.mockResolvedValue(orgB.session);
    const { getOwnerById, deleteOwner } = await import("@/lib/actions/owners");
    await expect(getOwnerById(orgA.owner.id)).rejects.toThrow();
    await expect(deleteOwner(orgA.owner.id)).rejects.toThrow();
  });

  it("cannot terminate Contract A or cancel Invoice A", async () => {
    mockAuth.mockResolvedValue(orgB.session);
    const { terminateContract } = await import("@/lib/actions/contracts");
    const { cancelInvoice } = await import("@/lib/actions/invoices");
    await expect(terminateContract(finA.contract.id)).rejects.toThrow();
    await expect(cancelInvoice(finA.invoice.id)).rejects.toThrow();
  });

  it("cannot attach Owner B to a Compound A asset", async () => {
    mockAuth.mockResolvedValue(orgB.session);
    const { createOwnership } = await import("@/lib/actions/ownership");
    const fd = new FormData();
    fd.set("ownerId", orgB.owner.id);
    fd.set("assetLevel", "COMPOUND");
    fd.set("assetId", orgA.compound.id);
    fd.set("ownershipPercentage", "50");
    await expect(createOwnership(fd)).rejects.toThrow();
  });
});
