import { describe, it, expect, vi, beforeEach } from "vitest";

// Same pattern as rbac.integration.test.ts / crm-rbac.integration.test.ts:
// mock only the NextAuth boundary so requireSession()/requirePermission()
// see a controlled fake session, while everything downstream (permission
// checks, the action's own logic) runs for real.
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

describe("Viewing RBAC integration: viewing server actions reject unauthorized roles", () => {
  beforeEach(() => {
    mockAuth.mockReset();
  });

  function newViewingFormData() {
    const fd = new FormData();
    fd.set("leadId", "lead-1");
    fd.set("assignedToUserId", "user-2");
    fd.set("scheduledStart", "2026-06-15T10:00");
    fd.set("scheduledEnd", "2026-06-15T11:00");
    fd.append("unitIds", "unit-1");
    return fd;
  }

  it("createViewing rejects ACCOUNTANT and VIEWER before touching the database", async () => {
    const { createViewing } = await import("@/lib/actions/viewings");
    for (const role of ["ACCOUNTANT", "VIEWER"]) {
      mockAuth.mockResolvedValue(sessionFor(role));
      await expect(createViewing(newViewingFormData()), `role ${role} should be rejected`).rejects.toThrow();
    }
  });

  it("createViewing's permission check passes for OWNER, ADMIN, MANAGER (fails later, at the DB, which doesn't exist in this test)", async () => {
    const { createViewing } = await import("@/lib/actions/viewings");
    for (const role of ["OWNER", "ADMIN", "MANAGER"]) {
      mockAuth.mockResolvedValue(sessionFor(role));
      const error = await createViewing(newViewingFormData()).catch((e) => e);
      expect(error).toBeDefined();
      expect(String(error?.name)).not.toBe("AuthorizationError");
    }
  });

  it("confirmViewing/startViewing reject ACCOUNTANT and VIEWER", async () => {
    const { confirmViewing, startViewing } = await import("@/lib/actions/viewings");
    for (const role of ["ACCOUNTANT", "VIEWER"]) {
      mockAuth.mockResolvedValue(sessionFor(role));
      await expect(confirmViewing("viewing-1"), `confirm: role ${role}`).rejects.toThrow();
      await expect(startViewing("viewing-1"), `start: role ${role}`).rejects.toThrow();
    }
  });

  it("completeViewing rejects ACCOUNTANT and VIEWER", async () => {
    const { completeViewing } = await import("@/lib/actions/viewings");
    for (const role of ["ACCOUNTANT", "VIEWER"]) {
      mockAuth.mockResolvedValue(sessionFor(role));
      const fd = new FormData();
      fd.set("viewingId", "viewing-1");
      fd.set("outcome", "INTERESTED");
      await expect(completeViewing(fd), `role ${role} should be rejected`).rejects.toThrow();
    }
  });

  it("completeViewing's permission check passes for MANAGER (fails later, at the DB)", async () => {
    const { completeViewing } = await import("@/lib/actions/viewings");
    mockAuth.mockResolvedValue(sessionFor("MANAGER"));
    const fd = new FormData();
    fd.set("viewingId", "viewing-1");
    fd.set("outcome", "INTERESTED");
    const error = await completeViewing(fd).catch((e) => e);
    expect(error).toBeDefined();
    expect(String(error?.name)).not.toBe("AuthorizationError");
  });

  it("cancelViewing and markViewingNoShow reject ACCOUNTANT and VIEWER", async () => {
    const { cancelViewing, markViewingNoShow } = await import("@/lib/actions/viewings");
    for (const role of ["ACCOUNTANT", "VIEWER"]) {
      mockAuth.mockResolvedValue(sessionFor(role));
      const fd = new FormData();
      fd.set("viewingId", "viewing-1");
      fd.set("cancelReason", "CUSTOMER_REQUEST");
      await expect(cancelViewing(fd), `cancel: role ${role}`).rejects.toThrow();
      await expect(markViewingNoShow("viewing-1"), `no-show: role ${role}`).rejects.toThrow();
    }
  });

  it("rescheduleViewing rejects ACCOUNTANT and VIEWER", async () => {
    const { rescheduleViewing } = await import("@/lib/actions/viewings");
    for (const role of ["ACCOUNTANT", "VIEWER"]) {
      mockAuth.mockResolvedValue(sessionFor(role));
      const fd = new FormData();
      fd.set("viewingId", "viewing-1");
      fd.set("scheduledStart", "2026-06-16T10:00");
      fd.set("scheduledEnd", "2026-06-16T11:00");
      await expect(rescheduleViewing(fd), `role ${role} should be rejected`).rejects.toThrow();
    }
  });

  it("reassignViewingAgent rejects everyone except OWNER/ADMIN/MANAGER", async () => {
    const { reassignViewingAgent } = await import("@/lib/actions/viewings");
    for (const role of ["ACCOUNTANT", "VIEWER"]) {
      mockAuth.mockResolvedValue(sessionFor(role));
      await expect(reassignViewingAgent("viewing-1", "user-2"), `role ${role} should be rejected`).rejects.toThrow();
    }
  });

  it("listViewings (viewing.view) passes the gate for every role except ACCOUNTANT", async () => {
    const { listViewings } = await import("@/lib/actions/viewings");
    for (const role of ["OWNER", "ADMIN", "MANAGER", "VIEWER"]) {
      mockAuth.mockResolvedValue(sessionFor(role));
      const error = await listViewings({}).catch((e) => e);
      expect(error).toBeDefined();
      expect(String(error?.name)).not.toBe("AuthorizationError");
    }
  });

  it("listViewings rejects ACCOUNTANT (no viewing access at all, per the brief)", async () => {
    const { listViewings } = await import("@/lib/actions/viewings");
    mockAuth.mockResolvedValue(sessionFor("ACCOUNTANT"));
    await expect(listViewings({})).rejects.toThrow();
  });

  it("getViewingDashboardStats rejects ACCOUNTANT", async () => {
    const { getViewingDashboardStats } = await import("@/lib/actions/viewing-reports");
    mockAuth.mockResolvedValue(sessionFor("ACCOUNTANT"));
    await expect(getViewingDashboardStats()).rejects.toThrow();
  });
});
