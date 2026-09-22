import { describe, it, expect } from "vitest";
import { Prisma } from "@prisma/client";
import { pickEffectiveOwnershipLevel, type OwnershipRow } from "@/lib/ownership";

function row(ownerId: string, percentage: number): OwnershipRow {
  return { id: `ownership-${ownerId}`, ownerId, ownershipPercentage: new Prisma.Decimal(percentage) };
}

describe("pickEffectiveOwnershipLevel (unit -> building -> compound inheritance)", () => {
  it("uses the unit's own ownership when it has one, ignoring building/compound", () => {
    const result = pickEffectiveOwnershipLevel([
      { level: "UNIT", rows: [row("unit-owner", 100)] },
      { level: "BUILDING", rows: [row("building-owner", 100)] },
      { level: "COMPOUND", rows: [row("compound-owner", 100)] },
    ]);
    expect(result).toHaveLength(1);
    expect(result[0].ownerId).toBe("unit-owner");
    expect(result[0].sourceLevel).toBe("UNIT");
  });

  it("falls through to the building when the unit has no ownership record", () => {
    const result = pickEffectiveOwnershipLevel([
      { level: "UNIT", rows: [] },
      { level: "BUILDING", rows: [row("building-owner", 100)] },
      { level: "COMPOUND", rows: [row("compound-owner", 100)] },
    ]);
    expect(result).toHaveLength(1);
    expect(result[0].ownerId).toBe("building-owner");
    expect(result[0].sourceLevel).toBe("BUILDING");
  });

  it("falls through all the way to the compound when neither the unit nor building has ownership", () => {
    const result = pickEffectiveOwnershipLevel([
      { level: "UNIT", rows: [] },
      { level: "BUILDING", rows: [] },
      { level: "COMPOUND", rows: [row("compound-owner-a", 60), row("compound-owner-b", 40)] },
    ]);
    expect(result).toHaveLength(2);
    expect(result.map((r) => r.ownerId)).toEqual(["compound-owner-a", "compound-owner-b"]);
    expect(result.every((r) => r.sourceLevel === "COMPOUND")).toBe(true);
  });

  it("returns an empty array when nothing is configured anywhere in the chain", () => {
    const result = pickEffectiveOwnershipLevel([
      { level: "UNIT", rows: [] },
      { level: "BUILDING", rows: [] },
      { level: "COMPOUND", rows: [] },
    ]);
    expect(result).toEqual([]);
  });
});
