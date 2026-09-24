import { NextResponse } from "next/server";
import { isAuthorizedAutomationRequest } from "@/lib/automation/route-auth";
import { runCommunicationReconciliation } from "@/lib/automation/reconciliation";

/**
 * Step 15/62 - defense-in-depth only (never the primary durability
 * mechanism - that is the same-transaction outbox insert, Critical
 * Principle 1). Re-derives the expected CommunicationOutboxEvent for each
 * of the 9 originally-wired business events from its own authoritative
 * source table and fills in only what is durably missing. Suggested
 * external cron cadence: daily or hourly (docs/AUTOMATION-SCHEDULED-JOBS.md,
 * "Production trigger & cadence") - never sub-minute real-time.
 */
export async function POST(request: Request) {
  if (!isAuthorizedAutomationRequest(request)) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  try {
    const result = await runCommunicationReconciliation();
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
