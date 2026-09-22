import { describe, it, expect, vi, beforeEach } from "vitest";

// Same pattern as offer-rbac.integration.test.ts: mock only the NextAuth
// boundary so requireSession()/requirePermission() see a controlled fake
// session, while everything downstream (permission checks, the action's
// own logic) runs for real.
const mockAuth = vi.fn();
vi.mock("@/lib/auth", () => ({
  auth: () => mockAuth(),
}));

function sessionFor(role: string) {
  return {
    user: {
      id: "user-1",
      name: "Test User",
      email: "test@example.com",
      role,
      organizationId: "org-1",
      organizationName: "Test Org",
    },
  };
}

function newReservationFormData() {
  const fd = new FormData();
  fd.set("offerId", "offer-1");
  fd.set("holdUntil", "2099-01-01T00:00");
  fd.set("reservationAmount", "0");
  return fd;
}

describe("Reservation RBAC integration: reservation server actions reject unauthorized roles", () => {
  beforeEach(() => {
    mockAuth.mockReset();
  });

  it("createReservation rejects VIEWER before touching the database", async () => {
    const { createReservation } = await import("@/lib/actions/reservations");
    mockAuth.mockResolvedValue(sessionFor("VIEWER"));
    await expect(createReservation(newReservationFormData())).rejects.toThrow();
  });

  it("createReservation's permission check passes for OWNER, ADMIN, MANAGER (fails later, at the DB, which doesn't exist in this test)", async () => {
    const { createReservation } = await import("@/lib/actions/reservations");
    for (const role of ["OWNER", "ADMIN", "MANAGER"]) {
      mockAuth.mockResolvedValue(sessionFor(role));
      const error = await createReservation(newReservationFormData()).catch((e) => e);
      expect(error).toBeDefined();
      expect(String(error?.name)).not.toBe("AuthorizationError");
    }
  });

  it("createReservation rejects ACCOUNTANT (no reservation.create per the brief's own Step 29 policy)", async () => {
    const { createReservation } = await import("@/lib/actions/reservations");
    mockAuth.mockResolvedValue(sessionFor("ACCOUNTANT"));
    await expect(createReservation(newReservationFormData())).rejects.toThrow();
  });

  it("submitReservation and confirmReservation reject VIEWER and ACCOUNTANT", async () => {
    const { submitReservation, confirmReservation } = await import("@/lib/actions/reservations");
    for (const role of ["VIEWER", "ACCOUNTANT"]) {
      mockAuth.mockResolvedValue(sessionFor(role));
      await expect(submitReservation("res-1"), `submit: role ${role}`).rejects.toThrow();
      await expect(confirmReservation("res-1"), `confirm: role ${role}`).rejects.toThrow();
    }
  });

  it("cancelReservation and releaseReservation reject VIEWER and ACCOUNTANT", async () => {
    const { cancelReservation, releaseReservation } = await import("@/lib/actions/reservations");
    for (const role of ["VIEWER", "ACCOUNTANT"]) {
      mockAuth.mockResolvedValue(sessionFor(role));
      const fd = new FormData();
      fd.set("reservationId", "res-1");
      fd.set("cancelReason", "CUSTOMER_REQUEST");
      await expect(cancelReservation(fd), `cancel: role ${role}`).rejects.toThrow();
      await expect(releaseReservation("res-1"), `release: role ${role}`).rejects.toThrow();
    }
  });

  it("updateReservationAmountStatus rejects VIEWER but passes the gate for ACCOUNTANT (Step 29's explicit exception)", async () => {
    const { updateReservationAmountStatus } = await import("@/lib/actions/reservations");
    mockAuth.mockResolvedValue(sessionFor("VIEWER"));
    const fd = new FormData();
    fd.set("reservationId", "res-1");
    fd.set("reservationAmountStatus", "RECEIVED");
    await expect(updateReservationAmountStatus(fd)).rejects.toThrow();

    mockAuth.mockResolvedValue(sessionFor("ACCOUNTANT"));
    const error = await updateReservationAmountStatus(fd).catch((e) => e);
    expect(error).toBeDefined();
    expect(String(error?.name)).not.toBe("AuthorizationError");
  });

  it("listReservations (reservation.view) passes the gate for every role", async () => {
    const { listReservations } = await import("@/lib/actions/reservations");
    for (const role of ["OWNER", "ADMIN", "MANAGER", "ACCOUNTANT", "VIEWER"]) {
      mockAuth.mockResolvedValue(sessionFor(role));
      const error = await listReservations({}).catch((e) => e);
      expect(error).toBeDefined();
      expect(String(error?.name)).not.toBe("AuthorizationError");
    }
  });

  it("getReservationDashboardStats passes the gate for ACCOUNTANT (has reservation.view per Step 29)", async () => {
    const { getReservationDashboardStats } = await import("@/lib/actions/reservation-reports");
    mockAuth.mockResolvedValue(sessionFor("ACCOUNTANT"));
    const error = await getReservationDashboardStats().catch((e) => e);
    expect(error).toBeDefined();
    expect(String(error?.name)).not.toBe("AuthorizationError");
  });
});
