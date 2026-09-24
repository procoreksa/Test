import { NextResponse } from "next/server";
import { isAuthorizedAutomationRequest } from "@/lib/automation/route-auth";
import { processCommunicationOutbox } from "@/lib/automation/outbox-processor";
import { handleWorkerRouteError } from "@/lib/api-error";

/**
 * Step 8/62 - turns durable CommunicationOutboxEvent rows into
 * CommunicationMessage rows. Never calls a provider or touches the network
 * (that remains /api/communications/process's job, unchanged) - this stage's
 * entire job is outbox event in, CommunicationMessage row out. Suggested
 * external cron cadence: every 1-5 minutes (docs/
 * AUTOMATION-SCHEDULED-JOBS.md, "Production trigger & cadence").
 */
export async function POST(request: Request) {
  if (!isAuthorizedAutomationRequest(request)) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  const batchSizeParam = new URL(request.url).searchParams.get("batchSize");
  const batchSize = batchSizeParam ? Number(batchSizeParam) : undefined;

  try {
    const result = await processCommunicationOutbox(batchSize);
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return handleWorkerRouteError("automation.outbox.failed", error);
  }
}
