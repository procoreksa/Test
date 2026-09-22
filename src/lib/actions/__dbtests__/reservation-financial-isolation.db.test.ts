/**
 * STEP 40 - real, database-backed financial isolation test for Reservation
 * Management. Explicitly proves that creating, submitting, confirming,
 * amount-status-updating, and terminating (cancel/release/expire) a
 * Reservation NEVER creates or mutates any Invoice / InvoiceLine / Payment /
 * PaymentSchedule / OwnerLedgerEntry row - Reservation Amount is pure
 * operational tracking, never an accounting entry, per the task brief's
 * explicit "never create financial accounting entries" requirement.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { resetDatabase, seedFullOrg, seedFinancialsForOrg, createTestUnit, createTestOffer, type SeededOrg } from "./db-test-helpers";
import { prisma } from "@/lib/prisma";

const mockAuth = vi.fn();
vi.mock("@/lib/auth", () => ({ auth: () => mockAuth() }));

let org: SeededOrg;

beforeEach(async () => {
  await resetDatabase();
  org = await seedFullOrg("FI");
  mockAuth.mockResolvedValue(org.session);
});

async function financialCounts(organizationId: string) {
  const [invoices, invoiceLines, payments, paymentSchedules, ownerLedgerEntries] = await Promise.all([
    prisma.invoice.count({ where: { organizationId } }),
    prisma.invoiceLine.count({ where: { invoice: { organizationId } } }),
    prisma.payment.count({ where: { organizationId } }),
    prisma.paymentSchedule.count({ where: { organizationId } }),
    prisma.ownerLedgerEntry.count({ where: { organizationId } }),
  ]);
  return { invoices, invoiceLines, payments, paymentSchedules, ownerLedgerEntries };
}

describe("Reservation financial isolation (Step 40)", () => {
  it("a full reservation lifecycle (create -> submit -> confirm -> amount RECEIVED -> release) creates zero financial records", async () => {
    const before = await financialCounts(org.organization.id);
    expect(before).toEqual({ invoices: 0, invoiceLines: 0, payments: 0, paymentSchedules: 0, ownerLedgerEntries: 0 });

    const { submitReservation, confirmReservation, updateReservationAmountStatus, releaseReservation, createReservation } = await import(
      "@/lib/actions/reservations"
    );

    const unit = await createTestUnit(org.organization.id, org.floor.id, { unitNumber: "FI-101" });
    const offer = await createTestOffer(org.organization.id, org.lead.id, unit.id, org.admin.id, { status: "ACCEPTED" });
    const fd = new FormData();
    fd.set("offerId", offer.id);
    fd.set("holdUntil", "2099-01-01T00:00");
    fd.set("reservationAmount", "7500");
    const reservationId = await createReservation(fd);

    await submitReservation(reservationId);
    await confirmReservation(reservationId);

    const amountFd = new FormData();
    amountFd.set("reservationId", reservationId);
    amountFd.set("reservationAmountStatus", "RECEIVED");
    await updateReservationAmountStatus(amountFd);

    await releaseReservation(reservationId);

    const reservation = await prisma.reservation.findUniqueOrThrow({ where: { id: reservationId } });
    expect(reservation.status).toBe("RELEASED");
    expect(reservation.reservationAmountStatus).toBe("RECEIVED");
    expect(Number(reservation.reservationAmount)).toBe(7500);

    const after = await financialCounts(org.organization.id);
    expect(after).toEqual({ invoices: 0, invoiceLines: 0, payments: 0, paymentSchedules: 0, ownerLedgerEntries: 0 });
  });

  it("cancelling a reservation with a reservation amount marked FORFEITED creates zero financial records", async () => {
    const { cancelReservation, updateReservationAmountStatus } = await import("@/lib/actions/reservations");

    const amountFd = new FormData();
    amountFd.set("reservationId", org.reservation.id);
    amountFd.set("reservationAmountStatus", "FORFEITED");
    await updateReservationAmountStatus(amountFd);

    const fd = new FormData();
    fd.set("reservationId", org.reservation.id);
    fd.set("cancelReason", "PAYMENT_NOT_RECEIVED");
    await cancelReservation(fd);

    const after = await financialCounts(org.organization.id);
    expect(after).toEqual({ invoices: 0, invoiceLines: 0, payments: 0, paymentSchedules: 0, ownerLedgerEntries: 0 });
  });

  it("expiry sync of a reservation with a PENDING amount creates zero financial records", async () => {
    await prisma.reservation.update({ where: { id: org.reservation.id }, data: { status: "PENDING", holdUntil: new Date("2020-01-01T00:00:00Z"), reservationAmount: 3000, reservationAmountStatus: "PENDING" } });

    const { syncExpiredReservations } = await import("@/lib/actions/reservations");
    await syncExpiredReservations(org.organization.id);

    const reservation = await prisma.reservation.findUniqueOrThrow({ where: { id: org.reservation.id } });
    expect(reservation.status).toBe("EXPIRED");

    const after = await financialCounts(org.organization.id);
    expect(after).toEqual({ invoices: 0, invoiceLines: 0, payments: 0, paymentSchedules: 0, ownerLedgerEntries: 0 });
  });

  it("pre-existing financial records for other modules (contract/invoice/payment/ledger) are unaffected by reservation actions", async () => {
    const financials = await seedFinancialsForOrg(org);
    const before = await financialCounts(org.organization.id);
    expect(before).toEqual({ invoices: 1, invoiceLines: 1, payments: 1, paymentSchedules: 1, ownerLedgerEntries: 1 });

    const { submitReservation, confirmReservation, releaseReservation } = await import("@/lib/actions/reservations");
    await submitReservation(org.reservation.id);
    await confirmReservation(org.reservation.id);
    await releaseReservation(org.reservation.id);

    const after = await financialCounts(org.organization.id);
    expect(after).toEqual(before);

    // Sanity: the pre-existing invoice/payment amounts themselves are untouched.
    const invoice = await prisma.invoice.findUniqueOrThrow({ where: { id: financials.invoice.id } });
    expect(Number(invoice.paidAmount)).toBe(12000);
  });
});
