/**
 * Real, database-backed cross-organization security, IDOR, and same-org
 * relation-injection tests for Corporate Housing Management
 * (docs/CORPORATE-HOUSING.md): two real seeded organizations, only the
 * NextAuth session boundary mocked - the exact pattern established by
 * maintenance-cross-org-security.db.test.ts. Also covers the mandated
 * same-org relation-injection combinations (Account A + Occupant B,
 * Account A + Contract B, Contract A + Unit B, Allocation A + Occupant B,
 * Maintenance A + Occupant B) - every mutation re-verifies every relation
 * fresh from the server, never trusting a client-supplied id combination.
 */
import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
import { resetDatabase, seedFullOrg, createTestContract, seedCorporateAccount, createTestCorporateOccupant, type SeededOrg } from "./db-test-helpers";
import { prisma } from "@/lib/prisma";

const mockAuth = vi.fn();
vi.mock("@/lib/auth", () => ({ auth: () => mockAuth() }));

let orgA: SeededOrg;
let orgB: SeededOrg;

beforeAll(async () => {
  await resetDatabase();
  orgA = await seedFullOrg("CXA");
  orgB = await seedFullOrg("CXB");
});

beforeEach(() => {
  mockAuth.mockReset();
});

function fd(fields: Record<string, string>): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) f.set(k, v);
  return f;
}

describe("Corporate Housing cross-organization isolation", () => {
  it("Admin A cannot create a Corporate Account wrapping Org B's Renter", async () => {
    const renterB = await prisma.renter.create({ data: { organizationId: orgB.organization.id, fullName: "Org B Corp", vatNumber: "300000000000011" } });
    mockAuth.mockResolvedValue(orgA.session);
    const { createCorporateAccount } = await import("@/lib/actions/corporate-accounts");
    await expect(createCorporateAccount(fd({ renterId: renterB.id, displayName: "Hijacked" }))).rejects.toThrow();
    expect(await prisma.corporateAccount.count({ where: { renterId: renterB.id } })).toBe(0);
  });

  it("Admin A cannot read, update, or manage contacts/occupants on Org B's Corporate Account", async () => {
    mockAuth.mockResolvedValue(orgB.session);
    const { account: accountB } = await seedCorporateAccount(orgB, { displayName: "Org B Target" });
    const occupantB = await createTestCorporateOccupant(orgB.organization.id, accountB.id);

    mockAuth.mockResolvedValue(orgA.session);
    const { getCorporateAccountById, updateCorporateAccount } = await import("@/lib/actions/corporate-accounts");
    const { upsertCorporateContact } = await import("@/lib/actions/corporate-contacts");
    const { upsertCorporateOccupant, getCorporateOccupantById } = await import("@/lib/actions/corporate-occupants");

    await expect(getCorporateAccountById(accountB.id)).rejects.toThrow();
    await expect(updateCorporateAccount(fd({ accountId: accountB.id, displayName: "Hijacked", status: "SUSPENDED" }))).rejects.toThrow();
    await expect(upsertCorporateContact(fd({ corporateAccountId: accountB.id, name: "Injected Contact", contactType: "OTHER" }))).rejects.toThrow();
    await expect(upsertCorporateOccupant(fd({ corporateAccountId: accountB.id, fullName: "Injected Occupant" }))).rejects.toThrow();
    await expect(getCorporateOccupantById(occupantB.id)).rejects.toThrow();
    await expect(upsertCorporateOccupant(fd({ occupantId: occupantB.id, corporateAccountId: accountB.id, fullName: "Renamed" }))).rejects.toThrow();

    const stillB = await prisma.corporateAccount.findUniqueOrThrow({ where: { id: accountB.id } });
    expect(stillB.displayName).toBe("Org B Target");
    expect(stillB.status).toBe("ACTIVE");
  });

  it("Admin A cannot create, read, or act on an allocation using Org B's Account/Occupant/Contract", async () => {
    mockAuth.mockResolvedValue(orgB.session);
    const { account: accountB, renter: renterB } = await seedCorporateAccount(orgB, { displayName: "Org B Alloc Target" });
    const occupantB = await createTestCorporateOccupant(orgB.organization.id, accountB.id);
    const { contract: contractB } = await createTestContract(orgB, { renterId: renterB.id, unitNumber: "CXB-101" });

    mockAuth.mockResolvedValue(orgA.session);
    const { createCorporateAllocation, getCorporateAllocationById, activateCorporateAllocation, endCorporateAllocation, cancelCorporateAllocation, transferCorporateOccupant, getEligibleContractsForAccount } =
      await import("@/lib/actions/corporate-allocations");

    await expect(createCorporateAllocation(fd({ corporateAccountId: accountB.id, occupantId: occupantB.id, contractId: contractB.id, startDate: "2027-01-01" }))).rejects.toThrow();
    await expect(getEligibleContractsForAccount(accountB.id)).rejects.toThrow();
    expect(await prisma.corporateHousingAllocation.count({ where: { corporateAccountId: accountB.id } })).toBe(0);

    // Seed a real allocation as Org B, then confirm Org A cannot read or act on it by id.
    mockAuth.mockResolvedValue(orgB.session);
    const allocationId = await createCorporateAllocation(fd({ corporateAccountId: accountB.id, occupantId: occupantB.id, contractId: contractB.id, startDate: "2027-01-01" }));

    mockAuth.mockResolvedValue(orgA.session);
    await expect(getCorporateAllocationById(allocationId)).rejects.toThrow();
    await expect(activateCorporateAllocation(fd({ allocationId }))).rejects.toThrow();
    await expect(endCorporateAllocation(fd({ allocationId }))).rejects.toThrow();
    await expect(cancelCorporateAllocation(fd({ allocationId }))).rejects.toThrow();
    await expect(transferCorporateOccupant(fd({ currentAllocationId: allocationId, newContractId: contractB.id, newStartDate: "2027-06-01" }))).rejects.toThrow();

    const stillB = await prisma.corporateHousingAllocation.findUniqueOrThrow({ where: { id: allocationId } });
    expect(stillB.organizationId).toBe(orgB.organization.id);
    expect(stillB.status).toBe("PLANNED");
  });

  it("Admin A cannot see Org B's corporate context through the Maintenance/Contract/Unit integration helpers", async () => {
    mockAuth.mockResolvedValue(orgB.session);
    const { account: accountB, renter: renterB } = await seedCorporateAccount(orgB, { displayName: "Org B Integration" });
    const occupantB = await createTestCorporateOccupant(orgB.organization.id, accountB.id);
    const { contract: contractB, unit: unitB } = await createTestContract(orgB, { renterId: renterB.id, unitNumber: "CXB-INT-101" });

    mockAuth.mockResolvedValue(orgA.session);
    const { getCorporateHousingContextForContract, getCorporateHousingContextForUnit, getCorporateHousingContextForMaintenanceRequest, getCorporateAllocationStatusForUnits } = await import(
      "@/lib/actions/corporate-allocations"
    );
    const { getCorporateAccountLinksForRenters } = await import("@/lib/actions/corporate-accounts");

    // Contract belongs to Org B - Org A's own query for it returns nothing (organizationId re-checked against contract.renterId lookup).
    expect(await getCorporateHousingContextForContract(contractB.id)).toBeNull();
    expect(await getCorporateHousingContextForUnit(unitB.id)).toBeNull();
    expect((await getCorporateAllocationStatusForUnits([unitB.id])).get(unitB.id)).toBeUndefined();
    expect((await getCorporateAccountLinksForRenters([renterB.id])).get(renterB.id)).toBeUndefined();
    // Maintenance traceability helper is scoped by Org A's own organizationId - it must not match Org B's occupant/unit pair.
    const crossOrgResult = await getCorporateHousingContextForMaintenanceRequest(occupantB.id, unitB.id);
    expect(crossOrgResult).toBeNull();
  });

  it("a Maintenance Request cannot be created against another organization's corporateOccupantId", async () => {
    mockAuth.mockResolvedValue(orgB.session);
    const { account: accountB } = await seedCorporateAccount(orgB, { displayName: "Org B Maintenance Target" });
    const occupantB = await createTestCorporateOccupant(orgB.organization.id, accountB.id);

    mockAuth.mockResolvedValue(orgA.session);
    const { createMaintenanceRequest } = await import("@/lib/actions/maintenance");
    // corporateOccupantId is not part of createMaintenanceRequest()'s own accepted schema (Step 68's narrow scope - traceability
    // only, no client-facing "report as this corporate occupant" flow), so injecting it must have no effect at all.
    const requestId = await createMaintenanceRequest(
      fd({ scopeType: "UNIT", unitId: orgA.unit.id, category: "GENERAL", title: "Cross-org injection attempt", reportedByType: "STAFF", corporateOccupantId: occupantB.id })
    );
    const request = await prisma.maintenanceRequest.findUniqueOrThrow({ where: { id: requestId } });
    expect(request.organizationId).toBe(orgA.organization.id);
    expect(request.corporateOccupantId).toBeNull();
  });
});

describe("Corporate Housing same-org relation injection", () => {
  it("Account A + Occupant B: an Occupant belonging to a different Corporate Account in the SAME org cannot be allocated under Account A", async () => {
    mockAuth.mockResolvedValue(orgA.session);
    const { account: accountA, renter: renterA } = await seedCorporateAccount(orgA, { displayName: "Same-Org Account A" });
    const { account: accountAlt } = await seedCorporateAccount(orgA, { displayName: "Same-Org Account Alt" });
    const occupantUnderAlt = await createTestCorporateOccupant(orgA.organization.id, accountAlt.id, { fullName: "Belongs To Alt" });
    const { contract: contractA } = await createTestContract(orgA, { renterId: renterA.id, unitNumber: "INJ-ACC-101" });

    const { createCorporateAllocation } = await import("@/lib/actions/corporate-allocations");
    await expect(
      createCorporateAllocation(fd({ corporateAccountId: accountA.id, occupantId: occupantUnderAlt.id, contractId: contractA.id, startDate: "2027-01-01" }))
    ).rejects.toThrow();
    expect(await prisma.corporateHousingAllocation.count({ where: { occupantId: occupantUnderAlt.id } })).toBe(0);

    // Also rejected at the occupant-edit layer: Account A cannot "claim" Alt's occupant by supplying its own accountId.
    const { upsertCorporateOccupant } = await import("@/lib/actions/corporate-occupants");
    await expect(upsertCorporateOccupant(fd({ occupantId: occupantUnderAlt.id, corporateAccountId: accountA.id, fullName: "Renamed By A" }))).rejects.toThrow();
  });

  it("Account A + Contract B: a Contract under an unrelated Renter in the SAME org is never eligible for Account A's allocation", async () => {
    mockAuth.mockResolvedValue(orgA.session);
    const { account: accountA } = await seedCorporateAccount(orgA, { displayName: "Same-Org Account A2" });
    const occupantA = await createTestCorporateOccupant(orgA.organization.id, accountA.id);
    const unrelatedRenter = await prisma.renter.create({ data: { organizationId: orgA.organization.id, fullName: "Unrelated Renter" } });
    const { contract: unrelatedContract } = await createTestContract(orgA, { renterId: unrelatedRenter.id, unitNumber: "INJ-CTR-101" });

    const { createCorporateAllocation, getEligibleContractsForAccount } = await import("@/lib/actions/corporate-allocations");
    await expect(
      createCorporateAllocation(fd({ corporateAccountId: accountA.id, occupantId: occupantA.id, contractId: unrelatedContract.id, startDate: "2027-01-01" }))
    ).rejects.toThrow();

    const eligible = await getEligibleContractsForAccount(accountA.id);
    expect(eligible.map((c) => c.id)).not.toContain(unrelatedContract.id);
  });

  it("Contract A + Unit B: unitId is always server-derived from the Contract, so a client-injected unitId field has no effect", async () => {
    mockAuth.mockResolvedValue(orgA.session);
    const { account: accountA, renter: renterA } = await seedCorporateAccount(orgA, { displayName: "Same-Org Account A3" });
    const occupantA = await createTestCorporateOccupant(orgA.organization.id, accountA.id);
    const { contract: contractA, unit: unitA } = await createTestContract(orgA, { renterId: renterA.id, unitNumber: "INJ-UNIT-101" });
    const { unit: decoyUnit } = await createTestContract(orgA, { renterId: renterA.id, unitNumber: "INJ-UNIT-DECOY" });

    const { createCorporateAllocation } = await import("@/lib/actions/corporate-allocations");
    // createCorporateAllocation()'s own schema has no unitId field at all - an injected one is simply dropped by validation, never read.
    const allocationId = await createCorporateAllocation(
      fd({ corporateAccountId: accountA.id, occupantId: occupantA.id, contractId: contractA.id, unitId: decoyUnit.id, startDate: "2027-01-01" })
    );
    const allocation = await prisma.corporateHousingAllocation.findUniqueOrThrow({ where: { id: allocationId } });
    expect(allocation.unitId).toBe(unitA.id);
    expect(allocation.unitId).not.toBe(decoyUnit.id);
  });

  it("Allocation A + Occupant B: activate/end/cancel only ever accept an allocationId - re-derived occupant/account/contract can never be swapped by the caller", async () => {
    mockAuth.mockResolvedValue(orgA.session);
    const { account: accountA, renter: renterA } = await seedCorporateAccount(orgA, { displayName: "Same-Org Account A4" });
    const occupant1 = await createTestCorporateOccupant(orgA.organization.id, accountA.id, { fullName: "Occupant One" });
    const occupant2 = await createTestCorporateOccupant(orgA.organization.id, accountA.id, { fullName: "Occupant Two" });
    const { contract: contractA } = await createTestContract(orgA, { renterId: renterA.id, unitNumber: "INJ-ALLOC-101" });

    const { createCorporateAllocation, activateCorporateAllocation } = await import("@/lib/actions/corporate-allocations");
    const allocation1Id = await createCorporateAllocation(fd({ corporateAccountId: accountA.id, occupantId: occupant1.id, contractId: contractA.id, startDate: "2027-06-01" }));

    // Even if a caller supplies an unrelated occupantId alongside the real allocationId, activateCorporateAllocation()'s
    // schema has no occupantId field - the allocation's own occupant (occupant1) is what gets re-verified and activated.
    await activateCorporateAllocation(fd({ allocationId: allocation1Id, occupantId: occupant2.id }));
    const allocation1 = await prisma.corporateHousingAllocation.findUniqueOrThrow({ where: { id: allocation1Id } });
    expect(allocation1.occupantId).toBe(occupant1.id);
    expect(allocation1.status).toBe("ACTIVE");
  });

  it("Maintenance A + Occupant B: the traceability helper never matches a corporateOccupant/unit pair from a different Corporate Account in the same org", async () => {
    mockAuth.mockResolvedValue(orgA.session);
    const { renter: renterA } = await seedCorporateAccount(orgA, { displayName: "Same-Org Maintenance A" });
    const { account: accountAlt } = await seedCorporateAccount(orgA, { displayName: "Same-Org Maintenance Alt" });
    const occupantAlt = await createTestCorporateOccupant(orgA.organization.id, accountAlt.id, { fullName: "Alt Occupant" });
    const { unit: unitA } = await createTestContract(orgA, { renterId: renterA.id, unitNumber: "INJ-MAINT-101" });

    const { getCorporateHousingContextForMaintenanceRequest } = await import("@/lib/actions/corporate-allocations");
    // occupantAlt has no allocation at all on unitA (different account entirely) - must resolve to null, not some other allocation.
    const result = await getCorporateHousingContextForMaintenanceRequest(occupantAlt.id, unitA.id);
    expect(result).toBeNull();
  });
});
