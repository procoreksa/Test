/**
 * Real, database-backed cross-organization isolation tests for the Tenant
 * Portal (docs/TENANT-PORTAL.md). A tenant in Org B must never reach Org
 * A's Contract/Invoice/Payment/MaintenanceRequest/MoveIn/MoveOut/Settlement
 * data by guessing or reusing an id, even though every entitlement helper
 * (src/lib/tenant-session.ts) already scopes by organizationId - this
 * proves that scoping actually holds end-to-end through the real actions.
 */
import { describe, it, expect, vi, beforeAll } from "vitest";
import { resetDatabase, seedFullOrg, createTestContract, driveMoveInToCompletion, driveMoveOutToCompletion, payDepositInvoice, type SeededOrg } from "./db-test-helpers";
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

let orgA: SeededOrg;
let orgB: SeededOrg;
let tenantA: { id: string; organizationId: string; renterId: string; email: string };
let contractA: { id: string };
let invoiceA: { id: string };
let requestA: { id: string };
let moveInIdA: string;
let moveOutIdA: string;
let settlementIdA: string;
let contractB: { id: string; organizationId: string };

beforeAll(async () => {
  await resetDatabase();
  orgA = await seedFullOrg("TPX-A");
  orgB = await seedFullOrg("TPX-B");

  mockAuth.mockResolvedValue(orgA.session);

  const { contract } = await createTestContract(orgA, { unitNumber: `TPX-A-1-${Date.now()}` });
  await prisma.contract.update({ where: { id: contract.id }, data: { securityDeposit: 6000 } });
  contractA = contract;

  const account = await createTestTenantAccount(orgA.organization.id, orgA.renter.id, orgA.admin.id);
  tenantA = account;

  await payDepositInvoice(orgA.organization.id, orgA.renter.id, contract.id, 6000);
  const invoice = await prisma.invoice.findFirstOrThrow({ where: { organizationId: orgA.organization.id, contractId: contract.id } });
  invoiceA = invoice;

  moveInIdA = await driveMoveInToCompletion(contract.id);
  moveOutIdA = await driveMoveOutToCompletion(contract.id);

  const { createSecurityDepositSettlement } = await import("@/lib/actions/security-deposits");
  settlementIdA = await createSecurityDepositSettlement(moveOutIdA);

  mockTenantAuth.mockResolvedValue(tenantSessionFor(tenantA));
  const { createTenantMaintenanceRequest } = await import("@/lib/actions/portal/maintenance");
  const requestId = await createTenantMaintenanceRequest(fd({ category: "PLUMBING", title: "Leak" }));
  requestA = { id: requestId };

  // Now switch the mocked session to a brand-new Org B tenant for every test
  // in this file below - the attacker's own identity for the rest of the suite.
  mockAuth.mockResolvedValue(orgB.session);
  const { contract: builtContractB } = await createTestContract(orgB, { unitNumber: `TPX-B-1-${Date.now()}` });
  contractB = builtContractB;
  const tenantB = await createTestTenantAccount(orgB.organization.id, orgB.renter.id, orgB.admin.id);
  mockTenantAuth.mockResolvedValue(tenantSessionFor(tenantB));
});

describe("Tenant Portal cross-organization isolation: Org B's tenant cannot reach Org A's data", () => {
  it("Org B's own contract fixture was built under Org B (sanity check)", async () => {
    expect(contractB.organizationId).toBe(orgB.organization.id);
  });

  it("getTenantContractDetail rejects Org A's contractId", async () => {
    const { getTenantContractDetail } = await import("@/lib/actions/portal/tenancy");
    await expect(getTenantContractDetail(contractA.id)).rejects.toThrow();
  });

  it("getTenantPaymentSchedule rejects Org A's contractId", async () => {
    const { getTenantPaymentSchedule } = await import("@/lib/actions/portal/finance");
    await expect(getTenantPaymentSchedule(contractA.id)).rejects.toThrow();
  });

  it("getTenantInvoiceDetail rejects Org A's invoiceId", async () => {
    const { getTenantInvoiceDetail } = await import("@/lib/actions/portal/finance");
    await expect(getTenantInvoiceDetail(invoiceA.id)).rejects.toThrow();
  });

  it("getTenantInvoices/getTenantPayments never include Org A's rows", async () => {
    const { getTenantInvoices, getTenantPayments } = await import("@/lib/actions/portal/finance");
    const invoices = await getTenantInvoices();
    expect(invoices.some((i) => i.id === invoiceA.id)).toBe(false);
    const payments = await getTenantPayments();
    expect(payments.some((p) => p.invoice.id === invoiceA.id)).toBe(false);
  });

  it("getTenantMaintenanceRequestDetail rejects Org A's requestId, and cancel does not touch it", async () => {
    const { getTenantMaintenanceRequestDetail, cancelTenantMaintenanceRequest } = await import("@/lib/actions/portal/maintenance");
    await expect(getTenantMaintenanceRequestDetail(requestA.id)).rejects.toThrow();
    await expect(cancelTenantMaintenanceRequest(fd({ requestId: requestA.id }))).rejects.toThrow();
    const unchanged = await prisma.maintenanceRequest.findUniqueOrThrow({ where: { id: requestA.id } });
    expect(unchanged.status).toBe("OPEN");
  });

  it("getTenantMaintenanceRequests never includes Org A's rows", async () => {
    const { getTenantMaintenanceRequests } = await import("@/lib/actions/portal/maintenance");
    const requests = await getTenantMaintenanceRequests();
    expect(requests.some((r) => r.id === requestA.id)).toBe(false);
  });

  it("getTenantMoveIn/getTenantMoveOut/getTenantDepositPosition/getTenantSettlement reject Org A's contractId", async () => {
    const { getTenantMoveIn } = await import("@/lib/actions/portal/move-in");
    const { getTenantMoveOut } = await import("@/lib/actions/portal/move-out");
    const { getTenantDepositPosition, getTenantSettlement } = await import("@/lib/actions/portal/security-deposit");
    await expect(getTenantMoveIn(contractA.id)).rejects.toThrow();
    await expect(getTenantMoveOut(contractA.id)).rejects.toThrow();
    await expect(getTenantDepositPosition(contractA.id)).rejects.toThrow();
    await expect(getTenantSettlement(contractA.id)).rejects.toThrow();
  });

  it("getTenantContracts/getTenantDashboard never surface Org A's contract as Org B's own", async () => {
    const { getTenantContracts } = await import("@/lib/actions/portal/tenancy");
    const { getTenantDashboard } = await import("@/lib/actions/portal/dashboard");
    const { current, historical } = await getTenantContracts();
    expect(current?.id).not.toBe(contractA.id);
    expect(historical.some((c) => c.id === contractA.id)).toBe(false);
    const dashboard = await getTenantDashboard();
    expect(dashboard.currentContract?.id).not.toBe(contractA.id);
  });

  it("createTenantMaintenanceRequest for Org B's tenant never derives Org A's unit/contract", async () => {
    const { createTenantMaintenanceRequest } = await import("@/lib/actions/portal/maintenance");
    const id = await createTenantMaintenanceRequest(fd({ category: "ELECTRICAL", title: "Org B request" }));
    const created = await prisma.maintenanceRequest.findUniqueOrThrow({ where: { id } });
    expect(created.organizationId).toBe(orgB.organization.id);
    expect(created.contractId).not.toBe(contractA.id);
  });

  it("moveInIdA/moveOutIdA/settlementIdA exist under Org A only (sanity check on the fixture)", async () => {
    expect(await prisma.moveIn.findUniqueOrThrow({ where: { id: moveInIdA } })).toMatchObject({ organizationId: orgA.organization.id });
    expect(await prisma.moveOut.findUniqueOrThrow({ where: { id: moveOutIdA } })).toMatchObject({ organizationId: orgA.organization.id });
    expect(await prisma.securityDepositSettlement.findUniqueOrThrow({ where: { id: settlementIdA } })).toMatchObject({ organizationId: orgA.organization.id });
  });
});
