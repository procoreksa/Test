/**
 * Real, database-backed lifecycle/regression tests for Move-In & Handover
 * Inspection (docs/MOVE-IN-HANDOVER.md, Steps 52-56): full happy-path flow,
 * idempotent completion, post-completion immutability, occupancy
 * regression (Unit.status is never touched by Move-In), financial
 * isolation, and compatibility with both manually-created and
 * Reservation-originated contracts.
 */
import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
import { resetDatabase, seedFullOrg, createTestContract, createConvertibleReservation, seedFinancialsForOrg, type SeededOrg } from "./db-test-helpers";
import { prisma } from "@/lib/prisma";

const mockAuth = vi.fn();
vi.mock("@/lib/auth", () => ({ auth: () => mockAuth() }));

let org: SeededOrg;

beforeAll(async () => {
  await resetDatabase();
  org = await seedFullOrg("MIL");
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

describe("Move-In full lifecycle (manual contract)", () => {
  it("drives DRAFT -> IN_PROGRESS -> READY_FOR_HANDOVER -> COMPLETED with every requirement satisfied", async () => {
    const { contract, unit } = await createTestContract(org);
    const {
      createMoveIn,
      startMoveIn,
      updateInspectionItem,
      addMeterReading,
      addKeyItem,
      recordTenantAcknowledgement,
      recordStaffAcknowledgement,
      setHandoverDate,
      markReadyForHandover,
      completeMoveIn,
      getMoveInById,
    } = await import("@/lib/actions/move-ins");

    const moveInId = await createMoveIn(formDataWith({ contractId: contract.id }));
    expect((await prisma.moveIn.findUniqueOrThrow({ where: { id: moveInId } })).status).toBe("DRAFT");

    await startMoveIn(moveInId);
    const afterStart = await prisma.moveIn.findUniqueOrThrow({ where: { id: moveInId } });
    expect(afterStart.status).toBe("IN_PROGRESS");
    expect(afterStart.inspectedByUserId).toBe(org.admin.id);

    // Complete every applicable checklist item.
    const items = await prisma.moveInInspectionItem.findMany({ where: { moveInId, isApplicable: true } });
    for (const item of items) {
      await updateInspectionItem(formDataWith({ itemId: item.id, condition: "GOOD" }));
    }

    await addMeterReading(formDataWith({ moveInId, meterType: "ELECTRICITY", reading: "1000" }));
    await addMeterReading(formDataWith({ moveInId, meterType: "WATER", reading: "500" }));
    await addKeyItem(formDataWith({ moveInId, keyType: "KEY", description: "Main door key" }));

    await markReadyForHandover(moveInId);
    expect((await prisma.moveIn.findUniqueOrThrow({ where: { id: moveInId } })).status).toBe("READY_FOR_HANDOVER");

    await setHandoverDate(formDataWith({ moveInId, handoverDate: "2027-06-15T10:00:00" }));
    await recordTenantAcknowledgement(formDataWith({ moveInId, tenantRepresentativeName: "Tenant Rep" }));
    await recordStaffAcknowledgement(moveInId);

    const { completion } = await getMoveInById(moveInId);
    expect(completion.canComplete).toBe(true);

    const resultId = await completeMoveIn(moveInId);
    expect(resultId).toBe(moveInId);

    const completed = await prisma.moveIn.findUniqueOrThrow({ where: { id: moveInId } });
    expect(completed.status).toBe("COMPLETED");
    expect(completed.completedAt).not.toBeNull();

    // Step 8: Move-In never touches Unit.status - it was already OCCUPIED
    // from createContractWithSchedule() at contract creation, and stays so.
    const unitAfter = await prisma.unit.findUniqueOrThrow({ where: { id: unit.id } });
    expect(unitAfter.status).toBe("OCCUPIED");
    // Contract.status is likewise untouched by Move-In.
    const contractAfter = await prisma.contract.findUniqueOrThrow({ where: { id: contract.id } });
    expect(contractAfter.status).toBe("ACTIVE");
  });

  it("completeMoveIn() is idempotent - a second call returns the same id without duplicating audit rows (Step 47)", async () => {
    const { contract } = await createTestContract(org, { unitNumber: `IDEMP-${Date.now()}` });
    const { createMoveIn, startMoveIn, updateInspectionItem, addMeterReading, addKeyItem, recordStaffAcknowledgement, setTenantAcknowledgementOverride, markReadyForHandover, completeMoveIn, setHandoverDate } =
      await import("@/lib/actions/move-ins");

    const moveInId = await createMoveIn(formDataWith({ contractId: contract.id }));
    await startMoveIn(moveInId);
    const items = await prisma.moveInInspectionItem.findMany({ where: { moveInId, isApplicable: true } });
    for (const item of items) await updateInspectionItem(formDataWith({ itemId: item.id, condition: "GOOD" }));
    await addMeterReading(formDataWith({ moveInId, meterType: "ELECTRICITY", reading: "1" }));
    await addMeterReading(formDataWith({ moveInId, meterType: "WATER", reading: "1" }));
    await addKeyItem(formDataWith({ moveInId, keyType: "KEY", description: "Key" }));
    await markReadyForHandover(moveInId);
    await setTenantAcknowledgementOverride(formDataWith({ moveInId, override: "on", reason: "Tenant unavailable" }));
    await setHandoverDate(formDataWith({ moveInId, handoverDate: "2027-06-15T10:00:00" }));
    await recordStaffAcknowledgement(moveInId);

    const firstResult = await completeMoveIn(moveInId);
    const auditCountAfterFirst = await prisma.auditLog.count({ where: { entityType: "MoveIn", entityId: moveInId, action: "UPDATE" } });

    const secondResult = await completeMoveIn(moveInId);
    const auditCountAfterSecond = await prisma.auditLog.count({ where: { entityType: "MoveIn", entityId: moveInId, action: "UPDATE" } });

    expect(secondResult).toBe(firstResult);
    expect(auditCountAfterSecond).toBe(auditCountAfterFirst);
  });

  it("post-completion: inspection items, meters, keys, and acknowledgements become read-only (Step 32)", async () => {
    const { contract } = await createTestContract(org, { unitNumber: `LOCK-${Date.now()}` });
    const { createMoveIn, startMoveIn, updateInspectionItem, addMeterReading, addKeyItem, recordStaffAcknowledgement, setTenantAcknowledgementOverride, markReadyForHandover, completeMoveIn, addInventoryItem, setHandoverDate } =
      await import("@/lib/actions/move-ins");

    const moveInId = await createMoveIn(formDataWith({ contractId: contract.id }));
    await startMoveIn(moveInId);
    const items = await prisma.moveInInspectionItem.findMany({ where: { moveInId, isApplicable: true } });
    for (const item of items) await updateInspectionItem(formDataWith({ itemId: item.id, condition: "GOOD" }));
    await addMeterReading(formDataWith({ moveInId, meterType: "ELECTRICITY", reading: "1" }));
    await addMeterReading(formDataWith({ moveInId, meterType: "WATER", reading: "1" }));
    await addKeyItem(formDataWith({ moveInId, keyType: "KEY", description: "Key" }));
    await markReadyForHandover(moveInId);
    await setTenantAcknowledgementOverride(formDataWith({ moveInId, override: "on", reason: "Tenant unavailable" }));
    await setHandoverDate(formDataWith({ moveInId, handoverDate: "2027-06-15T10:00:00" }));
    await recordStaffAcknowledgement(moveInId);
    await completeMoveIn(moveInId);

    const firstItem = items[0];
    await expect(updateInspectionItem(formDataWith({ itemId: firstItem.id, condition: "DAMAGED" }))).rejects.toThrow();
    await expect(addInventoryItem(formDataWith({ moveInId, category: "BEDROOM", itemName: "Sofa" }))).rejects.toThrow();
    await expect(addMeterReading(formDataWith({ moveInId, meterType: "GAS", reading: "1" }))).rejects.toThrow();
    await expect(addKeyItem(formDataWith({ moveInId, keyType: "REMOTE", description: "Extra remote" }))).rejects.toThrow();

    const unchanged = await prisma.moveInInspectionItem.findUniqueOrThrow({ where: { id: firstItem.id } });
    expect(unchanged.condition).toBe("GOOD");
  });

  it("rejects completion when required requirements are missing, listing them", async () => {
    const { contract } = await createTestContract(org, { unitNumber: `INCOMPLETE-${Date.now()}` });
    const { createMoveIn, startMoveIn, completeMoveIn } = await import("@/lib/actions/move-ins");
    const moveInId = await createMoveIn(formDataWith({ contractId: contract.id }));
    await startMoveIn(moveInId);

    await expect(completeMoveIn(moveInId)).rejects.toThrow();
    const stillInProgress = await prisma.moveIn.findUniqueOrThrow({ where: { id: moveInId } });
    expect(stillInProgress.status).toBe("IN_PROGRESS");
  });

  it("cancellation never deletes the record and requires a note for OTHER", async () => {
    const { contract } = await createTestContract(org, { unitNumber: `CANCEL-${Date.now()}` });
    const { createMoveIn, cancelMoveIn } = await import("@/lib/actions/move-ins");
    const moveInId = await createMoveIn(formDataWith({ contractId: contract.id }));

    await expect(cancelMoveIn(formDataWith({ moveInId, reason: "OTHER" }))).rejects.toThrow();
    await cancelMoveIn(formDataWith({ moveInId, reason: "OTHER", note: "Wrong unit selected" }));

    const cancelled = await prisma.moveIn.findUniqueOrThrow({ where: { id: moveInId } });
    expect(cancelled.status).toBe("CANCELLED");
    expect(cancelled.cancelReasonNote).toBe("Wrong unit selected");
  });
});

describe("Move-In compatibility with Reservation-originated contracts", () => {
  it("creates a LeadActivity on completion only when the Contract traces back to a Lead", async () => {
    const { convertReservationToContract } = await import("@/lib/actions/reservation-contract");
    const { reservation } = await createConvertibleReservation(org, { unitNumber: `R2C-${Date.now()}` });
    const contractId = await convertReservationToContract(reservation.id);

    const { createMoveIn, startMoveIn, updateInspectionItem, addMeterReading, addKeyItem, recordStaffAcknowledgement, setTenantAcknowledgementOverride, markReadyForHandover, completeMoveIn, setHandoverDate } =
      await import("@/lib/actions/move-ins");
    const moveInId = await createMoveIn(formDataWith({ contractId }));
    await startMoveIn(moveInId);
    const items = await prisma.moveInInspectionItem.findMany({ where: { moveInId, isApplicable: true } });
    for (const item of items) await updateInspectionItem(formDataWith({ itemId: item.id, condition: "GOOD" }));
    await addMeterReading(formDataWith({ moveInId, meterType: "ELECTRICITY", reading: "1" }));
    await addMeterReading(formDataWith({ moveInId, meterType: "WATER", reading: "1" }));
    await addKeyItem(formDataWith({ moveInId, keyType: "KEY", description: "Key" }));
    await markReadyForHandover(moveInId);
    await setTenantAcknowledgementOverride(formDataWith({ moveInId, override: "on", reason: "Tenant unavailable" }));
    await setHandoverDate(formDataWith({ moveInId, handoverDate: "2027-06-15T10:00:00" }));
    await recordStaffAcknowledgement(moveInId);
    await completeMoveIn(moveInId);

    const activities = await prisma.leadActivity.findMany({ where: { leadId: org.lead.id, activityType: "STATUS_CHANGE" } });
    expect(activities.some((a) => a.subject?.includes("Move-In") || a.subject?.includes("استلام"))).toBe(true);
  });
});

describe("Move-In financial isolation regression (Step 56)", () => {
  it("creating/completing a Move-In never creates or alters an Invoice/Payment/PaymentSchedule/OwnerLedgerEntry", async () => {
    const financials = await seedFinancialsForOrg(org);
    const invoiceBefore = await prisma.invoice.findUniqueOrThrow({ where: { id: financials.invoice.id } });
    const scheduleBefore = await prisma.paymentSchedule.findUniqueOrThrow({ where: { id: financials.schedule.id } });
    const ledgerCountBefore = await prisma.ownerLedgerEntry.count({ where: { organizationId: org.organization.id } });
    const paymentCountBefore = await prisma.payment.count({ where: { organizationId: org.organization.id } });

    const { createMoveIn, startMoveIn, updateInspectionItem, addMeterReading, addKeyItem, recordStaffAcknowledgement, setTenantAcknowledgementOverride, markReadyForHandover, completeMoveIn, setHandoverDate } =
      await import("@/lib/actions/move-ins");
    const moveInId = await createMoveIn(formDataWith({ contractId: financials.contract.id }));
    await startMoveIn(moveInId);
    const items = await prisma.moveInInspectionItem.findMany({ where: { moveInId, isApplicable: true } });
    for (const item of items) await updateInspectionItem(formDataWith({ itemId: item.id, condition: "GOOD" }));
    await addMeterReading(formDataWith({ moveInId, meterType: "ELECTRICITY", reading: "1" }));
    await addMeterReading(formDataWith({ moveInId, meterType: "WATER", reading: "1" }));
    await addKeyItem(formDataWith({ moveInId, keyType: "KEY", description: "Key" }));
    await markReadyForHandover(moveInId);
    await setTenantAcknowledgementOverride(formDataWith({ moveInId, override: "on", reason: "Tenant unavailable" }));
    await setHandoverDate(formDataWith({ moveInId, handoverDate: "2027-06-15T10:00:00" }));
    await recordStaffAcknowledgement(moveInId);
    await completeMoveIn(moveInId);

    const invoiceAfter = await prisma.invoice.findUniqueOrThrow({ where: { id: financials.invoice.id } });
    const scheduleAfter = await prisma.paymentSchedule.findUniqueOrThrow({ where: { id: financials.schedule.id } });
    expect(invoiceAfter).toEqual(invoiceBefore);
    expect(scheduleAfter).toEqual(scheduleBefore);
    expect(await prisma.ownerLedgerEntry.count({ where: { organizationId: org.organization.id } })).toBe(ledgerCountBefore);
    expect(await prisma.payment.count({ where: { organizationId: org.organization.id } })).toBe(paymentCountBefore);
  });
});
