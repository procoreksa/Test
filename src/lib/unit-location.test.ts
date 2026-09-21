import { describe, it, expect } from "vitest";
import { unitLocationLabel } from "@/lib/unit-location";

function unit(overrides: {
  buildingName?: string;
  buildingNameAr?: string | null;
  compoundName?: string;
  compoundArabicName?: string | null;
}) {
  return {
    floor: {
      name: "Ground Floor",
      building: {
        name: overrides.buildingName ?? "Main Building",
        nameAr: overrides.buildingNameAr ?? null,
        compound: {
          name: overrides.compoundName ?? "Al Yasmin Tower",
          arabicName: overrides.compoundArabicName ?? null,
        },
      },
    },
  };
}

describe("unitLocationLabel", () => {
  it("uses the English compound/building name in English locale", () => {
    const label = unitLocationLabel("en", unit({}));
    expect(label).toBe("Al Yasmin Tower / Main Building");
  });

  it("uses the Arabic compound/building name in Arabic locale when present", () => {
    const label = unitLocationLabel(
      "ar",
      unit({ compoundArabicName: "برج الياسمين", buildingNameAr: "المبنى الرئيسي" })
    );
    expect(label).toBe("برج الياسمين / المبنى الرئيسي");
  });

  it("falls back to the English name in Arabic locale when no Arabic name exists (shim data from the migration)", () => {
    const label = unitLocationLabel("ar", unit({}));
    expect(label).toBe("Al Yasmin Tower / Main Building");
  });
});
