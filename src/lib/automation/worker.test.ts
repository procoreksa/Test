import { describe, it, expect } from "vitest";
import { STUCK_RUNNING_THRESHOLD_MS } from "@/lib/automation/worker";
import { STUCK_PROCESSING_THRESHOLD_MS } from "@/lib/communications/retry";

describe("STUCK_RUNNING_THRESHOLD_MS (Step 53 - stuck-job recovery threshold)", () => {
  it("is a positive, bounded duration (a stuck job recovers within one operator work session)", () => {
    expect(STUCK_RUNNING_THRESHOLD_MS).toBeGreaterThan(0);
    expect(STUCK_RUNNING_THRESHOLD_MS).toBeLessThanOrEqual(60 * 60_000);
  });

  it("is more generous than the Communications delivery worker's own stuck threshold (a job runs real domain logic, not just a provider call)", () => {
    expect(STUCK_RUNNING_THRESHOLD_MS).toBeGreaterThan(STUCK_PROCESSING_THRESHOLD_MS);
  });
});
