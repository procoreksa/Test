/**
 * STEP 37/38 - real, database-backed cross-organization security and IDOR
 * tests for Reservation Management, following the exact pattern established
 * in offer-cross-org-security.db.test.ts: two real organizations, real
 * Admin users, only the NextAuth session boundary mocked. A passing test
 * proves the organizationId filter in the actual Prisma query, not a mock.
 */
import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
import { resetDatabase, seedFullOrg, createTestUser, type SeededOrg } from "./db-test-helpers";

const mockAuth = vi.fn();
vi.mock("@/lib/auth", () => ({ auth: () => mockAuth() }));

let orgA: SeededOrg;
let orgB: SeededOrg;

beforeAll(async () => {
  await resetDatabase();
  orgA = await seedFullOrg("A");
  orgB = await seedFullOrg("B");
});

beforeEach(() => {
  mockAuth.mockReset();
});

describe("Reservation cross-organization isolation: Admin A cannot read/modify Organization B's reservation", () => {
  it("cannot read Reservation B", async () => {
    mockAuth.mockResolvedValue(orgA.session);
    const { getReservationById } = await import("@/lib/actions/reservations");
    await expect(getReservationById(orgB.reservation.id)).rejects.toThrow();
  });

  it("cannot submit/confirm Reservation B", async () => {
    mockAuth.mockResolvedValue(orgA.session);
    const { submitReservation, confirmReservation } = await import("@/lib/actions/reservations");
    await expect(submitReservation(orgB.reservation.id)).rejects.toThrow();
    await expect(confirmReservation(orgB.reservation.id)).rejects.toThrow();
  });

  it("cannot cancel or release Reservation B", async () => {
    mockAuth.mockResolvedValue(orgA.session);
    const { cancelReservation, releaseReservation } = await import("@/lib/actions/reservations");
    const fd = new FormData();
    fd.set("reservationId", orgB.reservation.id);
    fd.set("cancelReason", "CUSTOMER_REQUEST");
    await expect(cancelReservation(fd)).rejects.toThrow();
    await expect(releaseReservation(orgB.reservation.id)).rejects.toThrow();

    const { prisma } = await import("@/lib/prisma");
    const stillDraft = await prisma.reservation.findUniqueOrThrow({ where: { id: orgB.reservation.id } });
    expect(stillDraft.status).toBe("DRAFT");
  });

  it("cannot change Reservation B's amount status", async () => {
    mockAuth.mockResolvedValue(orgA.session);
    const { updateReservationAmountStatus } = await import("@/lib/actions/reservations");
    const fd = new FormData();
    fd.set("reservationId", orgB.reservation.id);
    fd.set("reservationAmountStatus", "RECEIVED");
    await expect(updateReservationAmountStatus(fd)).rejects.toThrow();
  });

  it("cannot reassign Reservation B's agent or hold-until", async () => {
    mockAuth.mockResolvedValue(orgA.session);
    const { reassignReservationAgent, updateReservationHoldUntil } = await import("@/lib/actions/reservations");
    await expect(reassignReservationAgent(orgB.reservation.id, orgA.admin.id)).rejects.toThrow();
    const fd = new FormData();
    fd.set("reservationId", orgB.reservation.id);
    fd.set("holdUntil", "2099-01-01");
    await expect(updateReservationHoldUntil(fd)).rejects.toThrow();
  });

  it("Org A's reservation list never contains Org B's reservation", async () => {
    mockAuth.mockResolvedValue(orgA.session);
    const { listReservations } = await import("@/lib/actions/reservations");
    const { rows } = await listReservations({});
    expect(rows.some((r) => r.id === orgB.reservation.id)).toBe(false);
  });
});

describe("Reservation IDOR: direct cross-org id substitution is rejected on creation", () => {
  function baseFormData(overrides: Partial<{ offerId: string; assignedToUserId: string }> = {}) {
    const fd = new FormData();
    fd.set("offerId", overrides.offerId ?? orgA.acceptedOffer.id);
    if (overrides.assignedToUserId) fd.set("assignedToUserId", overrides.assignedToUserId);
    fd.set("holdUntil", "2099-01-01T00:00");
    fd.set("reservationAmount", "0");
    return fd;
  }

  it("cannot create a reservation from Offer B", async () => {
    mockAuth.mockResolvedValue(orgA.session);
    const { createReservation } = await import("@/lib/actions/reservations");
    await expect(createReservation(baseFormData({ offerId: orgB.acceptedOffer.id }))).rejects.toThrow();
  });

  it("cannot create a reservation assigning User B as the agent", async () => {
    mockAuth.mockResolvedValue(orgA.session);
    const { createReservation } = await import("@/lib/actions/reservations");
    // orgA already has one active reservation on acceptedOffer from
    // seedFullOrg, so this also proves the one-active-per-offer rule fires
    // before the agent IDOR check is even relevant here; use a fresh
    // accepted offer on a fresh unit instead.
    const { prisma } = await import("@/lib/prisma");
    const { createTestUnit, createTestOffer } = await import("./db-test-helpers");
    const freshUnit = await createTestUnit(orgA.organization.id, orgA.floor.id, { unitNumber: "IDOR-AGENT" });
    const freshOffer = await createTestOffer(orgA.organization.id, orgA.lead.id, freshUnit.id, orgA.admin.id, { status: "ACCEPTED" });
    await expect(createReservation(baseFormData({ offerId: freshOffer.id, assignedToUserId: orgB.admin.id }))).rejects.toThrow();
    void prisma;
  });
});

describe("Reservation cross-organization isolation: reverse direction (Admin B against Organization A)", () => {
  it("cannot read or confirm Reservation A", async () => {
    mockAuth.mockResolvedValue(orgB.session);
    const { getReservationById, confirmReservation } = await import("@/lib/actions/reservations");
    await expect(getReservationById(orgA.reservation.id)).rejects.toThrow();
    await expect(confirmReservation(orgA.reservation.id)).rejects.toThrow();
  });
});

describe("Reservation IDOR: positive control", () => {
  it("Admin A can create a reservation assigning another Org A user as agent, from a fresh accepted offer", async () => {
    mockAuth.mockResolvedValue(orgA.session);
    const { createReservation } = await import("@/lib/actions/reservations");
    const { createTestUnit, createTestOffer } = await import("./db-test-helpers");
    const secondUser = await createTestUser(orgA.organization.id, "MANAGER");
    const freshUnit = await createTestUnit(orgA.organization.id, orgA.floor.id, { unitNumber: "POSCTRL-1" });
    const freshOffer = await createTestOffer(orgA.organization.id, orgA.lead.id, freshUnit.id, orgA.admin.id, { status: "ACCEPTED" });

    const fd = new FormData();
    fd.set("offerId", freshOffer.id);
    fd.set("assignedToUserId", secondUser.id);
    fd.set("holdUntil", "2099-01-01T00:00");
    fd.set("reservationAmount", "0");

    const reservationId = await createReservation(fd);
    expect(reservationId).toBeTruthy();
  });
});
