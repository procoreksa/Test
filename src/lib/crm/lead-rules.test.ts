import { describe, it, expect } from "vitest";
import {
  computeConversionRate,
  findDuplicateMatches,
  validateLostReason,
  isActiveLeadStatus,
  followUpBucket,
  buildLeadFullName,
  type DuplicateCandidate,
} from "./lead-rules";

describe("computeConversionRate", () => {
  it("is WON / (WON + LOST), never including active leads", () => {
    expect(computeConversionRate(1, 2)).toBeCloseTo(33.3, 1);
  });

  it("is 100 when every closed lead was won", () => {
    expect(computeConversionRate(5, 0)).toBe(100);
  });

  it("is 0 when every closed lead was lost", () => {
    expect(computeConversionRate(0, 5)).toBe(0);
  });

  it("is 0 (not NaN) when there are no closed leads at all", () => {
    expect(computeConversionRate(0, 0)).toBe(0);
  });
});

function candidate(overrides: Partial<DuplicateCandidate>): DuplicateCandidate {
  return {
    id: "lead-1",
    leadNumber: "LEAD-000001",
    fullName: "Existing Lead",
    mobile: "0501234567",
    normalizedMobile: "966501234567",
    email: "existing@example.com",
    status: "NEW",
    assignedToUserId: null,
    ...overrides,
  };
}

describe("findDuplicateMatches", () => {
  it("matches on normalized mobile across different input formats", () => {
    const matches = findDuplicateMatches([candidate({})], { mobile: "+966501234567" });
    expect(matches).toHaveLength(1);
    expect(matches[0].matchedOn).toBe("mobile");
  });

  it("matches on case-insensitive email when mobile differs", () => {
    const matches = findDuplicateMatches([candidate({})], { mobile: "0559876543", email: "EXISTING@example.com" });
    expect(matches).toHaveLength(1);
    expect(matches[0].matchedOn).toBe("email");
  });

  it("returns no matches for a genuinely new lead", () => {
    const matches = findDuplicateMatches([candidate({})], { mobile: "0559876543", email: "new@example.com" });
    expect(matches).toHaveLength(0);
  });

  it("never throws or blocks - it just returns candidates for the caller to warn with", () => {
    expect(() => findDuplicateMatches([candidate({}), candidate({ id: "lead-2", leadNumber: "LEAD-000002" })], { mobile: "0501234567" })).not.toThrow();
  });
});

describe("validateLostReason", () => {
  it("requires a note when reason is OTHER", () => {
    expect(validateLostReason("OTHER", null)).toBe("lostReasonNoteRequired");
    expect(validateLostReason("OTHER", "   ")).toBe("lostReasonNoteRequired");
    expect(validateLostReason("OTHER", "Went with a competitor's unit")).toBeNull();
  });

  it("does not require a note for any other reason", () => {
    expect(validateLostReason("PRICE", null)).toBeNull();
    expect(validateLostReason("BUDGET", undefined)).toBeNull();
  });
});

describe("isActiveLeadStatus / followUpBucket", () => {
  it("WON/LOST/ARCHIVED are not active", () => {
    expect(isActiveLeadStatus("WON")).toBe(false);
    expect(isActiveLeadStatus("LOST")).toBe(false);
    expect(isActiveLeadStatus("ARCHIVED")).toBe(false);
  });

  it("NEW/CONTACTED/QUALIFIED are active", () => {
    expect(isActiveLeadStatus("NEW")).toBe(true);
    expect(isActiveLeadStatus("CONTACTED")).toBe(true);
    expect(isActiveLeadStatus("QUALIFIED")).toBe(true);
  });

  it("buckets a past follow-up as overdue, only for active leads", () => {
    const now = new Date("2026-06-15T12:00:00Z");
    expect(followUpBucket("NEW", new Date("2026-06-14T09:00:00Z"), now)).toBe("overdue");
    expect(followUpBucket("WON", new Date("2026-06-14T09:00:00Z"), now)).toBeNull();
  });

  it("buckets today's follow-up as today", () => {
    const now = new Date("2026-06-15T12:00:00Z");
    expect(followUpBucket("QUALIFIED", new Date("2026-06-15T18:00:00Z"), now)).toBe("today");
  });

  it("buckets a future follow-up as upcoming", () => {
    const now = new Date("2026-06-15T12:00:00Z");
    expect(followUpBucket("QUALIFIED", new Date("2026-06-20T09:00:00Z"), now)).toBe("upcoming");
  });

  it("returns null when there is no follow-up date set", () => {
    expect(followUpBucket("NEW", null, new Date())).toBeNull();
  });
});

describe("buildLeadFullName", () => {
  it("joins first and last name for individual leads", () => {
    expect(buildLeadFullName({ leadType: "INDIVIDUAL", firstName: "Sara", lastName: "Al-Otaibi" })).toBe("Sara Al-Otaibi");
  });

  it("uses companyName for corporate leads", () => {
    expect(buildLeadFullName({ leadType: "CORPORATE", firstName: "Contact", lastName: "Person", companyName: "Sinopec" })).toBe("Sinopec");
  });

  it("falls back to companyName if an individual lead has no name parts", () => {
    expect(buildLeadFullName({ leadType: "INDIVIDUAL", companyName: "Fallback Co" })).toBe("Fallback Co");
  });
});
