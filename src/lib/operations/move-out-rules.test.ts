import { describe, it, expect } from "vitest";
import {
  isValidMoveOutTransition,
  isMoveOutTerminal,
  isMoveOutEditable,
  blocksNewMoveOutForContract,
  moveOutBlocksContractRenewal,
  isFindingsReviewEligible,
  isReadyForClosureEligible,
  isUnsafeToVacate,
  reconcileKeyReturns,
  isKeyReturnSatisfied,
  validateMoveOutCompletion,
  REQUIRED_MOVE_OUT_METER_TYPES,
  diffInventoryItems,
  computeMeterConsumption,
  compareInspectionCondition,
  computeDefectSummary,
  type MoveOutCompletionInput,
  type KeyReconciliationResult,
} from "./move-out-rules";

describe("isValidMoveOutTransition", () => {
  it("allows the canonical DRAFT -> SCHEDULED -> IN_PROGRESS -> PENDING_FINDINGS_REVIEW -> READY_FOR_CLOSURE -> COMPLETED chain", () => {
    expect(isValidMoveOutTransition("DRAFT", "SCHEDULED")).toBe(true);
    expect(isValidMoveOutTransition("SCHEDULED", "IN_PROGRESS")).toBe(true);
    expect(isValidMoveOutTransition("IN_PROGRESS", "PENDING_FINDINGS_REVIEW")).toBe(true);
    expect(isValidMoveOutTransition("PENDING_FINDINGS_REVIEW", "READY_FOR_CLOSURE")).toBe(true);
    expect(isValidMoveOutTransition("READY_FOR_CLOSURE", "COMPLETED")).toBe(true);
  });

  it("allows DRAFT to skip straight to IN_PROGRESS (schedule is optional)", () => {
    expect(isValidMoveOutTransition("DRAFT", "IN_PROGRESS")).toBe(true);
  });

  it("allows one-step-back corrections (PENDING_FINDINGS_REVIEW -> IN_PROGRESS, READY_FOR_CLOSURE -> PENDING_FINDINGS_REVIEW)", () => {
    expect(isValidMoveOutTransition("PENDING_FINDINGS_REVIEW", "IN_PROGRESS")).toBe(true);
    expect(isValidMoveOutTransition("READY_FOR_CLOSURE", "PENDING_FINDINGS_REVIEW")).toBe(true);
  });

  it("allows cancellation from every non-terminal status", () => {
    for (const from of ["DRAFT", "SCHEDULED", "IN_PROGRESS", "PENDING_FINDINGS_REVIEW", "READY_FOR_CLOSURE"] as const) {
      expect(isValidMoveOutTransition(from, "CANCELLED")).toBe(true);
    }
  });

  it("rejects any move out of COMPLETED or CANCELLED - both terminal", () => {
    for (const terminal of ["COMPLETED", "CANCELLED"] as const) {
      expect(isValidMoveOutTransition(terminal, "IN_PROGRESS")).toBe(false);
      expect(isValidMoveOutTransition(terminal, "SCHEDULED")).toBe(false);
      expect(isValidMoveOutTransition(terminal, "READY_FOR_CLOSURE")).toBe(false);
      expect(isValidMoveOutTransition(terminal, "CANCELLED")).toBe(false);
    }
  });

  it("rejects invalid skips", () => {
    expect(isValidMoveOutTransition("SCHEDULED", "COMPLETED")).toBe(false);
    expect(isValidMoveOutTransition("DRAFT", "READY_FOR_CLOSURE")).toBe(false);
    expect(isValidMoveOutTransition("IN_PROGRESS", "COMPLETED")).toBe(false);
    expect(isValidMoveOutTransition("SCHEDULED", "DRAFT")).toBe(false);
  });

  it("exhaustively covers every (from, to) pair - no unintended legal transitions", () => {
    const statuses = ["DRAFT", "SCHEDULED", "IN_PROGRESS", "PENDING_FINDINGS_REVIEW", "READY_FOR_CLOSURE", "COMPLETED", "CANCELLED"] as const;
    const expectedLegal = new Set([
      "DRAFT->SCHEDULED",
      "DRAFT->IN_PROGRESS",
      "DRAFT->CANCELLED",
      "SCHEDULED->IN_PROGRESS",
      "SCHEDULED->CANCELLED",
      "IN_PROGRESS->PENDING_FINDINGS_REVIEW",
      "IN_PROGRESS->CANCELLED",
      "PENDING_FINDINGS_REVIEW->READY_FOR_CLOSURE",
      "PENDING_FINDINGS_REVIEW->IN_PROGRESS",
      "PENDING_FINDINGS_REVIEW->CANCELLED",
      "READY_FOR_CLOSURE->COMPLETED",
      "READY_FOR_CLOSURE->PENDING_FINDINGS_REVIEW",
      "READY_FOR_CLOSURE->CANCELLED",
    ]);
    for (const from of statuses) {
      for (const to of statuses) {
        if (from === to) continue;
        const key = `${from}->${to}`;
        expect(isValidMoveOutTransition(from, to)).toBe(expectedLegal.has(key));
      }
    }
  });
});

describe("isMoveOutTerminal", () => {
  it("only COMPLETED and CANCELLED are terminal", () => {
    expect(isMoveOutTerminal("COMPLETED")).toBe(true);
    expect(isMoveOutTerminal("CANCELLED")).toBe(true);
    for (const status of ["DRAFT", "SCHEDULED", "IN_PROGRESS", "PENDING_FINDINGS_REVIEW", "READY_FOR_CLOSURE"] as const) {
      expect(isMoveOutTerminal(status)).toBe(false);
    }
  });
});

describe("isMoveOutEditable", () => {
  it("only IN_PROGRESS and PENDING_FINDINGS_REVIEW are editable", () => {
    expect(isMoveOutEditable("IN_PROGRESS")).toBe(true);
    expect(isMoveOutEditable("PENDING_FINDINGS_REVIEW")).toBe(true);
    for (const status of ["DRAFT", "SCHEDULED", "READY_FOR_CLOSURE", "COMPLETED", "CANCELLED"] as const) {
      expect(isMoveOutEditable(status)).toBe(false);
    }
  });
});

describe("blocksNewMoveOutForContract / moveOutBlocksContractRenewal (shared predicate)", () => {
  it("every status except CANCELLED blocks a new Move-Out or a renewal for the same Contract", () => {
    for (const status of ["DRAFT", "SCHEDULED", "IN_PROGRESS", "PENDING_FINDINGS_REVIEW", "READY_FOR_CLOSURE", "COMPLETED"] as const) {
      expect(blocksNewMoveOutForContract(status)).toBe(true);
      expect(moveOutBlocksContractRenewal(status)).toBe(true);
    }
  });

  it("a CANCELLED Move-Out blocks neither a new Move-Out nor a renewal", () => {
    expect(blocksNewMoveOutForContract("CANCELLED")).toBe(false);
    expect(moveOutBlocksContractRenewal("CANCELLED")).toBe(false);
  });
});

describe("isFindingsReviewEligible", () => {
  it("requires every applicable inspection item to have a recorded condition", () => {
    const complete = [
      { isApplicable: true, condition: "GOOD" as const },
      { isApplicable: false, condition: null },
    ];
    expect(isFindingsReviewEligible(complete)).toBe(true);

    const incomplete = [{ isApplicable: true, condition: null }];
    expect(isFindingsReviewEligible(incomplete)).toBe(false);
  });

  it("is eligible with zero applicable items (never divide by zero / never block a trivial checklist)", () => {
    expect(isFindingsReviewEligible([])).toBe(true);
  });
});

describe("isReadyForClosureEligible", () => {
  it("requires findingsReviewedAt to be set", () => {
    expect(isReadyForClosureEligible(null)).toBe(false);
    expect(isReadyForClosureEligible(new Date("2027-01-01"))).toBe(true);
  });
});

describe("computeDefectSummary (reused from move-in-rules)", () => {
  it("tallies requiresAttention/damaged/notWorking/poor for Move-Out inspection items", () => {
    const items = [
      { isApplicable: true, condition: "DAMAGED" as const, requiresAttention: true },
      { isApplicable: true, condition: "GOOD" as const, requiresAttention: false },
    ];
    const summary = computeDefectSummary(items);
    expect(summary.totalItems).toBe(2);
    expect(summary.requiresAttentionCount).toBe(1);
    expect(summary.damagedCount).toBe(1);
  });
});

describe("isUnsafeToVacate", () => {
  it("is safe when there is no other active contract and no active reservation", () => {
    expect(isUnsafeToVacate({ otherActiveContractCount: 0, activeReservationCount: 0 })).toBe(false);
  });

  it("is unsafe when another ACTIVE contract already exists for the unit", () => {
    expect(isUnsafeToVacate({ otherActiveContractCount: 1, activeReservationCount: 0 })).toBe(true);
  });

  it("is unsafe when the unit is held by a live (PENDING/CONFIRMED) reservation", () => {
    expect(isUnsafeToVacate({ otherActiveContractCount: 0, activeReservationCount: 1 })).toBe(true);
  });

  it("is unsafe when both conditions are true at once", () => {
    expect(isUnsafeToVacate({ otherActiveContractCount: 1, activeReservationCount: 1 })).toBe(true);
  });
});

describe("reconcileKeyReturns", () => {
  it("matches expected and returned keys by keyType + description, case/whitespace-insensitively", () => {
    const result = reconcileKeyReturns(
      [{ keyType: "KEY", description: "  Main Door Key ", quantity: 2 }],
      [{ keyType: "KEY", description: "main door key", quantity: 2 }]
    );
    expect(result.lines).toHaveLength(1);
    expect(result.lines[0].fullyReturned).toBe(true);
    expect(result.allReturned).toBe(true);
    expect(result.hasExpectations).toBe(true);
  });

  it("sums multiple returned rows for the same key before comparing to the expected quantity", () => {
    const result = reconcileKeyReturns(
      [{ keyType: "REMOTE", description: "Garage remote", quantity: 2 }],
      [
        { keyType: "REMOTE", description: "Garage remote", quantity: 1 },
        { keyType: "REMOTE", description: "Garage remote", quantity: 1 },
      ]
    );
    expect(result.lines[0].returnedQuantity).toBe(2);
    expect(result.lines[0].fullyReturned).toBe(true);
  });

  it("flags a short return as not fully returned", () => {
    const result = reconcileKeyReturns([{ keyType: "KEY", description: "Main door key", quantity: 2 }], [{ keyType: "KEY", description: "Main door key", quantity: 1 }]);
    expect(result.lines[0].fullyReturned).toBe(false);
    expect(result.allReturned).toBe(false);
  });

  it("treats an expected key with zero matching returns as not fully returned", () => {
    const result = reconcileKeyReturns([{ keyType: "ACCESS_CARD", description: "Lobby card", quantity: 1 }], []);
    expect(result.lines[0].returnedQuantity).toBe(0);
    expect(result.lines[0].fullyReturned).toBe(false);
  });

  it("hasExpectations is false and allReturned is vacuously true with no baseline expectations", () => {
    const result = reconcileKeyReturns([], [{ keyType: "KEY", description: "Spare key", quantity: 1 }]);
    expect(result.hasExpectations).toBe(false);
    expect(result.allReturned).toBe(true);
  });
});

describe("isKeyReturnSatisfied", () => {
  const satisfied: KeyReconciliationResult = { lines: [], hasExpectations: true, allReturned: true };
  const unsatisfied: KeyReconciliationResult = { lines: [], hasExpectations: true, allReturned: false };
  const noBaseline: KeyReconciliationResult = { lines: [], hasExpectations: false, allReturned: true };

  it("noKeysToReturn always satisfies the requirement, overriding everything else", () => {
    expect(isKeyReturnSatisfied(unsatisfied, 0, true)).toBe(true);
  });

  it("with a baseline, requires every expected key to reconcile as fully returned", () => {
    expect(isKeyReturnSatisfied(satisfied, 5, false)).toBe(true);
    expect(isKeyReturnSatisfied(unsatisfied, 5, false)).toBe(false);
  });

  it("with no baseline, falls back to at least one recorded key item", () => {
    expect(isKeyReturnSatisfied(noBaseline, 0, false)).toBe(false);
    expect(isKeyReturnSatisfied(noBaseline, 1, false)).toBe(true);
  });
});

describe("validateMoveOutCompletion", () => {
  function baseInput(overrides: Partial<MoveOutCompletionInput> = {}): MoveOutCompletionInput {
    return {
      vacateDate: new Date("2027-01-01"),
      inspectionItems: [{ isApplicable: true, condition: "GOOD" }],
      findingsReviewedAt: new Date("2027-01-01"),
      meterReadingTypes: [...REQUIRED_MOVE_OUT_METER_TYPES],
      keyReconciliation: { lines: [], hasExpectations: false, allReturned: true },
      recordedKeyCount: 1,
      noKeysToReturn: false,
      tenantAcknowledgedAt: new Date("2027-01-01"),
      tenantAcknowledgementOverride: false,
      staffAcknowledgedAt: new Date("2027-01-01"),
      ...overrides,
    };
  }

  it("passes when every requirement is satisfied", () => {
    const result = validateMoveOutCompletion(baseInput());
    expect(result.canComplete).toBe(true);
    expect(result.missing).toEqual([]);
  });

  it("requires a vacateDate", () => {
    expect(validateMoveOutCompletion(baseInput({ vacateDate: null })).missing).toContain("VACATE_DATE_MISSING");
  });

  it("requires the inspection checklist fully complete", () => {
    const result = validateMoveOutCompletion(baseInput({ inspectionItems: [{ isApplicable: true, condition: null }] }));
    expect(result.missing).toContain("INSPECTION_INCOMPLETE");
  });

  it("requires findings to have been reviewed", () => {
    expect(validateMoveOutCompletion(baseInput({ findingsReviewedAt: null })).missing).toContain("FINDINGS_NOT_REVIEWED");
  });

  it("requires ELECTRICITY and WATER meter readings", () => {
    expect(validateMoveOutCompletion(baseInput({ meterReadingTypes: ["WATER"] })).missing).toContain("REQUIRED_METERS_MISSING");
  });

  it("requires keys reconciled/recorded, or an explicit noKeysToReturn flag", () => {
    expect(
      validateMoveOutCompletion(
        baseInput({ recordedKeyCount: 0, noKeysToReturn: false, keyReconciliation: { lines: [], hasExpectations: false, allReturned: true } })
      ).missing
    ).toContain("KEYS_NOT_RECONCILED");
    expect(
      validateMoveOutCompletion(
        baseInput({ recordedKeyCount: 0, noKeysToReturn: true, keyReconciliation: { lines: [], hasExpectations: false, allReturned: true } })
      ).missing
    ).not.toContain("KEYS_NOT_RECONCILED");
  });

  it("requires tenant acknowledgement OR an authorized override, never both missing", () => {
    expect(validateMoveOutCompletion(baseInput({ tenantAcknowledgedAt: null, tenantAcknowledgementOverride: false })).missing).toContain(
      "TENANT_ACKNOWLEDGEMENT_MISSING"
    );
    expect(validateMoveOutCompletion(baseInput({ tenantAcknowledgedAt: null, tenantAcknowledgementOverride: true })).missing).not.toContain(
      "TENANT_ACKNOWLEDGEMENT_MISSING"
    );
  });

  it("requires staff acknowledgement unconditionally - no override", () => {
    expect(validateMoveOutCompletion(baseInput({ staffAcknowledgedAt: null })).missing).toContain("STAFF_ACKNOWLEDGEMENT_MISSING");
  });

  it("never reports a financial or inventory requirement, whatever the input (Decision 3/4: operational only)", () => {
    const result = validateMoveOutCompletion(baseInput());
    const nonOperationalKeys = ["OUTSTANDING_BALANCE", "INVENTORY_REQUIRED_FOR_FURNISHED_UNIT"];
    for (const key of nonOperationalKeys) {
      expect((result.missing as string[])).not.toContain(key);
    }
  });

  it("returns every missing requirement at once, not just the first", () => {
    const result = validateMoveOutCompletion(
      baseInput({ vacateDate: null, staffAcknowledgedAt: null, recordedKeyCount: 0, noKeysToReturn: false })
    );
    expect(result.missing).toEqual(expect.arrayContaining(["VACATE_DATE_MISSING", "STAFF_ACKNOWLEDGEMENT_MISSING", "KEYS_NOT_RECONCILED"]));
    expect(result.canComplete).toBe(false);
  });
});

describe("diffInventoryItems", () => {
  it("matches items by category+itemName and flags a quantity mismatch", () => {
    const lines = diffInventoryItems(
      [{ category: "BEDROOM", itemName: "Wardrobe", quantity: 1, condition: "GOOD" }],
      [{ category: "BEDROOM", itemName: "Wardrobe", quantity: 1, condition: "FAIR" }]
    );
    expect(lines).toHaveLength(1);
    expect(lines[0].status).toBe("MATCHED");
    expect(lines[0].moveInCondition).toBe("GOOD");
    expect(lines[0].moveOutCondition).toBe("FAIR");
  });

  it("flags a quantity mismatch when counts differ for the same item", () => {
    const lines = diffInventoryItems(
      [{ category: "KITCHEN", itemName: "Chair", quantity: 4, condition: "GOOD" }],
      [{ category: "KITCHEN", itemName: "Chair", quantity: 3, condition: "GOOD" }]
    );
    expect(lines[0].status).toBe("QUANTITY_MISMATCH");
  });

  it("flags an item present at Move-In but missing at Move-Out", () => {
    const lines = diffInventoryItems([{ category: "LIVING_ROOM", itemName: "Sofa", quantity: 1, condition: "GOOD" }], []);
    expect(lines[0].status).toBe("MISSING_AT_MOVE_OUT");
    expect(lines[0].moveOutQuantity).toBeNull();
  });

  it("flags an item present at Move-Out but never recorded at Move-In", () => {
    const lines = diffInventoryItems([], [{ category: "LIVING_ROOM", itemName: "New rug", quantity: 1, condition: "NEW" }]);
    expect(lines[0].status).toBe("ADDED_AT_MOVE_OUT");
    expect(lines[0].moveInQuantity).toBeNull();
  });

  it("is case/whitespace-insensitive on itemName matching", () => {
    const lines = diffInventoryItems(
      [{ category: "BEDROOM", itemName: "  Wardrobe ", quantity: 1, condition: "GOOD" }],
      [{ category: "BEDROOM", itemName: "wardrobe", quantity: 1, condition: "GOOD" }]
    );
    expect(lines).toHaveLength(1);
    expect(lines[0].status).toBe("MATCHED");
  });
});

describe("computeMeterConsumption", () => {
  it("computes consumption as moveOut reading minus moveIn reading", () => {
    const lines = computeMeterConsumption([{ meterType: "ELECTRICITY", reading: 1000 }], [{ meterType: "ELECTRICITY", reading: 1250 }]);
    expect(lines).toHaveLength(1);
    expect(lines[0].consumption).toBe(250);
  });

  it("never stores a negative-looking consumption incorrectly - straight subtraction, caller's concern to flag anomalies", () => {
    const lines = computeMeterConsumption([{ meterType: "WATER", reading: 500 }], [{ meterType: "WATER", reading: 400 }]);
    expect(lines[0].consumption).toBe(-100);
  });

  it("consumption is null when either side is missing a reading for that meter type", () => {
    const onlyMoveIn = computeMeterConsumption([{ meterType: "GAS", reading: 10 }], []);
    expect(onlyMoveIn[0].consumption).toBeNull();
    expect(onlyMoveIn[0].moveOutReading).toBeNull();

    const onlyMoveOut = computeMeterConsumption([], [{ meterType: "GAS", reading: 10 }]);
    expect(onlyMoveOut[0].consumption).toBeNull();
    expect(onlyMoveOut[0].moveInReading).toBeNull();
  });
});

describe("compareInspectionCondition", () => {
  it("flags changed=true when the condition differs between Move-In and Move-Out", () => {
    expect(compareInspectionCondition("GOOD", "FAIR").changed).toBe(true);
    expect(compareInspectionCondition("GOOD", "GOOD").changed).toBe(false);
  });

  it("treats null vs a set condition as changed", () => {
    expect(compareInspectionCondition(null, "GOOD").changed).toBe(true);
    expect(compareInspectionCondition(null, null).changed).toBe(false);
  });
});
