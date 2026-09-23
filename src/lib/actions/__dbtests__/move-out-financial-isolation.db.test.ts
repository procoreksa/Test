/**
 * Real, database-backed financial-isolation regression test for Move-Out
 * Management (Move-Out Management Phase 2, requirement 9 / Decision 3/4):
 * driving a full Move-Out lifecycle to COMPLETED against a Contract that
 * already has a real Invoice/InvoiceLine/PaymentSchedule/Payment/
 * OwnerLedgerEntry must never create, update, delete, or reverse any of
 * them. Mirrors move-in-lifecycle.db.test.ts's own financial-isolation
 * regression exactly.
 */
import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
import { resetDatabase, seedFullOrg, seedFinancialsForOrg, type SeededOrg } from "./db-test-helpers";
import { prisma } from "@/lib/prisma";

const mockAuth = vi.fn();
vi.mock("@/lib/auth", () => ({ auth: () => mockAuth() }));

let org: SeededOrg;

beforeAll(async () => {
  await resetDatabase();
  org = await seedFullOrg("MFI");
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

describe("Move-Out financial isolation regression", () => {
  it("creating/progressing/completing a Move-Out never creates or alters an Invoice/InvoiceLine/Payment/PaymentSchedule/OwnerLedgerEntry", async () => {
    const financials = await seedFinancialsForOrg(org);
    const invoiceBefore = await prisma.invoice.findUniqueOrThrow({ where: { id: financials.invoice.id }, include: { lines: true } });
    const scheduleBefore = await prisma.paymentSchedule.findUniqueOrThrow({ where: { id: financials.schedule.id } });
    const paymentBefore = await prisma.payment.findUniqueOrThrow({ where: { id: financials.payment.id } });
    const ledgerBefore = await prisma.ownerLedgerEntry.findUniqueOrThrow({ where: { id: financials.ledgerEntry.id } });
    const ledgerCountBefore = await prisma.ownerLedgerEntry.count({ where: { organizationId: org.organization.id } });
    const paymentCountBefore = await prisma.payment.count({ where: { organizationId: org.organization.id } });
    const invoiceCountBefore = await prisma.invoice.count({ where: { organizationId: org.organization.id } });
    const scheduleCountBefore = await prisma.paymentSchedule.count({ where: { organizationId: org.organization.id } });

    const {
      createMoveOut,
      startMoveOut,
      updateInspectionItem,
      advanceToFindingsReview,
      reviewMoveOutFindings,
      addMeterReading,
      addKeyItem,
      setVacateDate,
      recordTenantAcknowledgement,
      recordStaffAcknowledgement,
      completeMoveOut,
    } = await import("@/lib/actions/move-outs");

    const moveOutId = await createMoveOut(formDataWith({ contractId: financials.contract.id }));
    await startMoveOut(moveOutId);
    const items = await prisma.moveOutInspectionItem.findMany({ where: { moveOutId, isApplicable: true } });
    for (const item of items) await updateInspectionItem(formDataWith({ itemId: item.id, condition: "GOOD" }));
    await addMeterReading(formDataWith({ moveOutId, meterType: "ELECTRICITY", reading: "1" }));
    await addMeterReading(formDataWith({ moveOutId, meterType: "WATER", reading: "1" }));
    await addKeyItem(formDataWith({ moveOutId, keyType: "KEY", description: "Key" }));
    await setVacateDate(formDataWith({ moveOutId, vacateDate: "2027-06-15T10:00:00" }));
    await recordTenantAcknowledgement(formDataWith({ moveOutId, tenantRepresentativeName: "Tenant Rep" }));
    await recordStaffAcknowledgement(moveOutId);
    await advanceToFindingsReview(moveOutId);
    await reviewMoveOutFindings(moveOutId);
    await completeMoveOut(moveOutId);

    const completed = await prisma.moveOut.findUniqueOrThrow({ where: { id: moveOutId } });
    expect(completed.status).toBe("COMPLETED");

    const invoiceAfter = await prisma.invoice.findUniqueOrThrow({ where: { id: financials.invoice.id }, include: { lines: true } });
    const scheduleAfter = await prisma.paymentSchedule.findUniqueOrThrow({ where: { id: financials.schedule.id } });
    const paymentAfter = await prisma.payment.findUniqueOrThrow({ where: { id: financials.payment.id } });
    const ledgerAfter = await prisma.ownerLedgerEntry.findUniqueOrThrow({ where: { id: financials.ledgerEntry.id } });

    expect(invoiceAfter).toEqual(invoiceBefore);
    expect(scheduleAfter).toEqual(scheduleBefore);
    expect(paymentAfter).toEqual(paymentBefore);
    expect(ledgerAfter).toEqual(ledgerBefore);
    expect(await prisma.ownerLedgerEntry.count({ where: { organizationId: org.organization.id } })).toBe(ledgerCountBefore);
    expect(await prisma.payment.count({ where: { organizationId: org.organization.id } })).toBe(paymentCountBefore);
    expect(await prisma.invoice.count({ where: { organizationId: org.organization.id } })).toBe(invoiceCountBefore);
    expect(await prisma.paymentSchedule.count({ where: { organizationId: org.organization.id } })).toBe(scheduleCountBefore);
  });

  it("Move-Out never itself invokes Contract termination - Contract.status is untouched by the full lifecycle", async () => {
    const financials = await seedFinancialsForOrg(org);
    const { createMoveOut, startMoveOut, cancelMoveOut } = await import("@/lib/actions/move-outs");
    const moveOutId = await createMoveOut(formDataWith({ contractId: financials.contract.id }));
    await startMoveOut(moveOutId);
    await cancelMoveOut(formDataWith({ moveOutId, reason: "TENANT_REQUEST" }));

    const contractAfter = await prisma.contract.findUniqueOrThrow({ where: { id: financials.contract.id } });
    expect(contractAfter.status).toBe("ACTIVE");
  });
});
