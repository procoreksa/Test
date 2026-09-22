/**
 * Pure, DB-free Move-In business rules (same pattern as
 * src/lib/crm/reservation-rules.ts/offer-rules.ts/viewing-rules.ts) -
 * status-transition legality, inspection progress/defect summaries,
 * completion validation, the overdue formula, and the default inspection
 * checklist template are all pure functions here; the actual Prisma
 * queries live in src/lib/actions/move-ins.ts. See
 * docs/MOVE-IN-HANDOVER.md for the full design.
 */
import type { MoveInStatus, ConditionRating, InspectionCategory, MeterType } from "@prisma/client";

// ---------------------------------------------------------------------------
// Status transitions (Step 4) - the single source of truth for which moves
// are legal, checked server-side before every mutating action writes
// anything.
// ---------------------------------------------------------------------------
const MOVE_IN_TRANSITIONS: Record<MoveInStatus, readonly MoveInStatus[]> = {
  DRAFT: ["SCHEDULED", "IN_PROGRESS", "CANCELLED"],
  SCHEDULED: ["IN_PROGRESS", "CANCELLED"],
  IN_PROGRESS: ["READY_FOR_HANDOVER", "CANCELLED"],
  READY_FOR_HANDOVER: ["COMPLETED", "IN_PROGRESS", "CANCELLED"],
  COMPLETED: [],
  CANCELLED: [],
};

export function isValidMoveInTransition(from: MoveInStatus, to: MoveInStatus): boolean {
  return MOVE_IN_TRANSITIONS[from]?.includes(to) ?? false;
}

/** Statuses in which the inspection checklist/inventory/meters/keys may still be edited (Step 28/32) - DRAFT/SCHEDULED haven't started yet, COMPLETED/CANCELLED are locked. */
const EDITABLE_MOVE_IN_STATUSES: readonly MoveInStatus[] = ["IN_PROGRESS", "READY_FOR_HANDOVER"];

export function isMoveInEditable(status: MoveInStatus): boolean {
  return EDITABLE_MOVE_IN_STATUSES.includes(status);
}

/**
 * One-active-Move-In-per-Contract rule (Step 6): a second Move-In for the
 * same Contract is blocked unless the existing one has already reached
 * CANCELLED. Mirrors blocksNewReservationForOffer()'s own precedent
 * exactly - a Contract may accumulate several cancelled Move-In attempts
 * (data errors, rescheduling that started a fresh record, etc.) before a
 * successful one, but never two simultaneously live/completed ones.
 */
export function blocksNewMoveInForContract(status: MoveInStatus): boolean {
  return status !== "CANCELLED";
}

// ---------------------------------------------------------------------------
// Inspection progress (Step 29) - NOT_APPLICABLE items (via isApplicable)
// are excluded from the denominator entirely, never counted as "done."
// ---------------------------------------------------------------------------
export interface InspectionItemLike {
  isApplicable: boolean;
  condition: ConditionRating | null;
}

export function isInspectionItemComplete(item: InspectionItemLike): boolean {
  return !item.isApplicable || item.condition !== null;
}

export interface InspectionProgress {
  completed: number;
  total: number;
  percent: number;
}

export function computeInspectionProgress(items: readonly InspectionItemLike[]): InspectionProgress {
  const applicable = items.filter((i) => i.isApplicable);
  const completed = applicable.filter((i) => i.condition !== null).length;
  const total = applicable.length;
  const percent = total === 0 ? 100 : Math.round((completed / total) * 1000) / 10;
  return { completed, total, percent };
}

/** IN_PROGRESS -> READY_FOR_HANDOVER (Step 30) requires every applicable checklist item to have a recorded condition - acknowledgements are NOT required yet (those happen at completion). */
export function isReadyForHandoverEligible(items: readonly InspectionItemLike[]): boolean {
  const { completed, total } = computeInspectionProgress(items);
  return total === 0 || completed === total;
}

// ---------------------------------------------------------------------------
// Defect summary (Step 35) - shown prominently before handover; never
// itself blocks handover (authorized staff may proceed with acknowledged
// defects, per Step 35's explicit instruction).
// ---------------------------------------------------------------------------
export interface DefectSummary {
  totalItems: number;
  requiresAttentionCount: number;
  damagedCount: number;
  notWorkingCount: number;
  poorCount: number;
}

export interface InspectionItemWithAttention extends InspectionItemLike {
  requiresAttention: boolean;
}

export function computeDefectSummary(items: readonly InspectionItemWithAttention[]): DefectSummary {
  const applicable = items.filter((i) => i.isApplicable);
  return {
    totalItems: applicable.length,
    requiresAttentionCount: applicable.filter((i) => i.requiresAttention).length,
    damagedCount: applicable.filter((i) => i.condition === "DAMAGED").length,
    notWorkingCount: applicable.filter((i) => i.condition === "NOT_WORKING").length,
    poorCount: applicable.filter((i) => i.condition === "POOR").length,
  };
}

// ---------------------------------------------------------------------------
// Completion validation (Step 22) - the single centralized gate every
// completeMoveIn() call runs before writing COMPLETED. Returns every
// missing requirement at once (not just the first) so the UI can show a
// full checklist rather than a frustrating one-error-at-a-time loop.
// ---------------------------------------------------------------------------
export const REQUIRED_METER_TYPES: readonly MeterType[] = ["ELECTRICITY", "WATER"];

export type MissingRequirement =
  | "HANDOVER_DATE"
  | "INSPECTION_INCOMPLETE"
  | "REQUIRED_METERS_MISSING"
  | "KEYS_NOT_RECORDED"
  | "INVENTORY_REQUIRED_FOR_FURNISHED_UNIT"
  | "TENANT_ACKNOWLEDGEMENT_MISSING"
  | "STAFF_ACKNOWLEDGEMENT_MISSING";

export interface MoveInCompletionInput {
  handoverDate: Date | null;
  inspectionItems: readonly InspectionItemLike[];
  meterReadingTypes: readonly MeterType[];
  keyItemCount: number;
  noKeysToRecord: boolean;
  isFurnished: boolean;
  inventoryItemCount: number;
  tenantAcknowledgedAt: Date | null;
  tenantAcknowledgementOverride: boolean;
  staffAcknowledgedAt: Date | null;
}

export function validateMoveInCompletion(input: MoveInCompletionInput): { canComplete: boolean; missing: MissingRequirement[] } {
  const missing: MissingRequirement[] = [];

  if (!input.handoverDate) missing.push("HANDOVER_DATE");

  const { completed, total } = computeInspectionProgress(input.inspectionItems);
  if (total > 0 && completed < total) missing.push("INSPECTION_INCOMPLETE");

  const hasAllRequiredMeters = REQUIRED_METER_TYPES.every((t) => input.meterReadingTypes.includes(t));
  if (!hasAllRequiredMeters) missing.push("REQUIRED_METERS_MISSING");

  if (input.keyItemCount === 0 && !input.noKeysToRecord) missing.push("KEYS_NOT_RECORDED");

  // Step 23: furniture inventory is only required for a furnished unit -
  // never required, and never blocking, for an unfurnished one.
  if (input.isFurnished && input.inventoryItemCount === 0) missing.push("INVENTORY_REQUIRED_FOR_FURNISHED_UNIT");

  if (!input.tenantAcknowledgedAt && !input.tenantAcknowledgementOverride) missing.push("TENANT_ACKNOWLEDGEMENT_MISSING");

  if (!input.staffAcknowledgedAt) missing.push("STAFF_ACKNOWLEDGEMENT_MISSING");

  return { canComplete: missing.length === 0, missing };
}

// ---------------------------------------------------------------------------
// Overdue (Step 40): scheduledAt < now AND status not COMPLETED/CANCELLED.
// ---------------------------------------------------------------------------
export function isMoveInOverdue(scheduledAt: Date | null, status: MoveInStatus, now: Date = new Date()): boolean {
  if (!scheduledAt) return false;
  return scheduledAt < now && status !== "COMPLETED" && status !== "CANCELLED";
}

// ---------------------------------------------------------------------------
// Default inspection checklist template (Step 12/13) - a single
// centralized, organization-wide default. Future extension point (Step
// 13): this function's signature already takes no per-org/per-compound/
// per-unit-type argument, but the call site (createMoveIn() in
// src/lib/actions/move-ins.ts) is the one place that would need to change
// to select among multiple templates once that administration module
// exists - nothing else in this module or its UI hardcodes the checklist.
// ---------------------------------------------------------------------------
export interface DefaultChecklistItem {
  category: InspectionCategory;
  itemName: string;
  itemNameAr: string;
  isApplicable: boolean;
}

export function getDefaultInspectionChecklist(): DefaultChecklistItem[] {
  const items: DefaultChecklistItem[] = [
    // Entrance
    { category: "ENTRANCE", itemName: "Main door", itemNameAr: "الباب الرئيسي", isApplicable: true },
    { category: "ENTRANCE", itemName: "Door lock", itemNameAr: "قفل الباب", isApplicable: true },
    { category: "ENTRANCE", itemName: "Doorbell", itemNameAr: "جرس الباب", isApplicable: true },

    // Living Room
    { category: "LIVING_ROOM", itemName: "Walls", itemNameAr: "الجدران", isApplicable: true },
    { category: "LIVING_ROOM", itemName: "Ceiling", itemNameAr: "السقف", isApplicable: true },
    { category: "LIVING_ROOM", itemName: "Flooring", itemNameAr: "الأرضية", isApplicable: true },
    { category: "LIVING_ROOM", itemName: "Lighting", itemNameAr: "الإضاءة", isApplicable: true },
    { category: "LIVING_ROOM", itemName: "Windows", itemNameAr: "النوافذ", isApplicable: true },
    { category: "LIVING_ROOM", itemName: "Curtains", itemNameAr: "الستائر", isApplicable: false },

    // Dining Room
    { category: "DINING_ROOM", itemName: "Flooring", itemNameAr: "الأرضية", isApplicable: true },
    { category: "DINING_ROOM", itemName: "Walls", itemNameAr: "الجدران", isApplicable: true },
    { category: "DINING_ROOM", itemName: "Lighting", itemNameAr: "الإضاءة", isApplicable: true },

    // Kitchen
    { category: "KITCHEN", itemName: "Cabinets", itemNameAr: "الخزائن", isApplicable: true },
    { category: "KITCHEN", itemName: "Countertop", itemNameAr: "سطح العمل", isApplicable: true },
    { category: "KITCHEN", itemName: "Sink", itemNameAr: "الحوض", isApplicable: true },
    { category: "KITCHEN", itemName: "Faucet", itemNameAr: "الحنفية", isApplicable: true },
    { category: "KITCHEN", itemName: "Oven", itemNameAr: "الفرن", isApplicable: true },
    { category: "KITCHEN", itemName: "Hob", itemNameAr: "موقد الطبخ", isApplicable: true },
    { category: "KITCHEN", itemName: "Refrigerator", itemNameAr: "الثلاجة", isApplicable: true },
    { category: "KITCHEN", itemName: "Dishwasher", itemNameAr: "غسالة الصحون", isApplicable: false },
    { category: "KITCHEN", itemName: "Washing machine", itemNameAr: "غسالة الملابس", isApplicable: false },
    { category: "KITCHEN", itemName: "Extractor hood", itemNameAr: "شفاط المطبخ", isApplicable: true },

    // Bathroom
    { category: "BATHROOM", itemName: "Toilet", itemNameAr: "المرحاض", isApplicable: true },
    { category: "BATHROOM", itemName: "Basin", itemNameAr: "المغسلة", isApplicable: true },
    { category: "BATHROOM", itemName: "Shower", itemNameAr: "الدُش", isApplicable: true },
    { category: "BATHROOM", itemName: "Bathtub", itemNameAr: "حوض الاستحمام", isApplicable: false },
    { category: "BATHROOM", itemName: "Water heater", itemNameAr: "سخان المياه", isApplicable: true },
    { category: "BATHROOM", itemName: "Exhaust fan", itemNameAr: "مروحة الشفط", isApplicable: true },
    { category: "BATHROOM", itemName: "Mirrors", itemNameAr: "المرايا", isApplicable: true },
    { category: "BATHROOM", itemName: "Accessories", itemNameAr: "الإكسسوارات", isApplicable: true },

    // Bedroom
    { category: "BEDROOM", itemName: "Flooring", itemNameAr: "الأرضية", isApplicable: true },
    { category: "BEDROOM", itemName: "Walls", itemNameAr: "الجدران", isApplicable: true },
    { category: "BEDROOM", itemName: "Lighting", itemNameAr: "الإضاءة", isApplicable: true },
    { category: "BEDROOM", itemName: "Wardrobe", itemNameAr: "الخزانة", isApplicable: true },
    { category: "BEDROOM", itemName: "Windows", itemNameAr: "النوافذ", isApplicable: true },
    { category: "BEDROOM", itemName: "Curtains", itemNameAr: "الستائر", isApplicable: false },

    // Balcony
    { category: "BALCONY", itemName: "Flooring", itemNameAr: "الأرضية", isApplicable: false },
    { category: "BALCONY", itemName: "Railing", itemNameAr: "الدرابزين", isApplicable: false },

    // Windows & Doors (whole-unit)
    { category: "WINDOWS_DOORS", itemName: "General windows & doors condition", itemNameAr: "الحالة العامة للنوافذ والأبواب", isApplicable: true },

    // Air Conditioning
    { category: "AIR_CONDITIONING", itemName: "AC unit", itemNameAr: "وحدة التكييف", isApplicable: true },
    { category: "AIR_CONDITIONING", itemName: "Thermostat", itemNameAr: "منظم الحرارة", isApplicable: true },
    { category: "AIR_CONDITIONING", itemName: "Cooling test", itemNameAr: "اختبار التبريد", isApplicable: true },

    // Electrical
    { category: "ELECTRICAL", itemName: "Sockets", itemNameAr: "المقابس الكهربائية", isApplicable: true },
    { category: "ELECTRICAL", itemName: "Switches", itemNameAr: "المفاتيح الكهربائية", isApplicable: true },
    { category: "ELECTRICAL", itemName: "Distribution board", itemNameAr: "لوحة التوزيع الكهربائية", isApplicable: true },

    // Plumbing (whole-unit)
    { category: "PLUMBING", itemName: "General plumbing check", itemNameAr: "فحص السباكة العام", isApplicable: true },

    // Safety
    { category: "SAFETY", itemName: "Smoke detector", itemNameAr: "كاشف الدخان", isApplicable: true },
    { category: "SAFETY", itemName: "Fire extinguisher", itemNameAr: "طفاية الحريق", isApplicable: false },
  ];

  return items;
}
