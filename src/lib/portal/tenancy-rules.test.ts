import { describe, it, expect } from "vitest";
import { Prisma } from "@prisma/client";
import { selectCurrentTenancy, settlementVisibilityForTenant, isTenantCancellableMaintenanceStatus, computeTenantOutstandingBalance } from "./tenancy-rules";

describe("selectCurrentTenancy", () => {
  it("returns null/empty for a renter with no contracts", () => {
    expect(selectCurrentTenancy([])).toEqual({ current: null, historical: [] });
  });

  it("picks the single ACTIVE contract as current", () => {
    const active = { id: "c1", status: "ACTIVE" as const, startDate: new Date("2027-01-01"), endDate: new Date("2028-01-01") };
    const expired = { id: "c0", status: "EXPIRED" as const, startDate: new Date("2026-01-01"), endDate: new Date("2027-01-01") };
    const result = selectCurrentTenancy([expired, active]);
    expect(result.current?.id).toBe("c1");
    expect(result.historical.map((c) => c.id)).toEqual(["c0"]);
  });

  it("falls back to the most-recently-ended contract when none is ACTIVE", () => {
    const older = { id: "c1", status: "TERMINATED" as const, startDate: new Date("2025-01-01"), endDate: new Date("2026-01-01") };
    const newer = { id: "c2", status: "EXPIRED" as const, startDate: new Date("2026-06-01"), endDate: new Date("2027-06-01") };
    const result = selectCurrentTenancy([older, newer]);
    expect(result.current?.id).toBe("c2");
    expect(result.historical.map((c) => c.id)).toEqual(["c1"]);
  });

  it("never picks an arbitrary contract if two ACTIVE rows somehow exist - takes the most recently started", () => {
    const a = { id: "a", status: "ACTIVE" as const, startDate: new Date("2027-01-01"), endDate: new Date("2028-01-01") };
    const b = { id: "b", status: "ACTIVE" as const, startDate: new Date("2027-06-01"), endDate: new Date("2028-06-01") };
    const result = selectCurrentTenancy([a, b]);
    expect(result.current?.id).toBe("b");
  });
});

describe("settlementVisibilityForTenant", () => {
  it("hides DRAFT/UNDER_REVIEW/PENDING_APPROVAL/CANCELLED", () => {
    expect(settlementVisibilityForTenant("DRAFT")).toBe("HIDDEN");
    expect(settlementVisibilityForTenant("UNDER_REVIEW")).toBe("HIDDEN");
    expect(settlementVisibilityForTenant("PENDING_APPROVAL")).toBe("HIDDEN");
    expect(settlementVisibilityForTenant("CANCELLED")).toBe("HIDDEN");
  });

  it("shows the approved-pending-posting view only at APPROVED", () => {
    expect(settlementVisibilityForTenant("APPROVED")).toBe("APPROVED_PENDING_POSTING");
  });

  it("shows the final view from POSTED onward", () => {
    expect(settlementVisibilityForTenant("POSTED")).toBe("FINAL");
    expect(settlementVisibilityForTenant("PARTIALLY_SETTLED")).toBe("FINAL");
    expect(settlementVisibilityForTenant("SETTLED")).toBe("FINAL");
  });
});

describe("isTenantCancellableMaintenanceStatus", () => {
  it("allows cancellation only while OPEN", () => {
    expect(isTenantCancellableMaintenanceStatus("OPEN")).toBe(true);
    expect(isTenantCancellableMaintenanceStatus("TRIAGED")).toBe(false);
    expect(isTenantCancellableMaintenanceStatus("WORK_ORDER_CREATED")).toBe(false);
    expect(isTenantCancellableMaintenanceStatus("RESOLVED")).toBe(false);
    expect(isTenantCancellableMaintenanceStatus("CANCELLED")).toBe(false);
  });
});

describe("computeTenantOutstandingBalance", () => {
  it("sums totalAmount minus paidAmount across non-cancelled invoices", () => {
    const result = computeTenantOutstandingBalance([
      { totalAmount: 1000, paidAmount: 1000, status: "PAID" },
      { totalAmount: 2000, paidAmount: 500, status: "PARTIALLY_PAID" },
      { totalAmount: 500, paidAmount: 0, status: "ISSUED" },
    ]);
    expect(result.toString()).toBe("2000");
  });

  it("excludes CANCELLED invoices entirely", () => {
    const result = computeTenantOutstandingBalance([
      { totalAmount: 5000, paidAmount: 0, status: "CANCELLED" },
      { totalAmount: 1000, paidAmount: 0, status: "ISSUED" },
    ]);
    expect(result.toString()).toBe("1000");
  });

  it("returns zero for an empty invoice list", () => {
    expect(computeTenantOutstandingBalance([]).toString()).toBe("0");
  });

  it("never double-counts - a settlement additional-due invoice is just another Invoice row, summed once", () => {
    const result = computeTenantOutstandingBalance([{ totalAmount: new Prisma.Decimal(2000), paidAmount: new Prisma.Decimal(0), status: "ISSUED" }]);
    expect(result.toString()).toBe("2000");
  });
});
