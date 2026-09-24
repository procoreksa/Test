/**
 * Real, database-backed reconciliation tests for Executive Dashboards
 * (docs/EXECUTIVE-DASHBOARDS.md) - Steps 79/80/93's mandatory checklist:
 * anti-double-counting, owner-ledger authority, payment reversal, cancelled
 * invoice exclusion, corporate-occupancy distinction, maintenance-cost
 * boundary, communications status distinction, cross-org aggregate
 * isolation, server-side financial RBAC, aging reconciliation, and the
 * read-only/no-domain-mutation guarantee. Only the internal NextAuth
 * session boundary is mocked, matching every other db-test file in this
 * suite.
 */
import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
import { Prisma } from "@prisma/client";
import {
  resetDatabase,
  seedFullOrg,
  createTestContract,
  createTestUser,
  sessionFor,
  seedCorporateAccount,
  uniqueSuffix,
  type SeededOrg,
} from "./db-test-helpers";
import { issueInvoice } from "@/lib/invoicing";
import { prisma } from "@/lib/prisma";

const mockAuth = vi.fn();
vi.mock("@/lib/auth", () => ({ auth: () => mockAuth() }));

let orgA: SeededOrg;
let orgB: SeededOrg;

beforeAll(async () => {
  await resetDatabase();
  orgA = await seedFullOrg("EXECA");
  orgB = await seedFullOrg("EXECB");
});

beforeEach(() => {
  mockAuth.mockReset();
  mockAuth.mockResolvedValue(orgA.session);
});

describe("Collections: cancelled invoices, payment reversal, aging reconciliation", () => {
  it("a CANCELLED invoice is excluded from Invoiced This Period (deliberate deviation from the legacy /dashboard gap)", async () => {
    const { unit, contract } = await createTestContract(orgA, { unitNumber: `EXCL-${uniqueSuffix()}` });
    const schedule = await prisma.paymentSchedule.findFirstOrThrow({ where: { contractId: contract.id } });
    const invoice = await issueInvoice({
      organizationId: orgA.organization.id,
      renterId: orgA.renter.id,
      contractId: contract.id,
      paymentScheduleId: schedule.id,
      lines: [{ description: "Rent", kind: "RENT", quantity: 1, unitPrice: 12000, vatRate: 0 }],
    });
    await prisma.invoice.update({ where: { id: invoice.id }, data: { status: "CANCELLED" } });

    const { getExecutiveCollectionsDetail } = await import("@/lib/actions/executive");
    const detail = await getExecutiveCollectionsDetail({ period: "THIS_YEAR" });
    expect(Number(detail.invoicedThisPeriod)).toBe(0);
    void unit;
  });

  it("payment reversal nets Collected This Period to exactly zero - never double-counted, never wrongly filtered by status", async () => {
    const { contract } = await createTestContract(orgA, { unitNumber: `REV-${uniqueSuffix()}` });
    const schedule = await prisma.paymentSchedule.findFirstOrThrow({ where: { contractId: contract.id } });
    const invoice = await issueInvoice({
      organizationId: orgA.organization.id,
      renterId: orgA.renter.id,
      contractId: contract.id,
      paymentScheduleId: schedule.id,
      lines: [{ description: "Rent", kind: "RENT", quantity: 1, unitPrice: 9000, vatRate: 0 }],
    });
    const payment = await prisma.payment.create({
      data: { organizationId: orgA.organization.id, invoiceId: invoice.id, renterId: orgA.renter.id, receiptNumber: `RCT-${uniqueSuffix()}`, amount: 9000, method: "BANK_TRANSFER" },
    });
    await prisma.invoice.update({ where: { id: invoice.id }, data: { paidAmount: 9000, status: "PAID" } });

    const { reversePayment } = await import("@/lib/actions/payments");
    await reversePayment(payment.id);

    const { getExecutiveCollectionsDetail } = await import("@/lib/actions/executive");
    const detail = await getExecutiveCollectionsDetail({ period: "THIS_YEAR" });
    expect(Number(detail.collectedThisPeriod)).toBe(0);
  });

  it("aging buckets always sum to the outstanding total (mandatory reconciliation invariant) with real invoice rows", async () => {
    const today = new Date();
    async function invoiceDueIn(daysFromToday: number, amount: number) {
      const { contract } = await createTestContract(orgA, { unitNumber: `AGE-${uniqueSuffix()}` });
      const schedule = await prisma.paymentSchedule.findFirstOrThrow({ where: { contractId: contract.id } });
      const dueDate = new Date(today.getTime() + daysFromToday * 24 * 60 * 60 * 1000);
      const invoice = await issueInvoice({
        organizationId: orgA.organization.id,
        renterId: orgA.renter.id,
        contractId: contract.id,
        paymentScheduleId: schedule.id,
        lines: [{ description: "Rent", kind: "RENT", quantity: 1, unitPrice: amount, vatRate: 0 }],
      });
      await prisma.invoice.update({ where: { id: invoice.id }, data: { dueDate } });
      return invoice;
    }

    await invoiceDueIn(10, 1000); // CURRENT
    await invoiceDueIn(-10, 2000); // 1-30
    await invoiceDueIn(-45, 3000); // 31-60
    await invoiceDueIn(-100, 4000); // 90+

    const { getExecutiveCollectionsDetail } = await import("@/lib/actions/executive");
    const detail = await getExecutiveCollectionsDetail({});
    const bucketSum = Object.values(detail.aging.buckets).reduce((sum, v) => sum.plus(new Prisma.Decimal(v)), new Prisma.Decimal(0));
    expect(bucketSum.toString()).toBe(new Prisma.Decimal(detail.outstandingReceivables).toString());
  });
});

describe("Owner Financials: OwnerLedgerEntry is the sole authority, never Invoice x ownership%", () => {
  it("Invoice totalAmount=100k + OwnerLedgerEntry income=60k -> Executive Owner Income shows exactly 60k", async () => {
    const { contract } = await createTestContract(orgA, { unitNumber: `OWN-${uniqueSuffix()}`, rentAmount: 100000 });
    const schedule = await prisma.paymentSchedule.findFirstOrThrow({ where: { contractId: contract.id } });
    await issueInvoice({
      organizationId: orgA.organization.id,
      renterId: orgA.renter.id,
      contractId: contract.id,
      paymentScheduleId: schedule.id,
      lines: [{ description: "Rent", kind: "RENT", quantity: 1, unitPrice: 100000, vatRate: 0 }],
    });
    await prisma.ownerLedgerEntry.create({
      data: { organizationId: orgA.organization.id, ownerId: orgA.owner.id, entryType: "RENT_INCOME", description: "Owner income", credit: 60000 },
    });

    const { getExecutiveOverview } = await import("@/lib/actions/executive");
    const overview = await getExecutiveOverview({ period: "THIS_YEAR" });
    expect(overview.ownerFinancials).not.toBeNull();
    expect(Number(overview.ownerFinancials?.totalIncome)).toBe(60000);
  });

  it("an operational maintenance cost (MaintenanceWorkOrder.actualCost) is never reflected in Owner Expenses - zero automatic posting path exists", async () => {
    const request = await prisma.maintenanceRequest.create({
      data: {
        organizationId: orgA.organization.id,
        requestNumber: `MR-${uniqueSuffix()}`,
        scopeType: "UNIT",
        unitId: orgA.unit.id,
        category: "PLUMBING",
        priority: "NORMAL",
        status: "RESOLVED",
        title: "Test leak",
        description: "test",
        reportedByType: "TENANT",
        source: "TENANT",
        resolvedAt: new Date(),
        createdByUserId: orgA.admin.id,
      },
    });
    await prisma.maintenanceWorkOrder.create({
      data: {
        organizationId: orgA.organization.id,
        workOrderNumber: `WO-${uniqueSuffix()}`,
        requestId: request.id,
        status: "CLOSED",
        priority: "NORMAL",
        actualCost: 5000,
        costResponsibility: "OWNER",
        closedAt: new Date(),
        createdByUserId: orgA.admin.id,
      },
    });

    const { getExecutiveOverview } = await import("@/lib/actions/executive");
    const overview = await getExecutiveOverview({ period: "THIS_YEAR" });
    expect(Number(overview.ownerFinancials?.totalExpenses ?? 0)).toBe(0);
    expect(Number(overview.maintenance?.maintenanceCostThisPeriod)).toBe(5000);
  });
});

describe("Corporate-occupancy distinction: corporate-leased-but-unallocated != VACANT", () => {
  it("a corporate-leased OCCUPIED unit with zero active allocations counts as unallocated, never as a Vacant Unit", async () => {
    const { renter: corpRenter } = await seedCorporateAccount(orgA, { displayName: `Corp-${uniqueSuffix()}` });
    const { unit } = await createTestContract(orgA, { unitNumber: `CORP-${uniqueSuffix()}`, renterId: corpRenter.id });

    const dbUnit = await prisma.unit.findUniqueOrThrow({ where: { id: unit.id } });
    expect(dbUnit.status).toBe("OCCUPIED");

    const { getExecutiveOverview } = await import("@/lib/actions/executive");
    const overview = await getExecutiveOverview({});
    expect(overview.corporateHousing?.unallocatedCorporateUnits).toBeGreaterThanOrEqual(1);
    // The occupied-but-unallocated unit must never be double-counted as Vacant.
    const vacantUnitStatuses = await prisma.unit.findMany({ where: { organizationId: orgA.organization.id, status: "VACANT" }, select: { id: true } });
    expect(vacantUnitStatuses.map((u) => u.id)).not.toContain(unit.id);
  });
});

describe("Communications: SENT != DELIVERED != FAILED", () => {
  it("counts each status independently, never treating SENT as a proxy for DELIVERED", async () => {
    const commonMessage = {
      organizationId: orgA.organization.id,
      eventType: "INVOICE_ISSUED" as const,
      channel: "EMAIL" as const,
      language: "en",
      recipientType: "RENTER" as const,
      renterId: orgA.renter.id,
      destinationRaw: "test@example.com",
      destinationMasked: "t***@example.com",
      renderedBody: "test",
      variablesSnapshot: {},
      businessEntityType: "Invoice",
      businessEntityId: "test",
      idempotencyKey: `key-${uniqueSuffix()}`,
    };
    await prisma.communicationMessage.create({ data: { ...commonMessage, status: "SENT", idempotencyKey: `key-${uniqueSuffix()}` } });
    await prisma.communicationMessage.create({ data: { ...commonMessage, status: "DELIVERED", idempotencyKey: `key-${uniqueSuffix()}` } });
    await prisma.communicationMessage.create({ data: { ...commonMessage, status: "FAILED", idempotencyKey: `key-${uniqueSuffix()}` } });

    const { getExecutiveOverview } = await import("@/lib/actions/executive");
    const overview = await getExecutiveOverview({ period: "THIS_YEAR" });
    expect(overview.communications?.sent).toBe(2); // SENT + DELIVERED both "reached SENT or beyond"
    expect(overview.communications?.delivered).toBe(1);
    expect(overview.communications?.failed).toBe(1);
  });
});

describe("Cross-org aggregate isolation", () => {
  it("Org A's executive overview never includes Org B's units/contracts", async () => {
    await createTestContract(orgB, { unitNumber: `LEAK-${uniqueSuffix()}` });

    const { getExecutiveOverview } = await import("@/lib/actions/executive");
    const overviewA = await getExecutiveOverview({});
    const totalUnitsOrgA = await prisma.unit.count({ where: { organizationId: orgA.organization.id } });
    expect(overviewA.portfolio.totalUnits).toBe(totalUnitsOrgA);
  });

  it("a cross-org compoundId filter is silently ignored, never leaking Org B's compound scope into Org A's results", async () => {
    const { getExecutivePropertiesReport } = await import("@/lib/actions/executive");
    const filteredAsIfOrgB = await getExecutivePropertiesReport({ compoundId: orgB.compound.id });
    const unfiltered = await getExecutivePropertiesReport({});
    expect(filteredAsIfOrgB.totalUnits).toBe(unfiltered.totalUnits);
  });
});

describe("Financial RBAC is enforced server-side, never UI-only", () => {
  it("a MANAGER role receives no Owner Financials in the overview at all (executiveOwnerFinancials.view not granted)", async () => {
    const manager = await createTestUser(orgA.organization.id, "MANAGER");
    mockAuth.mockResolvedValue(sessionFor(manager, orgA.organization.name));

    const { getExecutiveOverview } = await import("@/lib/actions/executive");
    const overview = await getExecutiveOverview({});
    expect(overview.ownerFinancials).toBeNull();
  });

  it("a VIEWER role sees maintenance operational KPIs but the cost figure is redacted server-side (maintenance.cost.view not granted)", async () => {
    const viewer = await createTestUser(orgA.organization.id, "VIEWER");
    mockAuth.mockResolvedValue(sessionFor(viewer, orgA.organization.name));

    const { getExecutiveMaintenanceDetail } = await import("@/lib/actions/executive");
    const detail = await getExecutiveMaintenanceDetail({});
    expect(detail.maintenanceCostThisPeriod).toBeNull();
    expect(typeof detail.openRequests).toBe("number");
  });

  it("an ADMIN/ACCOUNTANT-tier role sees the maintenance cost figure populated", async () => {
    const accountant = await createTestUser(orgA.organization.id, "ACCOUNTANT");
    mockAuth.mockResolvedValue(sessionFor(accountant, orgA.organization.name));

    const { getExecutiveMaintenanceDetail } = await import("@/lib/actions/executive");
    const detail = await getExecutiveMaintenanceDetail({});
    expect(detail.maintenanceCostThisPeriod).not.toBeNull();
  });
});

describe("Read-only: loading Executive Dashboards never mutates domain tables", () => {
  it("a past-due PENDING PaymentSchedule/ISSUED Invoice is left untouched (no syncOverdueStatuses() call on this read path)", async () => {
    const { contract } = await createTestContract(orgA, { unitNumber: `RO-${uniqueSuffix()}`, startDate: new Date("2020-01-01"), endDate: new Date("2021-01-01") });
    const schedule = await prisma.paymentSchedule.findFirstOrThrow({ where: { contractId: contract.id } });
    const invoice = await issueInvoice({
      organizationId: orgA.organization.id,
      renterId: orgA.renter.id,
      contractId: contract.id,
      paymentScheduleId: schedule.id,
      lines: [{ description: "Rent", kind: "RENT", quantity: 1, unitPrice: 5000, vatRate: 0 }],
    });
    const pastDueDate = new Date("2020-02-01");
    await prisma.invoice.update({ where: { id: invoice.id }, data: { dueDate: pastDueDate, status: "ISSUED" } });
    await prisma.paymentSchedule.update({ where: { id: schedule.id }, data: { status: "PENDING", dueDate: pastDueDate } });

    const { getExecutiveOverview } = await import("@/lib/actions/executive");
    await getExecutiveOverview({});

    const invoiceAfter = await prisma.invoice.findUniqueOrThrow({ where: { id: invoice.id } });
    const scheduleAfter = await prisma.paymentSchedule.findUniqueOrThrow({ where: { id: schedule.id } });
    expect(invoiceAfter.status).toBe("ISSUED");
    expect(scheduleAfter.status).toBe("PENDING");
  });
});
