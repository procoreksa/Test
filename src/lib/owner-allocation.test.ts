import { describe, it, expect } from "vitest";
import { Prisma } from "@prisma/client";
import { allocateAmountToOwners, defaultLedgerSide } from "@/lib/owner-allocation";

function share(ownerId: string, percentage: number) {
  return { ownerId, percentage: new Prisma.Decimal(percentage) };
}

describe("allocateAmountToOwners", () => {
  it("splits 100,000 SAR 60/40 exactly", () => {
    const result = allocateAmountToOwners(100000, [share("owner-a", 60), share("owner-b", 40)]);
    const byOwner = Object.fromEntries(result.map((r) => [r.ownerId, r.amount.toString()]));
    expect(byOwner["owner-a"]).toBe("60000");
    expect(byOwner["owner-b"]).toBe("40000");
  });

  it("splits an odd amount 50/50 with rounding, still summing exactly to the input", () => {
    const result = allocateAmountToOwners("100.01", [share("owner-a", 50), share("owner-b", 50)]);
    const total = result.reduce((sum, r) => sum.plus(r.amount), new Prisma.Decimal(0));
    expect(total.toString()).toBe("100.01");
    // Deterministic tie-break: both remainders are equal (0.005), so the
    // extra cent goes to whichever ownerId sorts first alphabetically.
    const byOwner = Object.fromEntries(result.map((r) => [r.ownerId, r.amount.toFixed(2)]));
    expect(byOwner["owner-a"]).toBe("50.01");
    expect(byOwner["owner-b"]).toBe("50.00");
  });

  it("gives a single 100% owner the full amount", () => {
    const result = allocateAmountToOwners("12345.67", [share("owner-a", 100)]);
    expect(result).toHaveLength(1);
    expect(result[0].amount.toString()).toBe("12345.67");
  });

  it("never loses or invents money across three uneven owners (33.33/33.33/33.34)", () => {
    const result = allocateAmountToOwners("1000", [share("a", 33.33), share("b", 33.33), share("c", 33.34)]);
    const total = result.reduce((sum, r) => sum.plus(r.amount), new Prisma.Decimal(0));
    expect(total.toString()).toBe("1000");
  });

  it("returns an empty array for no shares", () => {
    expect(allocateAmountToOwners(1000, [])).toEqual([]);
  });
});

describe("defaultLedgerSide", () => {
  it("posts income and owner contributions as credits", () => {
    expect(defaultLedgerSide("RENT_INCOME")).toBe("credit");
    expect(defaultLedgerSide("OTHER_INCOME")).toBe("credit");
    expect(defaultLedgerSide("OWNER_CONTRIBUTION")).toBe("credit");
  });

  it("posts expenses and distributions as debits", () => {
    expect(defaultLedgerSide("MANAGEMENT_FEE")).toBe("debit");
    expect(defaultLedgerSide("MAINTENANCE_EXPENSE")).toBe("debit");
    expect(defaultLedgerSide("OWNER_DISTRIBUTION")).toBe("debit");
  });

  it("throws for ADJUSTMENT/REVERSAL, which must be posted explicitly", () => {
    expect(() => defaultLedgerSide("ADJUSTMENT")).toThrow();
    expect(() => defaultLedgerSide("REVERSAL")).toThrow();
  });
});
