import { describe, it, expect } from "vitest";
import {
  invoiceIssuedKey,
  paymentReceivedKey,
  maintenanceRequestCreatedKey,
  maintenanceScheduledKey,
  maintenanceCompletedKey,
  moveInScheduledKey,
  moveOutScheduledKey,
  securityDepositSettlementPostedKey,
  securityDepositRefundRecordedKey,
} from "@/lib/automation/outbox-keys";

describe("one-shot event keys (id-only)", () => {
  it("invoiceIssuedKey is exactly the invoice id", () => {
    expect(invoiceIssuedKey("inv1")).toBe("inv1");
  });

  it("paymentReceivedKey is exactly the payment id", () => {
    expect(paymentReceivedKey("pay1")).toBe("pay1");
  });

  it("maintenanceRequestCreatedKey is exactly the request id", () => {
    expect(maintenanceRequestCreatedKey("req1")).toBe("req1");
  });

  it("maintenanceCompletedKey is exactly the work order id", () => {
    expect(maintenanceCompletedKey("wo1")).toBe("wo1");
  });

  it("securityDepositSettlementPostedKey is exactly the settlement id", () => {
    expect(securityDepositSettlementPostedKey("sds1")).toBe("sds1");
  });

  it("securityDepositRefundRecordedKey is exactly the refund id", () => {
    expect(securityDepositRefundRecordedKey("refund1")).toBe("refund1");
  });
});

describe("reschedulable event keys (embed the scheduled instant)", () => {
  it("maintenanceScheduledKey changes when the work order is rescheduled to a new instant", () => {
    const first = maintenanceScheduledKey("wo1", new Date("2026-06-15T08:00:00Z"));
    const rescheduled = maintenanceScheduledKey("wo1", new Date("2026-06-20T10:00:00Z"));
    expect(first).not.toBe(rescheduled);
  });

  it("maintenanceScheduledKey is stable for the same instant", () => {
    const a = maintenanceScheduledKey("wo1", new Date("2026-06-15T08:00:00Z"));
    const b = maintenanceScheduledKey("wo1", new Date("2026-06-15T08:00:00Z"));
    expect(a).toBe(b);
  });

  it("moveInScheduledKey changes on reschedule", () => {
    const first = moveInScheduledKey("mi1", new Date("2026-06-15T08:00:00Z"));
    const rescheduled = moveInScheduledKey("mi1", new Date("2026-06-20T10:00:00Z"));
    expect(first).not.toBe(rescheduled);
  });

  it("moveOutScheduledKey changes on reschedule", () => {
    const first = moveOutScheduledKey("mo1", new Date("2026-06-15T08:00:00Z"));
    const rescheduled = moveOutScheduledKey("mo1", new Date("2026-06-20T10:00:00Z"));
    expect(first).not.toBe(rescheduled);
  });

  it("distinguishes different business records scheduled at the identical instant", () => {
    const instant = new Date("2026-06-15T08:00:00Z");
    expect(moveInScheduledKey("mi1", instant)).not.toBe(moveInScheduledKey("mi2", instant));
  });
});
