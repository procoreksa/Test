# Incident Runbook

Written during Prompt 23's production security & reliability hardening
pass. Step-by-step procedures for an operator responding to a suspected
incident. No real credentials appear anywhere in this document - every
example is a placeholder. Companion to `docs/PRODUCTION-SECURITY.md` and
`docs/PRODUCTION-RELIABILITY.md`.

General principle for every scenario below: **contain first, then
investigate, then remediate, then document.** Rotating a secret or
disabling an account is cheap and reversible; leaving a suspected
compromise live while you investigate is not.

## 1. Suspected internal account compromise

1. **Contain:** an OWNER/ADMIN deactivates the affected `User` row
   immediately (existing admin UI). Deactivation takes effect within 5
   minutes even for an already-open session, via the periodic session
   revalidation (`src/lib/auth-session-refresh.ts`) - no need to wait for
   a 30-day JWT to expire.
2. **Investigate:** query `AuditLog` for that `userId` across the
   suspected window - every login (`LOGIN`/`LOGIN_FAILED`) and every
   mutating action is recorded with `ipAddress`/`userAgent`.
3. **Remediate:** reset the account's password (forces a fresh
   credential); review whether any financial/data mutation in the
   suspected window needs manual correction (this codebase never allows
   editing posted financial records - only reversal/new-linked-row
   patterns - so "correction" here means an explicit reversal, never an
   edit).
4. **Document:** record the incident, window, and affected `AuditLog` row
   ids somewhere durable outside this codebase (this app has no incident
   ticketing of its own).

## 2. Suspected Tenant/Owner Portal account compromise

Same shape as §1, using `TenantPortalAccount`/`OwnerPortalAccount`'s own
`status` field (`SUSPENDED`/`DISABLED`) instead of `User.isActive` - takes
effect within 5 minutes via the same revalidation pattern
(`refreshTenantSessionClaims()`/`refreshOwnerSessionClaims()`). Query
`AuditLog` filtered by `entityType = "TenantSession"` or `"OwnerSession"`
and the account's id.

## 3. Worker secret compromise (`AUTOMATION_WORKER_SECRET` /
`COMMUNICATIONS_WORKER_SECRET` / `ADMIN_SEED_SECRET`)

1. **Contain:** generate a new random secret value (32+ random bytes) and
   set it on the hosting platform's environment configuration for the
   affected variable only - the other two worker secrets are
   independently rotatable and unaffected.
2. **Deploy:** restart/redeploy the application so the new value takes
   effect (an env var change alone doesn't hot-reload a running Node
   process).
3. **Update callers:** update whatever external cron/scheduled-task
   caller invokes that route with the new secret in its `Authorization:
   Bearer` header.
4. **Investigate:** since worker routes have no session/cookie/user
   identity attached, there's no `AuditLog` login trail for a worker-route
   call - review the hosting platform's own HTTP access logs for the
   affected route/time window for unexpected call volume or unfamiliar
   source IPs.
5. If `ADMIN_SEED_SECRET` specifically: confirm `ALLOW_PRODUCTION_SEED` is
   `false` (or unset) in production - it should be, by default; if it was
   ever set to `true` in production, treat that itself as a finding to
   investigate (why was a demo-data bootstrap endpoint enabled in
   production).

## 4. Storage credential compromise (`DOCUMENT_S3_ACCESS_KEY_ID`/
`DOCUMENT_S3_SECRET_ACCESS_KEY`)

1. **Contain:** rotate the access key pair at the storage provider
   directly (AWS IAM console, R2 dashboard, etc.) - revoke the old key
   pair immediately once the new one is confirmed working.
2. **Deploy:** update `DOCUMENT_S3_ACCESS_KEY_ID`/
   `DOCUMENT_S3_SECRET_ACCESS_KEY` on the hosting platform and
   redeploy/restart.
3. **Verify:** `/api/ops/health`'s `storage.provider` reports
   `S3_COMPATIBLE`; perform one real upload+download smoke test through
   the internal Document Center UI.
4. **Investigate:** review the storage provider's own access logs (S3
   server access logging / CloudTrail equivalent) for the compromised
   key's activity window - this application does not itself log
   individual storage-provider API calls beyond
   success/failure at the adapter boundary.

## 5. Database credential compromise (`DATABASE_URL`/`DIRECT_URL`)

1. **Contain:** rotate the database password/connection credential at the
   provider level immediately.
2. **Deploy:** update `DATABASE_URL`/`DIRECT_URL` and redeploy/restart.
3. **Verify:** `/api/health/ready` returns `200` (confirms the new
   credential works and the app can reach the database).
4. **Investigate:** review the managed Postgres provider's own connection/
   query audit log (most managed providers offer this) for the
   compromised credential's activity window.
5. Consider whether a full data-integrity check is warranted
   (`scripts/check-data-integrity.ts`, existing standing tool - re-verifies
   cross-org/state-consistency/ownership-total invariants against real
   data).

## 6. Unexpected cross-tenant data exposure

1. **Contain:** if a specific code path is identified, treat it as a P0 -
   deploy a fix or, if no fix is immediately ready, consider disabling the
   affected feature/route entirely rather than leaving it live.
2. **Scope the blast radius:** identify exactly which organizations'
   data was exposed and to whom, using `AuditLog` (every read/mutation
   this codebase's `requirePermission()`-gated actions perform is
   attributable to a `userId`/`organizationId`) and the specific
   vulnerable query/action.
3. **Fix:** apply the missing `organizationId` scope (this codebase's
   established pattern - see `docs/SECURITY-REVIEW.md`'s own Finding 2 for
   a worked example of exactly this fix, applied to `Contract.renterId`).
4. **Regression-test:** add a real-DB cross-org test proving the fix
   (this codebase's established pattern - every prior cross-org finding
   has a permanent regression test under `__dbtests__`).
5. **Notify:** determine notification obligations to the affected
   organization(s) per the organization's own data-processing agreement/
   applicable law - outside this codebase's own scope to decide.

## 7. Failed deployment

1. Since every migration is additive-only (`docs/PRODUCTION-RELIABILITY.md`
   §5), the fastest safe recovery is almost always **redeploy the previous
   known-good build/commit** - the old code remains compatible with the
   new (superset) schema.
2. If the failure is itself a migration failure (see §8), do not redeploy
   application code on top of a half-applied migration - resolve the
   migration first.
3. Check `/api/health/ready` immediately after any redeploy.

## 8. Failed migration

1. **Do not attempt to hand-write a reverse migration against live
   production data** under time pressure.
2. Restore from the pre-migration backup taken per
   `docs/PRODUCTION-RELIABILITY.md` §5 step 1.
3. Investigate what made the migration not purely additive (contrary to
   this codebase's established discipline) in a non-production
   environment (mirroring `docs/BACKUP-RECOVERY.md` §7a's own restore-drill
   procedure) before attempting it again.
4. If migration history bookkeeping itself becomes inconsistent (a
   migration folder renamed/reordered, as happened during this pass's own
   restore drill - `docs/BACKUP-RECOVERY.md` §8), use the official
   `npx prisma migrate resolve --applied <name>` (or `--rolled-back`)
   command to reconcile `_prisma_migrations` - never a raw SQL edit of
   that table, which bypasses Prisma's own bookkeeping guarantees.

## 9. Database outage

1. `/api/health` (liveness) stays `200` even during a DB outage (it
   doesn't check the database at all) - `/api/health/ready` correctly
   flips to `503`. Configure the hosting platform's traffic routing
   against readiness, not liveness, so traffic stops reaching an instance
   that can't serve real requests.
2. Check the managed Postgres provider's own status page/dashboard first -
   this is very often provider-side, not application-side.
3. If a failover/restore is needed, follow
   `docs/PRODUCTION-RELIABILITY.md` §5's deployment procedure once the
   database is reachable again on a (possibly new) connection string.

## 10. Object storage outage

1. Document upload/download will fail with a clear, safe error (the
   adapter's bounded timeouts mean this fails within ~20 seconds, not
   indefinitely) - every other feature of the application continues to
   function normally, since no other code path depends on object storage.
2. `/api/ops/health`'s `storage.provider` field confirms which adapter is
   configured; a `MISCONFIGURED_LOCAL_DEV_IN_PRODUCTION` value there is
   itself an incident (production storage configuration was lost or never
   set) - investigate immediately, since new production uploads would
   otherwise silently target a non-durable path (though
   `src/instrumentation.ts`'s startup check should already have prevented
   the server from starting in that state).
3. No DB corruption results from a storage-side outage - metadata rows are
   never written until after a successful storage operation.

## 11. Communication provider outage

1. Business actions are unaffected - the outbox/message durability
   pattern means nothing is lost, only delayed (see
   `docs/PRODUCTION-RELIABILITY.md` §3).
2. `/api/ops/health`'s `communications.failedMessages` count rises -
   monitor it; once the provider recovers, the existing
   `/api/automation/outbox` and `/api/communications/process` worker
   routes drain the backlog on their normal cadence with no special
   recovery action needed.

## 12. Scheduler stopped / automation backlog

1. `/api/ops/health`'s `automation.pendingJobs`/`oldestPendingJobAgeSeconds`
   reveal a stopped scheduler (a growing pending count, an increasing
   oldest-pending age).
2. Confirm the external cron/scheduled-task caller (Vercel Cron, Cloud
   Scheduler, etc.) is still configured and firing - this application
   never triggers these routes itself.
3. Once resumed, discovery/execution simply continues from where it left
   off - no manual backlog-clearing step is needed (idempotent by design).

## 13. Lost/missing object (DB row exists, storage object doesn't)

1. This is the one integrity problem a DB backup and an object-storage
   backup, taken independently, can produce - see
   `docs/BACKUP-RECOVERY.md` §"What must be backed up" for why. The
   download route already handles this safely today: a missing object
   produces a clean `404`, never a `500` or a leak of internal state (see
   `docs/DOCUMENT-MANAGEMENT.md` §28).
2. If isolated to one document: check whether a recent object-storage
   restore is available for that specific key; if not, the file is
   genuinely lost and the affected user should be asked to re-upload.
3. If widespread (many documents affected at once): this points to a
   storage-side incident (accidental bucket-level deletion, a failed
   migration between storage providers) - treat as a P0, engage the
   storage provider's own support/recovery process immediately.

## 14. Credential rotation (routine, not incident-driven)

Same mechanics as §§3-5 above, minus the "contain" urgency - rotate on a
routine schedule (e.g. annually, or per the organization's own security
policy), verify via the same health-check/smoke-test steps, and update the
hosting platform's environment configuration. Never reuse a rotated-out
secret for anything else.
