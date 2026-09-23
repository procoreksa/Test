import { describe, it, expect } from "vitest";
import { Prisma } from "@prisma/client";
import type { OwnerLedgerEntryType } from "@prisma/client";
import { summarizeOwnerLedgerEntries, computeOwnerOpeningBalance, buildOwnerStatement } from "@/lib/owner-ledger-rules";

function entry(entryType: OwnerLedgerEntryType, debit: number, credit: number) {
  return { entryType, debit: new Prisma.Decimal(debit), credit: new Prisma.Decimal(credit) };
}

describe("summarizeOwnerLedgerEntries", () => {
  it("balance is the sum of credit minus debit across every entry", () => {
    const result = summarizeOwnerLedgerEntries([entry("RENT_INCOME", 0, 10000), entry("MAINTENANCE_EXPENSE", 2000, 0)]);
    expect(result.balance.toString()).toBe("8000");
  });

  it("income only counts RENT_INCOME and OTHER_INCOME credits, never OWNER_CONTRIBUTION", () => {
    const result = summarizeOwnerLedgerEntries([entry("RENT_INCOME", 0, 5000), entry("OTHER_INCOME", 0, 1000), entry("OWNER_CONTRIBUTION", 0, 20000)]);
    expect(result.totalIncome.toString()).toBe("6000");
    expect(result.balance.toString()).toBe("26000");
  });

  it("expenses only count the six operating-expense types, never OWNER_DISTRIBUTION", () => {
    const result = summarizeOwnerLedgerEntries([
      entry("MANAGEMENT_FEE", 500, 0),
      entry("MAINTENANCE_EXPENSE", 300, 0),
      entry("UTILITY_EXPENSE", 200, 0),
      entry("SERVICE_EXPENSE", 100, 0),
      entry("GOVERNMENT_FEE", 50, 0),
      entry("OTHER_EXPENSE", 25, 0),
      entry("OWNER_DISTRIBUTION", 1000, 0),
    ]);
    expect(result.totalExpenses.toString()).toBe("1175");
    expect(result.totalDistributions.toString()).toBe("1000");
  });

  it("ADJUSTMENT and REVERSAL entries affect balance but neither income nor expense buckets", () => {
    const result = summarizeOwnerLedgerEntries([entry("ADJUSTMENT", 100, 0), entry("REVERSAL", 0, 50)]);
    expect(result.balance.toString()).toBe("-50");
    expect(result.totalIncome.toString()).toBe("0");
    expect(result.totalExpenses.toString()).toBe("0");
  });

  it("returns all zeros for an empty entry list", () => {
    const result = summarizeOwnerLedgerEntries([]);
    expect(result.balance.toString()).toBe("0");
    expect(result.totalIncome.toString()).toBe("0");
    expect(result.totalExpenses.toString()).toBe("0");
    expect(result.totalDistributions.toString()).toBe("0");
  });
});

describe("computeOwnerOpeningBalance", () => {
  it("sums credit minus debit over the given (already pre-period-filtered) entries", () => {
    const balance = computeOwnerOpeningBalance([
      { debit: new Prisma.Decimal(0), credit: new Prisma.Decimal(10000) },
      { debit: new Prisma.Decimal(3000), credit: new Prisma.Decimal(0) },
    ]);
    expect(balance.toString()).toBe("7000");
  });

  it("is zero for no prior entries", () => {
    expect(computeOwnerOpeningBalance([]).toString()).toBe("0");
  });
});

describe("buildOwnerStatement", () => {
  it("never starts a non-empty opening period at zero (Step 33)", () => {
    const opening = [{ debit: new Prisma.Decimal(0), credit: new Prisma.Decimal(5000) }];
    const result = buildOwnerStatement(opening, []);
    expect(result.openingBalance.toString()).toBe("5000");
    expect(result.closingBalance.toString()).toBe("5000");
  });

  it("running balance carries forward row by row starting from the opening balance", () => {
    const opening = [{ debit: new Prisma.Decimal(0), credit: new Prisma.Decimal(1000) }];
    const periodEntries = [
      { id: "e1", entryDate: new Date("2027-01-05"), description: "Rent", descriptionAr: null, ...entry("RENT_INCOME", 0, 2000) },
      { id: "e2", entryDate: new Date("2027-01-10"), description: "Maintenance", descriptionAr: null, ...entry("MAINTENANCE_EXPENSE", 500, 0) },
    ];
    const result = buildOwnerStatement(opening, periodEntries);
    expect(result.rows[0].runningBalance.toString()).toBe("3000");
    expect(result.rows[1].runningBalance.toString()).toBe("2500");
    expect(result.closingBalance.toString()).toBe("2500");
  });

  it("netMovement equals periodCredits minus periodDebits and reconciles opening/closing", () => {
    const opening = [{ debit: new Prisma.Decimal(0), credit: new Prisma.Decimal(1000) }];
    const periodEntries = [
      { id: "e1", entryDate: new Date("2027-02-01"), description: "Rent", descriptionAr: null, ...entry("RENT_INCOME", 0, 4000) },
      { id: "e2", entryDate: new Date("2027-02-02"), description: "Fee", descriptionAr: null, ...entry("MANAGEMENT_FEE", 400, 0) },
    ];
    const result = buildOwnerStatement(opening, periodEntries);
    expect(result.netMovement.toString()).toBe("3600");
    expect(result.openingBalance.plus(result.netMovement).toString()).toBe(result.closingBalance.toString());
  });

  it("classifies totalIncome/totalExpenses/totalDistributions identically to summarizeOwnerLedgerEntries", () => {
    const periodEntries = [
      { id: "e1", entryDate: new Date("2027-03-01"), description: "Rent", descriptionAr: null, ...entry("RENT_INCOME", 0, 10000) },
      { id: "e2", entryDate: new Date("2027-03-02"), description: "Distribution", descriptionAr: null, ...entry("OWNER_DISTRIBUTION", 3000, 0) },
    ];
    const result = buildOwnerStatement([], periodEntries);
    expect(result.totalIncome.toString()).toBe("10000");
    expect(result.totalDistributions.toString()).toBe("3000");
    expect(result.totalExpenses.toString()).toBe("0");
  });
});
