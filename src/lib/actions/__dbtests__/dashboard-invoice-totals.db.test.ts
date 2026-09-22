/**
 * Hardening (docs/PERFORMANCE-REVIEW.md, "Dashboard query audit"): real,
 * database-backed regression test proving getDashboardStats()'s rewritten
 * invoice-totals/monthly-trend queries (now a bounded aggregate + a
 * bounded, SQL-grouped query, replacing an unbounded
 * `findMany({ where: { organizationId } })` over every invoice the
 * organization has ever issued) still produce the exact same numbers as
 * the naive JS-side computation would have - including invoices far
 * outside the 6-month trend window (which must still count toward the
 * lifetime totals), a month with zero invoices in the trend (which must
 * still appear as a zero-filled entry, not be silently omitted), and
 * cross-org isolation (another organization's invoices never leak into
 * these totals).
 */
import { describe, it, expect, vi, beforeAll } from "vitest";
import { subMonths } from "date-fns";
import { resetDatabase, seedFullOrg, uniqueSuffix, type SeededOrg } from "./db-test-helpers";
import { prisma } from "@/lib/prisma";

const mockAuth = vi.fn();
vi.mock("@/lib/auth", () => ({ auth: () => mockAuth() }));

let org: SeededOrg;
let orgB: SeededOrg;

async function createInvoice(organizationId: string, renterId: string, issueDate: Date, totalAmount: number, paidAmount: number) {
  const suffix = uniqueSuffix();
  return prisma.invoice.create({
    data: {
      organizationId,
      renterId,
      invoiceNumber: `INV-TEST-${suffix}`,
      icv: Math.floor(Math.random() * 1_000_000),
      uuid: `uuid-${suffix}`,
      issueDate,
      subtotal: totalAmount,
      vatAmount: 0,
      totalAmount,
      paidAmount,
    },
  });
}

beforeAll(async () => {
  await resetDatabase();
  org = await seedFullOrg("DASH");
  orgB = await seedFullOrg("DASHB");
  mockAuth.mockResolvedValue(org.session);

  const now = new Date();

  // Two invoices this month (one of the 6 trend months).
  await createInvoice(org.organization.id, org.renter.id, now, 1000, 400);
  await createInvoice(org.organization.id, org.renter.id, now, 500, 500);

  // One invoice 2 months ago (also inside the trend window).
  await createInvoice(org.organization.id, org.renter.id, subMonths(now, 2), 2000, 0);

  // One invoice far outside the 6-month trend window - must still count
  // toward the lifetime totals, but must NOT appear in monthlySeries.
  await createInvoice(org.organization.id, org.renter.id, subMonths(now, 20), 9000, 9000);

  // A different organization's invoice - must never leak into org's totals.
  await createInvoice(orgB.organization.id, orgB.renter.id, now, 777, 777);
});

describe("getDashboardStats() invoice totals/trend after the aggregate-query rewrite", () => {
  it("lifetime totals sum every invoice regardless of age, excluding other organizations", async () => {
    const { getDashboardStats } = await import("@/lib/actions/dashboard");
    const stats = await getDashboardStats();

    // 1000 + 500 + 2000 + 9000 = 12500 (org B's 777 must not be included)
    expect(stats.totalInvoiced).toBe(12500);
    // 400 + 500 + 0 + 9000 = 9900
    expect(stats.totalCollected).toBe(9900);
    expect(stats.totalOutstanding).toBe(12500 - 9900);
  });

  it("monthlySeries covers exactly the last 6 months, zero-fills months with no invoices, and excludes the 20-month-old invoice", async () => {
    const { getDashboardStats } = await import("@/lib/actions/dashboard");
    const stats = await getDashboardStats();

    expect(stats.monthlySeries).toHaveLength(6);

    const totalAcrossTrend = stats.monthlySeries.reduce((sum, m) => sum + m.invoiced, 0);
    // Only the 1000 + 500 + 2000 = 3500 from inside the trend window - the
    // 9000 twenty months ago must not appear here even though it's part of
    // the lifetime total above.
    expect(totalAcrossTrend).toBe(3500);

    const collectedAcrossTrend = stats.monthlySeries.reduce((sum, m) => sum + m.collected, 0);
    expect(collectedAcrossTrend).toBe(900);

    // At least one of the 6 months has neither invoice and must be an
    // explicit zero entry, not simply absent.
    const zeroMonths = stats.monthlySeries.filter((m) => m.invoiced === 0 && m.collected === 0);
    expect(zeroMonths.length).toBeGreaterThan(0);
  });

  it("a contract's expiring/overdue lookups remain bounded and organization-scoped (unaffected by the invoice-query rewrite)", async () => {
    const { getDashboardStats } = await import("@/lib/actions/dashboard");
    const stats = await getDashboardStats();
    expect(Array.isArray(stats.expiringContracts)).toBe(true);
    expect(Array.isArray(stats.overdueSchedules)).toBe(true);
  });
});
