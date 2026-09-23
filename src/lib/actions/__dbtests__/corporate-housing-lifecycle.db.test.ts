/**
 * Real, database-backed lifecycle/regression tests for Corporate Housing
 * Management (docs/CORPORATE-HOUSING.md): full happy-path flow (Account ->
 * Contact -> Occupant -> Allocation create/activate/transfer/end/cancel),
 * the Unit.status/Contract.status invariants (allocation actions never
 * touch either), the financial isolation regression (the full allocation
 * lifecycle must never mutate Invoice/InvoiceLine/Payment/PaymentSchedule/
 * OwnerLedgerEntry), the Move-In immutability regression, and the
 * Move-Out/Contract-termination blockers (an active/planned allocation must
 * block both, and the blocker's own rejection path must be the only thing
 * touched - Move-Out/Contract completion still succeeds normally once the
 * allocation is ended).
 */
import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
import {
  resetDatabase,
  seedFullOrg,
  createTestContract,
  seedCorporateAccount,
  createTestCorporateOccupant,
  seedFinancialsForOrg,
  driveMoveInToCompletion,
  type SeededOrg,
} from "./db-test-helpers";
import { prisma } from "@/lib/prisma";

const mockAuth = vi.fn();
vi.mock("@/lib/auth", () => ({ auth: () => mockAuth() }));

let org: SeededOrg;

beforeAll(async () => {
  await resetDatabase();
  org = await seedFullOrg("CH");
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

describe("Corporate Housing full lifecycle", () => {
  it("drives Account create -> Contact -> Occupant -> Allocation create/activate/transfer/end, and Cancel on a separate Planned allocation", async () => {
    const { createCorporateAccount, updateCorporateAccount, getCorporateAccountById } = await import("@/lib/actions/corporate-accounts");
    const { upsertCorporateContact } = await import("@/lib/actions/corporate-contacts");
    const { upsertCorporateOccupant } = await import("@/lib/actions/corporate-occupants");
    const { createCorporateAllocation, activateCorporateAllocation, endCorporateAllocation, cancelCorporateAllocation, transferCorporateOccupant, getCorporateAllocationById } = await import(
      "@/lib/actions/corporate-allocations"
    );

    // Account: create via the real server action (never a duplicate customer model - wraps an existing VAT-registered Renter).
    const renter = await prisma.renter.create({ data: { organizationId: org.organization.id, fullName: "Acme Corp", vatNumber: "300000000000099" } });
    const accountId = await createCorporateAccount(formDataWith({ renterId: renter.id, displayName: "Acme Corp", industry: "Construction" }));
    let account = await prisma.corporateAccount.findUniqueOrThrow({ where: { id: accountId } });
    expect(account.accountNumber).toMatch(/^CORP-\d{6}$/);
    expect(account.status).toBe("PROSPECT");

    await updateCorporateAccount(formDataWith({ accountId, displayName: "Acme Corp", status: "ACTIVE" }));
    account = await prisma.corporateAccount.findUniqueOrThrow({ where: { id: accountId } });
    expect(account.status).toBe("ACTIVE");

    // A second createCorporateAccount() attempt for the SAME renter must be rejected (one CorporateAccount per Renter).
    await expect(createCorporateAccount(formDataWith({ renterId: renter.id, displayName: "Acme Corp Duplicate" }))).rejects.toThrow();

    // Contact.
    const contactId = await upsertCorporateContact(
      formDataWith({ corporateAccountId: accountId, name: "Jane HR", contactType: "HR", email: "jane@acme.example", isPrimary: "on" })
    );
    const contact = await prisma.corporateContact.findUniqueOrThrow({ where: { id: contactId } });
    expect(contact.isPrimary).toBe(true);
    expect(contact.isActive).toBe(true);

    // Occupant - deliberately minimal PII, no passport/salary/bank fields exist on the model at all.
    const occupantId = await upsertCorporateOccupant(formDataWith({ corporateAccountId: accountId, fullName: "Employee One", employeeNumber: "EMP-001" }));
    const occupant = await prisma.corporateOccupant.findUniqueOrThrow({ where: { id: occupantId } });
    expect(occupant.status).toBe("ACTIVE");

    // A Contract under the SAME corporate Renter, eligible for allocation.
    const { unit, contract } = await createTestContract(org, { renterId: renter.id, unitNumber: "CH-101", startDate: new Date("2025-01-01"), endDate: new Date("2027-01-01") });
    expect(contract.status).toBe("ACTIVE");
    const unitBefore = await prisma.unit.findUniqueOrThrow({ where: { id: unit.id } });
    expect(unitBefore.status).toBe("OCCUPIED");

    const allocationId = await createCorporateAllocation(
      formDataWith({ corporateAccountId: accountId, occupantId, contractId: contract.id, startDate: "2026-01-01" })
    );
    let allocation = await prisma.corporateHousingAllocation.findUniqueOrThrow({ where: { id: allocationId } });
    expect(allocation.allocationNumber).toMatch(/^CHA-\d{6}$/);
    expect(allocation.unitId).toBe(unit.id); // unitId always server-derived from the Contract, never client-supplied.
    expect(allocation.status).toBe("ACTIVE"); // startDate is in the past relative to "now" in these fixtures.

    // Invariant: creating the allocation never touched Unit.status or Contract.status.
    let unitAfter = await prisma.unit.findUniqueOrThrow({ where: { id: unit.id } });
    let contractAfter = await prisma.contract.findUniqueOrThrow({ where: { id: contract.id } });
    expect(unitAfter.status).toBe(unitBefore.status);
    expect(contractAfter.status).toBe("ACTIVE");

    // A PLANNED allocation for a second occupant, exercised through activate() and cancel() paths separately below.
    const occupant2Id = await upsertCorporateOccupant(formDataWith({ corporateAccountId: accountId, fullName: "Employee Two", employeeNumber: "EMP-002" }));
    const futureStart = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const plannedAllocationId = await createCorporateAllocation(formDataWith({ corporateAccountId: accountId, occupantId: occupant2Id, contractId: contract.id, startDate: futureStart }));
    let plannedAllocation = await prisma.corporateHousingAllocation.findUniqueOrThrow({ where: { id: plannedAllocationId } });
    expect(plannedAllocation.status).toBe("PLANNED");

    await activateCorporateAllocation(formDataWith({ allocationId: plannedAllocationId }));
    plannedAllocation = await prisma.corporateHousingAllocation.findUniqueOrThrow({ where: { id: plannedAllocationId } });
    expect(plannedAllocation.status).toBe("ACTIVE");

    // Terminal-state guard: ACTIVE can never be CANCELLED (only ENDED).
    await expect(cancelCorporateAllocation(formDataWith({ allocationId: plannedAllocationId }))).rejects.toThrow();

    // Transfer occupant2's now-ACTIVE allocation to a new Contract under the SAME Corporate Account.
    const { contract: contract2 } = await createTestContract(org, { renterId: renter.id, unitNumber: "CH-102", startDate: new Date("2025-01-01"), endDate: new Date("2028-01-01") });
    const newAllocationId = await transferCorporateOccupant(
      formDataWith({ currentAllocationId: plannedAllocationId, newContractId: contract2.id, newStartDate: new Date().toISOString().slice(0, 10) })
    );
    const endedOriginal = await prisma.corporateHousingAllocation.findUniqueOrThrow({ where: { id: plannedAllocationId } });
    expect(endedOriginal.status).toBe("ENDED");
    const transferred = await prisma.corporateHousingAllocation.findUniqueOrThrow({ where: { id: newAllocationId } });
    expect(transferred.occupantId).toBe(occupant2Id);
    expect(transferred.unitId).not.toBe(endedOriginal.unitId);
    expect(transferred.status).toBe("ACTIVE");

    // End the original allocation (occupant one) - the critical invariant: ending an allocation must NEVER
    // terminate the Contract, complete a Move-Out, set Unit VACANT, or touch Invoice/PaymentSchedule.
    await endCorporateAllocation(formDataWith({ allocationId }));
    allocation = await prisma.corporateHousingAllocation.findUniqueOrThrow({ where: { id: allocationId } });
    expect(allocation.status).toBe("ENDED");
    expect(allocation.actualEndDate).not.toBeNull();

    unitAfter = await prisma.unit.findUniqueOrThrow({ where: { id: unit.id } });
    contractAfter = await prisma.contract.findUniqueOrThrow({ where: { id: contract.id } });
    expect(unitAfter.status).toBe(unitBefore.status); // still OCCUPIED, never reset to VACANT.
    expect(contractAfter.status).toBe("ACTIVE"); // never terminated.

    // Full profile read confirms the wrapped-Renter, contacts, occupants, and allocation history all resolve correctly.
    const profile = await getCorporateAccountById(accountId);
    expect(profile.account.renter.id).toBe(renter.id);
    expect(profile.occupants.map((o) => o.id).sort()).toEqual([occupantId, occupant2Id].sort());
    expect(profile.allocations.length).toBeGreaterThanOrEqual(3);

    const allocationDetail = await getCorporateAllocationById(newAllocationId);
    expect(allocationDetail.allocation.contract.id).toBe(contract2.id);
  });
});

describe("Corporate Housing financial isolation", () => {
  it("the full allocation lifecycle never mutates Invoice/InvoiceLine/Payment/PaymentSchedule/OwnerLedgerEntry", async () => {
    const { account, renter } = await seedCorporateAccount(org, { displayName: "FinIso Corp" });
    const occupant = await createTestCorporateOccupant(org.organization.id, account.id);
    const { contract } = await createTestContract(org, { renterId: renter.id, unitNumber: "FIN-101" });
    await seedFinancialsForOrg(org); // unrelated financial records on org.unit/org.renter, to prove nothing org-wide gets touched either.

    const invoicesBefore = await prisma.invoice.findMany({ orderBy: { id: "asc" } });
    const invoiceLinesBefore = await prisma.invoiceLine.findMany({ orderBy: { id: "asc" } });
    const paymentsBefore = await prisma.payment.findMany({ orderBy: { id: "asc" } });
    const schedulesBefore = await prisma.paymentSchedule.findMany({ orderBy: { id: "asc" } });
    const ledgerBefore = await prisma.ownerLedgerEntry.findMany({ orderBy: { id: "asc" } });

    const { createCorporateAllocation, activateCorporateAllocation, endCorporateAllocation } = await import("@/lib/actions/corporate-allocations");
    const allocationId = await createCorporateAllocation(formDataWith({ corporateAccountId: account.id, occupantId: occupant.id, contractId: contract.id, startDate: "2027-01-01" }));
    await activateCorporateAllocation(formDataWith({ allocationId }));
    await endCorporateAllocation(formDataWith({ allocationId }));

    expect(await prisma.invoice.findMany({ orderBy: { id: "asc" } })).toEqual(invoicesBefore);
    expect(await prisma.invoiceLine.findMany({ orderBy: { id: "asc" } })).toEqual(invoiceLinesBefore);
    expect(await prisma.payment.findMany({ orderBy: { id: "asc" } })).toEqual(paymentsBefore);
    expect(await prisma.paymentSchedule.findMany({ orderBy: { id: "asc" } })).toEqual(schedulesBefore);
    expect(await prisma.ownerLedgerEntry.findMany({ orderBy: { id: "asc" } })).toEqual(ledgerBefore);
  });
});

describe("Corporate Housing Move-In immutability", () => {
  it("allocation create/activate/transfer/end never mutates a completed Move-In's snapshot", async () => {
    const { account, renter } = await seedCorporateAccount(org, { displayName: "MoveIn Corp" });
    const occupant = await createTestCorporateOccupant(org.organization.id, account.id);
    const { contract } = await createTestContract(org, { renterId: renter.id, unitNumber: "MI-CORP-101", startDate: new Date("2026-01-01"), endDate: new Date("2028-01-01") });

    const moveInId = await driveMoveInToCompletion(contract.id);
    const moveInBefore = await prisma.moveIn.findUniqueOrThrow({ where: { id: moveInId }, include: { inspectionItems: true, meterReadings: true, keyItems: true } });

    const { createCorporateAllocation, activateCorporateAllocation, endCorporateAllocation, transferCorporateOccupant } = await import("@/lib/actions/corporate-allocations");
    const allocationId = await createCorporateAllocation(formDataWith({ corporateAccountId: account.id, occupantId: occupant.id, contractId: contract.id, startDate: "2027-01-01" }));
    await activateCorporateAllocation(formDataWith({ allocationId }));

    const { contract: contract2 } = await createTestContract(org, {
      renterId: renter.id,
      unitNumber: "MI-CORP-102",
      startDate: new Date("2026-01-01"),
      endDate: new Date("2028-01-01"),
    });
    const transferredId = await transferCorporateOccupant(formDataWith({ currentAllocationId: allocationId, newContractId: contract2.id, newStartDate: new Date().toISOString().slice(0, 10) }));
    await endCorporateAllocation(formDataWith({ allocationId: transferredId }));

    const moveInAfter = await prisma.moveIn.findUniqueOrThrow({ where: { id: moveInId }, include: { inspectionItems: true, meterReadings: true, keyItems: true } });
    expect(moveInAfter).toEqual(moveInBefore);
  });
});

describe("Corporate Housing Move-Out completion blocker", () => {
  it("blocks completeMoveOut() while an active/planned allocation exists on the Contract, and allows it once ended (Step 23's blocking approach)", async () => {
    const { account, renter } = await seedCorporateAccount(org, { displayName: "MoveOut Corp" });
    const occupant = await createTestCorporateOccupant(org.organization.id, account.id);
    const { contract } = await createTestContract(org, { renterId: renter.id, unitNumber: "MO-CORP-101", startDate: new Date("2025-01-01"), endDate: new Date("2027-06-01") });

    const { createCorporateAllocation, endCorporateAllocation } = await import("@/lib/actions/corporate-allocations");
    const allocationId = await createCorporateAllocation(formDataWith({ corporateAccountId: account.id, occupantId: occupant.id, contractId: contract.id, startDate: "2026-01-01" }));

    const { createMoveOut, startMoveOut, updateInspectionItem, addMeterReading, addKeyItem, setVacateDate, recordTenantAcknowledgement, recordStaffAcknowledgement, advanceToFindingsReview, reviewMoveOutFindings, completeMoveOut } =
      await import("@/lib/actions/move-outs");

    function fd(fields: Record<string, string>) {
      const f = new FormData();
      for (const [k, v] of Object.entries(fields)) f.set(k, v);
      return f;
    }

    const moveOutId = await createMoveOut(fd({ contractId: contract.id }));
    await startMoveOut(moveOutId);
    const items = await prisma.moveOutInspectionItem.findMany({ where: { moveOutId, isApplicable: true } });
    for (const item of items) await updateInspectionItem(fd({ itemId: item.id, condition: "GOOD" }));
    await addMeterReading(fd({ moveOutId, meterType: "ELECTRICITY", reading: "1200" }));
    await addMeterReading(fd({ moveOutId, meterType: "WATER", reading: "600" }));
    await addKeyItem(fd({ moveOutId, keyType: "KEY", description: "Main door key" }));
    await setVacateDate(fd({ moveOutId, vacateDate: "2027-06-15T10:00:00" }));
    await recordTenantAcknowledgement(fd({ moveOutId, tenantRepresentativeName: "Tenant Rep" }));
    await recordStaffAcknowledgement(moveOutId);
    await advanceToFindingsReview(moveOutId);
    await reviewMoveOutFindings(moveOutId);

    // Blocked: an ACTIVE corporate housing allocation still exists on this Contract.
    await expect(completeMoveOut(moveOutId)).rejects.toThrow();
    let moveOut = await prisma.moveOut.findUniqueOrThrow({ where: { id: moveOutId } });
    expect(moveOut.status).not.toBe("COMPLETED");

    // End the allocation, then completion succeeds normally - the blocker's rejection path is the ONLY thing exercised; nothing else about Move-Out behavior changes.
    await endCorporateAllocation(fd({ allocationId }));
    await completeMoveOut(moveOutId);
    moveOut = await prisma.moveOut.findUniqueOrThrow({ where: { id: moveOutId } });
    expect(moveOut.status).toBe("COMPLETED");
  });
});

describe("Corporate Housing Contract termination blocker", () => {
  it("blocks terminateContract() while an active/planned allocation exists, and allows it once ended", async () => {
    const { account, renter } = await seedCorporateAccount(org, { displayName: "Terminate Corp" });
    const occupant = await createTestCorporateOccupant(org.organization.id, account.id);
    const { contract } = await createTestContract(org, { renterId: renter.id, unitNumber: "TERM-CORP-101", startDate: new Date("2025-01-01"), endDate: new Date("2028-01-01") });

    const { createCorporateAllocation, endCorporateAllocation } = await import("@/lib/actions/corporate-allocations");
    const allocationId = await createCorporateAllocation(formDataWith({ corporateAccountId: account.id, occupantId: occupant.id, contractId: contract.id, startDate: "2026-06-01" }));

    const { terminateContract } = await import("@/lib/actions/contracts");
    await expect(terminateContract(contract.id)).rejects.toThrow();
    let contractAfter = await prisma.contract.findUniqueOrThrow({ where: { id: contract.id } });
    expect(contractAfter.status).not.toBe("TERMINATED");

    await endCorporateAllocation(formDataWith({ allocationId }));
    await terminateContract(contract.id);
    contractAfter = await prisma.contract.findUniqueOrThrow({ where: { id: contract.id } });
    expect(contractAfter.status).toBe("TERMINATED");
  });
});
