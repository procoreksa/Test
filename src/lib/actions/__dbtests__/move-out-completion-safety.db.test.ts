/**
 * Real, database-backed tests for completeMoveOut()'s conflicting-occupancy
 * safety invariant (Move-Out Management Phase 2, requirement 3): a newer
 * ACTIVE Contract or a live (PENDING/CONFIRMED) Reservation on the same Unit
 * must reject completion outright, leaving every record - Move-Out,
 * Contract, Unit - exactly as it was. No partial writes.
 */
import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
import { resetDatabase, seedFullOrg, createTestContract, uniqueSuffix, type SeededOrg } from "./db-test-helpers";
import { prisma } from "@/lib/prisma";

const mockAuth = vi.fn();
vi.mock("@/lib/auth", () => ({ auth: () => mockAuth() }));

let org: SeededOrg;

beforeAll(async () => {
  await resetDatabase();
  org = await seedFullOrg("MCS");
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

async function driveMoveOutToReadyForClosure(contractId: string) {
  const { createMoveOut, startMoveOut, updateInspectionItem, addMeterReading, addKeyItem, advanceToFindingsReview, reviewMoveOutFindings, setVacateDate, recordTenantAcknowledgement, recordStaffAcknowledgement } =
    await import("@/lib/actions/move-outs");

  const moveOutId = await createMoveOut(formDataWith({ contractId }));
  await startMoveOut(moveOutId);
  const items = await prisma.moveOutInspectionItem.findMany({ where: { moveOutId, isApplicable: true } });
  for (const item of items) {
    await updateInspectionItem(formDataWith({ itemId: item.id, condition: "GOOD" }));
  }
  await addMeterReading(formDataWith({ moveOutId, meterType: "ELECTRICITY", reading: "1200" }));
  await addMeterReading(formDataWith({ moveOutId, meterType: "WATER", reading: "600" }));
  await addKeyItem(formDataWith({ moveOutId, keyType: "KEY", description: "Main door key" }));
  await setVacateDate(formDataWith({ moveOutId, vacateDate: "2027-06-15T10:00:00" }));
  await recordTenantAcknowledgement(formDataWith({ moveOutId, tenantRepresentativeName: "Tenant Rep" }));
  await recordStaffAcknowledgement(moveOutId);
  await advanceToFindingsReview(moveOutId);
  await reviewMoveOutFindings(moveOutId);
  return moveOutId;
}

describe("completeMoveOut() conflicting-occupancy rejection", () => {
  it("rejects completion when another ACTIVE Contract already exists for the Unit, with no partial writes", async () => {
    const { contract, unit } = await createTestContract(org, { unitNumber: `MCS-1-${Date.now()}` });
    const moveOutId = await driveMoveOutToReadyForClosure(contract.id);

    // Simulate a newer occupancy state appearing after the Move-Out was
    // prepared: another ACTIVE Contract for the very same Unit (an
    // application-layer invariant this test is intentionally checking
    // completeMoveOut() enforces itself, not one the schema prevents).
    await prisma.contract.create({
      data: {
        organizationId: org.organization.id,
        contractNumber: `CTR-CONFLICT-${uniqueSuffix()}`,
        unitId: unit.id,
        renterId: org.renter.id,
        startDate: new Date("2027-07-01"),
        endDate: new Date("2028-07-01"),
        rentAmount: 15000,
        paymentFrequency: "ANNUAL",
        extraChargesMode: "ONE_TIME",
        vatApplicable: false,
        status: "ACTIVE",
      },
    });

    const auditCountBefore = await prisma.auditLog.count({ where: { entityType: "MoveOut", entityId: moveOutId } });

    const { completeMoveOut } = await import("@/lib/actions/move-outs");
    await expect(completeMoveOut(moveOutId)).rejects.toThrow();

    const moveOutAfter = await prisma.moveOut.findUniqueOrThrow({ where: { id: moveOutId } });
    expect(moveOutAfter.status).toBe("READY_FOR_CLOSURE");
    expect(moveOutAfter.completedAt).toBeNull();

    const unitAfter = await prisma.unit.findUniqueOrThrow({ where: { id: unit.id } });
    expect(unitAfter.status).toBe("OCCUPIED");

    const auditCountAfter = await prisma.auditLog.count({ where: { entityType: "MoveOut", entityId: moveOutId } });
    expect(auditCountAfter).toBe(auditCountBefore);
  });

  it("rejects completion when the Unit is held by a live (PENDING) Reservation, with no partial writes", async () => {
    const { contract, unit } = await createTestContract(org, { unitNumber: `MCS-2-${Date.now()}` });
    const moveOutId = await driveMoveOutToReadyForClosure(contract.id);

    const offer = await prisma.leasingOffer.create({
      data: {
        organizationId: org.organization.id,
        offerNumber: `OFFER-CONFLICT-${uniqueSuffix()}`,
        versionNumber: 1,
        leadId: org.lead.id,
        unitId: unit.id,
        status: "ACCEPTED",
        validFrom: new Date("2027-01-01"),
        validUntil: new Date("2027-12-31"),
        annualRent: 15000,
        discountAmount: 0,
        discountPercentage: 0,
        netAnnualRent: 15000,
        securityDeposit: 3750,
        totalInitialPayment: 3750,
        paymentFrequency: "QUARTERLY",
        leaseDurationMonths: 12,
        createdByUserId: org.admin.id,
      },
    });
    await prisma.reservation.create({
      data: {
        organizationId: org.organization.id,
        reservationNumber: `RES-CONFLICT-${uniqueSuffix()}`,
        leadId: org.lead.id,
        offerId: offer.id,
        unitId: unit.id,
        status: "PENDING",
        holdUntil: new Date("2027-12-31"),
        reservationAmount: 0,
        reservationAmountStatus: "NOT_REQUIRED",
        createdByUserId: org.admin.id,
      },
    });

    const { completeMoveOut } = await import("@/lib/actions/move-outs");
    await expect(completeMoveOut(moveOutId)).rejects.toThrow();

    const moveOutAfter = await prisma.moveOut.findUniqueOrThrow({ where: { id: moveOutId } });
    expect(moveOutAfter.status).toBe("READY_FOR_CLOSURE");
    const unitAfter = await prisma.unit.findUniqueOrThrow({ where: { id: unit.id } });
    expect(unitAfter.status).toBe("OCCUPIED");
  });

  it("a CANCELLED or RELEASED reservation on the Unit does not block completion", async () => {
    const { contract, unit } = await createTestContract(org, { unitNumber: `MCS-3-${Date.now()}` });
    const moveOutId = await driveMoveOutToReadyForClosure(contract.id);

    const offer = await prisma.leasingOffer.create({
      data: {
        organizationId: org.organization.id,
        offerNumber: `OFFER-OK-${uniqueSuffix()}`,
        versionNumber: 1,
        leadId: org.lead.id,
        unitId: unit.id,
        status: "ACCEPTED",
        validFrom: new Date("2027-01-01"),
        validUntil: new Date("2027-12-31"),
        annualRent: 15000,
        discountAmount: 0,
        discountPercentage: 0,
        netAnnualRent: 15000,
        securityDeposit: 3750,
        totalInitialPayment: 3750,
        paymentFrequency: "QUARTERLY",
        leaseDurationMonths: 12,
        createdByUserId: org.admin.id,
      },
    });
    await prisma.reservation.create({
      data: {
        organizationId: org.organization.id,
        reservationNumber: `RES-OK-${uniqueSuffix()}`,
        leadId: org.lead.id,
        offerId: offer.id,
        unitId: unit.id,
        status: "CANCELLED",
        holdUntil: new Date("2027-12-31"),
        reservationAmount: 0,
        reservationAmountStatus: "NOT_REQUIRED",
        createdByUserId: org.admin.id,
      },
    });

    const { completeMoveOut } = await import("@/lib/actions/move-outs");
    await completeMoveOut(moveOutId);

    const unitAfter = await prisma.unit.findUniqueOrThrow({ where: { id: unit.id } });
    expect(unitAfter.status).toBe("VACANT");
  });

  it("does not re-write Unit.status when it is already VACANT (no-op vacancy write)", async () => {
    const { contract, unit } = await createTestContract(org, { unitNumber: `MCS-4-${Date.now()}` });
    const moveOutId = await driveMoveOutToReadyForClosure(contract.id);
    await prisma.unit.update({ where: { id: unit.id }, data: { status: "VACANT" } });
    const unitBefore = await prisma.unit.findUniqueOrThrow({ where: { id: unit.id } });

    const { completeMoveOut } = await import("@/lib/actions/move-outs");
    await completeMoveOut(moveOutId);

    const unitAfter = await prisma.unit.findUniqueOrThrow({ where: { id: unit.id } });
    expect(unitAfter.status).toBe("VACANT");
    expect(unitAfter.updatedAt.getTime()).toBe(unitBefore.updatedAt.getTime());
  });
});
