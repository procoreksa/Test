/**
 * Real, database-backed financial-integrity tests for the Owner Portal
 * (docs/OWNER-PORTAL.md, "Owner financial architecture"). Proves the two
 * non-negotiable financial rules from the spec:
 *  - The portal's financial figures come exclusively from OwnerLedgerEntry,
 *    never from summing tenant Invoice amounts.
 *  - The portal never recomputes ownership% x invoice on the fly; it only
 *    ever displays whatever amount the ledger itself already recorded, and
 *    that figure is immune to later, unrelated changes to the invoice.
 */
import { describe, it, expect, vi, beforeAll } from "vitest";
import { resetDatabase, seedFullOrg, createTestOwner, createTestUnit, createTestRenter, type SeededOrg } from "./db-test-helpers";
import { createTestOwnerPortalAccount, ownerSessionFor } from "./owner-portal-test-helpers";
import { prisma } from "@/lib/prisma";
import { createContractWithSchedule } from "@/lib/contract-schedule";
import { issueInvoice } from "@/lib/invoicing";

const mockOwnerAuth = vi.fn();
vi.mock("@/lib/owner-auth", () => ({ auth: () => mockOwnerAuth() }));

let org: SeededOrg;

beforeAll(async () => {
  await resetDatabase();
  org = await seedFullOrg("OWNFIN");
});

describe("Ledger-based financial source: the portal reports the ledger's amount, never the raw invoice total", () => {
  it("a 100,000 tenant invoice with only a 60,000 OwnerLedgerEntry posted reports exactly 60,000 income, never 100,000", async () => {
    const owner = await createTestOwner(org.organization.id, "Ledger Source Owner");
    const account = await createTestOwnerPortalAccount(org.organization.id, owner.id, org.admin.id);
    const unit = await createTestUnit(org.organization.id, org.floor.id, { unitNumber: `Fin-${Date.now()}` });
    await prisma.propertyOwnership.create({ data: { organizationId: org.organization.id, ownerId: owner.id, unitId: unit.id, ownershipPercentage: 60 } });

    const renter = await createTestRenter(org.organization.id, "Ledger Source Renter");
    const contract = await createContractWithSchedule(prisma, org.organization.id, {
      unitId: unit.id,
      renterId: renter.id,
      startDate: new Date("2026-01-01"),
      endDate: new Date("2027-01-01"),
      rentAmount: 100000,
      paymentFrequency: "ANNUAL",
      extraChargesMode: "ONE_TIME",
      vatApplicable: false,
    });
    const schedule = await prisma.paymentSchedule.findFirstOrThrow({ where: { contractId: contract.id } });
    const invoice = await issueInvoice({
      organizationId: org.organization.id,
      renterId: renter.id,
      contractId: contract.id,
      paymentScheduleId: schedule.id,
      lines: [{ description: "Rent", kind: "RENT", quantity: 1, unitPrice: 100000, vatRate: 0 }],
    });
    expect(Number(invoice.totalAmount)).toBe(100000);

    // Only 60,000 (the owner's already-allocated share) is ever posted to
    // the Owner Ledger - the portal must never see or infer the 100,000
    // invoice total.
    await prisma.ownerLedgerEntry.create({
      data: { organizationId: org.organization.id, ownerId: owner.id, entryType: "RENT_INCOME", description: "Owner's allocated rent income", credit: 60000, unitId: unit.id, entryDate: new Date() },
    });

    mockOwnerAuth.mockResolvedValue(ownerSessionFor(account));
    const { getOwnerPortalFinancialSummary } = await import("@/lib/actions/owner-portal/financials");
    const { getOwnerPortalLedger } = await import("@/lib/actions/owner-portal/financials");

    const summary = await getOwnerPortalFinancialSummary();
    expect(Number(summary.monthToDateIncome)).toBe(60000);
    expect(Number(summary.yearToDateIncome)).toBe(60000);
    expect(Number(summary.currentBalance)).toBe(60000);

    const ledger = await getOwnerPortalLedger();
    expect(Number(ledger.balance)).toBe(60000);
  });
});

describe("Ownership-percentage-vs-ledger regression: the portal never recomputes invoice x percentage on the fly", () => {
  it("changing the invoice total after the ledger entry is posted never changes the portal's reported figures", async () => {
    const owner = await createTestOwner(org.organization.id, "Percentage Regression Owner");
    const account = await createTestOwnerPortalAccount(org.organization.id, owner.id, org.admin.id);
    const unit = await createTestUnit(org.organization.id, org.floor.id, { unitNumber: `PctReg-${Date.now()}` });
    await prisma.propertyOwnership.create({ data: { organizationId: org.organization.id, ownerId: owner.id, unitId: unit.id, ownershipPercentage: 60 } });

    const renter = await createTestRenter(org.organization.id, "Percentage Regression Renter");
    const contract = await createContractWithSchedule(prisma, org.organization.id, {
      unitId: unit.id,
      renterId: renter.id,
      startDate: new Date("2026-01-01"),
      endDate: new Date("2027-01-01"),
      rentAmount: 100000,
      paymentFrequency: "ANNUAL",
      extraChargesMode: "ONE_TIME",
      vatApplicable: false,
    });
    const schedule = await prisma.paymentSchedule.findFirstOrThrow({ where: { contractId: contract.id } });
    const invoice = await issueInvoice({
      organizationId: org.organization.id,
      renterId: renter.id,
      contractId: contract.id,
      paymentScheduleId: schedule.id,
      lines: [{ description: "Rent", kind: "RENT", quantity: 1, unitPrice: 100000, vatRate: 0 }],
    });

    // The 60,000 figure already reflects the owner's 60% share, allocated
    // once at posting time - the portal must display this exact figure.
    await prisma.ownerLedgerEntry.create({
      data: { organizationId: org.organization.id, ownerId: owner.id, entryType: "RENT_INCOME", description: "Allocated rent income", credit: 60000, unitId: unit.id, entryDate: new Date() },
    });

    mockOwnerAuth.mockResolvedValue(ownerSessionFor(account));
    const { getOwnerPortalFinancialSummary } = await import("@/lib/actions/owner-portal/financials");
    const before = await getOwnerPortalFinancialSummary();
    expect(Number(before.currentBalance)).toBe(60000);

    // A later, unrelated change to the invoice total (e.g. a correction)
    // must never ripple into the owner's already-posted ledger figure -
    // if the portal recomputed `invoice x percentage` dynamically instead
    // of reading the ledger, this would now report 300,000 x 0.6 = 180,000.
    await prisma.invoice.update({ where: { id: invoice.id }, data: { totalAmount: 300000 } });

    const after = await getOwnerPortalFinancialSummary();
    expect(Number(after.currentBalance)).toBe(60000);
    expect(Number(after.monthToDateIncome)).toBe(60000);
  });
});
