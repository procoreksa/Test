import { describe, it, expect } from "vitest";
import { Prisma } from "@prisma/client";
import {
  isValidMaintenanceRequestTransition,
  blocksNewWorkOrderForRequest,
  isValidMaintenanceWorkOrderTransition,
  isMaintenanceWorkOrderLocked,
  SLA_POLICY,
  computeSlaDueDates,
  computeResponseSlaStatus,
  computeResolutionSlaStatus,
  computeOverallSlaStatus,
  isValidWorkOrderSchedule,
  hasScheduleOverlap,
  isScheduleBlockingWorkOrderStatus,
  isMaintenanceRequestOverdue,
  isMaintenanceWorkOrderOverdue,
  computePartTotalCost,
  computeLaborCost,
  computeMaintenanceCostSummary,
  computeCostVariance,
  validateWorkOrderCompletion,
} from "./maintenance-rules";

describe("isValidMaintenanceRequestTransition", () => {
  it("allows the canonical OPEN -> TRIAGED -> WORK_ORDER_CREATED -> RESOLVED chain", () => {
    expect(isValidMaintenanceRequestTransition("OPEN", "TRIAGED")).toBe(true);
    expect(isValidMaintenanceRequestTransition("TRIAGED", "WORK_ORDER_CREATED")).toBe(true);
    expect(isValidMaintenanceRequestTransition("WORK_ORDER_CREATED", "RESOLVED")).toBe(true);
  });

  it("allows WORK_ORDER_CREATED back to TRIAGED (its Work Order was cancelled, follow-up needed)", () => {
    expect(isValidMaintenanceRequestTransition("WORK_ORDER_CREATED", "TRIAGED")).toBe(true);
  });

  it("allows cancellation before a Work Order exists", () => {
    expect(isValidMaintenanceRequestTransition("OPEN", "CANCELLED")).toBe(true);
    expect(isValidMaintenanceRequestTransition("TRIAGED", "CANCELLED")).toBe(true);
  });

  it("rejects any move out of RESOLVED or CANCELLED - both terminal", () => {
    for (const terminal of ["RESOLVED", "CANCELLED"] as const) {
      expect(isValidMaintenanceRequestTransition(terminal, "OPEN")).toBe(false);
      expect(isValidMaintenanceRequestTransition(terminal, "TRIAGED")).toBe(false);
    }
  });

  it("rejects skipping straight from OPEN to WORK_ORDER_CREATED", () => {
    expect(isValidMaintenanceRequestTransition("OPEN", "WORK_ORDER_CREATED")).toBe(false);
  });
});

describe("blocksNewWorkOrderForRequest", () => {
  it("blocks a new Work Order unless the existing one is CANCELLED", () => {
    expect(blocksNewWorkOrderForRequest("CANCELLED")).toBe(false);
    for (const status of ["DRAFT", "ASSIGNED", "SCHEDULED", "IN_PROGRESS", "ON_HOLD", "COMPLETED", "VERIFIED", "CLOSED"] as const) {
      expect(blocksNewWorkOrderForRequest(status)).toBe(true);
    }
  });
});

describe("isValidMaintenanceWorkOrderTransition", () => {
  it("allows the canonical DRAFT -> ASSIGNED -> SCHEDULED -> IN_PROGRESS -> COMPLETED -> VERIFIED -> CLOSED chain", () => {
    expect(isValidMaintenanceWorkOrderTransition("DRAFT", "ASSIGNED")).toBe(true);
    expect(isValidMaintenanceWorkOrderTransition("ASSIGNED", "SCHEDULED")).toBe(true);
    expect(isValidMaintenanceWorkOrderTransition("SCHEDULED", "IN_PROGRESS")).toBe(true);
    expect(isValidMaintenanceWorkOrderTransition("IN_PROGRESS", "COMPLETED")).toBe(true);
    expect(isValidMaintenanceWorkOrderTransition("COMPLETED", "VERIFIED")).toBe(true);
    expect(isValidMaintenanceWorkOrderTransition("VERIFIED", "CLOSED")).toBe(true);
  });

  it("allows ASSIGNED/SCHEDULED to skip straight to IN_PROGRESS", () => {
    expect(isValidMaintenanceWorkOrderTransition("ASSIGNED", "IN_PROGRESS")).toBe(true);
    expect(isValidMaintenanceWorkOrderTransition("SCHEDULED", "IN_PROGRESS")).toBe(true);
  });

  it("allows IN_PROGRESS <-> ON_HOLD both ways", () => {
    expect(isValidMaintenanceWorkOrderTransition("IN_PROGRESS", "ON_HOLD")).toBe(true);
    expect(isValidMaintenanceWorkOrderTransition("ON_HOLD", "IN_PROGRESS")).toBe(true);
  });

  it("allows cancellation from every non-terminal status, including COMPLETED and VERIFIED (before CLOSED)", () => {
    for (const from of ["DRAFT", "ASSIGNED", "SCHEDULED", "IN_PROGRESS", "ON_HOLD", "COMPLETED", "VERIFIED"] as const) {
      expect(isValidMaintenanceWorkOrderTransition(from, "CANCELLED")).toBe(true);
    }
  });

  it("rejects any move out of CLOSED or CANCELLED - both terminal", () => {
    for (const terminal of ["CLOSED", "CANCELLED"] as const) {
      expect(isValidMaintenanceWorkOrderTransition(terminal, "IN_PROGRESS")).toBe(false);
      expect(isValidMaintenanceWorkOrderTransition(terminal, "VERIFIED")).toBe(false);
    }
  });

  it("rejects an invalid backward move like VERIFIED -> IN_PROGRESS", () => {
    expect(isValidMaintenanceWorkOrderTransition("VERIFIED", "IN_PROGRESS")).toBe(false);
  });

  it("rejects skipping straight from DRAFT to IN_PROGRESS", () => {
    expect(isValidMaintenanceWorkOrderTransition("DRAFT", "IN_PROGRESS")).toBe(false);
  });
});

describe("isMaintenanceWorkOrderLocked", () => {
  it("only CLOSED is locked", () => {
    expect(isMaintenanceWorkOrderLocked("CLOSED")).toBe(true);
    for (const status of ["DRAFT", "ASSIGNED", "SCHEDULED", "IN_PROGRESS", "ON_HOLD", "COMPLETED", "VERIFIED", "CANCELLED"] as const) {
      expect(isMaintenanceWorkOrderLocked(status)).toBe(false);
    }
  });
});

describe("SLA_POLICY / computeSlaDueDates", () => {
  it("matches the brief's exact default policy (in minutes)", () => {
    expect(SLA_POLICY.EMERGENCY).toEqual({ responseMinutes: 15, resolutionMinutes: 240 });
    expect(SLA_POLICY.URGENT).toEqual({ responseMinutes: 60, resolutionMinutes: 480 });
    expect(SLA_POLICY.HIGH).toEqual({ responseMinutes: 240, resolutionMinutes: 1440 });
    expect(SLA_POLICY.NORMAL).toEqual({ responseMinutes: 480, resolutionMinutes: 4320 });
    expect(SLA_POLICY.LOW).toEqual({ responseMinutes: 1440, resolutionMinutes: 7200 });
  });

  it("computes due dates as reportedAt + policy minutes", () => {
    const reportedAt = new Date("2026-01-01T00:00:00.000Z");
    const { responseDueAt, resolutionDueAt } = computeSlaDueDates(reportedAt, "URGENT");
    expect(responseDueAt.toISOString()).toBe("2026-01-01T01:00:00.000Z");
    expect(resolutionDueAt.toISOString()).toBe("2026-01-01T08:00:00.000Z");
  });
});

describe("computeResponseSlaStatus", () => {
  const reportedAt = new Date("2026-01-01T00:00:00.000Z");
  const responseDueAt = new Date("2026-01-01T08:00:00.000Z"); // NORMAL response window

  it("returns ON_TRACK early in the window with no response yet", () => {
    const now = new Date("2026-01-01T01:00:00.000Z");
    expect(computeResponseSlaStatus({ reportedAt, responseDueAt, firstResponseAt: null, now })).toBe("ON_TRACK");
  });

  it("returns AT_RISK past 75% of the window with no response yet", () => {
    const now = new Date("2026-01-01T07:00:00.000Z"); // 87.5% elapsed
    expect(computeResponseSlaStatus({ reportedAt, responseDueAt, firstResponseAt: null, now })).toBe("AT_RISK");
  });

  it("returns BREACHED once now is past the due date with no response", () => {
    const now = new Date("2026-01-01T09:00:00.000Z");
    expect(computeResponseSlaStatus({ reportedAt, responseDueAt, firstResponseAt: null, now })).toBe("BREACHED");
  });

  it("returns MET when the actual first response beat the due date", () => {
    const firstResponseAt = new Date("2026-01-01T05:00:00.000Z");
    expect(computeResponseSlaStatus({ reportedAt, responseDueAt, firstResponseAt })).toBe("MET");
  });

  it("returns BREACHED when the actual first response came after the due date", () => {
    const firstResponseAt = new Date("2026-01-01T09:00:00.000Z");
    expect(computeResponseSlaStatus({ reportedAt, responseDueAt, firstResponseAt })).toBe("BREACHED");
  });

  it("returns ON_TRACK when there is no due date at all", () => {
    expect(computeResponseSlaStatus({ reportedAt, responseDueAt: null, firstResponseAt: null })).toBe("ON_TRACK");
  });
});

describe("computeResolutionSlaStatus", () => {
  const reportedAt = new Date("2026-01-01T00:00:00.000Z");
  const resolutionDueAt = new Date("2026-01-04T00:00:00.000Z"); // NORMAL resolution window (72h)

  it("returns null for a CANCELLED Request regardless of due date", () => {
    const now = new Date("2026-01-05T00:00:00.000Z");
    expect(computeResolutionSlaStatus({ reportedAt, resolutionDueAt, resolvedAt: null, requestStatus: "CANCELLED", now })).toBeNull();
  });

  it("returns MET when resolved before the due date", () => {
    const resolvedAt = new Date("2026-01-02T00:00:00.000Z");
    expect(computeResolutionSlaStatus({ reportedAt, resolutionDueAt, resolvedAt, requestStatus: "RESOLVED" })).toBe("MET");
  });

  it("returns BREACHED when resolved after the due date", () => {
    const resolvedAt = new Date("2026-01-05T00:00:00.000Z");
    expect(computeResolutionSlaStatus({ reportedAt, resolutionDueAt, resolvedAt, requestStatus: "RESOLVED" })).toBe("BREACHED");
  });

  it("does not count a still-open Request past its due date as met", () => {
    const now = new Date("2026-01-05T00:00:00.000Z");
    expect(computeResolutionSlaStatus({ reportedAt, resolutionDueAt, resolvedAt: null, requestStatus: "WORK_ORDER_CREATED", now })).toBe(
      "BREACHED"
    );
  });

  it("returns AT_RISK past 75% of the window while still open and not yet due", () => {
    // 72h window (reportedAt -> resolutionDueAt); 60h elapsed = 83% - past
    // the 75% threshold but still 12h before the due date itself.
    const atRiskNow = new Date("2026-01-03T12:00:00.000Z");
    expect(computeResolutionSlaStatus({ reportedAt, resolutionDueAt, resolvedAt: null, requestStatus: "OPEN", now: atRiskNow })).toBe(
      "AT_RISK"
    );
  });
});

describe("computeOverallSlaStatus", () => {
  it("returns the more severe of the two component statuses", () => {
    expect(computeOverallSlaStatus("MET", "ON_TRACK")).toBe("ON_TRACK");
    expect(computeOverallSlaStatus("BREACHED", "ON_TRACK")).toBe("BREACHED");
    expect(computeOverallSlaStatus("AT_RISK", "MET")).toBe("AT_RISK");
    expect(computeOverallSlaStatus("MET", null)).toBe("MET");
  });
});

describe("isValidWorkOrderSchedule", () => {
  it("requires end strictly after start", () => {
    const start = new Date("2026-01-01T10:00:00.000Z");
    expect(isValidWorkOrderSchedule(start, new Date("2026-01-01T11:00:00.000Z"))).toBe(true);
    expect(isValidWorkOrderSchedule(start, start)).toBe(false);
    expect(isValidWorkOrderSchedule(start, new Date("2026-01-01T09:00:00.000Z"))).toBe(false);
  });
});

describe("hasScheduleOverlap", () => {
  it("detects an overlapping window", () => {
    const existingStart = new Date("2026-01-01T10:00:00.000Z");
    const existingEnd = new Date("2026-01-01T12:00:00.000Z");
    expect(hasScheduleOverlap(existingStart, existingEnd, new Date("2026-01-01T11:00:00.000Z"), new Date("2026-01-01T13:00:00.000Z"))).toBe(
      true
    );
  });

  it("does not flag back-to-back windows as overlapping", () => {
    const existingStart = new Date("2026-01-01T10:00:00.000Z");
    const existingEnd = new Date("2026-01-01T12:00:00.000Z");
    expect(hasScheduleOverlap(existingStart, existingEnd, existingEnd, new Date("2026-01-01T13:00:00.000Z"))).toBe(false);
  });

  it("does not flag a fully separate window", () => {
    const existingStart = new Date("2026-01-01T10:00:00.000Z");
    const existingEnd = new Date("2026-01-01T12:00:00.000Z");
    expect(hasScheduleOverlap(existingStart, existingEnd, new Date("2026-01-01T13:00:00.000Z"), new Date("2026-01-01T14:00:00.000Z"))).toBe(
      false
    );
  });
});

describe("isScheduleBlockingWorkOrderStatus", () => {
  it("only active-assignment statuses block a schedule slot", () => {
    for (const status of ["ASSIGNED", "SCHEDULED", "IN_PROGRESS", "ON_HOLD"] as const) {
      expect(isScheduleBlockingWorkOrderStatus(status)).toBe(true);
    }
    for (const status of ["DRAFT", "COMPLETED", "VERIFIED", "CLOSED", "CANCELLED"] as const) {
      expect(isScheduleBlockingWorkOrderStatus(status)).toBe(false);
    }
  });
});

describe("isMaintenanceRequestOverdue / isMaintenanceWorkOrderOverdue", () => {
  it("a Request is overdue only when past due and not RESOLVED/CANCELLED", () => {
    const due = new Date("2026-01-01T00:00:00.000Z");
    const now = new Date("2026-01-02T00:00:00.000Z");
    expect(isMaintenanceRequestOverdue(due, "OPEN", now)).toBe(true);
    expect(isMaintenanceRequestOverdue(due, "RESOLVED", now)).toBe(false);
    expect(isMaintenanceRequestOverdue(due, "CANCELLED", now)).toBe(false);
    expect(isMaintenanceRequestOverdue(null, "OPEN", now)).toBe(false);
  });

  it("a Work Order is overdue only when past due and not CLOSED/CANCELLED", () => {
    const due = new Date("2026-01-01T00:00:00.000Z");
    const now = new Date("2026-01-02T00:00:00.000Z");
    expect(isMaintenanceWorkOrderOverdue(due, "IN_PROGRESS", now)).toBe(true);
    expect(isMaintenanceWorkOrderOverdue(due, "CLOSED", now)).toBe(false);
    expect(isMaintenanceWorkOrderOverdue(due, "CANCELLED", now)).toBe(false);
  });
});

describe("computePartTotalCost", () => {
  it("multiplies quantity x unitCost using Decimal, never floating point", () => {
    const total = computePartTotalCost(3, "19.99");
    expect(total.toFixed(2)).toBe("59.97");
  });
});

describe("computeLaborCost", () => {
  it("multiplies hours x hourlyRate when a rate is given", () => {
    const cost = computeLaborCost("2.5", "100");
    expect(cost?.toFixed(2)).toBe("250.00");
  });

  it("returns null when no hourly rate is given (caller must supply an explicit cost)", () => {
    expect(computeLaborCost("2.5", null)).toBeNull();
  });
});

describe("computeMaintenanceCostSummary", () => {
  it("sums Labor + Parts + Other as the authoritative actual cost, Decimal-safe", () => {
    const summary = computeMaintenanceCostSummary(
      [{ cost: new Prisma.Decimal("100.10") }, { cost: new Prisma.Decimal("50.05") }],
      [{ totalCost: new Prisma.Decimal("29.97") }],
      [{ amount: new Prisma.Decimal("10.00") }]
    );
    expect(summary.laborCost.toFixed(2)).toBe("150.15");
    expect(summary.partsCost.toFixed(2)).toBe("29.97");
    expect(summary.otherCost.toFixed(2)).toBe("10.00");
    expect(summary.actualCost.toFixed(2)).toBe("190.12");
  });

  it("returns all zeros for no entries at all - some maintenance is internal/no-cost", () => {
    const summary = computeMaintenanceCostSummary([], [], []);
    expect(summary.actualCost.toFixed(2)).toBe("0.00");
  });
});

describe("computeCostVariance", () => {
  it("returns actual minus estimated when an estimate exists", () => {
    const variance = computeCostVariance(new Prisma.Decimal("100.00"), new Prisma.Decimal("120.00"));
    expect(variance?.toFixed(2)).toBe("20.00");
  });

  it("returns null when no estimate was given", () => {
    expect(computeCostVariance(null, new Prisma.Decimal("120.00"))).toBeNull();
  });
});

describe("validateWorkOrderCompletion", () => {
  it("requires startedAt, workPerformed, and completionNotes - never a minimum cost", () => {
    const result = validateWorkOrderCompletion({ startedAt: null, workPerformed: null, completionNotes: null });
    expect(result.canComplete).toBe(false);
    expect(result.missing).toEqual(["NOT_STARTED", "WORK_PERFORMED_REQUIRED", "COMPLETION_NOTES_REQUIRED"]);
  });

  it("passes once all three are present, even with zero cost entries", () => {
    const result = validateWorkOrderCompletion({
      startedAt: new Date(),
      workPerformed: "Replaced the AC filter.",
      completionNotes: "No further action needed.",
    });
    expect(result.canComplete).toBe(true);
    expect(result.missing).toEqual([]);
  });

  it("rejects whitespace-only text as missing", () => {
    const result = validateWorkOrderCompletion({ startedAt: new Date(), workPerformed: "   ", completionNotes: "   " });
    expect(result.canComplete).toBe(false);
    expect(result.missing).toContain("WORK_PERFORMED_REQUIRED");
    expect(result.missing).toContain("COMPLETION_NOTES_REQUIRED");
  });
});
