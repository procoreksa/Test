/**
 * Pure, DB-free Move-Out business rules (same pattern as
 * src/lib/operations/move-in-rules.ts) - status-transition legality,
 * editability, findings-review/completion gating, key-return reconciliation,
 * and Move-In baseline-comparison helpers are all pure functions here; the
 * actual Prisma queries live in src/lib/actions/move-outs.ts. See
 * docs/MOVE-OUT-MANAGEMENT.md for the full design.
 *
 * Deliberately imports (never duplicates) the inspection-progress/defect
 * helpers from move-in-rules.ts - MoveOutInspectionItem shares the exact
 * same applicable/condition/requiresAttention shape as MoveInInspectionItem,
 * so the same pure functions apply unchanged. This is a read of another
 * module's pure, side-effect-free logic, not a runtime dependency on Move-In
 * data - it does not violate Move-Out's "never mutate Move-In" rule.
 */
import type { MoveOutStatus, ConditionRating, InspectionCategory, MeterType, KeyType } from "@prisma/client";
import {
  isInspectionItemComplete,
  computeInspectionProgress,
  computeDefectSummary,
  type InspectionItemLike,
  type InspectionItemWithAttention,
  type InspectionProgress,
  type DefectSummary,
} from "./move-in-rules";

export { isInspectionItemComplete, computeInspectionProgress, computeDefectSummary };
export type { InspectionItemLike, InspectionItemWithAttention, InspectionProgress, DefectSummary };

// ---------------------------------------------------------------------------
// Status transitions - the single source of truth for which moves are
// legal, checked server-side before every mutating action writes anything.
// Approved lifecycle: DRAFT -> SCHEDULED -> IN_PROGRESS ->
// PENDING_FINDINGS_REVIEW -> READY_FOR_CLOSURE -> COMPLETED, with CANCELLED
// reachable from every non-terminal state and no separate CLOSED state.
//
// The one-step "back" moves (PENDING_FINDINGS_REVIEW -> IN_PROGRESS,
// READY_FOR_CLOSURE -> PENDING_FINDINGS_REVIEW) are a deliberate, small
// addition beyond the literal forward chain, mirroring the same reopen
// allowance move-in-rules.ts already grants (READY_FOR_HANDOVER ->
// IN_PROGRESS) so staff can correct a premature advance without cancelling
// and starting over. COMPLETED and CANCELLED remain strictly terminal.
// ---------------------------------------------------------------------------
const MOVE_OUT_TRANSITIONS: Record<MoveOutStatus, readonly MoveOutStatus[]> = {
  DRAFT: ["SCHEDULED", "IN_PROGRESS", "CANCELLED"],
  SCHEDULED: ["IN_PROGRESS", "CANCELLED"],
  IN_PROGRESS: ["PENDING_FINDINGS_REVIEW", "CANCELLED"],
  PENDING_FINDINGS_REVIEW: ["READY_FOR_CLOSURE", "IN_PROGRESS", "CANCELLED"],
  READY_FOR_CLOSURE: ["COMPLETED", "PENDING_FINDINGS_REVIEW", "CANCELLED"],
  COMPLETED: [],
  CANCELLED: [],
};

export function isValidMoveOutTransition(from: MoveOutStatus, to: MoveOutStatus): boolean {
  return MOVE_OUT_TRANSITIONS[from]?.includes(to) ?? false;
}

const TERMINAL_MOVE_OUT_STATUSES: readonly MoveOutStatus[] = ["COMPLETED", "CANCELLED"];

export function isMoveOutTerminal(status: MoveOutStatus): boolean {
  return TERMINAL_MOVE_OUT_STATUSES.includes(status);
}

/** Statuses in which the inspection checklist/inventory/meters/keys may still be edited - DRAFT/SCHEDULED haven't started yet, READY_FOR_CLOSURE onward is locked pending completion. */
const EDITABLE_MOVE_OUT_STATUSES: readonly MoveOutStatus[] = ["IN_PROGRESS", "PENDING_FINDINGS_REVIEW"];

export function isMoveOutEditable(status: MoveOutStatus): boolean {
  return EDITABLE_MOVE_OUT_STATUSES.includes(status);
}

/**
 * One-active-Move-Out-per-Contract rule (requirement 5) and the renewal-
 * conflict rule (requirement 4) share exactly the same predicate: every
 * Move-Out status other than CANCELLED blocks a new sibling action (a fresh
 * Move-Out, or a Contract renewal) for the same Contract. COMPLETED still
 * blocks both - a Contract whose physical hand-back is already done has
 * nothing left to legitimately renew, and starting a second Move-Out for it
 * would be a meaningless duplicate record. A CANCELLED Move-Out never
 * blocks either action - a Contract may accumulate several cancelled
 * Move-Out attempts (data errors, a reinstated tenancy, etc.) before a
 * legitimate one, exactly like Move-In's own blocksNewMoveInForContract()
 * precedent.
 */
export function blocksNewMoveOutForContract(status: MoveOutStatus): boolean {
  return status !== "CANCELLED";
}

/** Alias for the same predicate, named for its use at the renewContract() call site (requirement 4). */
export const moveOutBlocksContractRenewal = blocksNewMoveOutForContract;

// ---------------------------------------------------------------------------
// Findings-review gating (IN_PROGRESS -> PENDING_FINDINGS_REVIEW requires
// the inspection checklist to be fully recorded; PENDING_FINDINGS_REVIEW ->
// READY_FOR_CLOSURE requires that review to have actually happened).
// ---------------------------------------------------------------------------
export function isFindingsReviewEligible(items: readonly InspectionItemLike[]): boolean {
  const { completed, total } = computeInspectionProgress(items);
  return total === 0 || completed === total;
}

export function isReadyForClosureEligible(findingsReviewedAt: Date | null): boolean {
  return findingsReviewedAt !== null;
}

// ---------------------------------------------------------------------------
// Key-return reconciliation (requirement 2's "key-return reconciliation
// helper") - compares what Move-In recorded as returnedExpected against
// what Move-Out actually recorded as returned, matched by keyType +
// description (no stored row-to-row link, same reasoning as inventory:
// keys aren't individually tracked with a stable identity).
// ---------------------------------------------------------------------------
export interface KeyExpectation {
  keyType: KeyType;
  description: string;
  quantity: number;
}

export interface KeyReturnEntry {
  keyType: KeyType;
  description: string;
  quantity: number;
}

export interface KeyReconciliationLine {
  keyType: KeyType;
  description: string;
  expectedQuantity: number;
  returnedQuantity: number;
  fullyReturned: boolean;
}

export interface KeyReconciliationResult {
  lines: KeyReconciliationLine[];
  hasExpectations: boolean;
  allReturned: boolean;
}

function keyMatchKey(keyType: KeyType, description: string): string {
  return `${keyType}::${description.trim().toLowerCase()}`;
}

export function reconcileKeyReturns(expected: readonly KeyExpectation[], returned: readonly KeyReturnEntry[]): KeyReconciliationResult {
  const returnedTotals = new Map<string, number>();
  for (const r of returned) {
    const k = keyMatchKey(r.keyType, r.description);
    returnedTotals.set(k, (returnedTotals.get(k) ?? 0) + r.quantity);
  }

  const lines: KeyReconciliationLine[] = expected.map((e) => {
    const returnedQuantity = returnedTotals.get(keyMatchKey(e.keyType, e.description)) ?? 0;
    return {
      keyType: e.keyType,
      description: e.description,
      expectedQuantity: e.quantity,
      returnedQuantity,
      fullyReturned: returnedQuantity >= e.quantity,
    };
  });

  return {
    lines,
    hasExpectations: expected.length > 0,
    allReturned: lines.every((l) => l.fullyReturned),
  };
}

/**
 * Whether the key-return requirement is satisfied for completion. When
 * there's a Move-In baseline with returnedExpected keys, every one of them
 * must reconcile as fully returned (unless staff explicitly marks
 * noKeysToReturn). With no baseline (no linked Move-In, or the Move-In
 * recorded no returnedExpected keys), the requirement falls back to
 * Move-In's own pattern: at least one MoveOutKeyItem recorded, or the
 * explicit noKeysToReturn flag.
 */
export function isKeyReturnSatisfied(reconciliation: KeyReconciliationResult, recordedKeyCount: number, noKeysToReturn: boolean): boolean {
  if (noKeysToReturn) return true;
  if (reconciliation.hasExpectations) return reconciliation.allReturned;
  return recordedKeyCount > 0;
}

// ---------------------------------------------------------------------------
// Completion validation - the single centralized gate every
// completeMoveOut() call runs (in addition to the transactional
// re-validation/conflicting-occupancy check that lives in
// src/lib/actions/move-outs.ts, which is inherently DB-dependent and so
// cannot live in this pure module). Returns every missing requirement at
// once, same pattern as validateMoveInCompletion().
//
// Deliberately excludes any financial check (Decision 3: "Move-Out is
// operational, not financial") and any inventory/furnished-unit
// requirement (no equivalent decision was made requiring one; damages are
// operational-only per Decision 4 and never gate completion).
// ---------------------------------------------------------------------------
export const REQUIRED_MOVE_OUT_METER_TYPES: readonly MeterType[] = ["ELECTRICITY", "WATER"];

export type MoveOutMissingRequirement =
  | "VACATE_DATE_MISSING"
  | "INSPECTION_INCOMPLETE"
  | "FINDINGS_NOT_REVIEWED"
  | "REQUIRED_METERS_MISSING"
  | "KEYS_NOT_RECONCILED"
  | "TENANT_ACKNOWLEDGEMENT_MISSING"
  | "STAFF_ACKNOWLEDGEMENT_MISSING";

export interface MoveOutCompletionInput {
  vacateDate: Date | null;
  inspectionItems: readonly InspectionItemLike[];
  findingsReviewedAt: Date | null;
  meterReadingTypes: readonly MeterType[];
  keyReconciliation: KeyReconciliationResult;
  recordedKeyCount: number;
  noKeysToReturn: boolean;
  tenantAcknowledgedAt: Date | null;
  tenantAcknowledgementOverride: boolean;
  staffAcknowledgedAt: Date | null;
}

export function validateMoveOutCompletion(input: MoveOutCompletionInput): { canComplete: boolean; missing: MoveOutMissingRequirement[] } {
  const missing: MoveOutMissingRequirement[] = [];

  if (!input.vacateDate) missing.push("VACATE_DATE_MISSING");

  const { completed, total } = computeInspectionProgress(input.inspectionItems);
  if (total > 0 && completed < total) missing.push("INSPECTION_INCOMPLETE");

  if (!isReadyForClosureEligible(input.findingsReviewedAt)) missing.push("FINDINGS_NOT_REVIEWED");

  const hasAllRequiredMeters = REQUIRED_MOVE_OUT_METER_TYPES.every((t) => input.meterReadingTypes.includes(t));
  if (!hasAllRequiredMeters) missing.push("REQUIRED_METERS_MISSING");

  if (!isKeyReturnSatisfied(input.keyReconciliation, input.recordedKeyCount, input.noKeysToReturn)) missing.push("KEYS_NOT_RECONCILED");

  if (!input.tenantAcknowledgedAt && !input.tenantAcknowledgementOverride) missing.push("TENANT_ACKNOWLEDGEMENT_MISSING");

  if (!input.staffAcknowledgedAt) missing.push("STAFF_ACKNOWLEDGEMENT_MISSING");

  return { canComplete: missing.length === 0, missing };
}

// ---------------------------------------------------------------------------
// Move-In baseline comparison helpers (Phase 1 audit's own conclusion:
// furniture/meters have no stable row-to-row identity across records, so
// they're diffed by category+itemName / meterType at comparison time
// rather than via a stored link - unlike inspection items, which DO get a
// direct optional moveInInspectionItemId link handled separately, and
// unlike keys, which are reconciled above by keyType+description too).
// ---------------------------------------------------------------------------
export interface InventoryBaselineItem {
  category: InspectionCategory;
  itemName: string;
  quantity: number;
  condition: ConditionRating | null;
}

export type InventoryDiffStatus = "MATCHED" | "QUANTITY_MISMATCH" | "MISSING_AT_MOVE_OUT" | "ADDED_AT_MOVE_OUT";

export interface InventoryDiffLine {
  category: InspectionCategory;
  itemName: string;
  moveInQuantity: number | null;
  moveOutQuantity: number | null;
  moveInCondition: ConditionRating | null;
  moveOutCondition: ConditionRating | null;
  status: InventoryDiffStatus;
}

function inventoryMatchKey(category: InspectionCategory, itemName: string): string {
  return `${category}::${itemName.trim().toLowerCase()}`;
}

export function diffInventoryItems(moveIn: readonly InventoryBaselineItem[], moveOut: readonly InventoryBaselineItem[]): InventoryDiffLine[] {
  const moveInByKey = new Map<string, InventoryBaselineItem>();
  for (const item of moveIn) moveInByKey.set(inventoryMatchKey(item.category, item.itemName), item);

  const moveOutByKey = new Map<string, InventoryBaselineItem>();
  for (const item of moveOut) moveOutByKey.set(inventoryMatchKey(item.category, item.itemName), item);

  const allKeys = new Set([...moveInByKey.keys(), ...moveOutByKey.keys()]);
  const lines: InventoryDiffLine[] = [];

  for (const key of allKeys) {
    const inItem = moveInByKey.get(key) ?? null;
    const outItem = moveOutByKey.get(key) ?? null;

    let status: InventoryDiffStatus;
    if (inItem && outItem) {
      status = inItem.quantity === outItem.quantity ? "MATCHED" : "QUANTITY_MISMATCH";
    } else if (inItem && !outItem) {
      status = "MISSING_AT_MOVE_OUT";
    } else {
      status = "ADDED_AT_MOVE_OUT";
    }

    lines.push({
      category: (inItem ?? outItem)!.category,
      itemName: (inItem ?? outItem)!.itemName,
      moveInQuantity: inItem?.quantity ?? null,
      moveOutQuantity: outItem?.quantity ?? null,
      moveInCondition: inItem?.condition ?? null,
      moveOutCondition: outItem?.condition ?? null,
      status,
    });
  }

  return lines;
}

export interface MeterBaselineReading {
  meterType: MeterType;
  reading: number;
}

export interface MeterConsumptionLine {
  meterType: MeterType;
  moveInReading: number | null;
  moveOutReading: number | null;
  /** moveOutReading - moveInReading, computed on demand and never stored as a third persisted value. Null unless both readings exist. */
  consumption: number | null;
}

export function computeMeterConsumption(moveIn: readonly MeterBaselineReading[], moveOut: readonly MeterBaselineReading[]): MeterConsumptionLine[] {
  const moveInByType = new Map<MeterType, number>(moveIn.map((r) => [r.meterType, r.reading]));
  const moveOutByType = new Map<MeterType, number>(moveOut.map((r) => [r.meterType, r.reading]));

  const allTypes = new Set<MeterType>([...moveInByType.keys(), ...moveOutByType.keys()]);

  return Array.from(allTypes).map((meterType) => {
    const moveInReading = moveInByType.get(meterType) ?? null;
    const moveOutReading = moveOutByType.get(meterType) ?? null;
    return {
      meterType,
      moveInReading,
      moveOutReading,
      consumption: moveInReading !== null && moveOutReading !== null ? moveOutReading - moveInReading : null,
    };
  });
}

// ---------------------------------------------------------------------------
// Conflicting-occupancy rule for completeMoveOut() (requirement 3) - the
// single, explicit, testable definition of "unsafe to vacate": another
// ACTIVE Contract already exists for the Unit (besides this Move-Out's own
// Contract), or the Unit is held by a live Reservation (PENDING/CONFIRMED -
// the same two statuses that put Unit.status at RESERVED elsewhere in this
// schema). Either means someone else already has a claim on the Unit, so
// completion must be rejected and every record left unchanged - never a
// partial write. The actual counts are inherently DB-dependent and are
// computed in src/lib/actions/move-outs.ts; this function is the pure
// decision only, so it can be unit-tested without a database.
// ---------------------------------------------------------------------------
export interface OccupancyConflictInput {
  otherActiveContractCount: number;
  activeReservationCount: number;
}

export function isUnsafeToVacate(input: OccupancyConflictInput): boolean {
  return input.otherActiveContractCount > 0 || input.activeReservationCount > 0;
}

/** Direct before/after condition delta for an inspection item explicitly linked via moveInInspectionItemId. */
export interface InspectionConditionComparison {
  moveInCondition: ConditionRating | null;
  moveOutCondition: ConditionRating | null;
  changed: boolean;
}

export function compareInspectionCondition(moveInCondition: ConditionRating | null, moveOutCondition: ConditionRating | null): InspectionConditionComparison {
  return { moveInCondition, moveOutCondition, changed: moveInCondition !== moveOutCondition };
}
