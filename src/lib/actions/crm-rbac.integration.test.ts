import { describe, it, expect, vi, beforeEach } from "vitest";

// Same pattern as rbac.integration.test.ts: mock only the NextAuth
// boundary so requireSession()/requirePermission() see a controlled fake
// session, while everything downstream (permission checks, the action's
// own logic) runs for real - proving the actual CRM permission wiring,
// not a mock of it.
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

describe("CRM RBAC integration: lead server actions reject unauthorized roles", () => {
  beforeEach(() => {
    mockAuth.mockReset();
  });

  it("createLead rejects VIEWER and ACCOUNTANT before touching the database", async () => {
    const { createLead } = await import("@/lib/actions/leads");
    for (const role of ["VIEWER", "ACCOUNTANT"]) {
      mockAuth.mockResolvedValue(sessionFor(role));
      const formData = new FormData();
      formData.set("leadType", "INDIVIDUAL");
      formData.set("mobile", "0501234567");
      formData.set("source", "WEBSITE");
      await expect(createLead(formData), `role ${role} should be rejected`).rejects.toThrow();
    }
  });

  it("createLead's permission check passes for OWNER, ADMIN, and MANAGER (fails later, at the DB, which doesn't exist in this test)", async () => {
    const { createLead } = await import("@/lib/actions/leads");
    for (const role of ["OWNER", "ADMIN", "MANAGER"]) {
      mockAuth.mockResolvedValue(sessionFor(role));
      const formData = new FormData();
      formData.set("leadType", "INDIVIDUAL");
      formData.set("mobile", "0501234567");
      formData.set("source", "WEBSITE");
      const error = await createLead(formData).catch((e) => e);
      expect(error).toBeDefined();
      expect(String(error?.name)).not.toBe("AuthorizationError");
    }
  });

  it("updateLead rejects VIEWER and ACCOUNTANT", async () => {
    const { updateLead } = await import("@/lib/actions/leads");
    for (const role of ["VIEWER", "ACCOUNTANT"]) {
      mockAuth.mockResolvedValue(sessionFor(role));
      const formData = new FormData();
      formData.set("leadId", "lead-1");
      formData.set("leadType", "INDIVIDUAL");
      formData.set("mobile", "0501234567");
      formData.set("source", "WEBSITE");
      await expect(updateLead(formData)).rejects.toThrow();
    }
  });

  it("assignLead rejects everyone except OWNER/ADMIN/MANAGER", async () => {
    const { assignLead } = await import("@/lib/actions/leads");
    for (const role of ["ACCOUNTANT", "VIEWER"]) {
      mockAuth.mockResolvedValue(sessionFor(role));
      await expect(assignLead("lead-1", "user-2"), `role ${role} should be rejected`).rejects.toThrow();
    }
  });

  it("assignLead's permission check passes for MANAGER (fails later, at the DB)", async () => {
    const { assignLead } = await import("@/lib/actions/leads");
    mockAuth.mockResolvedValue(sessionFor("MANAGER"));
    const error = await assignLead("lead-1", "user-2").catch((e) => e);
    expect(error).toBeDefined();
    expect(String(error?.name)).not.toBe("AuthorizationError");
  });

  it("convertLeadToRenter rejects everyone except OWNER/ADMIN/MANAGER", async () => {
    const { convertLeadToRenter } = await import("@/lib/actions/leads");
    for (const role of ["ACCOUNTANT", "VIEWER"]) {
      mockAuth.mockResolvedValue(sessionFor(role));
      const formData = new FormData();
      formData.set("leadId", "lead-1");
      formData.set("mode", "new");
      await expect(convertLeadToRenter(formData), `role ${role} should be rejected`).rejects.toThrow();
    }
  });

  it("archiveLead rejects everyone except OWNER/ADMIN/MANAGER", async () => {
    const { archiveLead } = await import("@/lib/actions/leads");
    for (const role of ["ACCOUNTANT", "VIEWER"]) {
      mockAuth.mockResolvedValue(sessionFor(role));
      await expect(archiveLead("lead-1"), `role ${role} should be rejected`).rejects.toThrow();
    }
  });

  it("markLeadLost rejects everyone except OWNER/ADMIN/MANAGER", async () => {
    const { markLeadLost } = await import("@/lib/actions/leads");
    for (const role of ["ACCOUNTANT", "VIEWER"]) {
      mockAuth.mockResolvedValue(sessionFor(role));
      const formData = new FormData();
      formData.set("leadId", "lead-1");
      formData.set("lostReason", "PRICE");
      await expect(markLeadLost(formData), `role ${role} should be rejected`).rejects.toThrow();
    }
  });

  it("listLeads (lead.view) is rejected only for roles with no CRM access at all", async () => {
    const { listLeads } = await import("@/lib/actions/leads");
    // Every role in this app is granted lead.view (VIEWER included, per the
    // brief's explicit "lead.view only" instruction) - so this call should
    // get past the permission gate for every role and fail only at the DB.
    for (const role of ["OWNER", "ADMIN", "MANAGER", "VIEWER"]) {
      mockAuth.mockResolvedValue(sessionFor(role));
      const error = await listLeads({}).catch((e) => e);
      expect(error).toBeDefined();
      expect(String(error?.name)).not.toBe("AuthorizationError");
    }
  });

  it("listLeads rejects ACCOUNTANT (no CRM access at all, per the brief)", async () => {
    const { listLeads } = await import("@/lib/actions/leads");
    mockAuth.mockResolvedValue(sessionFor("ACCOUNTANT"));
    await expect(listLeads({})).rejects.toThrow();
  });

  it("createLeadActivity rejects VIEWER and ACCOUNTANT", async () => {
    const { createLeadActivity } = await import("@/lib/actions/lead-activities");
    for (const role of ["VIEWER", "ACCOUNTANT"]) {
      mockAuth.mockResolvedValue(sessionFor(role));
      const formData = new FormData();
      formData.set("leadId", "lead-1");
      formData.set("activityType", "CALL");
      formData.set("subject", "Called the prospect");
      await expect(createLeadActivity(formData), `role ${role} should be rejected`).rejects.toThrow();
    }
  });

  it("createLeadActivity's permission check passes for MANAGER (fails later, at the DB)", async () => {
    const { createLeadActivity } = await import("@/lib/actions/lead-activities");
    mockAuth.mockResolvedValue(sessionFor("MANAGER"));
    const formData = new FormData();
    formData.set("leadId", "lead-1");
    formData.set("activityType", "CALL");
    formData.set("subject", "Called the prospect");
    const error = await createLeadActivity(formData).catch((e) => e);
    expect(error).toBeDefined();
    expect(String(error?.name)).not.toBe("AuthorizationError");
  });

  it("listLeadActivities rejects VIEWER (leadActivity.view is not granted to VIEWER, unlike lead.view)", async () => {
    const { listLeadActivities } = await import("@/lib/actions/lead-activities");
    mockAuth.mockResolvedValue(sessionFor("VIEWER"));
    await expect(listLeadActivities("lead-1")).rejects.toThrow();
  });

  it("getCrmDashboardStats rejects ACCOUNTANT", async () => {
    const { getCrmDashboardStats } = await import("@/lib/actions/crm");
    mockAuth.mockResolvedValue(sessionFor("ACCOUNTANT"));
    await expect(getCrmDashboardStats()).rejects.toThrow();
  });
});
