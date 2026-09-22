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
  - stateless - no local filesystem writes assumed to persist
        │
        ▼
PostgreSQL (Supabase, or any managed Postgres)
  - one pooled connection string for runtime (DATABASE_URL)
  - one direct connection string for migrations (DIRECT_URL)
        │
        ▼
(Future) Object storage (Supabase Storage, or S3-compatible)
  - not implemented yet - see docs/STORAGE-ARCHITECTURE.md
```

## 2. Application

- **Build:** `npm run build` → `prisma generate && prisma migrate deploy && next build`
  (already the repository's own `package.json` script - migrations run as
  part of the build step, before the new code that expects the new schema
  ever serves traffic).
- **Start:** `npm run start` → `next start -p ${PORT:-3000}` (already
  respects a platform-injected `PORT`, matching Render's own convention).
- **Statelessness:** the app writes nothing to local disk that needs to
  survive a restart or persist across instances (no session store on
  disk, no uploaded file written locally - see
  `docs/STORAGE-ARCHITECTURE.md` for why file uploads aren't built yet).
  This means it's safe to run multiple instances behind a load balancer
  with no sticky-session requirement (NextAuth's JWT strategy needs no
  server-side session store either).

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
- **Migrations.** `prisma migrate deploy` (never `migrate dev` in
  production - it can prompt interactively and is meant for local
  development only) applies whatever migrations exist in
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

Optional (ZATCA e-invoicing, only needed once the organization onboards
with ZATCA):

| Variable | Purpose |
|---|---|
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

Not implemented yet - see `docs/STORAGE-ARCHITECTURE.md`. When it is,
its own connection details (a Supabase Storage service-role key, or S3
credentials) join the environment-variable table above, following the
same "never commit, never expose via `NEXT_PUBLIC_`" rules.

## 6. Health check

`GET /api/health` (added this pass) - unauthenticated, returns
`{ status, database }` and a `200`/`503` status code, checking only that
the app process is up and can run `SELECT 1` against Postgres. Configure
the hosting platform's own health-check probe to hit this path. It
deliberately never returns database host/version/credentials/schema
details - safe to leave publicly reachable.

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

## 9. Observability (Step 54 - documented, not built)

No monitoring vendor is integrated, and none should be added purely for
this hardening pass (per the brief's explicit instruction). Documented
future needs, for whoever scopes that work:

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
- **Payment/storage failures** - not applicable yet (no payment gateway,
  no storage backend exists in this codebase); revisit when either is
  built.
- Until any of the above exists, `console.error` in a genuinely
  unexpected-error `catch` block (not the routine, expected
  validation-error `throw`s this codebase already uses throughout) is a
  reasonable, zero-dependency stopgap - not added in this pass since
  nothing currently throws an error that isn't already an expected,
  translated validation failure.

## 10. Deployment sequence (a fresh production rollout)

1. Provision the Postgres database (Supabase project, or equivalent);
   note both the pooled and direct connection strings.
2. Set all required environment variables (§4) on the hosting platform.
3. Deploy - the build step runs `prisma generate && prisma migrate deploy && next build`
   automatically, so migrations are applied before the new build serves
   any traffic.
4. Verify `/api/health` returns `{"status":"ok","database":"ok"}`.
5. Seed initial data if needed (`prisma/seed.ts` / the `/api/admin/seed`
   bootstrap endpoint already in this codebase, token-gated by
   `AUTH_SECRET`).
6. Smoke-test login and one representative page per major module before
   announcing the environment as live.

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

No structured logging exists yet (see §9) - today, "logs" means whatever
the hosting platform captures from stdout/stderr (Next.js's own
request/build output) plus the `AuditLog` table for every business
mutation and security event. Confirmed during this pass: nothing writes
PII, financial data, tokens, cookies, or full form payloads to any log
stream, because nothing writes to any log stream at all currently (see
`docs/SECURITY-REVIEW.md` §"Logging").
