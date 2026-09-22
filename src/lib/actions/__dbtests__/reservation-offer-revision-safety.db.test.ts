/**
 * STEP 41 - real, database-backed test proving the required invariant: an
 * Offer with an active Reservation can never be silently revised into
 * different commercial terms.
 *
 * Investigation before writing this test (see docs/RESERVATION-MANAGEMENT.md,
 * "Offer revision safety") found this is already fully guaranteed by the
 * pre-existing, off-limits offer-versioning logic, with no new code needed:
 * `canReviseOffer()` (src/lib/crm/offer-rules.ts) explicitly excludes
 * ACCEPTED - its own comment says why: "accepted moves on to Reservation".
 * `ACCEPTED` is also terminal in `OFFER_TRANSITIONS` (no outgoing
 * transition), so an offer can never leave ACCEPTED on its own either.
 * Since Step 5 requires an Offer to be ACCEPTED before a Reservation can
 * ever be created against it, and ACCEPTED offers can never be revised or
 * leave ACCEPTED, an Offer can never simultaneously carry an active
 * Reservation and be eligible for revision. This test proves that
 * invariant holds through a real reservation lifecycle, both with and
 * without a reservation present, and confirms it is unaffected by the
 * reservation's own state changes (create/confirm/cancel/release/expire).
 *
 * An earlier attempt added an explicit "reject revision if an active
 * Reservation exists" guard inside reviseOffer() - it was dead code
 * (unreachable, since canReviseOffer already rejects ACCEPTED
 * unconditionally) and was removed in favor of documenting the existing
 * guarantee instead of adding code that could never execute.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { resetDatabase, seedFullOrg, createTestUnit, type SeededOrg } from "./db-test-helpers";

const mockAuth = vi.fn();
vi.mock("@/lib/auth", () => ({ auth: () => mockAuth() }));

let org: SeededOrg;

beforeEach(async () => {
  await resetDatabase();
  org = await seedFullOrg("RV");
  mockAuth.mockResolvedValue(org.session);
});

async function acceptedSentOffer(unitId: string) {
  const { createOffer, submitOfferForApproval, approveOffer, sendOffer, acceptOffer } = await import("@/lib/actions/offers");
  const fd = new FormData();
  fd.set("leadId", org.lead.id);
  fd.set("unitId", unitId);
  fd.set("validFrom", "2027-06-01");
  fd.set("validUntil", "2027-06-30");
  fd.set("annualRent", "100000");
  fd.set("securityDeposit", "25000");
  fd.set("paymentFrequency", "QUARTERLY");
  fd.set("furnishedStatus", "UNFURNISHED");
  const offerId = await createOffer(fd);
  await submitOfferForApproval(offerId);
  await approveOffer(offerId);
  await sendOffer(offerId);
  await acceptOffer(offerId);
  return offerId;
}

describe("Reservation/Offer safety (Step 41): an ACCEPTED Offer can never be revised, with or without a Reservation", () => {
  it("reviseOffer rejects an ACCEPTED offer with no reservation at all", async () => {
    const { reviseOffer } = await import("@/lib/actions/offers");
    const unit = await createTestUnit(org.organization.id, org.floor.id, { unitNumber: "RV-0" });
    const offerId = await acceptedSentOffer(unit.id);
    await expect(reviseOffer(offerId)).rejects.toThrow();
  });

  it("reviseOffer rejects an ACCEPTED offer that has a DRAFT reservation", async () => {
    const { reviseOffer } = await import("@/lib/actions/offers");
    const { createReservation } = await import("@/lib/actions/reservations");
    const unit = await createTestUnit(org.organization.id, org.floor.id, { unitNumber: "RV-1" });
    const offerId = await acceptedSentOffer(unit.id);

    const fd = new FormData();
    fd.set("offerId", offerId);
    fd.set("holdUntil", "2099-01-01T00:00");
    fd.set("reservationAmount", "0");
    await createReservation(fd);

    await expect(reviseOffer(offerId)).rejects.toThrow();
  });

  it("reviseOffer rejects an ACCEPTED offer that has a CONFIRMED reservation", async () => {
    const { reviseOffer } = await import("@/lib/actions/offers");
    const { createReservation, submitReservation, confirmReservation } = await import("@/lib/actions/reservations");
    const unit = await createTestUnit(org.organization.id, org.floor.id, { unitNumber: "RV-2" });
    const offerId = await acceptedSentOffer(unit.id);

    const fd = new FormData();
    fd.set("offerId", offerId);
    fd.set("holdUntil", "2099-01-01T00:00");
    fd.set("reservationAmount", "0");
    const reservationId = await createReservation(fd);
    await submitReservation(reservationId);
    await confirmReservation(reservationId);

    await expect(reviseOffer(offerId)).rejects.toThrow();
  });

  it("reviseOffer still rejects the offer even after its Reservation has been CANCELLED - ACCEPTED itself is terminal for revision, not gated by reservation state", async () => {
    const { reviseOffer } = await import("@/lib/actions/offers");
    const { createReservation, cancelReservation } = await import("@/lib/actions/reservations");
    const unit = await createTestUnit(org.organization.id, org.floor.id, { unitNumber: "RV-3" });
    const offerId = await acceptedSentOffer(unit.id);

    const fd = new FormData();
    fd.set("offerId", offerId);
    fd.set("holdUntil", "2099-01-01T00:00");
    fd.set("reservationAmount", "0");
    const reservationId = await createReservation(fd);

    const cancelFd = new FormData();
    cancelFd.set("reservationId", reservationId);
    cancelFd.set("cancelReason", "CUSTOMER_REQUEST");
    await cancelReservation(cancelFd);

    await expect(reviseOffer(offerId)).rejects.toThrow();
  });

  it("reviseOffer still rejects the offer even after its Reservation has been RELEASED", async () => {
    const { reviseOffer } = await import("@/lib/actions/offers");
    const { createReservation, submitReservation, confirmReservation, releaseReservation } = await import("@/lib/actions/reservations");
    const unit = await createTestUnit(org.organization.id, org.floor.id, { unitNumber: "RV-4" });
    const offerId = await acceptedSentOffer(unit.id);

    const fd = new FormData();
    fd.set("offerId", offerId);
    fd.set("holdUntil", "2099-01-01T00:00");
    fd.set("reservationAmount", "0");
    const reservationId = await createReservation(fd);
    await submitReservation(reservationId);
    await confirmReservation(reservationId);
    await releaseReservation(reservationId);

    await expect(reviseOffer(offerId)).rejects.toThrow();
  });

  it("reviseOffer still rejects the offer even after its Reservation has EXPIRED", async () => {
    const { reviseOffer } = await import("@/lib/actions/offers");
    const { createReservation, syncExpiredReservations } = await import("@/lib/actions/reservations");
    const { prisma } = await import("@/lib/prisma");
    const unit = await createTestUnit(org.organization.id, org.floor.id, { unitNumber: "RV-5" });
    const offerId = await acceptedSentOffer(unit.id);

    const fd = new FormData();
    fd.set("offerId", offerId);
    fd.set("holdUntil", "2099-01-01T00:00");
    fd.set("reservationAmount", "0");
    const reservationId = await createReservation(fd);
    await prisma.reservation.update({ where: { id: reservationId }, data: { status: "PENDING", holdUntil: new Date("2020-01-01T00:00:00Z") } });
    await syncExpiredReservations(org.organization.id);

    await expect(reviseOffer(offerId)).rejects.toThrow();
  });
});
