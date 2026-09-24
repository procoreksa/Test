import { timingSafeEqual } from "crypto";

/**
 * Step 62/103 - every automation worker route (scheduler, worker, outbox
 * processor) is gated by this single shared secret, deliberately distinct
 * from `COMMUNICATIONS_WORKER_SECRET` (the pre-existing Communications
 * delivery worker's own secret, src/app/api/communications/process/route.ts)
 * so each stage's blast radius stays independently rotatable and
 * independently auditable - never a browser session, never stored in the
 * database. See docs/AUTOMATION-SCHEDULED-JOBS.md, "Production runbook -
 * secret rotation."
 */
export function isAuthorizedAutomationRequest(request: Request): boolean {
  const token = new URL(request.url).searchParams.get("token") ?? "";
  const secret = process.env.AUTOMATION_WORKER_SECRET ?? "";
  const tokenBuf = Buffer.from(token);
  const secretBuf = Buffer.from(secret);
  if (!secret || tokenBuf.length !== secretBuf.length) return false;
  return timingSafeEqual(tokenBuf, secretBuf);
}
