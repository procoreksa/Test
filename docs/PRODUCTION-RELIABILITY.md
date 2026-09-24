# Production Reliability

Written during Prompt 23's production security & reliability hardening
pass. Covers database, object storage, communications, automation/outbox,
health, backup/restore, migration strategy, and disaster scenarios.
Companion to `docs/PRODUCTION-SECURITY.md` and `docs/INCIDENT-RUNBOOK.md`.

## 1. Database

**Connection lifecycle.** `src/lib/prisma.ts` uses the standard
Next.js-recommended singleton pattern (`globalForPrisma`) - one
`PrismaClient` instance per process, never created per-request. No change
needed or made this pass; re-confirmed clean.

**Pooling.** The schema already distinguishes a pooled runtime connection
(`DATABASE_URL`) from a direct migration connection (`DIRECT_URL`) via
Prisma's `directUrl` datasource field - the standard shape for a pooled
provider (Supabase's PgBouncer, Neon). Production should use the
pooled/transaction-mode connection string for `DATABASE_URL` and the
direct connection string for `DIRECT_URL`; see
`docs/PRODUCTION-DEPLOYMENT.md` §4.

**Transaction/network-call audit (re-verified this pass).** No
transaction in the codebase performs a network call, file upload, or
provider send inside its own scope - confirmed again specifically for
Document Management (storage calls happen outside the DB transaction,
with a compensating delete on failure - see §2) and Automation/
Communications (outbox insert happens in the same transaction as the
business write, but delivery/provider-send always happens in a later,
separate transaction/request).

**Raw SQL.** One production `$queryRaw` call
(`src/lib/actions/dashboard.ts`, the monthly invoice trend), using a
`Prisma.sql` tagged template (parameterized, never string-interpolated)
and explicitly `organizationId`-scoped. No `$executeRawUnsafe` outside
test-only helpers (`db-test-helpers.ts`, guarded by
`assertSafeTestDatabaseUrl()`).

**Indexes.** Reviewed against actual production query paths added/changed
this pass: `LoginRateLimitEntry` has a unique index on
`(bucketKey, windowStart)` (the exact lookup/upsert key) and a plain index
on `windowStart` (for a future cleanup job's range scan). No other new
query path was added this pass that needed a new index.

**Unique constraints backing concurrency invariants.** `LoginRateLimitEntry`'s
`@@unique([bucketKey, windowStart])` is what makes the rate limiter's
increment atomic - re-confirmed by a real-DB concurrency test. Every
other documented invariant (`AutomationJob`/`CommunicationOutboxEvent`'s
own unique keys, numbering counters, ownership totals) is unchanged this
pass - see `docs/SECURITY-REVIEW.md` §"Transaction & concurrency audit"
and `docs/AUTOMATION-SCHEDULED-JOBS.md` for their own original write-ups.

## 2. Object storage

The production adapter (`src/lib/documents/providers/s3-compatible.ts`)
is now a real client built on `@aws-sdk/client-s3` - see
`docs/PRODUCTION-SECURITY.md` §10 for its security properties. Reliability
properties:

- **Bounded timeouts, no infinite waits.** `connectionTimeout: 5s`,
  `requestTimeout: 15s` (`@smithy/node-http-handler`'s `NodeHttpHandler`).
  Verified live: a request against a genuinely unreachable endpoint
  (connection refused) fails well within the timeout budget rather than
  hanging (see the adapter's own integration test).
- **Bounded retries, no retry storms.** `maxAttempts: 2` (one retry) - a
  transient blip is tolerated once; a sustained outage fails fast rather
  than compounding load against an already-struggling endpoint.
- **Storage failure during upload.** `putObject()` throwing propagates to
  the caller (`src/lib/actions/documents.ts`), which never marks a
  `DocumentVersion` row as complete until the storage write itself
  succeeds - a failed upload leaves no orphaned/inconsistent DB row.
- **DB failure after a successful S3 put.** If the storage write succeeds
  but the subsequent DB transaction fails, the calling action's existing
  compensating-delete logic (`docs/DOCUMENT-MANAGEMENT.md` §24-25,
  unchanged this pass) attempts to delete the now-orphaned object. If
  *that* delete also fails (a genuine double-failure), the result is an
  orphaned storage object with no DB reference - a storage-cost problem,
  **never** a security problem (a bare key is never itself authorization -
  Critical Principle 3), and not swept by any automated job today. This
  residual risk is explicitly documented, not silently accepted as solved.
- **Delete-compensation failure.** Same shape as above - logged (once
  structured logging is wired into that call site), never silently
  swallowed as if cleanup always succeeds.
- **No claim of distributed-transaction atomicity.** Postgres and the
  object store are never atomically consistent with each other - this is
  a fundamental property of using two separate storage systems, not a bug
  to "fix," and is why `docs/BACKUP-RECOVERY.md` treats a DB backup and an
  object-storage backup as one recovery unit that must be reasoned about
  together (§"Backup consistency" there).
- **Integration verified, not merely unit-mocked.** The real adapter class
  was exercised against a local, in-process S3-compatible server
  (`s3rver`) for put/get/exists/delete round-trips, not-found handling,
  idempotent delete, and the bounded-timeout behavior above - see the
  adapter's own test file and `docs/BACKUP-RECOVERY.md` §7b for the
  restore-drill-specific run. No real AWS/R2/MinIO account exists in this
  environment; that gap is stated explicitly, never glossed over.

## 3. Communications & automation

Unchanged in architecture from `docs/AUTOMATION-SCHEDULED-JOBS.md` and
`docs/NOTIFICATIONS-COMMUNICATIONS.md` (this pass touched only the worker
routes' auth/error-handling, not their business logic). Key properties,
re-confirmed:

- **Durability.** A business event's `CommunicationOutboxEvent` row is
  inserted in the *same* database transaction as the business write it
  originates from - the primary durability mechanism, never dependent on
  the outbox-processor route actually running promptly.
- **Provider-outage behavior.** A `CommunicationMessage` stuck in `QUEUED`/
  `FAILED` never blocks the business action that created it - the
  business transaction has already committed by the time any provider
  call happens. Failure is visible via `failedMessages` in
  `/api/ops/health` (Prompt 23, new this pass) and via the existing
  Communication Center UI.
- **Scheduler-outage recovery.** If `/api/automation/scheduler` isn't
  called for a while, discovery simply resumes on the next call - job
  keys are deterministic and idempotent (`src/lib/automation/job-keys.ts`),
  so a missed window never produces a duplicate reminder once discovery
  resumes; a job whose `scheduledFor` window has already passed is still
  discovered and still executed (late, not lost).
- **Outbox-backlog drain.** Repeated, bounded calls to
  `/api/automation/outbox` safely drain any backlog - each call claims a
  bounded batch, and the underlying idempotency keys prevent a retried/
  overlapping call from duplicating a message.
- **Worker replay safety.** Every job/outbox-event claim uses a
  conditional `updateMany` (claim only if still `PENDING`/unlocked) -
  replaying the same worker call concurrently or after a crash can never
  double-process the same logical unit of work.

## 4. Health & readiness (Prompt 23 - new tiering this pass)

See `docs/PRODUCTION-SECURITY.md` §13 for the three-tier design
(liveness/readiness/protected operational health). Operationally:
configure the hosting platform's liveness probe against `/api/health`,
its readiness probe against `/api/health/ready`, and use `/api/ops/health`
(bearer-secret-gated) for manual/dashboard operator checks - never wire an
orchestrator's automated liveness probe to the protected endpoint (it
needs the secret, which a liveness probe configuration shouldn't need to
know).

## 5. Migration safety & deployment procedure

Every migration in this repository remains additive-only (no destructive
change without an explicit, reviewed exception). The migration-ordering
bug found and fixed by this pass's own restore drill
(`docs/BACKUP-RECOVERY.md` §8, `docs/TECHNICAL-DEBT.md` item #8) means a
**fresh** `prisma migrate deploy` from an empty database is now verified
to work end-to-end - previously untested in that exact shape.

**Deployment procedure for a schema migration:**
1. Take a fresh, verified backup (`docs/BACKUP-RECOVERY.md` §4) -
   immediately before the migration runs.
2. `prisma migrate deploy` (never `migrate dev` in production).
3. Confirm `/api/health/ready` returns `200`.
4. Smoke-test: login (all 3 principals if the change could plausibly
   affect auth), one representative read, one representative write.
5. **Rollback decision:** since migrations are additive-only, a code
   rollback never requires a schema rollback - redeploy the previous
   application build/commit. The schema's extra (unused-by-old-code)
   columns/tables are harmless to the older code. If a migration turns
   out not to have been purely additive despite review, restore from the
   pre-migration backup rather than hand-writing a reverse migration
   against live data.
6. Keep the pre-migration backup independent of the regular rolling
   retention schedule for 24-48 hours post-deploy.

## 6. Backup, restore, RPO/RTO

See `docs/BACKUP-RECOVERY.md` for the full backup requirements and the
restore drill actually executed this pass (both database and object
storage, with real checksum/integrity verification, not just "the command
exited 0").

**RPO/RTO - stated as targets to design toward, never a fabricated
provider SLA:**
- **Database RPO target:** bounded by the managed provider's backup
  cadence - daily full backups at minimum, continuous WAL/PITR where the
  plan supports it (minutes, not a full day, if PITR is enabled).
- **Database RTO target:** on the order of tens of minutes for a
  same-region restore into a fresh instance plus the deployment sequence
  in §5 - not measured against a real production incident in this
  environment, since none has occurred; a target, not a guarantee.
- **Object storage RPO/RTO targets:** depend entirely on the chosen
  provider's own versioning/replication configuration - see
  `docs/BACKUP-RECOVERY.md` §1 for why this remains a deliberate
  deployment-time decision rather than a number this document invents.

## 7. Disaster-scenario runbook coverage

See `docs/INCIDENT-RUNBOOK.md` for step-by-step procedures. Scenarios
explicitly covered there: database outage, object-storage outage,
communication-provider outage, scheduler stopped, outbox backlog, failed
migration, bad deployment, lost object, credential rotation, and
suspected security compromise (account/worker-secret/storage-credential/
DB-credential, unexpected cross-tenant exposure).

## 8. What remains a known gap (honest disposition)

- Object storage has never been exercised against a real cloud provider
  account (only a local S3-compatible test server) - stated explicitly in
  `docs/PRODUCTION-SECURITY.md` §17 and here, never claimed otherwise.
- No automated orphaned-storage-object reconciliation job exists yet
  (`docs/DOCUMENT-MANAGEMENT.md`/`docs/TECHNICAL-DEBT.md` item 11c,
  unchanged) - a cost problem, not a security problem, deferred as
  explicitly out of scope for this hardening-only pass.
- No monitoring/alerting vendor integration exists - `/api/ops/health`
  gives an operator a place to *look*, but nothing pages anyone
  automatically yet (unchanged from the prior pass's own conclusion,
  `docs/PRODUCTION-DEPLOYMENT.md` §9).
