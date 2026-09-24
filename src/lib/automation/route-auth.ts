import { isAuthorizedWorkerRequest } from "@/lib/security/worker-auth";

/**
 * Step 62/103 - every automation worker route (scheduler, worker, outbox
 * processor, reconciliation) is gated by this single shared secret,
 * deliberately distinct from `COMMUNICATIONS_WORKER_SECRET` (the
 * pre-existing Communications delivery worker's own secret,
 * src/app/api/communications/process/route.ts) so each stage's blast
 * radius stays independently rotatable and independently auditable -
 * never a browser session, never stored in the database. See
 * docs/AUTOMATION-SCHEDULED-JOBS.md, "Production runbook - secret
 * rotation."
 *
 * Hardening (Prompt 23 Step 21): the secret is read from the
 * `Authorization: Bearer <token>` header via the centralized
 * isAuthorizedWorkerRequest() helper (src/lib/security/worker-auth.ts) -
 * a `?token=` query-string parameter is no longer accepted at all, since a
 * query string is captured by access logs/`Referer` headers in a way a
 * header sent by a trusted server-to-server cron caller is not.
 */
export function isAuthorizedAutomationRequest(request: Request): boolean {
  return isAuthorizedWorkerRequest(request, process.env.AUTOMATION_WORKER_SECRET);
}
