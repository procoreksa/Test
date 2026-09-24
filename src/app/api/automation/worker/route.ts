import { NextResponse } from "next/server";
import { isAuthorizedAutomationRequest } from "@/lib/automation/route-auth";
import { runAutomationWorker } from "@/lib/automation/worker";
import { handleWorkerRouteError } from "@/lib/api-error";

/**
 * Step 48/62 - claims and executes already-scheduled, due AutomationJob rows
 * through the central handler registry. Bounded batch size (env-overridable,
 * capped inside runAutomationWorker()) keeps one invocation suitable for a
 * serverless/route execution-time budget - never an endless loop. Suggested
 * external cron cadence: every 5-15 minutes (docs/
 * AUTOMATION-SCHEDULED-JOBS.md, "Production trigger & cadence").
 */
export async function POST(request: Request) {
  if (!isAuthorizedAutomationRequest(request)) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  const batchSizeParam = new URL(request.url).searchParams.get("batchSize");
  const batchSize = batchSizeParam ? Number(batchSizeParam) : undefined;

  try {
    const result = await runAutomationWorker(batchSize);
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return handleWorkerRouteError("automation.worker.failed", error);
  }
}
