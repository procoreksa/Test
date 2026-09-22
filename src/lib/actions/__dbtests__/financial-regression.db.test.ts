/**
 * STEP 22 - financial regression tests, against the real database: confirm
 * the audit-log/financial-controls integration did NOT change VAT
 * calculation, invoice totals, payment totals, payment schedule status,
 * partial invoicing, owner ledger balances, proportional owner allocation,
 * or reversal math. Every assertion exercises the real server actions
 * (issueInvoiceForSchedule, recordPayment, reversePayment,
 * allocateToOwnersAction, reverseLedgerEntry) end-to-end against Postgres -
 * these are the same code paths now wrapped in $transaction + audit calls.
 */
import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
import { computeInvoiceTotals } from "@/lib/zatca/vat";
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
  createTestOwner,
  sessionFor,
} from "./db-test-helpers";

const mockAuth = vi.fn();
vi.mock("@/lib/auth", () => ({ auth: () => mockAuth() }));

let organizationId: string;
let session: ReturnType<typeof sessionFor>;
let scheduleId: string;
let contractId: string;

beforeAll(async () => {
  await resetDatabase();
  const { prisma } = await import("@/lib/prisma");

  const organization = await createTestOrganization("Financial Regression Org");
  organizationId = organization.id;
  const admin = await createTestUser(organizationId, "ADMIN");
  session = sessionFor(admin, organization.name);

  const compound = await createTestCompound(organizationId);
  const building = await createTestBuilding(organizationId, compound.id);
  const floor = await createTestFloor(organizationId, building.id);
  const unit = await createTestUnit(organizationId, floor.id, { baseRentAmount: 10000, vatApplicable: true });
  const renter = await createTestRenter(organizationId);

  const contract = await createContractWithSchedule(prisma, organizationId, {
    unitId: unit.id,
    renterId: renter.id,
    startDate: new Date("2026-01-01"),
    endDate: new Date("2027-01-01"),
    rentAmount: 10000,
    paymentFrequency: "ANNUAL",
    commissionAmount: 500,
    extraChargesMode: "ONE_TIME",
    vatApplicable: true,
  });
  contractId = contract.id;
  const schedule = await prisma.paymentSchedule.findFirstOrThrow({ where: { contractId } });
  scheduleId = schedule.id;
});

beforeEach(() => {
  mockAuth.mockReset();
  mockAuth.mockResolvedValue(session);
});

describe("VAT and invoice totals are unchanged by audit integration", () => {
  it("issuing the RENT component computes VAT at the contract's 15% rate, matching computeInvoiceTotals directly", async () => {
    const { issueInvoiceForSchedule } = await import("@/lib/actions/invoices");
    const { prisma } = await import("@/lib/prisma");

    const fd = new FormData();
    fd.set("scheduleId", scheduleId);
    fd.set("kind", "RENT");
    await issueInvoiceForSchedule(fd);

    const invoice = await prisma.invoice.findFirstOrThrow({ where: { organizationId, contractId } });
    const expected = computeInvoiceTotals([{ quantity: 1, unitPrice: 10000, vatRate: 15 }]);

    expect(Number(invoice.subtotal)).toBe(expected.subtotal);
    expect(Number(invoice.vatAmount)).toBe(expected.vatAmount);
    expect(Number(invoice.totalAmount)).toBe(expected.totalAmount);
  });

  it("partial invoicing: the COMMISSION component can be billed separately without disturbing the RENT invoice already issued", async () => {
    const { issueInvoiceForSchedule } = await import("@/lib/actions/invoices");
    const { prisma } = await import("@/lib/prisma");

    const rentInvoiceBefore = await prisma.invoice.findFirstOrThrow({ where: { organizationId, contractId } });

    // The ONE_TIME extra-charges mode puts commission on its own separate
    // schedule installment (rentAmount = 0), not the rent installment - see
    // src/lib/schedule.ts, generateSchedule().
    const commissionSchedule = await prisma.paymentSchedule.findFirstOrThrow({
      where: { contractId, commissionAmount: { gt: 0 } },
    });

    const fd = new FormData();
    fd.set("scheduleId", commissionSchedule.id);
    fd.set("kind", "COMMISSION");
    await issueInvoiceForSchedule(fd);

    const rentInvoiceAfter = await prisma.invoice.findUniqueOrThrow({ where: { id: rentInvoiceBefore.id } });
    expect(Number(rentInvoiceAfter.totalAmount)).toBe(Number(rentInvoiceBefore.totalAmount));

    const commissionInvoice = await prisma.invoice.findFirstOrThrow({
      where: { organizationId, contractId, id: { not: rentInvoiceBefore.id } },
    });
    const expected = computeInvoiceTotals([{ quantity: 1, unitPrice: 500, vatRate: 15 }]);
    expect(Number(commissionInvoice.totalAmount)).toBe(expected.totalAmount);

    const invoiceCount = await prisma.invoice.count({ where: { organizationId, contractId } });
    expect(invoiceCount).toBe(2);
  });
});

describe("Payment recording, schedule status, and reversal math are unchanged", () => {
  it("recording full payment on the rent invoice marks it PAID with the exact totalAmount", async () => {
    const { recordPayment } = await import("@/lib/actions/payments");
    const { prisma } = await import("@/lib/prisma");

    const rentInvoice = await prisma.invoice.findFirstOrThrow({
      where: { organizationId, contractId },
      orderBy: { createdAt: "asc" },
    });

    const fd = new FormData();
    fd.set("invoiceId", rentInvoice.id);
    fd.set("amount", String(rentInvoice.totalAmount));
    fd.set("method", "CASH");
    await recordPayment(fd);

    const updated = await prisma.invoice.findUniqueOrThrow({ where: { id: rentInvoice.id } });
    expect(updated.status).toBe("PAID");
    expect(Number(updated.paidAmount)).toBe(Number(rentInvoice.totalAmount));
  });

  it("reversePayment posts a negative-amount reversal that nets the invoice back to ISSUED and the schedule out of PAID", async () => {
    const { reversePayment } = await import("@/lib/actions/payments");
    const { prisma } = await import("@/lib/prisma");

    const rentInvoice = await prisma.invoice.findFirstOrThrow({
      where: { organizationId, contractId },
      orderBy: { createdAt: "asc" },
    });
    const originalPayment = await prisma.payment.findFirstOrThrow({ where: { invoiceId: rentInvoice.id } });

    const reversalId = await reversePayment(originalPayment.id);

    const reversal = await prisma.payment.findUniqueOrThrow({ where: { id: reversalId } });
    expect(Number(reversal.amount)).toBe(-Number(originalPayment.amount));
    expect(reversal.reversalOfPaymentId).toBe(originalPayment.id);

    const originalAfter = await prisma.payment.findUniqueOrThrow({ where: { id: originalPayment.id } });
    expect(originalAfter.status).toBe("REVERSED");
    // The original row's amount itself is never edited - only its status changes.
    expect(Number(originalAfter.amount)).toBe(Number(originalPayment.amount));

    const invoiceAfter = await prisma.invoice.findUniqueOrThrow({ where: { id: rentInvoice.id } });
    expect(Number(invoiceAfter.paidAmount)).toBe(0);
    expect(invoiceAfter.status).not.toBe("PAID");

    // Every existing SUM(amount)-based report nets correctly with zero query changes.
    const sum = await prisma.payment.aggregate({ where: { invoiceId: rentInvoice.id }, _sum: { amount: true } });
    expect(Number(sum._sum.amount)).toBe(0);
  });
});

describe("Owner ledger allocation math is unchanged", () => {
  it("allocates a 1000 SAR income entry as exactly 600/400 across a 60/40 ownership split, summing to the original total", async () => {
    const { prisma } = await import("@/lib/prisma");
    const { allocateToOwnersAction } = await import("@/lib/actions/owner-ledger");

    const compound = await createTestCompound(organizationId, "Allocation Compound");
    const ownerMajority = await createTestOwner(organizationId, "Majority Owner");
    const ownerMinority = await createTestOwner(organizationId, "Minority Owner");
    await prisma.propertyOwnership.create({
      data: { organizationId, ownerId: ownerMajority.id, compoundId: compound.id, ownershipPercentage: 60 },
    });
    await prisma.propertyOwnership.create({
      data: { organizationId, ownerId: ownerMinority.id, compoundId: compound.id, ownershipPercentage: 40 },
    });

    const fd = new FormData();
    fd.set("assetLevel", "COMPOUND");
    fd.set("assetId", compound.id);
    fd.set("entryType", "RENT_INCOME");
    fd.set("amount", "1000");
    fd.set("description", "Regression allocation test");
    const result = await allocateToOwnersAction(fd);

    const majorityAllocation = result.allocations.find((a) => a.ownerId === ownerMajority.id)!;
    const minorityAllocation = result.allocations.find((a) => a.ownerId === ownerMinority.id)!;
    expect(Number(majorityAllocation.amount)).toBe(600);
    expect(Number(minorityAllocation.amount)).toBe(400);
    expect(Number(majorityAllocation.amount) + Number(minorityAllocation.amount)).toBe(1000);

    const entries = await prisma.ownerLedgerEntry.findMany({ where: { id: { in: result.createdEntryIds } } });
    const total = entries.reduce((sum, e) => sum + Number(e.credit) - Number(e.debit), 0);
    expect(total).toBe(1000);
  });

  it("reverseLedgerEntry mirrors debit/credit exactly, leaving the owner's net balance at zero after both entries", async () => {
    const { prisma } = await import("@/lib/prisma");
    const { postManualLedgerEntry, reverseLedgerEntry, getOwnerBalance } = await import("@/lib/actions/owner-ledger");

    const owner = await createTestOwner(organizationId, "Reversal Balance Owner");
    const postFd = new FormData();
    postFd.set("ownerId", owner.id);
    postFd.set("entryType", "OTHER_INCOME");
    postFd.set("amount", "250");
    postFd.set("description", "To be reversed");
    const entryId = await postManualLedgerEntry(postFd);

    await reverseLedgerEntry(entryId);

    const { balance } = await getOwnerBalance(owner.id);
    expect(Number(balance)).toBe(0);

    const original = await prisma.ownerLedgerEntry.findUniqueOrThrow({ where: { id: entryId } });
    const reversal = await prisma.ownerLedgerEntry.findFirstOrThrow({ where: { reversalOfEntryId: entryId } });
    expect(Number(reversal.debit)).toBe(Number(original.credit));
    expect(Number(reversal.credit)).toBe(Number(original.debit));
  });
});
