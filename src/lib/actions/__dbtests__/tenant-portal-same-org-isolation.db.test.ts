/**
 * Real, database-backed SAME-ORGANIZATION tenant isolation tests
 * (docs/TENANT-PORTAL.md's explicit, non-negotiable requirement: "The
 * portal must NEVER expose internal organization data merely because a
 * tenant knows or guesses an ID... Organization scoping alone is NOT
 * sufficient for Tenant Portal. Tenant-resource ownership/entitlement must
 * be checked explicitly."). Two renters/contracts/tenant accounts inside
 * the SAME Organization - Tenant B must not reach any of Tenant A's
 * Contract/Invoice/Payment/MaintenanceRequest/MoveIn/MoveOut/Settlement,
 * even though both belong to the same organizationId.
 */
import { describe, it, expect, vi, beforeAll } from "vitest";
import { resetDatabase, seedFullOrg, driveMoveInToCompletion, driveMoveOutToCompletion, payDepositInvoice, type SeededOrg } from "./db-test-helpers";
import { seedTenancy, type SeededTenancy } from "./tenant-portal-test-helpers";
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
let tenancyA: SeededTenancy;
let tenancyB: SeededTenancy;
let invoiceA: { id: string };
let requestA: { id: string };
let moveInIdA: string;
let moveOutIdA: string;
let settlementIdA: string;

beforeAll(async () => {
  await resetDatabase();
  org = await seedFullOrg("SAMEORG");

  mockAuth.mockResolvedValue(org.session);
  tenancyA = await seedTenancy(org, "TenantA");
  tenancyB = await seedTenancy(org, "TenantB");

  await prisma.contract.update({ where: { id: tenancyA.contract.id }, data: { securityDeposit: 5000 } });
  await payDepositInvoice(org.organization.id, tenancyA.renter.id, tenancyA.contract.id, 5000);
  const invoice = await prisma.invoice.findFirstOrThrow({ where: { organizationId: org.organization.id, contractId: tenancyA.contract.id } });
  invoiceA = invoice;

  moveInIdA = await driveMoveInToCompletion(tenancyA.contract.id);
  moveOutIdA = await driveMoveOutToCompletion(tenancyA.contract.id);

  const { createSecurityDepositSettlement } = await import("@/lib/actions/security-deposits");
  settlementIdA = await createSecurityDepositSettlement(moveOutIdA);

  mockTenantAuth.mockResolvedValue(tenancyA.session);
  const { createTenantMaintenanceRequest } = await import("@/lib/actions/portal/maintenance");
  const requestId = await createTenantMaintenanceRequest(fd({ category: "PLUMBING", title: "Tenant A's leak" }));
  requestA = { id: requestId };

  // Every test below authenticates as Tenant B.
  mockTenantAuth.mockResolvedValue(tenancyB.session);
});

describe("Same-organization tenant isolation: Tenant B cannot reach Tenant A's resources", () => {
  it("getTenantContractDetail rejects Tenant A's contractId", async () => {
    const { getTenantContractDetail } = await import("@/lib/actions/portal/tenancy");
    await expect(getTenantContractDetail(tenancyA.contract.id)).rejects.toThrow();
  });

  it("getTenantContracts never includes Tenant A's contract as Tenant B's own", async () => {
    const { getTenantContracts } = await import("@/lib/actions/portal/tenancy");
    const { current, historical } = await getTenantContracts();
    expect(current?.id).not.toBe(tenancyA.contract.id);
    expect(historical.some((c) => c.id === tenancyA.contract.id)).toBe(false);
  });

  it("getTenantPaymentSchedule rejects Tenant A's contractId", async () => {
    const { getTenantPaymentSchedule } = await import("@/lib/actions/portal/finance");
    await expect(getTenantPaymentSchedule(tenancyA.contract.id)).rejects.toThrow();
  });

  it("getTenantInvoiceDetail rejects Tenant A's invoiceId, and getTenantInvoices/getTenantPayments never list it", async () => {
    const { getTenantInvoiceDetail, getTenantInvoices, getTenantPayments } = await import("@/lib/actions/portal/finance");
    await expect(getTenantInvoiceDetail(invoiceA.id)).rejects.toThrow();
    expect((await getTenantInvoices()).some((i) => i.id === invoiceA.id)).toBe(false);
    expect((await getTenantPayments()).some((p) => p.invoice.id === invoiceA.id)).toBe(false);
  });

  it("getTenantOutstandingBalance for Tenant B never includes Tenant A's invoice amounts", async () => {
    const { getTenantOutstandingBalance } = await import("@/lib/actions/portal/finance");
    // Tenant B has no invoices at all yet - the balance must be zero, not
    // inflated by Tenant A's PAID (or any other) invoice in the same org.
    const balance = await getTenantOutstandingBalance();
    expect(Number(balance)).toBe(0);
  });

  it("getTenantMaintenanceRequestDetail rejects Tenant A's requestId, and cancel does not touch it", async () => {
    const { getTenantMaintenanceRequestDetail, cancelTenantMaintenanceRequest } = await import("@/lib/actions/portal/maintenance");
    await expect(getTenantMaintenanceRequestDetail(requestA.id)).rejects.toThrow();
    await expect(cancelTenantMaintenanceRequest(fd({ requestId: requestA.id }))).rejects.toThrow();
    const unchanged = await prisma.maintenanceRequest.findUniqueOrThrow({ where: { id: requestA.id } });
    expect(unchanged.status).toBe("OPEN");
  });

  it("getTenantMaintenanceRequests never includes Tenant A's request", async () => {
    const { getTenantMaintenanceRequests } = await import("@/lib/actions/portal/maintenance");
    expect((await getTenantMaintenanceRequests()).some((r) => r.id === requestA.id)).toBe(false);
  });

  it("getTenantMoveIn/getTenantMoveOut reject Tenant A's contractId", async () => {
    const { getTenantMoveIn } = await import("@/lib/actions/portal/move-in");
    const { getTenantMoveOut } = await import("@/lib/actions/portal/move-out");
    await expect(getTenantMoveIn(tenancyA.contract.id)).rejects.toThrow();
    await expect(getTenantMoveOut(tenancyA.contract.id)).rejects.toThrow();
  });

  it("getTenantDepositPosition/getTenantSettlement reject Tenant A's contractId", async () => {
    const { getTenantDepositPosition, getTenantSettlement } = await import("@/lib/actions/portal/security-deposit");
    await expect(getTenantDepositPosition(tenancyA.contract.id)).rejects.toThrow();
    await expect(getTenantSettlement(tenancyA.contract.id)).rejects.toThrow();
  });

  it("getTenantDashboard for Tenant B reflects Tenant B's own tenancy only", async () => {
    const { getTenantDashboard } = await import("@/lib/actions/portal/dashboard");
    const dashboard = await getTenantDashboard();
    expect(dashboard.currentContract?.id).toBe(tenancyB.contract.id);
    expect(dashboard.currentContract?.id).not.toBe(tenancyA.contract.id);
    expect(dashboard.openMaintenanceCount).toBe(0);
  });

  it("moveInIdA/moveOutIdA/settlementIdA exist under Tenant A's renterId only (sanity check on the fixture)", async () => {
    expect(await prisma.moveIn.findUniqueOrThrow({ where: { id: moveInIdA } })).toMatchObject({ contractId: tenancyA.contract.id });
    expect(await prisma.moveOut.findUniqueOrThrow({ where: { id: moveOutIdA } })).toMatchObject({ contractId: tenancyA.contract.id });
    expect(await prisma.securityDepositSettlement.findUniqueOrThrow({ where: { id: settlementIdA } })).toMatchObject({ contractId: tenancyA.contract.id });
  });
});
