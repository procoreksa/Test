/**
 * Real, database-backed concurrency tests for Corporate Housing Management
 * (docs/CORPORATE-HOUSING.md): concurrent allocation-number generation,
 * duplicate-overlap prevention (canOccupantBeAllocated()'s real enforcement
 * under a race), simultaneous activation of the same allocation, and a
 * transfer racing an end on the same allocation - every race driven by
 * genuine concurrent Promise.allSettled() calls under Serializable
 * transactions (the same protection already established by
 * maintenance-concurrency.db.test.ts / reservation-contract-concurrency.db.test.ts),
 * never sleep-based timing.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { resetDatabase, seedFullOrg, createTestContract, seedCorporateAccount, createTestCorporateOccupant, type SeededOrg } from "./db-test-helpers";
import { prisma } from "@/lib/prisma";

const mockAuth = vi.fn();
vi.mock("@/lib/auth", () => ({ auth: () => mockAuth() }));

let org: SeededOrg;

beforeEach(async () => {
  await resetDatabase();
  org = await seedFullOrg("CHC");
  mockAuth.mockResolvedValue(org.session);
});

function fd(fields: Record<string, string>): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) f.set(k, v);
  return f;
}

describe("Corporate Housing allocation numbering concurrency", () => {
  it("never issues the same allocation number twice under concurrent creation across different occupants", async () => {
    const { account, renter } = await seedCorporateAccount(org, { displayName: "Numbering Corp" });
    const occupant1 = await createTestCorporateOccupant(org.organization.id, account.id, { fullName: "Numbering One" });
    const occupant2 = await createTestCorporateOccupant(org.organization.id, account.id, { fullName: "Numbering Two" });
    const { contract } = await createTestContract(org, { renterId: renter.id, unitNumber: "NUM-101" });
    const { contract: contract2 } = await createTestContract(org, { renterId: renter.id, unitNumber: "NUM-102" });

    const { createCorporateAllocation } = await import("@/lib/actions/corporate-allocations");
    const results = await Promise.allSettled([
      createCorporateAllocation(fd({ corporateAccountId: account.id, occupantId: occupant1.id, contractId: contract.id, startDate: "2027-01-01" })),
      createCorporateAllocation(fd({ corporateAccountId: account.id, occupantId: occupant2.id, contractId: contract2.id, startDate: "2027-01-01" })),
    ]);

    const fulfilled = results.filter((r): r is PromiseFulfilledResult<string> => r.status === "fulfilled");
    expect(fulfilled.length).toBeGreaterThanOrEqual(1);

    const allocations = await prisma.corporateHousingAllocation.findMany({ where: { id: { in: fulfilled.map((r) => r.value) } }, select: { allocationNumber: true } });
    const numbers = allocations.map((a) => a.allocationNumber);
    expect(new Set(numbers).size).toBe(numbers.length);
  });
});

describe("Corporate Housing occupant overlap concurrency", () => {
  it("of two simultaneous allocation attempts for the SAME occupant on overlapping dates, exactly one succeeds (canOccupantBeAllocated() under a real race)", async () => {
    const { account, renter } = await seedCorporateAccount(org, { displayName: "Overlap Corp" });
    const occupant = await createTestCorporateOccupant(org.organization.id, account.id);
    const { contract: contractX } = await createTestContract(org, { renterId: renter.id, unitNumber: "OVL-101" });
    const { contract: contractY } = await createTestContract(org, { renterId: renter.id, unitNumber: "OVL-102" });

    const { createCorporateAllocation } = await import("@/lib/actions/corporate-allocations");
    const results = await Promise.allSettled([
      createCorporateAllocation(fd({ corporateAccountId: account.id, occupantId: occupant.id, contractId: contractX.id, startDate: "2027-01-01" })),
      createCorporateAllocation(fd({ corporateAccountId: account.id, occupantId: occupant.id, contractId: contractY.id, startDate: "2027-01-01" })),
    ]);

    const fulfilled = results.filter((r) => r.status === "fulfilled");
    expect(fulfilled.length).toBe(1);

    const allocations = await prisma.corporateHousingAllocation.findMany({ where: { occupantId: occupant.id, status: { in: ["PLANNED", "ACTIVE"] } } });
    expect(allocations).toHaveLength(1);
  });
});

describe("Corporate Housing simultaneous activation", () => {
  it("of two simultaneous activation attempts on the same PLANNED allocation, exactly one succeeds", async () => {
    const { account, renter } = await seedCorporateAccount(org, { displayName: "Activate Corp" });
    const occupant = await createTestCorporateOccupant(org.organization.id, account.id);
    const { contract } = await createTestContract(org, { renterId: renter.id, unitNumber: "ACT-101" });

    const { createCorporateAllocation, activateCorporateAllocation } = await import("@/lib/actions/corporate-allocations");
    const allocationId = await createCorporateAllocation(fd({ corporateAccountId: account.id, occupantId: occupant.id, contractId: contract.id, startDate: "2027-06-01" }));

    const results = await Promise.allSettled([activateCorporateAllocation(fd({ allocationId })), activateCorporateAllocation(fd({ allocationId }))]);
    const fulfilled = results.filter((r) => r.status === "fulfilled");
    expect(fulfilled.length).toBeGreaterThanOrEqual(1);

    const allocation = await prisma.corporateHousingAllocation.findUniqueOrThrow({ where: { id: allocationId } });
    expect(allocation.status).toBe("ACTIVE");

    const activateAudits = await prisma.auditLog.findMany({ where: { organizationId: org.organization.id, entityType: "CorporateHousingAllocation", entityId: allocationId, action: "ACTIVATE" } });
    expect(activateAudits).toHaveLength(1);
  });
});

describe("Corporate Housing transfer-vs-end conflict", () => {
  it("of a transfer racing an end on the same ACTIVE allocation, exactly one of the two conflicting transitions applies (never both)", async () => {
    const { account, renter } = await seedCorporateAccount(org, { displayName: "TransferRace Corp" });
    const occupant = await createTestCorporateOccupant(org.organization.id, account.id);
    const { contract } = await createTestContract(org, { renterId: renter.id, unitNumber: "TXR-101", startDate: new Date("2025-01-01"), endDate: new Date("2028-01-01") });
    const { contract: contractNew } = await createTestContract(org, { renterId: renter.id, unitNumber: "TXR-102", startDate: new Date("2025-01-01"), endDate: new Date("2028-01-01") });

    const { createCorporateAllocation, endCorporateAllocation, transferCorporateOccupant } = await import("@/lib/actions/corporate-allocations");
    // startDate is in the past relative to "now", so createCorporateAllocation() lands it directly as ACTIVE.
    const allocationId = await createCorporateAllocation(fd({ corporateAccountId: account.id, occupantId: occupant.id, contractId: contract.id, startDate: "2026-01-01" }));
    const seeded = await prisma.corporateHousingAllocation.findUniqueOrThrow({ where: { id: allocationId } });
    expect(seeded.status).toBe("ACTIVE");

    const results = await Promise.allSettled([
      endCorporateAllocation(fd({ allocationId })),
      transferCorporateOccupant(fd({ currentAllocationId: allocationId, newContractId: contractNew.id, newStartDate: "2026-06-01" })),
    ]);

    // Exactly one of the two conflicting transitions applies under Serializable isolation - the loser's
    // transaction aborts entirely rather than silently no-op-ing (same pattern as the Work Order close race
    // in maintenance-concurrency.db.test.ts).
    const fulfilled = results.filter((r) => r.status === "fulfilled");
    expect(fulfilled.length).toBe(1);

    const original = await prisma.corporateHousingAllocation.findUniqueOrThrow({ where: { id: allocationId } });
    expect(original.status).toBe("ENDED");

    // If the transfer specifically won the race, there must be exactly one resulting new allocation record;
    // if only the plain end won, there must be none.
    const transferResult = results[1];
    const newAllocations = await prisma.corporateHousingAllocation.findMany({ where: { organizationId: org.organization.id, contractId: contractNew.id } });
    if (transferResult.status === "fulfilled") {
      expect(newAllocations).toHaveLength(1);
      expect(newAllocations[0].id).toBe(transferResult.value);
    } else {
      expect(newAllocations).toHaveLength(0);
    }
  });
});
