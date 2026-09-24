import { NextResponse } from "next/server";
import { isAuthorizedAutomationRequest } from "@/lib/automation/route-auth";
import { runAutomationScheduler } from "@/lib/automation/scheduler";

/**
 * Step 20/62 - discovers eligible business records and idempotently inserts
 * missing AutomationJob rows. Never claims or executes a job in the same
 * request (that is /api/automation/worker's job) - keeping discovery and
 * execution as two separate, independently-triggerable stages (Step 20).
 * Suggested external cron cadence: every 15-60 minutes (docs/
 * AUTOMATION-SCHEDULED-JOBS.md, "Production trigger & cadence").
 */
export async function POST(request: Request) {
  if (!isAuthorizedAutomationRequest(request)) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  try {
    const result = await runAutomationScheduler();
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
