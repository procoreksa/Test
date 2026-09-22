/**
 * STEP 35/36 - real, database-backed concurrency test for Reservation
 * Management. Proves the chosen concurrency strategy - wrapping
 * createReservation/submitReservation/confirmReservation in a Postgres
 * SERIALIZABLE transaction (see docs/RESERVATION-MANAGEMENT.md,
 * "Concurrency strategy") - actually prevents two simultaneous attempts to
 * move competing reservations for the same Unit past the DRAFT stage (the
 * point at which a reservation starts blocking the Unit, per Step 8).
 *
 * Two DRAFT reservations for the same Unit are allowed to coexist by
 * design (DRAFT does not block - see reservation-business-rules.db.test.ts).
 * The real race the brief describes is two users trying to *confirm/hold*
 * the same Unit at the same time, so this test races submitReservation()
 * (DRAFT -> PENDING, the transition that starts blocking the Unit) against
 * two reservations for the same Unit, run truly concurrently via
 * Promise.allSettled. Under Postgres Serializable Snapshot Isolation, one
 * of the two transactions must be aborted with a serialization failure
 * (Prisma error code P2034) because both read the same "no blocking
 * reservation yet" snapshot of the reservations table while the other was
 * concurrently writing to it - exactly one must succeed.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { resetDatabase, seedFullOrg, createTestOffer, type SeededOrg } from "./db-test-helpers";
import { prisma } from "@/lib/prisma";

const mockAuth = vi.fn();
vi.mock("@/lib/auth", () => ({ auth: () => mockAuth() }));

let org: SeededOrg;

beforeEach(async () => {
  await resetDatabase();
  org = await seedFullOrg("CC");
  mockAuth.mockResolvedValue(org.session);
});

describe("Reservation concurrency (Step 35/36): Serializable isolation prevents double-holding the same Unit", () => {
  it("of two simultaneous submitReservation() calls for two DRAFT reservations on the same Unit, exactly one succeeds", async () => {
    const { createReservation, submitReservation } = await import("@/lib/actions/reservations");

    // org.reservation is already a DRAFT reservation on org.reservableUnit
    // (from org.acceptedOffer, via seedFullOrg). Create a second, competing
    // DRAFT reservation for the SAME unit from a distinct accepted offer -
    // allowed, since DRAFT does not block Unit availability.
    const secondOffer = await createTestOffer(org.organization.id, org.lead.id, org.reservableUnit.id, org.admin.id, { status: "ACCEPTED" });
    const fd = new FormData();
    fd.set("offerId", secondOffer.id);
    fd.set("holdUntil", "2099-01-01T00:00");
    fd.set("reservationAmount", "0");
    const secondReservationId = await createReservation(fd);

    const firstReservationId = org.reservation.id;

    // Fire both submits truly concurrently.
    const results = await Promise.allSettled([submitReservation(firstReservationId), submitReservation(secondReservationId)]);

    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r) => r.status === "rejected");
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);

    const [first, second] = await Promise.all([
      prisma.reservation.findUniqueOrThrow({ where: { id: firstReservationId } }),
      prisma.reservation.findUniqueOrThrow({ where: { id: secondReservationId } }),
    ]);
    const statuses = [first.status, second.status].sort();
    // Exactly one moved to PENDING; the other's transaction was aborted
    // and rolled back, so it remains DRAFT (not silently corrupted).
    expect(statuses).toEqual(["DRAFT", "PENDING"]);
  });

  it("of two simultaneous createReservation() calls (Step 36's literal scenario), exactly one succeeds - Postgres also serializes on the shared numbering Counter row", async () => {
    const { createReservation } = await import("@/lib/actions/reservations");

    const offerA = await createTestOffer(org.organization.id, org.lead.id, org.unit.id, org.admin.id, { status: "ACCEPTED" });
    const offerB = await createTestOffer(org.organization.id, org.lead.id, org.unit.id, org.admin.id, { status: "ACCEPTED" });

    const fdA = new FormData();
    fdA.set("offerId", offerA.id);
    fdA.set("holdUntil", "2099-01-01T00:00");
    fdA.set("reservationAmount", "0");
    const fdB = new FormData();
    fdB.set("offerId", offerB.id);
    fdB.set("holdUntil", "2099-01-01T00:00");
    fdB.set("reservationAmount", "0");

    // At the DRAFT stage, Unit-level conflict alone would not block both of
    // these (DRAFT doesn't block, by design - see
    // reservation-business-rules.db.test.ts). In practice, though, both
    // transactions also write to the SAME shared numbering Counter row
    // (nextCounterValue) to allocate a reservation number, so Postgres's
    // Serializable Snapshot Isolation still detects a genuine conflict
    // between the two concurrent transactions and aborts one of them
    // (surfacing as Prisma P2034) - a real, expected side effect of reusing
    // the org's shared Counter infrastructure (Step 4) under Serializable
    // isolation, documented in docs/RESERVATION-MANAGEMENT.md. Either way,
    // "exactly one succeeds" holds.
    const createResults = await Promise.allSettled([createReservation(fdA), createReservation(fdB)]);
    const createdOk = createResults.filter((r): r is PromiseFulfilledResult<string> => r.status === "fulfilled");
    expect(createdOk).toHaveLength(1);
    const createdReservation = await prisma.reservation.findUniqueOrThrow({ where: { id: createdOk[0].value } });
    expect(createdReservation.status).toBe("DRAFT");
  });

  it("of two DRAFT reservations for the same Unit created sequentially, a simultaneous submitReservation() race still lets exactly one become PENDING and only that one can be confirmed", async () => {
    const { createReservation, submitReservation, confirmReservation } = await import("@/lib/actions/reservations");

    const offerA = await createTestOffer(org.organization.id, org.lead.id, org.unit.id, org.admin.id, { status: "ACCEPTED" });
    const offerB = await createTestOffer(org.organization.id, org.lead.id, org.unit.id, org.admin.id, { status: "ACCEPTED" });

    const fdA = new FormData();
    fdA.set("offerId", offerA.id);
    fdA.set("holdUntil", "2099-01-01T00:00");
    fdA.set("reservationAmount", "0");
    const fdB = new FormData();
    fdB.set("offerId", offerB.id);
    fdB.set("holdUntil", "2099-01-01T00:00");
    fdB.set("reservationAmount", "0");

    // Created sequentially here so this test isolates the Unit-contention
    // race at submit time (its actual purpose) from the separate Counter-row
    // contention already covered by the previous test.
    const resAId = await createReservation(fdA);
    const resBId = await createReservation(fdB);

    // Now race submit (the actually contested, blocking transition).
    const submitResults = await Promise.allSettled([submitReservation(resAId), submitReservation(resBId)]);
    const submittedOk = submitResults.filter((r) => r.status === "fulfilled");
    expect(submittedOk).toHaveLength(1);

    const winnerId = (await prisma.reservation.findFirstOrThrow({ where: { id: { in: [resAId, resBId] }, status: "PENDING" } })).id;
    const loserId = winnerId === resAId ? resBId : resAId;

    await confirmReservation(winnerId);
    const unit = await prisma.unit.findUniqueOrThrow({ where: { id: org.unit.id } });
    expect(unit.status).toBe("RESERVED");

    // The loser is still DRAFT and can never be confirmed directly (must be submitted first, and submitting it now fails since the Unit is RESERVED).
    await expect(submitReservation(loserId)).rejects.toThrow();
  });
});
