/**
 * Real, database-backed tests for the Contract renewal <-> Move-Out
 * conflict rule (Move-Out Management Phase 2, requirement 4):
 * renewContract() must reject a Contract that has a non-terminal or
 * COMPLETED Move-Out, but a CANCELLED Move-Out never blocks renewal.
 * Creating a Move-Out for an already-RENEWED Contract must also be
 * rejected.
 */
import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
import { resetDatabase, seedFullOrg, createTestContract, type SeededOrg } from "./db-test-helpers";
import { prisma } from "@/lib/prisma";

const mockAuth = vi.fn();
vi.mock("@/lib/auth", () => ({ auth: () => mockAuth() }));

let org: SeededOrg;

beforeAll(async () => {
  await resetDatabase();
  org = await seedFullOrg("MRC");
});

beforeEach(() => {
  mockAuth.mockReset();
  mockAuth.mockResolvedValue(org.session);
});

function formDataWith(fields: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
}

function renewalFormData(contractId: string) {
  return formDataWith({
    contractId,
    startDate: "2028-01-01",
    endDate: "2029-01-01",
    rentAmount: "13000",
    paymentFrequency: "ANNUAL",
    extraChargesMode: "ONE_TIME",
  });
}

async function expectRedirect(promise: Promise<unknown>) {
  // renewContract() calls redirect() at the end on success, which throws a
  // NEXT_REDIRECT control-flow error in a non-Next.js test runtime -
  // expected and harmless, matches the existing contract-renewal test
  // convention (reservation-contract-conversion.db.test.ts).
  await promise.catch((e) => {
    if (!String((e as { message?: unknown })?.message ?? e).includes("NEXT_REDIRECT")) throw e;
  });
}

describe("renewContract() vs Move-Out conflict", () => {
  it.each(["DRAFT", "SCHEDULED", "IN_PROGRESS", "PENDING_FINDINGS_REVIEW", "READY_FOR_CLOSURE", "COMPLETED"] as const)(
    "rejects renewal when a %s Move-Out exists for the Contract",
    async (status) => {
      const { contract } = await createTestContract(org, { unitNumber: `MRC-${status}-${Date.now()}` });
      const { createMoveOut } = await import("@/lib/actions/move-outs");
      const moveOutId = await createMoveOut(formDataWith({ contractId: contract.id }));
      await prisma.moveOut.update({ where: { id: moveOutId }, data: { status } });

      const { renewContract } = await import("@/lib/actions/contracts");
      await expect(renewContract(renewalFormData(contract.id))).rejects.toThrow();

      const contractAfter = await prisma.contract.findUniqueOrThrow({ where: { id: contract.id } });
      expect(contractAfter.status).not.toBe("RENEWED");
      expect(contractAfter.renewedFromContractId).toBeNull();
    }
  );

  it("allows renewal when the only Move-Out for the Contract is CANCELLED", async () => {
    const { contract } = await createTestContract(org, { unitNumber: `MRC-CANCELLED-${Date.now()}` });
    const { createMoveOut, cancelMoveOut } = await import("@/lib/actions/move-outs");
    const moveOutId = await createMoveOut(formDataWith({ contractId: contract.id }));
    await cancelMoveOut(formDataWith({ moveOutId, reason: "DATA_ERROR" }));

    const { renewContract } = await import("@/lib/actions/contracts");
    await expectRedirect(renewContract(renewalFormData(contract.id)));

    const contractAfter = await prisma.contract.findUniqueOrThrow({ where: { id: contract.id } });
    expect(contractAfter.status).toBe("RENEWED");
    expect(contractAfter.renewedFromContractId).toBeNull();
    const renewedInto = await prisma.contract.findFirst({ where: { renewedFromContractId: contract.id } });
    expect(renewedInto).not.toBeNull();
  });

  it("rejects creating a Move-Out for an already-RENEWED Contract", async () => {
    const { contract } = await createTestContract(org, { unitNumber: `MRC-RENEWED-${Date.now()}` });
    const { renewContract } = await import("@/lib/actions/contracts");
    await expectRedirect(renewContract(renewalFormData(contract.id)));
    expect((await prisma.contract.findUniqueOrThrow({ where: { id: contract.id } })).status).toBe("RENEWED");

    const { createMoveOut } = await import("@/lib/actions/move-outs");
    await expect(createMoveOut(formDataWith({ contractId: contract.id }))).rejects.toThrow();
    expect(await prisma.moveOut.count({ where: { contractId: contract.id } })).toBe(0);
  });
});
