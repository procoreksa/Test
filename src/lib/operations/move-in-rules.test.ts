import { describe, it, expect } from "vitest";
import {
  isValidMoveInTransition,
  isMoveInEditable,
  blocksNewMoveInForContract,
  isInspectionItemComplete,
  computeInspectionProgress,
  isReadyForHandoverEligible,
  computeDefectSummary,
  validateMoveInCompletion,
  isMoveInOverdue,
  getDefaultInspectionChecklist,
  REQUIRED_METER_TYPES,
  type MoveInCompletionInput,
} from "./move-in-rules";

describe("isValidMoveInTransition", () => {
  it("allows the canonical DRAFT -> SCHEDULED -> IN_PROGRESS -> READY_FOR_HANDOVER -> COMPLETED chain", () => {
    expect(isValidMoveInTransition("DRAFT", "SCHEDULED")).toBe(true);
    expect(isValidMoveInTransition("SCHEDULED", "IN_PROGRESS")).toBe(true);
    expect(isValidMoveInTransition("IN_PROGRESS", "READY_FOR_HANDOVER")).toBe(true);
    expect(isValidMoveInTransition("READY_FOR_HANDOVER", "COMPLETED")).toBe(true);
  });

  it("allows DRAFT to skip straight to IN_PROGRESS (schedule is optional)", () => {
    expect(isValidMoveInTransition("DRAFT", "IN_PROGRESS")).toBe(true);
  });

  it("allows READY_FOR_HANDOVER back to IN_PROGRESS for corrections before completion", () => {
    expect(isValidMoveInTransition("READY_FOR_HANDOVER", "IN_PROGRESS")).toBe(true);
  });

  it("allows cancellation from every non-terminal status", () => {
    for (const from of ["DRAFT", "SCHEDULED", "IN_PROGRESS", "READY_FOR_HANDOVER"] as const) {
      expect(isValidMoveInTransition(from, "CANCELLED")).toBe(true);
    }
  });

  it("rejects any move out of COMPLETED or CANCELLED - both terminal", () => {
    for (const terminal of ["COMPLETED", "CANCELLED"] as const) {
      expect(isValidMoveInTransition(terminal, "IN_PROGRESS")).toBe(false);
      expect(isValidMoveInTransition(terminal, "SCHEDULED")).toBe(false);
      expect(isValidMoveInTransition(terminal, "CANCELLED")).toBe(false);
    }
  });

  it("rejects an invalid skip like SCHEDULED -> COMPLETED", () => {
    expect(isValidMoveInTransition("SCHEDULED", "COMPLETED")).toBe(false);
  });
});

describe("isMoveInEditable", () => {
  it("only IN_PROGRESS and READY_FOR_HANDOVER are editable", () => {
    expect(isMoveInEditable("IN_PROGRESS")).toBe(true);
    expect(isMoveInEditable("READY_FOR_HANDOVER")).toBe(true);
    for (const status of ["DRAFT", "SCHEDULED", "COMPLETED", "CANCELLED"] as const) {
      expect(isMoveInEditable(status)).toBe(false);
    }
  });
});

describe("blocksNewMoveInForContract (one active/completed Move-In per Contract)", () => {
  it("every status except CANCELLED blocks a new Move-In for the same Contract", () => {
    for (const status of ["DRAFT", "SCHEDULED", "IN_PROGRESS", "READY_FOR_HANDOVER", "COMPLETED"] as const) {
      expect(blocksNewMoveInForContract(status)).toBe(true);
    }
    expect(blocksNewMoveInForContract("CANCELLED")).toBe(false);
  });
});

describe("computeInspectionProgress", () => {
  it("counts only applicable items in the denominator (Step 29 example: 34/40 = 85%)", () => {
    const items = [
      ...Array.from({ length: 34 }, () => ({ isApplicable: true, condition: "GOOD" as const })),
      ...Array.from({ length: 6 }, () => ({ isApplicable: true, condition: null })),
    ];
    const progress = computeInspectionProgress(items);
    expect(progress.completed).toBe(34);
    expect(progress.total).toBe(40);
    expect(progress.percent).toBe(85);
  });

  it("excludes non-applicable items entirely, even if they have no condition set", () => {
    const items = [
      { isApplicable: true, condition: "GOOD" as const },
      { isApplicable: false, condition: null },
      { isApplicable: false, condition: null },
    ];
    const progress = computeInspectionProgress(items);
    expect(progress.total).toBe(1);
    expect(progress.completed).toBe(1);
    expect(progress.percent).toBe(100);
  });

  it("is 100% when there are no applicable items at all (never divide by zero)", () => {
    expect(computeInspectionProgress([]).percent).toBe(100);
    expect(computeInspectionProgress([{ isApplicable: false, condition: null }]).percent).toBe(100);
  });
});

describe("isInspectionItemComplete", () => {
  it("a non-applicable item is always complete regardless of condition", () => {
    expect(isInspectionItemComplete({ isApplicable: false, condition: null })).toBe(true);
  });
  it("an applicable item is complete only once a condition is set", () => {
    expect(isInspectionItemComplete({ isApplicable: true, condition: null })).toBe(false);
    expect(isInspectionItemComplete({ isApplicable: true, condition: "GOOD" })).toBe(true);
  });
});

describe("isReadyForHandoverEligible", () => {
  it("requires every applicable item to have a condition, but not acknowledgements", () => {
    const complete = [
      { isApplicable: true, condition: "GOOD" as const },
      { isApplicable: false, condition: null },
    ];
    expect(isReadyForHandoverEligible(complete)).toBe(true);

    const incomplete = [{ isApplicable: true, condition: null }];
    expect(isReadyForHandoverEligible(incomplete)).toBe(false);
  });
});

describe("computeDefectSummary", () => {
  it("tallies requiresAttention/damaged/notWorking/poor, excluding non-applicable items", () => {
    const items = [
      { isApplicable: true, condition: "DAMAGED" as const, requiresAttention: true },
      { isApplicable: true, condition: "NOT_WORKING" as const, requiresAttention: true },
      { isApplicable: true, condition: "POOR" as const, requiresAttention: false },
      { isApplicable: true, condition: "GOOD" as const, requiresAttention: false },
      { isApplicable: false, condition: "DAMAGED" as const, requiresAttention: true }, // excluded - not applicable
    ];
    const summary = computeDefectSummary(items);
    expect(summary.totalItems).toBe(4);
    expect(summary.requiresAttentionCount).toBe(2);
    expect(summary.damagedCount).toBe(1);
    expect(summary.notWorkingCount).toBe(1);
    expect(summary.poorCount).toBe(1);
  });
});

describe("validateMoveInCompletion", () => {
  function baseInput(overrides: Partial<MoveInCompletionInput> = {}): MoveInCompletionInput {
    return {
      handoverDate: new Date("2027-01-01"),
      inspectionItems: [{ isApplicable: true, condition: "GOOD" }],
      meterReadingTypes: [...REQUIRED_METER_TYPES],
      keyItemCount: 1,
      noKeysToRecord: false,
      isFurnished: false,
      inventoryItemCount: 0,
      tenantAcknowledgedAt: new Date("2027-01-01"),
      tenantAcknowledgementOverride: false,
      staffAcknowledgedAt: new Date("2027-01-01"),
      ...overrides,
    };
  }

  it("passes when every requirement is satisfied", () => {
    const result = validateMoveInCompletion(baseInput());
    expect(result.canComplete).toBe(true);
    expect(result.missing).toEqual([]);
  });

  it("requires a handoverDate", () => {
    const result = validateMoveInCompletion(baseInput({ handoverDate: null }));
    expect(result.missing).toContain("HANDOVER_DATE");
  });

  it("requires the inspection checklist fully complete", () => {
    const result = validateMoveInCompletion(baseInput({ inspectionItems: [{ isApplicable: true, condition: null }] }));
    expect(result.missing).toContain("INSPECTION_INCOMPLETE");
  });

  it("requires ELECTRICITY and WATER meter readings", () => {
    const result = validateMoveInCompletion(baseInput({ meterReadingTypes: ["WATER"] }));
    expect(result.missing).toContain("REQUIRED_METERS_MISSING");
  });

  it("requires keys recorded, or an explicit noKeysToRecord flag", () => {
    expect(validateMoveInCompletion(baseInput({ keyItemCount: 0, noKeysToRecord: false })).missing).toContain("KEYS_NOT_RECORDED");
    expect(validateMoveInCompletion(baseInput({ keyItemCount: 0, noKeysToRecord: true })).missing).not.toContain("KEYS_NOT_RECORDED");
  });

  it("requires inventory only for a furnished unit - never for unfurnished", () => {
    expect(validateMoveInCompletion(baseInput({ isFurnished: true, inventoryItemCount: 0 })).missing).toContain(
      "INVENTORY_REQUIRED_FOR_FURNISHED_UNIT"
    );
    expect(validateMoveInCompletion(baseInput({ isFurnished: false, inventoryItemCount: 0 })).missing).not.toContain(
      "INVENTORY_REQUIRED_FOR_FURNISHED_UNIT"
    );
    expect(validateMoveInCompletion(baseInput({ isFurnished: true, inventoryItemCount: 3 })).missing).not.toContain(
      "INVENTORY_REQUIRED_FOR_FURNISHED_UNIT"
    );
  });

  it("requires tenant acknowledgement OR an authorized override, never both missing", () => {
    expect(
      validateMoveInCompletion(baseInput({ tenantAcknowledgedAt: null, tenantAcknowledgementOverride: false })).missing
    ).toContain("TENANT_ACKNOWLEDGEMENT_MISSING");
    expect(
      validateMoveInCompletion(baseInput({ tenantAcknowledgedAt: null, tenantAcknowledgementOverride: true })).missing
    ).not.toContain("TENANT_ACKNOWLEDGEMENT_MISSING");
  });

  it("requires staff acknowledgement unconditionally - no override", () => {
    expect(validateMoveInCompletion(baseInput({ staffAcknowledgedAt: null })).missing).toContain("STAFF_ACKNOWLEDGEMENT_MISSING");
  });

  it("returns every missing requirement at once, not just the first", () => {
    const result = validateMoveInCompletion(
      baseInput({ handoverDate: null, staffAcknowledgedAt: null, keyItemCount: 0, noKeysToRecord: false })
    );
    expect(result.missing).toEqual(
      expect.arrayContaining(["HANDOVER_DATE", "STAFF_ACKNOWLEDGEMENT_MISSING", "KEYS_NOT_RECORDED"])
    );
    expect(result.canComplete).toBe(false);
  });
});

describe("isMoveInOverdue", () => {
  const now = new Date("2027-06-15T00:00:00Z");

  it("is overdue when scheduledAt has passed and status is still active", () => {
    for (const status of ["DRAFT", "SCHEDULED", "IN_PROGRESS", "READY_FOR_HANDOVER"] as const) {
      expect(isMoveInOverdue(new Date("2027-06-14T00:00:00Z"), status, now)).toBe(true);
    }
  });

  it("is never overdue once COMPLETED or CANCELLED, even if scheduledAt has long passed", () => {
    for (const status of ["COMPLETED", "CANCELLED"] as const) {
      expect(isMoveInOverdue(new Date("2020-01-01T00:00:00Z"), status, now)).toBe(false);
    }
  });

  it("is not overdue when scheduledAt is null or in the future", () => {
    expect(isMoveInOverdue(null, "SCHEDULED", now)).toBe(false);
    expect(isMoveInOverdue(new Date("2027-06-16T00:00:00Z"), "SCHEDULED", now)).toBe(false);
  });
});

describe("getDefaultInspectionChecklist", () => {
  it("covers every InspectionCategory value used by the brief's worked examples", () => {
    const checklist = getDefaultInspectionChecklist();
    const categories = new Set(checklist.map((i) => i.category));
    for (const expected of ["ENTRANCE", "LIVING_ROOM", "KITCHEN", "BATHROOM", "BEDROOM", "AIR_CONDITIONING", "ELECTRICAL", "SAFETY"] as const) {
      expect(categories.has(expected)).toBe(true);
    }
  });

  it("every item has both an English and Arabic name", () => {
    for (const item of getDefaultInspectionChecklist()) {
      expect(item.itemName.length).toBeGreaterThan(0);
      expect(item.itemNameAr.length).toBeGreaterThan(0);
    }
  });

  it("marks conditionally-present items (dishwasher, bathtub, curtains) as not applicable by default", () => {
    const checklist = getDefaultInspectionChecklist();
    const dishwasher = checklist.find((i) => i.itemName === "Dishwasher");
    expect(dishwasher?.isApplicable).toBe(false);
  });
});
