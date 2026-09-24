import { NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { processQueuedCommunications } from "@/lib/communications/processor";

/**
 * Protected internal worker route - the only way processQueuedCommunications()
 * ever runs. Gated by a dedicated shared secret (not AUTH_SECRET - this
 * route triggers real provider sends, a materially different blast radius
 * than the demo-seed route it otherwise mirrors), reusing the same
 * `?token=` + `timingSafeEqual` idiom as src/app/api/admin/seed/route.ts.
 *
 * No scheduler exists in this codebase (see docs/NOTIFICATIONS-COMMUNICATIONS.md,
 * "Scheduling boundary") - an external cron/scheduled-task caller is
 * expected to hit this endpoint periodically. Batch size is bounded
 * (processQueuedCommunications() itself caps it) so one invocation can
 * never run unbounded.
 */
function isAuthorized(request: Request): boolean {
  const token = new URL(request.url).searchParams.get("token") ?? "";
  const secret = process.env.COMMUNICATIONS_WORKER_SECRET ?? "";
  const tokenBuf = Buffer.from(token);
  const secretBuf = Buffer.from(secret);
  if (!secret || tokenBuf.length !== secretBuf.length) return false;
  return timingSafeEqual(tokenBuf, secretBuf);
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
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
