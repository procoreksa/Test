import { NextResponse } from "next/server";
import { isAuthorizedWorkerRequest } from "@/lib/security/worker-auth";
import { processQueuedCommunications } from "@/lib/communications/processor";
import { handleWorkerRouteError } from "@/lib/api-error";

/**
 * Protected internal worker route - the only way processQueuedCommunications()
 * ever runs. Gated by a dedicated shared secret (not AUTH_SECRET - this
 * route triggers real provider sends, a materially different blast radius
 * than the demo-seed route it otherwise mirrors), read from the
 * `Authorization: Bearer <token>` header via the centralized
 * isAuthorizedWorkerRequest() helper (Prompt 23 Step 21/22 - never a
 * `?token=` query-string parameter, never re-implementing its own
 * timing-safe comparison).
 *
 * No scheduler exists in this codebase (see docs/NOTIFICATIONS-COMMUNICATIONS.md,
 * "Scheduling boundary") - an external cron/scheduled-task caller is
 * expected to hit this endpoint periodically. Batch size is bounded
 * (processQueuedCommunications() itself caps it) so one invocation can
 * never run unbounded.
 */
function isAuthorized(request: Request): boolean {
  return isAuthorizedWorkerRequest(request, process.env.COMMUNICATIONS_WORKER_SECRET);
}

export async function POST(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  const batchSizeParam = new URL(request.url).searchParams.get("batchSize");
  const batchSize = batchSizeParam ? Number(batchSizeParam) : undefined;

  try {
    const result = await processQueuedCommunications(batchSize);
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return handleWorkerRouteError("communications.process.failed", error);
  }
}
