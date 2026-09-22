/**
 * Hardening (Step 5 of the hardening brief, docs/SECURITY-REVIEW.md
 * "Cross-org relation injection"): real, database-backed regression tests
 * proving createContract()/updateContract() reject a renterId belonging to
 * a different organization, mirroring the existing check already in place
 * for unitId. Before this fix, renterId was written to Contract.renterId
 * with no organization check at all - a caller with contract.create/
 * contract.update could link a Contract to another organization's Renter.
 */
import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
import { resetDatabase, seedFullOrg, type SeededOrg } from "./db-test-helpers";
import { prisma } from "@/lib/prisma";

const mockAuth = vi.fn();
vi.mock("@/lib/auth", () => ({ auth: () => mockAuth() }));

let orgA: SeededOrg;
let orgB: SeededOrg;

beforeAll(async () => {
  await resetDatabase();
  orgA = await seedFullOrg("CRIA");
  orgB = await seedFullOrg("CRIB");
});

beforeEach(() => {
  mockAuth.mockReset();
});

function contractFormData(fields: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
}

describe("Contract relation injection: renterId is org-verified like unitId already is", () => {
  it("createContract() rejects a renterId belonging to another organization, and no Contract is created", async () => {
    mockAuth.mockResolvedValue(orgA.session);
    const { createContract } = await import("@/lib/actions/contracts");

    const fd = contractFormData({
      unitId: orgA.reservableUnit.id,
      renterId: orgB.renter.id, // cross-org renter id
      startDate: "2027-01-01",
      endDate: "2028-01-01",
      rentAmount: "1000",
      paymentFrequency: "ANNUAL",
      extraChargesMode: "ONE_TIME",
    });

    await expect(createContract(fd)).rejects.toThrow();
    const count = await prisma.contract.count({ where: { organizationId: orgA.organization.id, renterId: orgB.renter.id } });
    expect(count).toBe(0);
  });

  it("createContract() still succeeds normally with the caller's own renter (positive control)", async () => {
    mockAuth.mockResolvedValue(orgA.session);
    const { createContract } = await import("@/lib/actions/contracts");

    const fd = contractFormData({
      unitId: orgA.reservableUnit.id,
      renterId: orgA.renter.id,
      startDate: "2027-01-01",
      endDate: "2028-01-01",
      rentAmount: "1000",
      paymentFrequency: "ANNUAL",
      extraChargesMode: "ONE_TIME",
    });

    await createContract(fd);
    const contract = await prisma.contract.findFirstOrThrow({ where: { organizationId: orgA.organization.id, renterId: orgA.renter.id, unitId: orgA.reservableUnit.id } });
    expect(contract.organizationId).toBe(orgA.organization.id);
  });

  it("updateContract() rejects re-pointing an existing contract's renterId at another organization's Renter", async () => {
    mockAuth.mockResolvedValue(orgA.session);
    const { createContract, updateContract } = await import("@/lib/actions/contracts");

    const createFd = contractFormData({
      unitId: orgA.reservableUnit.id,
      renterId: orgA.renter.id,
      startDate: "2027-01-01",
      endDate: "2028-01-01",
      rentAmount: "1000",
      paymentFrequency: "ANNUAL",
      extraChargesMode: "ONE_TIME",
    });
    await createContract(createFd);
    const contract = await prisma.contract.findFirstOrThrow({ where: { organizationId: orgA.organization.id, unitId: orgA.reservableUnit.id } });

    const updateFd = contractFormData({
      contractId: contract.id,
      unitId: contract.unitId,
      renterId: orgB.renter.id, // cross-org renter id
      startDate: "2027-01-01",
      endDate: "2028-01-01",
      rentAmount: "1000",
      paymentFrequency: "ANNUAL",
      extraChargesMode: "ONE_TIME",
    });

    await expect(updateContract(updateFd)).rejects.toThrow();
    const unchanged = await prisma.contract.findUniqueOrThrow({ where: { id: contract.id } });
    expect(unchanged.renterId).toBe(orgA.renter.id);
  });
});
