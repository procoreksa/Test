/**
 * Real, database-backed tests for the tenant's one self-service mutation,
 * createTenantMaintenanceRequest() (docs/TENANT-PORTAL.md, "Primary self-
 * service mutation"). Proves: every location/ownership field is derived
 * from the session (never trusted from the form - there is nothing to
 * inject, since the form has no unitId/contractId/renterId/organizationId
 * field at all), no assignee/vendor/cost/triage field is ever settable,
 * the request is blocked without an ACTIVE tenancy, cancellation only
 * works from a cancellable status, and none of this ever creates or
 * touches a Payment/Invoice/Settlement/refund row (financial read-only
 * regression).
 */
import { describe, it, expect, vi, beforeAll } from "vitest";
import { resetDatabase, seedFullOrg, createTestContract, type SeededOrg } from "./db-test-helpers";
import { createTestTenantAccount, tenantSessionFor } from "./tenant-portal-test-helpers";
import { prisma } from "@/lib/prisma";

const mockAuth = vi.fn();
vi.mock("@/lib/auth", () => ({ auth: () => mockAuth() }));
const mockTenantAuth = vi.fn();
vi.mock("@/lib/tenant-auth", () => ({ auth: () => mockTenantAuth() }));

function fd(fields: Record<string, string>): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) f.set(k, v);
  return f;
}

let org: SeededOrg;
let tenantAccount: Awaited<ReturnType<typeof createTestTenantAccount>>;
let activeContract: { id: string; unitId: string; renterId: string };

beforeAll(async () => {
  await resetDatabase();
  org = await seedFullOrg("MNTX");
  mockAuth.mockResolvedValue(org.session);

  const { contract } = await createTestContract(org, { unitNumber: `MNTX-1-${Date.now()}` });
  activeContract = contract;
  tenantAccount = await createTestTenantAccount(org.organization.id, org.renter.id, org.admin.id);
  mockTenantAuth.mockResolvedValue(tenantSessionFor(tenantAccount));
});

describe("createTenantMaintenanceRequest: derivation, injection resistance, and scope", () => {
  it("derives organizationId/renterId/unitId/contractId entirely from the session, ignoring anything the client sends under those names", async () => {
    const { createTenantMaintenanceRequest } = await import("@/lib/actions/portal/maintenance");

    // A hostile client stuffing unrelated ids into the FormData under
    // plausible-looking names - the create schema doesn't even declare
    // these fields, so they're silently dropped by z.object().parse(),
    // never reaching the create() call.
    const requestId = await createTenantMaintenanceRequest(
      fd({
        category: "ELECTRICAL",
        title: "Broken outlet",
        unitId: "hostile-unit-id",
        contractId: "hostile-contract-id",
        renterId: "hostile-renter-id",
        organizationId: "hostile-org-id",
        assignedToUserId: "hostile-user-id",
        estimatedCost: "999999",
      })
    );

    const created = await prisma.maintenanceRequest.findUniqueOrThrow({ where: { id: requestId } });
    expect(created.organizationId).toBe(org.organization.id);
    expect(created.renterId).toBe(org.renter.id);
    expect(created.unitId).toBe(activeContract.unitId);
    expect(created.contractId).toBe(activeContract.id);
    expect(created.source).toBe("TENANT");
    expect(created.reportedByType).toBe("TENANT");
    expect(created.status).toBe("OPEN");
    expect(created.createdByUserId).toBe(`tenant:${tenantAccount.id}`);
  });

  it("never sets an assignee, and creates no WorkOrder (cost/vendor fields live only on a WorkOrder, which only internal triage ever creates)", async () => {
    const created = await prisma.maintenanceRequest.findFirstOrThrow({ where: { organizationId: org.organization.id, source: "TENANT" } });
    expect(created.assignedToUserId).toBeNull();
    const workOrderCount = await prisma.maintenanceWorkOrder.count({ where: { requestId: created.id } });
    expect(workOrderCount).toBe(0);
  });

  it("writes an AuditLog row attributed to the tenant (userRole TENANT, no fabricated internal User)", async () => {
    const created = await prisma.maintenanceRequest.findFirstOrThrow({ where: { organizationId: org.organization.id, source: "TENANT" } });
    const log = await prisma.auditLog.findFirstOrThrow({ where: { entityType: "MaintenanceRequest", entityId: created.id, action: "CREATE" } });
    expect(log.userRole).toBe("TENANT");
    expect(log.userId).toBeNull();
  });

  it("rejects creation entirely when the tenant has no ACTIVE tenancy, and creates no row", async () => {
    // A renter with a TERMINATED contract (not ACTIVE) - selectCurrentTenancy()
    // still picks it as "historical" but createTenantMaintenanceRequest()
    // explicitly requires an ACTIVE current contract, not just any contract.
    const renterNoActive = await prisma.renter.create({ data: { organizationId: org.organization.id, fullName: "No Active Tenancy Renter" } });
    const { contract: endedContract } = await createTestContract(org, {
      unitNumber: `MNTX-2-${Date.now()}`,
      renterId: renterNoActive.id,
      startDate: new Date("2020-01-01"),
      endDate: new Date("2020-12-31"),
    });
    await prisma.contract.update({ where: { id: endedContract.id }, data: { status: "TERMINATED" } });
    const accountNoActive = await createTestTenantAccount(org.organization.id, renterNoActive.id, org.admin.id);
    mockTenantAuth.mockResolvedValue(tenantSessionFor(accountNoActive));

    const { createTenantMaintenanceRequest } = await import("@/lib/actions/portal/maintenance");
    const before = await prisma.maintenanceRequest.count({ where: { organizationId: org.organization.id, renterId: renterNoActive.id } });
    await expect(createTenantMaintenanceRequest(fd({ category: "GENERAL", title: "Should never be created" }))).rejects.toThrow();
    const after = await prisma.maintenanceRequest.count({ where: { organizationId: org.organization.id, renterId: renterNoActive.id } });
    expect(after).toBe(before);

    mockTenantAuth.mockResolvedValue(tenantSessionFor(tenantAccount));
  });
});

describe("cancelTenantMaintenanceRequest: only from a cancellable status", () => {
  it("cancels a freshly-created OPEN request", async () => {
    const { createTenantMaintenanceRequest, cancelTenantMaintenanceRequest, getTenantMaintenanceRequestDetail } = await import("@/lib/actions/portal/maintenance");
    const requestId = await createTenantMaintenanceRequest(fd({ category: "PLUMBING", title: "Cancel me" }));
    const before = await getTenantMaintenanceRequestDetail(requestId);
    expect(before.cancellable).toBe(true);

    await cancelTenantMaintenanceRequest(fd({ requestId }));
    const cancelled = await prisma.maintenanceRequest.findUniqueOrThrow({ where: { id: requestId } });
    expect(cancelled.status).toBe("CANCELLED");
    expect(cancelled.cancelReason).toBe("TENANT_WITHDREW");
  });

  it("rejects a second cancel attempt on an already-cancelled request", async () => {
    const { createTenantMaintenanceRequest, cancelTenantMaintenanceRequest } = await import("@/lib/actions/portal/maintenance");
    const requestId = await createTenantMaintenanceRequest(fd({ category: "PLUMBING", title: "Cancel twice" }));
    await cancelTenantMaintenanceRequest(fd({ requestId }));
    await expect(cancelTenantMaintenanceRequest(fd({ requestId }))).rejects.toThrow();
    const still = await prisma.maintenanceRequest.findUniqueOrThrow({ where: { id: requestId } });
    expect(still.status).toBe("CANCELLED");
  });

  it("rejects cancelling a request that has already progressed past OPEN/TRIAGED (internal triage took over)", async () => {
    const { createTenantMaintenanceRequest, cancelTenantMaintenanceRequest } = await import("@/lib/actions/portal/maintenance");
    const requestId = await createTenantMaintenanceRequest(fd({ category: "PLUMBING", title: "Already resolved" }));
    await prisma.maintenanceRequest.update({ where: { id: requestId }, data: { status: "RESOLVED", resolvedAt: new Date() } });
    await expect(cancelTenantMaintenanceRequest(fd({ requestId }))).rejects.toThrow();
    const still = await prisma.maintenanceRequest.findUniqueOrThrow({ where: { id: requestId } });
    expect(still.status).toBe("RESOLVED");
  });
});

describe("Financial read-only regression: nothing in this file ever creates or modifies a financial record", () => {
  it("no Payment/Invoice/SecurityDepositSettlement/Refund row exists anywhere under this organization", async () => {
    expect(await prisma.payment.count({ where: { organizationId: org.organization.id } })).toBe(0);
    expect(await prisma.invoice.count({ where: { organizationId: org.organization.id } })).toBe(0);
    expect(await prisma.securityDepositSettlement.count({ where: { organizationId: org.organization.id } })).toBe(0);
    expect(await prisma.securityDepositRefund.count({ where: { organizationId: org.organization.id } })).toBe(0);
  });
});

describe("Corporate Housing privacy regression: the Tenant Portal never gains access to CorporateOccupant data through Maintenance", () => {
  it("an injected corporateOccupantId is silently dropped (the create schema has no such field) and the tenant-facing DTO never exposes any corporate field", async () => {
    const { seedCorporateAccount, createTestCorporateOccupant } = await import("./db-test-helpers");
    const { account: corpAccount } = await seedCorporateAccount(org, { displayName: "Tenant-Portal-Invisible Corp" });
    const occupant = await createTestCorporateOccupant(org.organization.id, corpAccount.id, { fullName: "Confidential Corporate Occupant" });

    const { createTenantMaintenanceRequest, getTenantMaintenanceRequestDetail } = await import("@/lib/actions/portal/maintenance");
    const requestId = await createTenantMaintenanceRequest(fd({ category: "GENERAL", title: "Injection attempt", corporateOccupantId: occupant.id }));

    const created = await prisma.maintenanceRequest.findUniqueOrThrow({ where: { id: requestId } });
    expect(created.corporateOccupantId).toBeNull();

    const detail = await getTenantMaintenanceRequestDetail(requestId);
    expect("corporateOccupantId" in detail).toBe(false);
    expect("corporateOccupant" in detail).toBe(false);
    expect(JSON.stringify(detail)).not.toContain("Confidential Corporate Occupant");
  });
});
