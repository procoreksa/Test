/**
 * STEP 19 - real, database-backed concurrency test for Reservation ->
 * Contract conversion. Uses the same production-grade strategy as
 * Reservation concurrency itself (see docs/RESERVATION-MANAGEMENT.md,
 * "Concurrency strategy"): the whole conversion runs inside a Postgres
 * SERIALIZABLE transaction. Two simultaneous conversion requests for the
 * SAME reservation must result in exactly one Contract.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { resetDatabase, seedFullOrg, createConvertibleReservation, type SeededOrg } from "./db-test-helpers";
import { prisma } from "@/lib/prisma";

const mockAuth = vi.fn();
vi.mock("@/lib/auth", () => ({ auth: () => mockAuth() }));

let org: SeededOrg;

beforeEach(async () => {
  await resetDatabase();
  org = await seedFullOrg("CV");
  mockAuth.mockResolvedValue(org.session);
});

describe("Reservation -> Contract conversion concurrency (Step 19)", () => {
  it("of two simultaneous conversion requests for the same Reservation, exactly one Contract results", async () => {
    const { convertReservationToContract } = await import("@/lib/actions/reservation-contract");
    const { reservation } = await createConvertibleReservation(org);

    const results = await Promise.allSettled([convertReservationToContract(reservation.id), convertReservationToContract(reservation.id)]);

    const fulfilled = results.filter((r): r is PromiseFulfilledResult<string> => r.status === "fulfilled");
    // Either both "succeed" (the second sees CONVERTED_TO_CONTRACT and
    // returns the same existing contract id via the idempotency check) or
    // one is aborted by Postgres's serialization check (P2034) while the
    // other wins outright - both outcomes satisfy "exactly one Contract
    // exists," which is the invariant actually being protected.
    expect(fulfilled.length).toBeGreaterThanOrEqual(1);

    const contracts = await prisma.contract.findMany({ where: { reservationId: reservation.id } });
    expect(contracts).toHaveLength(1);

    if (fulfilled.length === 2) {
      expect(fulfilled[0].value).toBe(fulfilled[1].value);
    }

    const updatedReservation = await prisma.reservation.findUniqueOrThrow({ where: { id: reservation.id } });
    expect(updatedReservation.status).toBe("CONVERTED_TO_CONTRACT");
  });
});
