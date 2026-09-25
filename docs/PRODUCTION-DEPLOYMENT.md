# Production Deployment Architecture

Written during the production-readiness hardening pass. Describes the
recommended deployment shape for this codebase as it exists today - no
deployment was actually performed as part of this task. The architecture
is deliberately provider-agnostic: **Render for application hosting** and
**Supabase for PostgreSQL (and, later, Storage)** are the named reference
targets, but nothing in the application code is coupled to either - see
§8 for exactly what would need to change to run on a different host/
database provider, which is "just environment variables," by design.

## 1. Target shape

```
Git repository (this repo)
        │
        ▼
Application hosting (Render Web Service, or equivalent)
  - runs `next build` then `next start`
  - stateless for everything except document uploads while only
    LOCAL_DEV storage is configured - see §2/§5
        │
        ▼
PostgreSQL (Supabase, or any managed Postgres)
  - one pooled connection string for runtime (DATABASE_URL)
  - one direct connection string for migrations (DIRECT_URL)
        │
        ▼
Object storage (Supabase Storage, or S3-compatible)
  - adapter boundary exists (docs/DOCUMENT-MANAGEMENT.md); no real
    account configured in this environment - see §5
```

## 2. Application

- **Build:** `npm run build` → `prisma generate && next build` (already the
  repository's own `package.json` script). **Migrations are a separate,
  explicit step** (`npm run migrate:deploy` → `prisma migrate deploy`),
  run deliberately before the build, never as an implicit side effect of
  it - a generic build command should never be able to mutate the
  production database. The recommended production sequence is: verify a
  fresh database backup exists → `npm run migrate:deploy` → `npx prisma
  migrate status` (confirm no pending/failed migrations) → `npm run build`
  (no DB mutation) → deploy/start the application → health/readiness
  smoke tests. (Historical note: earlier revisions of this document
  described `npm run build` as running `prisma migrate deploy` internally
  - that was true of this repository's `package.json` at the time and has
  since been deliberately separated for exactly the reason above.)
- **Start:** `npm run start` → `next start -p ${PORT:-3000}` (already
  respects a platform-injected `PORT`, matching Render's own convention).
- **Statelessness:** no session store on disk (NextAuth's JWT strategy
  needs no server-side session store). **Caveat added by Document
  Management (docs/DOCUMENT-MANAGEMENT.md):** the `LOCAL_DEV` storage
  adapter *does* write uploaded files to local disk
  (`var/document-storage/` by default) and is explicitly documented as
  non-production - it is neither durable across restarts on ephemeral
  filesystems nor safe to run behind multiple instances (each instance
  would see only the files it personally wrote). Production deployment
  requires configuring the `S3_COMPATIBLE` adapter (§5 below) before this
  app can be considered stateless/multi-instance-safe with real user
  uploads in play.

## 3. Database

- **Connection pooling (Step 61).** The schema already distinguishes a
  pooled runtime connection (`DATABASE_URL`) from a direct migration
  connection (`DIRECT_URL`) via Prisma's `directUrl` datasource field
  (`prisma/schema.prisma`) - this is exactly the distinction a serverless-
  friendly host like Supabase (via PgBouncer) or Neon requires: the app's
  many short-lived request connections go through the pooler, while
  `prisma migrate deploy`'s schema-altering statements need a direct,
  unpooled connection (some pooled modes don't support the session-level
  features migrations need). **On Supabase specifically:** use the
  "Connection pooling" connection string (port 6543, transaction mode)
  for `DATABASE_URL`, and the direct connection string (port 5432) for
  `DIRECT_URL`. Locally, both point at the same single Postgres instance
  (already the case in `.env.example`).
- **Migrations.** `npm run migrate:deploy` → `prisma migrate deploy`
  (never `migrate dev` in production - it can prompt interactively and is
  meant for local development only), run as its own explicit deployment
  step before `npm run build`, applies whatever migrations exist in
  `prisma/migrations/` that the target database hasn't seen yet. Every
  migration in this repository's history is additive-only (see each
  migration's own header comment) - a deliberate, maintained discipline,
  not an accident, and the one this hardening pass's own new migration
  (`20260922204200_invoice_dashboard_index`) follows too.
- **No credentials in source** - confirmed during this pass (see
  `docs/SECURITY-REVIEW.md` §"Secrets & environment") that no real
  connection string has ever been committed.

## 4. Environment variables

Required in every environment:

| Variable | Purpose | Notes |
|---|---|---|
| `DATABASE_URL` | Runtime (pooled) Postgres connection | Required |
| `DIRECT_URL` | Migration (direct) Postgres connection | Required; same as `DATABASE_URL` locally |
| `AUTH_SECRET` | NextAuth JWT signing secret | Required; must be a real random secret in production, never the `.env.example` placeholder |
| `COMMUNICATIONS_WORKER_SECRET` | Gates `POST /api/communications/process` (the notification delivery worker) | Required once any notification is expected to actually send - see `docs/NOTIFICATIONS-COMMUNICATIONS.md` §34 |
| `AUTOMATION_WORKER_SECRET` | Gates `POST /api/automation/{scheduler,worker,outbox,reconciliation}` and `GET /api/ops/health` | Required once any scheduled reminder or the outbox is expected to run - deliberately a separate secret from `COMMUNICATIONS_WORKER_SECRET` so each stage is independently rotatable; see `docs/AUTOMATION-SCHEDULED-JOBS.md` §39 |
| `DOCUMENT_S3_ENDPOINT` | S3-compatible storage endpoint URL | **Required in production** (Prompt 23, Critical Rule 5) - production must not run on `LOCAL_DEV` storage; see §5 below |
| `DOCUMENT_S3_REGION` | S3-compatible storage region | Required alongside the other four `DOCUMENT_S3_*` variables |
| `DOCUMENT_S3_BUCKET` | S3-compatible storage bucket name | Required alongside the other four `DOCUMENT_S3_*` variables |
| `DOCUMENT_S3_ACCESS_KEY_ID` | S3-compatible storage access key | Required alongside the other four `DOCUMENT_S3_*` variables |
| `DOCUMENT_S3_SECRET_ACCESS_KEY` | S3-compatible storage secret key | Required alongside the other four `DOCUMENT_S3_*` variables |

Required only if that specific route is ever exposed in production:

| Variable | Purpose | Notes |
|---|---|---|
| `ADMIN_SEED_SECRET` | Gates `POST /api/admin/seed` | Never `AUTH_SECRET` (Prompt 23 hardening - a worker secret must never double as the session-signing secret) |
| `ALLOW_PRODUCTION_SEED` | Must be exactly `"true"` for `/api/admin/seed` to run at all when `NODE_ENV=production` | Defaults closed (any other value, including unset, refuses the route in production) - see `src/app/api/admin/seed/route.ts` |

Optional (independent per-principal auth secrets, storage addressing, ZATCA
e-invoicing):

| Variable | Purpose |
|---|---|
| `OWNER_AUTH_SECRET` | Independent Owner Portal signing secret (derived from `AUTH_SECRET` if unset) |
| `TENANT_AUTH_SECRET` | Independent Tenant Portal signing secret (derived from `AUTH_SECRET` if unset) |
| `DOCUMENT_S3_FORCE_PATH_STYLE` | `"true"` (default) or `"false"` - path-style vs. virtual-hosted-style S3 addressing |
| `ZATCA_ENVIRONMENT` | `sandbox` or production |
| `ZATCA_API_BASE_URL` | Fatoora endpoint |
| `ZATCA_ONBOARDING_OTP` | One-time onboarding credential |

**Explicitly do not set** `NEXTAUTH_URL`/`AUTH_URL` - the app has
`trustHost: true` and derives the correct origin from each request's own
headers (already documented in `.env.example`'s own comment); hardcoding
this is a common source of "login redirects to the wrong host" bugs after
a deploy.

**No `NEXT_PUBLIC_*` variable exists in this codebase** (confirmed during
this pass) - so there is currently nothing that could accidentally expose
a server-only secret to the client bundle via that mechanism. If one is
ever added, remember that anything prefixed `NEXT_PUBLIC_` is bundled into
client-side JavaScript and must never hold a secret.

**Per-environment summary:**

- **Development** - `.env`, pointing at a local Postgres; `AUTH_SECRET`
  can be any string (never reused in production).
- **Test** - `.env.test`, pointing at a disposable database whose name
  the test suite itself guards against accidentally being a real database
  (`assertSafeTestDatabaseUrl()`, `src/lib/test-db-guard.ts`) - already
  built and reviewed, no change needed.
- **Production** - real secrets, injected via the hosting platform's own
  environment/secrets management (Render's Environment tab, or
  equivalent) - never committed, never logged (confirmed zero
  `console.log` calls anywhere in this pass's audit).

## 5. Storage

Document Management (`docs/DOCUMENT-MANAGEMENT.md`) added the adapter
boundary (`DocumentStorageProvider`); Prompt 23's hardening pass closed
the previously-open gap by wiring a real client behind it. Two adapters
exist:

- **`LOCAL_DEV`** (the fallback when the five `DOCUMENT_S3_*` variables
  aren't all set) - filesystem-backed, explicitly non-production (see
  §2's caveat above). Fine for local development and this environment's
  own tests only. **Production refuses to start on this adapter** -
  `src/instrumentation.ts` fails closed at server startup if
  `NODE_ENV=production` and the S3 configuration is missing/partial
  (Critical Rule 3/5); `getDefaultStorageProviderKind()` independently
  throws the same refusal if ever reached directly.
- **`S3_COMPATIBLE`** - the production adapter, now a real client built on
  the official AWS SDK v3 (`@aws-sdk/client-s3` + `@smithy/
  node-http-handler`), which works unmodified against real AWS S3 and any
  S3-compatible provider (Cloudflare R2, MinIO, Backblaze B2, Supabase
  Storage) via a custom `DOCUMENT_S3_ENDPOINT`. Becomes active once all
  five `DOCUMENT_S3_*` variables (§4 above) are set. Bounded connection
  (5s)/request (15s) timeouts and a bounded retry count (2 attempts) - no
  infinite waits, no retry storms. Private-by-default (no ACL ever set);
  the only read path is the server-side, re-authorized download route -
  see `docs/PRODUCTION-SECURITY.md` §10.
- **What has and hasn't been verified:** the real adapter class was
  exercised end-to-end (put/get/exists/delete, not-found handling,
  idempotent delete, a full backup-delete-restore-checksum-verify cycle)
  against a local, in-process S3-compatible test server - see
  `docs/BACKUP-RECOVERY.md` §7b. It has **not** been exercised against a
  real AWS/R2/MinIO account, since none exists in this environment - do
  not claim "production storage verified against a live provider" until
  that's actually done with real credentials in a real environment.

## 6. Health check (three tiers - Prompt 23)

- **`GET /api/health`** - public, unauthenticated **liveness**. Never
  touches the database. Returns `{ status, timestamp, version }`. Point
  the hosting platform's liveness probe here.
- **`GET /api/health/ready`** - public, unauthenticated **readiness**.
  Checks DB reachability and production config validity; returns
  `200`/`503` and `{ status, timestamp, checks: { database, config } }`.
  Point the hosting platform's readiness probe / load-balancer health
  check here (not at `/api/health`) so traffic stops reaching an instance
  that can't actually serve it.
- **`GET /api/ops/health`** - protected (`Authorization: Bearer
  $AUTOMATION_WORKER_SECRET`) **operational health** for a human operator:
  automation/outbox backlog counts and oldest-pending ages, communication
  failure count, active storage provider. Never wire an automated
  orchestrator probe to this one - it needs the secret.

All three deliberately never return a database host/version/credential/
schema detail, bucket name, or organization-specific data - safe to leave
`/api/health` and `/api/health/ready` publicly reachable.

## 7. Backups

See `docs/BACKUP-RECOVERY.md` for the full requirements (automated daily
backups at minimum, point-in-time recovery where the plan supports it,
mandatory pre-migration backups, quarterly restore drills).

## 8. Provider portability

Nothing in `src/` imports a Render-specific or Supabase-specific SDK -
the application talks to Postgres exclusively through Prisma
(`DATABASE_URL`/`DIRECT_URL`) and (once built) to object storage
exclusively through the abstraction described in
`docs/STORAGE-ARCHITECTURE.md`. Moving to a different host or database
provider is, by design, an environment-variable change plus (for a
non-Postgres database) a Prisma provider swap - never a code rewrite.
This portability was verified by inspection (no `@supabase/*` or
Render-specific package appears in `package.json`), not by actually
testing a second provider in this pass.

## 9. Observability

**Structured logging - added this pass** (`src/lib/logging.ts`): a
lightweight, dependency-free JSON-line logger (`logInfo`/`logWarn`/
`logError`/`logSecurityEvent`), with centralized, case-insensitive
redaction of anything secret-shaped before it's ever serialized (see
`docs/PRODUCTION-SECURITY.md` §14). Every worker/protected-API route's
catch block now calls `handleWorkerRouteError()`
(`src/lib/api-error.ts`), which logs the real (redacted) error under a
`correlationId` and returns only `{ ok: false, error: "INTERNAL_ERROR",
correlationId }` to the caller - never the raw exception message. This is
still intentionally "just enough to investigate an incident from logs
alone," not a full observability platform - no monitoring vendor is
integrated, and none should be added purely for a hardening pass. `/api/
ops/health` (§6) gives an operator a place to actively check backlog/
failure state; nothing pages anyone automatically yet.

Documented future needs, for whoever scopes that work:

- **Application errors** - a Next.js-native error-tracking integration
  (e.g. Sentry's official Next.js SDK) would be the natural fit given the
  framework already in use; currently there is no `error.tsx` boundary at
  all (see `docs/TECHNICAL-DEBT.md`), which would be worth adding
  alongside error tracking, not before it.
- **Database errors/latency** - most managed Postgres providers
  (Supabase included) expose this at the infrastructure level already;
  worth wiring into the same alerting channel as application errors
  rather than treated separately.
- **Login failures** - already captured in `AuditLog` today
  (`LOGIN_FAILED` rows) - a future dashboard/alert reading from that table
  is cheaper to build than a separate logging pipeline, since the data
  already exists.
- **Payment/storage failures** - no payment gateway exists yet. The
  storage adapter (Document Management, `docs/DOCUMENT-MANAGEMENT.md`,
  now a real S3-compatible client as of this pass) has a compensating-
  delete strategy for storage/DB inconsistency (§24-25 there) - a
  production deployment should alert on repeated orphaned-object cleanup
  failures, but no external alerting vendor exists yet to wire that into;
  the structured logs (§9 above) at least make the failure greppable.

## 10. Deployment sequence (25-step chronological checklist, Prompt 23)

1. Provision the PostgreSQL database (Supabase project, or equivalent).
2. Note both the pooled (`DATABASE_URL`) and direct (`DIRECT_URL`)
   connection strings.
3. Provision the S3-compatible object storage bucket (AWS S3, Cloudflare
   R2, MinIO, Backblaze B2, or equivalent) - required; production refuses
   to start on `LOCAL_DEV` storage (§5).
4. Configure the bucket's own security: private by default (no public
   read/list ACL, no public bucket policy), versioning enabled if the
   provider supports it (§7).
5. Set all required environment variables (§4) on the hosting platform:
   `DATABASE_URL`, `DIRECT_URL`, `AUTH_SECRET`.
6. Generate a real, random `AUTH_SECRET` (32+ random bytes) - never the
   `.env.example` placeholder.
7. Generate a real, random `AUTOMATION_WORKER_SECRET`, independent from
   `AUTH_SECRET`.
8. Configure `COMMUNICATIONS_WORKER_SECRET` and the real communications
   provider's own credentials once a real provider is wired (currently
   mock-only - see `docs/NOTIFICATIONS-COMMUNICATIONS.md`).
9. Set all five `DOCUMENT_S3_*` variables from steps 3-4.
10. Install dependencies with the committed lockfile
    (`npm ci`, never a bare `npm install`, for a reproducible build).
11. **Before running any migration**, ensure a fresh, verified database
    backup/restore point exists (§7) - this must be current *before* the
    next step, not after.
12. Run the explicit migration step: `npm run migrate:deploy` → `prisma
    migrate deploy` (never `migrate dev` in production). This is a
    separate, deliberate step - it is never an implicit side effect of
    the build.
13. Verify with `npx prisma migrate status` that no migrations are
    pending and none are in a failed state before proceeding.
14. Only then run the build: `npm run build` → `prisma generate && next
    build` - this step performs no database mutation.
15. At server startup, `src/instrumentation.ts` runs
    `assertValidProductionEnvironment()` - the process refuses to start at
    all if required production configuration is invalid (§6/Critical Rule
    3). A startup failure here means step 5-9 was incomplete; fix the
    missing/invalid variable and redeploy.
16. App serves traffic once startup validation passes.
17. Verify `GET /api/health` returns `{"status":"ok",...}`.
18. Verify `GET /api/health/ready` returns `200` with both `checks.database`
    and `checks.config` `true`.
19. Register the worker/cron routes (§10a) with the hosting platform's
    scheduled-task mechanism (Vercel Cron, Cloud Scheduler, or
    equivalent) - nothing in this codebase calls itself on a timer.
20. Confirm each worker route's cadence matches §10a's recommendations.
21. Smoke-test: internal staff login (`/login`).
22. Smoke-test: Tenant Portal login (`/portal/login`) and Owner Portal
    login (`/owner-portal/login`), if either portal has real accounts yet.
23. Smoke-test: one document upload + download round-trip through the
    internal Document Center, confirming the S3-compatible adapter is
    genuinely working end-to-end against the real provisioned bucket.
24. Smoke-test: trigger one business event that emits a
    `CommunicationOutboxEvent` (e.g. issue an invoice), then manually
    invoke `/api/automation/outbox` and `/api/communications/process`
    once to confirm the outbox→message pipeline works end-to-end.
25. Confirm monitoring/alerting coverage per whatever the operating team
    has set up (§9) - this codebase does not include its own alerting.
26. Announce the environment as live; keep the pre-migration backup
    (step 11) retained independently of the regular rolling schedule for
    24-48 hours post-deploy (§7).

## 10a. Background workers & scheduled jobs

Five routes must be hit periodically by an external cron/scheduled-task
caller (Vercel Cron, Cloud Scheduler, or the hosting platform's own
equivalent) - nothing in this codebase calls itself on a timer. **Prompt
23 hardening: the secret is now passed via the `Authorization` header,
never a `?token=` query-string parameter** (a query string is captured by
access logs/`Referer` headers - see `docs/PRODUCTION-SECURITY.md` §7):

| Route | Cadence | Purpose |
|---|---|---|
| `POST /api/communications/process` (`Authorization: Bearer $COMMUNICATIONS_WORKER_SECRET`) | 1-5 min | Sends queued `CommunicationMessage` rows via the provider adapter |
| `POST /api/automation/scheduler` (`Authorization: Bearer $AUTOMATION_WORKER_SECRET`) | 15-60 min | Discovers due reminders, inserts `AutomationJob` rows |
| `POST /api/automation/worker` (`Authorization: Bearer $AUTOMATION_WORKER_SECRET`) | 5-15 min | Claims and executes due `AutomationJob` rows |
| `POST /api/automation/outbox` (`Authorization: Bearer $AUTOMATION_WORKER_SECRET`) | 1-5 min | Drains `CommunicationOutboxEvent` into `CommunicationMessage` |
| `POST /api/automation/reconciliation` (`Authorization: Bearer $AUTOMATION_WORKER_SECRET`) | daily/hourly | Defense-in-depth fill for any durably-missing outbox event |

Example invocation: `curl -X POST -H "Authorization: Bearer
$AUTOMATION_WORKER_SECRET" https://your-app/api/automation/worker`.

None of these imply sub-minute real-time delivery. If none is configured,
the application still functions correctly for every other feature - only
notifications/reminders never actually send/fire (they queue up safely,
nothing is lost). See `docs/AUTOMATION-SCHEDULED-JOBS.md` §39 for the full
runbook (secret rotation, backlog diagnosis, duplicate investigation).

Seeding demo data, if ever needed against a real deployment: `POST
/api/admin/seed` with `Authorization: Bearer $ADMIN_SEED_SECRET` - refuses
to run at all in production unless `ALLOW_PRODUCTION_SEED=true` is also
explicitly set (off by default; see `docs/PRODUCTION-SECURITY.md` §7).

## 11. Rollback strategy

Since every migration in this repository is additive-only, a **code
rollback never requires a database rollback** - the previous application
version's code is fully compatible with a schema that has extra
(unused-by-the-old-code) columns/tables/indexes. Rollback is therefore
just: redeploy the previous known-good build/commit. The one scenario
that would need more care is a migration that turns out NOT to have been
purely additive despite the review discipline - in that case, per
`docs/BACKUP-RECOVERY.md` §4's mandatory pre-migration backup, restore
from that backup rather than attempting to hand-write a reverse
migration against a live production database.

## 12. Logs

"Logs" means whatever the hosting platform captures from stdout/stderr -
now including this pass's structured JSON-line logger (§9,
`src/lib/logging.ts`) alongside Next.js's own request/build output - plus
the `AuditLog` table for every business mutation and security event.
Every log line is passed through centralized redaction before being
serialized (`docs/PRODUCTION-SECURITY.md` §14) - no password, secret,
token, authorization header, cookie, access key, or database URL is ever
written to a log stream, and connection-string/AWS-key-shaped values
inside an otherwise-innocuous string are pattern-scrubbed as defense in
depth. Prior to this pass, confirmed zero `console.log`/`console.error`
calls existed anywhere in `src/` (see `docs/SECURITY-REVIEW.md`
§"Logging") - the baseline this pass's logging module was deliberately
built to extend without regressing.
