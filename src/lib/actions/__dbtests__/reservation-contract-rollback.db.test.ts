/**
 * STEP 20 - real, database-backed rollback test for Reservation ->
 * Contract conversion. Forces a genuine mid-transaction failure (a real
 * unique-constraint violation on Contract.reservationId, not a test-only
 * hook) partway through convertReservationToContract() - after
 * createContractWithSchedule() has already created the Contract row and
 * its PaymentSchedule, but before the transaction commits - and verifies
 * the whole Serializable transaction rolls back atomically: no orphan
 * Contract, no orphan PaymentSchedule, no partial Renter, Reservation
 * stays CONFIRMED, Lead is not WON, Unit stays RESERVED, and no false
 * Audit entry is left behind.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { resetDatabase, seedFullOrg, createConvertibleReservation, createTestRenter, createTestUnit, type SeededOrg } from "./db-test-helpers";
import { prisma } from "@/lib/prisma";

const mockAuth = vi.fn();
vi.mock("@/lib/auth", () => ({ auth: () => mockAuth() }));

let org: SeededOrg;

beforeEach(async () => {
  await resetDatabase();
  org = await seedFullOrg("RB");
  mockAuth.mockResolvedValue(org.session);
});

describe("Reservation -> Contract conversion: rollback on mid-transaction failure (Step 20)", () => {
  it("rolls back the entire transaction when the final reservationId link violates a unique constraint", async () => {
    const { convertReservationToContract } = await import("@/lib/actions/reservation-contract");
    const { unit, reservation } = await createConvertibleReservation(org);

    // Force a real failure: pre-occupy the unique Contract.reservationId
    // slot this very reservation is about to be linked to, using an
    // unrelated dummy unit/renter/contract so the conflict is isolated to
    // exactly the one constraint being tested.
    const dummyUnit = await createTestUnit(org.organization.id, org.floor.id, { unitNumber: "ROLLBACK-DUMMY" });
    const dummyRenter = await createTestRenter(org.organization.id, "Rollback Dummy Renter");
    await prisma.contract.create({
      data: {
        organizationId: org.organization.id,
        contractNumber: `ROLLBACK-DUMMY-${Date.now()}`,
        unitId: dummyUnit.id,
        renterId: dummyRenter.id,
        startDate: new Date("2026-01-01"),
        endDate: new Date("2027-01-01"),
        rentAmount: 1000,
        paymentFrequency: "ANNUAL",
        status: "ACTIVE",
        reservationId: reservation.id,
      },
    });

    const [contractCountBefore, scheduleCountBefore, renterCountBefore, auditCountBefore] = await Promise.all([
      prisma.contract.count({ where: { organizationId: org.organization.id } }),
      prisma.paymentSchedule.count({ where: { organizationId: org.organization.id } }),
      prisma.renter.count({ where: { organizationId: org.organization.id } }),
      prisma.auditLog.count({ where: { organizationId: org.organization.id, entityType: "Contract" } }),
    ]);

    await expect(convertReservationToContract(reservation.id)).rejects.toThrow();

    const [contractCountAfter, scheduleCountAfter, renterCountAfter, auditCountAfter] = await Promise.all([
      prisma.contract.count({ where: { organizationId: org.organization.id } }),
      prisma.paymentSchedule.count({ where: { organizationId: org.organization.id } }),
      prisma.renter.count({ where: { organizationId: org.organization.id } }),
      prisma.auditLog.count({ where: { organizationId: org.organization.id, entityType: "Contract" } }),
    ]);

    // No orphan Contract (only the pre-existing dummy remains) and no
    // orphan PaymentSchedule from the rolled-back attempt.
    expect(contractCountAfter).toBe(contractCountBefore);
    expect(scheduleCountAfter).toBe(scheduleCountBefore);
    // No partial Renter left behind from the rolled-back resolveRenterForLead() call.
    expect(renterCountAfter).toBe(renterCountBefore);
    // No false Audit entry for the failed Contract creation.
    expect(auditCountAfter).toBe(auditCountBefore);

    const stillConfirmed = await prisma.reservation.findUniqueOrThrow({ where: { id: reservation.id } });
    expect(stillConfirmed.status).toBe("CONFIRMED");
    expect(stillConfirmed.convertedAt).toBeNull();

    const leadStillNotWon = await prisma.lead.findUniqueOrThrow({ where: { id: org.lead.id } });
    expect(leadStillNotWon.status).not.toBe("WON");
    expect(leadStillNotWon.convertedContractId).toBeNull();

    const unitStillReserved = await prisma.unit.findUniqueOrThrow({ where: { id: unit.id } });
    expect(unitStillReserved.status).toBe("RESERVED");
  });
});
