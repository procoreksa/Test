/**
 * Service invoices (docs/SERVICE-INVOICES.md), against the real database:
 * a SERVICE invoice is a real ZATCA tax invoice on the organization's one
 * ICV/hash chain and in the VAT report, but never appears in or changes the
 * renter's rent statement or tenant/corporate rent balances - only the
 * separate services report.
 */
import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
import { createContractWithSchedule } from "@/lib/contract-schedule";
import {
  resetDatabase,
  createTestOrganization,
  createTestUser,
  createTestCompound,
  createTestBuilding,
  createTestFloor,
  createTestUnit,
  createTestRenter,
  sessionFor,
} from "./db-test-helpers";

const mockAuth = vi.fn();
vi.mock("@/lib/auth", () => ({ auth: () => mockAuth() }));

let organizationId: string;
let renterId: string;
let scheduleId: string;
let serviceId: string;
let session: ReturnType<typeof sessionFor>;
let otherOrgSession: ReturnType<typeof sessionFor>;

const wide = { from: new Date("2000-01-01"), to: new Date("2100-01-01") };

beforeAll(async () => {
  await resetDatabase();
  const { prisma } = await import("@/lib/prisma");

  const organization = await createTestOrganization("Service Invoices Org");
  organizationId = organization.id;
  const admin = await createTestUser(organizationId, "ADMIN");
  session = sessionFor(admin, organization.name);

  const other = await createTestOrganization("Other Org");
  const otherAdmin = await createTestUser(other.id, "ADMIN");
  otherOrgSession = sessionFor(otherAdmin, other.name);

  const compound = await createTestCompound(organizationId);
  const building = await createTestBuilding(organizationId, compound.id);
  const floor = await createTestFloor(organizationId, building.id);
  const unit = await createTestUnit(organizationId, floor.id, { baseRentAmount: 12000, vatApplicable: false });
  const renter = await createTestRenter(organizationId);
  renterId = renter.id;

  const contract = await createContractWithSchedule(prisma, organizationId, {
    unitId: unit.id,
    renterId,
    startDate: new Date("2026-01-01"),
    endDate: new Date("2027-01-01"),
    rentAmount: 12000,
    paymentFrequency: "ANNUAL",
    extraChargesMode: "ONE_TIME",
    vatApplicable: false,
  });
  scheduleId = (await prisma.paymentSchedule.findFirstOrThrow({ where: { contractId: contract.id } })).id;
});

beforeEach(() => {
  mockAuth.mockReset();
  mockAuth.mockResolvedValue(session);
});

describe("service catalog", () => {
  it("creates a service and rejects a duplicate name in the same organization", async () => {
    const { createServiceCatalogItem, listServiceCatalog } = await import("@/lib/actions/service-invoices");
    const fd = new FormData();
    fd.set("name", "Deep cleaning");
    fd.set("nameAr", "تنظيف عميق");
    fd.set("defaultPrice", "300");
    fd.set("vatRate", "15");
    expect(await createServiceCatalogItem(fd)).toEqual({});
    expect((await createServiceCatalogItem(fd)).error).toBeTruthy();

    const catalog = await listServiceCatalog();
    expect(catalog).toHaveLength(1);
    serviceId = catalog[0].id;
  });
});

describe("issuing", () => {
  it("issues a paid SERVICE invoice on the shared ICV chain, with a receipt for the full amount", async () => {
    const { issueInvoiceForSchedule } = await import("@/lib/actions/invoices");
    const { issueServiceInvoice } = await import("@/lib/actions/service-invoices");
    const { prisma } = await import("@/lib/prisma");

    const rentFd = new FormData();
    rentFd.set("scheduleId", scheduleId);
    rentFd.set("kind", "RENT");
    const rentInvoiceId = await issueInvoiceForSchedule(rentFd);
    const rentInvoice = await prisma.invoice.findUniqueOrThrow({ where: { id: rentInvoiceId } });

    const fd = new FormData();
    fd.set("renterId", renterId);
    fd.set("serviceId", serviceId);
    fd.set("quantity", "2");
    fd.set("unitPrice", "300");
    fd.set("vatRate", "15");
    fd.set("paymentMethod", "CARD");
    fd.set("referenceNumber", "POS-1");
    const result = await issueServiceInvoice(fd);
    expect(result.error).toBeUndefined();

    const invoice = await prisma.invoice.findUniqueOrThrow({ where: { id: result.invoiceId! }, include: { lines: true, payments: true } });
    expect(invoice.category).toBe("SERVICE");
    expect(invoice.contractId).toBeNull();
    expect(invoice.serviceId).toBe(serviceId);
    expect(Number(invoice.subtotal)).toBe(600);
    expect(Number(invoice.vatAmount)).toBe(90);
    expect(Number(invoice.totalAmount)).toBe(690);
    expect(invoice.status).toBe("PAID");
    expect(Number(invoice.paidAmount)).toBe(690);
    expect(invoice.lines[0].paymentScheduleId).toBeNull();
    expect(invoice.payments).toHaveLength(1);
    expect(invoice.payments[0].method).toBe("CARD");
    expect(Number(invoice.payments[0].amount)).toBe(690);

    // Same chain as rent invoices: next ICV, linked to the previous hash.
    expect(invoice.icv).toBe(rentInvoice.icv + 1);
    expect(invoice.previousInvoiceHash).toBe(rentInvoice.invoiceHash);
  });

  it("issues an unpaid invoice when the payment method is ON_ACCOUNT", async () => {
    const { issueServiceInvoice } = await import("@/lib/actions/service-invoices");
    const { prisma } = await import("@/lib/prisma");
    const fd = new FormData();
    fd.set("renterId", renterId);
    fd.set("serviceId", serviceId);
    fd.set("quantity", "1");
    fd.set("unitPrice", "100");
    fd.set("vatRate", "15");
    fd.set("paymentMethod", "ON_ACCOUNT");
    const { invoiceId } = await issueServiceInvoice(fd);
    const invoice = await prisma.invoice.findUniqueOrThrow({ where: { id: invoiceId! }, include: { payments: true } });
    expect(invoice.status).toBe("ISSUED");
    expect(invoice.payments).toHaveLength(0);
  });

  it("refuses another organization's customer or service", async () => {
    const { issueServiceInvoice } = await import("@/lib/actions/service-invoices");
    mockAuth.mockResolvedValue(otherOrgSession);
    const fd = new FormData();
    fd.set("renterId", renterId);
    fd.set("serviceId", serviceId);
    fd.set("quantity", "1");
    fd.set("unitPrice", "100");
    fd.set("vatRate", "15");
    fd.set("paymentMethod", "CASH");
    expect((await issueServiceInvoice(fd)).error).toBeTruthy();
  });
});

describe("ledger separation", () => {
  it("keeps service invoices and their payments out of the renter statement", async () => {
    const { getRenterStatement } = await import("@/lib/actions/reports");
    const { ledger } = await getRenterStatement(renterId);
    // Only the 12,000 rent invoice; no service lines or receipts.
    expect(ledger.every((e) => e.type !== "PAYMENT")).toBe(true);
    expect(ledger.reduce((sum, e) => sum + e.debit, 0)).toBe(12000);
  });

  it("keeps service invoices out of the main invoices list but lists them separately", async () => {
    const { listInvoices } = await import("@/lib/actions/invoices");
    const { listServiceInvoices } = await import("@/lib/actions/service-invoices");
    expect((await listInvoices()).every((i) => i.category === "RENTAL")).toBe(true);
    expect(await listServiceInvoices()).toHaveLength(2);
  });

  it("reports service invoices with totals, filtered by customer and service", async () => {
    const { getServicesReport } = await import("@/lib/actions/service-invoices");
    const { totals } = await getServicesReport({ ...wide, renterId, serviceId });
    expect(totals.count).toBe(2);
    expect(totals.totalAmount).toBe(805);
    expect(totals.paidAmount).toBe(690);
    expect(totals.outstanding).toBe(115);

    const none = await getServicesReport({ ...wide, renterId: "does-not-exist" });
    expect(none.totals.count).toBe(0);
  });

  it("still counts service invoices in the VAT report", async () => {
    const { getVatReport } = await import("@/lib/actions/reports");
    const { totals } = await getVatReport(wide.from, wide.to);
    expect(totals.invoiceCount).toBe(3);
    expect(totals.vatAmount).toBe(105);
  });
});
