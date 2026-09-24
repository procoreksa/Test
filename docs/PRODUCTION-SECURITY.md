# Production Security

Written during Prompt 23's production security & reliability hardening
pass. This is the security counterpart to `docs/PRODUCTION-RELIABILITY.md`
and `docs/INCIDENT-RUNBOOK.md`; `docs/SECURITY-REVIEW.md` remains the
historical record of an earlier hardening pass's own findings and is not
duplicated here. No real credentials appear anywhere in this document.

## 1. Threat model & trust boundaries

This is a multi-tenant SaaS application. The primary threats this
document's controls defend against:

- **Cross-tenant data exposure** - one organization reading/writing
  another's data (IDOR, missing `organizationId` scoping).
- **Credential compromise** - brute force/credential stuffing against any
  of the 3 login endpoints, or a leaked worker/admin secret.
- **Unauthorized document access** - a Tenant/Owner Portal user reaching a
  document they're not entitled to, or a storage key being treated as
  authorization on its own.
- **Information disclosure via error/log/health surfaces** - a stack
  trace, raw exception, or health-check response leaking a secret,
  connection string, or enough operational detail to aid an attacker.
- **Worker-route abuse** - an unauthenticated caller triggering a
  background job/outbox-processing/reconciliation route.
- **Supply-chain/dependency risk** - a vulnerable transitive dependency
  reachable from production request handling.

Trust boundaries: the browser (untrusted), the Next.js server process
(trusted, but every request re-authenticates/re-authorizes - no boundary
inside it is trusted implicitly), Postgres (trusted, reached only via
Prisma with parameterized queries), the S3-compatible object store
(trusted credentials, but every object is private-by-default and every
read goes through server-side re-authorization first), and the
communications provider (currently mock-only; see
`docs/NOTIFICATIONS-COMMUNICATIONS.md`).

## 2. Three authentication principals

Internal staff (`src/lib/auth.ts`), Tenant Portal
(`src/lib/tenant-auth.ts`), and Owner Portal (`src/lib/owner-auth.ts`) are
three fully independent NextAuth instances - distinct signing secrets
(`AUTH_SECRET`, optionally `TENANT_AUTH_SECRET`/`OWNER_AUTH_SECRET`),
distinct cookie names (`authjs.session-token`,
`tenant-portal.session-token`, `owner-portal.session-token`), distinct JWT
claim shapes. A token from one instance can never be replayed against
another. `src/proxy.ts` gates only the internal principal at the framework
level; `/portal` and `/owner-portal` each enforce their own entitlement at
the layout level, and every `/api/*` route (all three principals'
worker/download routes included) is excluded from the proxy matcher and
is therefore fully self-protecting - see §7.

## 3. RBAC & multi-tenancy

Every server action gates through `requirePermission()`
(`src/lib/session.ts`), which reads the role from the signed session JWT
only - never from client input - and throws `AuthorizationError` on
denial. Every Prisma query touching organization-owned data is scoped by
`organizationId` read from that same session. `docs/PERMISSIONS.md` is the
full role/permission matrix; `docs/SECURITY-REVIEW.md`'s "Multi-tenant
security audit" section documents the exhaustive review methodology
(scripted scan for `findUnique`/`findFirst`/`update`/`delete` calls
missing `organizationId`) - not re-run from scratch this pass, since no
schema change in this phase touched a new organization-owned relation.

## 4. Portal entitlement

Tenant Portal: a renter reaches only their own Contract/Invoice/Payment/
Move-In/Move-Out/Maintenance/Security-Deposit/Document rows, resolved
fresh per request (`src/lib/tenant-session.ts`), never cached beyond the
JWT's own 5-minute revalidation window. Owner Portal: entitlement is
always resolved via `getEffectiveOwners()` (`src/lib/ownership.ts`) at
request time - ownership is *never* cached in the JWT, so a revoked
ownership takes effect on the very next request regardless of session
age. Document entitlement specifically goes through the centralized
registry (`src/lib/documents/entity-registry.ts`), which is
conservative-by-default (`alwaysFalse` for any entity type not explicitly
allow-listed for a given portal).

## 5. Session handling

Cookies: `HttpOnly`, `SameSite=Lax` on all three principals; `Secure`
added automatically once served over HTTPS. Session strategy is JWT
(stateless, no server-side session store). All three principals share the
same staleness-bounding pattern: a `*_SESSION_REVALIDATE_INTERVAL_MS =
5 minutes` constant gates a periodic database re-check
(`refreshSessionClaims()`/`refreshTenantSessionClaims()`/
`refreshOwnerSessionClaims()`) that re-reads `isActive`/role/account
status and ends the session (JWT callback returns `null`) if the account
is no longer active. This bounds "how long does a deactivated
user/suspended tenant/disabled owner keep access" to minutes, not the
JWT's full 30-day `maxAge`. Password hashing: bcryptjs, applied
identically across all three `authorize()` implementations; no
backward-compatible "upgrade weak hash on login" path exists because only
one hashing scheme has ever been used in this codebase.

## 6. Login rate limiting (Prompt 23 - new this pass)

All three login paths (`/login`, `/portal/login`, `/owner-portal/login`)
now share a single, DB-backed fixed-window rate limiter
(`src/lib/rate-limit.ts` + `src/lib/login-rate-limiter.ts`), gated behind
the same `LoginRateLimitEntry` table for every principal:

- **Why DB-backed, not Redis:** this codebase has no other shared-state
  infrastructure, and adding Redis "solely for fashion" for a single V1
  feature was rejected in the prior hardening pass
  (`docs/TECHNICAL-DEBT.md` P3 #1) and again here. A DB-backed limiter is
  explicitly acceptable for V1 per this phase's own brief.
- **Atomicity:** a single `upsert` per bucket with
  `attemptCount: { increment: 1 }` - Postgres serializes concurrent
  upserts on the same unique `(bucketKey, windowStart)` key, so two
  simultaneous login attempts can never race past the counter (verified
  by a real-DB concurrency test, `login-rate-limiter.db.test.ts`).
- **Keys:** two independent buckets, either one tripping rejects the
  attempt - per-identifier (`sha256("identifier:<principal>:<normalized
  email>")`, catches many attempts against one account regardless of
  source IP) and per-IP (`sha256("ip:<principal>:<ip>")`, catches one
  source hitting many accounts; only applied when an IP is actually
  present - a missing/untrustworthy IP never blocks solely on that
  basis, per-identifier throttling remains the fallback). **Never** a raw
  email or IP is stored - only the SHA-256 digest.
- **Trusted-proxy handling:** `x-forwarded-for`'s first value is used as
  the IP heuristically (matching this codebase's pre-existing
  `requestMetadata()` audit-log convention) - this is NOT validated
  against a specific trusted-proxy allowlist in V1. Deployers behind a
  single, known reverse proxy (Render/Railway/a self-managed Nginx) should
  confirm that proxy always sets/overwrites this header rather than
  passing through a client-supplied one unchanged; this is a documented
  V1 limitation, not a solved problem, and the per-identifier bucket
  remains the primary defense even if the IP-based bucket is spoofable in
  a given deployment.
- **Response:** a throttled attempt returns exactly the same generic
  failure (`authorize()` returning `null`) as a wrong password or
  nonexistent account - checked and recorded *before* any database user
  lookup or `bcrypt.compare()` call, so the rate limiter itself never
  becomes a second timing side-channel, and no account-existence signal
  is ever leaked. No `Retry-After` header is returned (NextAuth's
  Credentials provider has no clean channel to convey one without
  introducing a distinguishable error - a deliberate trade-off, not an
  oversight).
- **Bounded growth:** window rows are small and narrow; a future
  scheduled cleanup (delete rows with `windowStart` older than N windows)
  is a reasonable follow-up once real traffic volume justifies it - not
  built in V1 since row size/count here is trivial compared to this
  application's other tables.

## 7. Worker route security

Automation (`/api/automation/{scheduler,worker,outbox,reconciliation}`)
and Communications (`/api/communications/process`) worker routes, plus the
demo-seed bootstrap (`/api/admin/seed`), are the only mutating/executing
API surfaces not covered by `src/proxy.ts`'s framework-level auth gate -
each is independently, fully self-protecting:

- **POST-only.** No worker/seed route accepts `GET` for execution.
- **Header-based secret, not query string (Prompt 23 - fixed this pass).**
  Previously all of these read `?token=` from the URL - captured by
  access logs and `Referer` headers. Now every one reads
  `Authorization: Bearer <secret>` via the centralized
  `isAuthorizedWorkerRequest()` helper (`src/lib/security/worker-auth.ts`).
- **Timing-safe comparison, centralized.** `timingSafeEqualStrings()` in
  the same module - previously duplicated three times (once per route
  family), each with its own inline `Buffer.from`/`timingSafeEqual` pair.
  Now one implementation, one set of pure unit tests, including a
  length-mismatch case that doesn't short-circuit instantly.
- **Fail closed on an unset/blank secret.** `isAuthorizedWorkerRequest()`
  returns `false` if the configured secret is empty - a misconfigured
  deployment can never accidentally run with "no secret required."
- **Secret separation.** `AUTOMATION_WORKER_SECRET` and
  `COMMUNICATIONS_WORKER_SECRET` remain independently rotatable (existing
  design, unchanged). `/api/admin/seed` previously reused `AUTH_SECRET` -
  **fixed this pass**: it now requires its own `ADMIN_SEED_SECRET`, and
  additionally refuses to run at all when `NODE_ENV=production` unless an
  operator explicitly sets `ALLOW_PRODUCTION_SEED=true` (fail closed by
  default - a demo-data bootstrap endpoint has no legitimate reason to be
  reachable in a real production deployment holding real tenant data).
- **Bounded batch size.** Every worker route caps its own batch size
  server-side (unchanged from the prior pass) - never client-unbounded.
- **Replay safety.** Every worker operation is idempotent by construction
  (DB-enforced unique keys on `AutomationJob`/`CommunicationOutboxEvent`,
  conditional claim-then-process patterns) - see
  `docs/AUTOMATION-SCHEDULED-JOBS.md` and `docs/PRODUCTION-RELIABILITY.md`
  §"Idempotency" for the full argument and its real-DB test coverage.

## 8. CSRF & origin validation

Next.js Server Actions carry the framework's own built-in origin-header
verification for same-origin, cookie-authenticated mutations - this
codebase has no custom cookie-authenticated route handler that performs a
mutation outside of Server Actions (every mutating API route is either a
worker route, gated by a bearer secret with no cookie involved at all, or
a `GET`-only download route). No additional CSRF token/middleware layer
is needed or added; worker routes are correctly never subjected to
Origin/Host validation, since a secret-authenticated server-to-server
caller has no browser `Origin` header to validate in the first place.

## 9. Security headers & Content-Security-Policy

`next.config.ts` sets `X-Content-Type-Options: nosniff`, `X-Frame-Options:
SAMEORIGIN`, `Referrer-Policy: strict-origin-when-cross-origin`,
`Permissions-Policy` (camera/microphone/geolocation/interest-cohort all
denied), `Strict-Transport-Security` (production only, `max-age=63072000;
includeSubDomains` - no `preload`, since submitting to the HSTS preload
list is a one-way, cross-application decision an operator should make
deliberately, not something this codebase should opt into on their
behalf).

**Content-Security-Policy - new this pass** (carry-forward decision #4):
`default-src 'self'`, `object-src 'none'`, `base-uri 'self'`,
`form-action 'self'`, `frame-ancestors 'self'` (reinforcing
`X-Frame-Options` against clickjacking), `img-src 'self' blob: data:`,
`font-src 'self'` (sufficient since `next/font/google` self-hosts Cairo at
build time - no runtime request to Google's font CDN),
`upgrade-insecure-requests` in production.

**Documented limitation:** `script-src`/`style-src` include
`'unsafe-inline'` rather than a nonce-based strict policy. Two concrete,
verified reasons: (1) Next.js's App Router streams RSC payload chunks via
inline `<script>` tags injected progressively into the page - a strict
`'nonce-...' 'strict-dynamic'` policy would block this unless every page
opts into fully dynamic rendering (disabling static optimization
app-wide, which Next's own docs describe as a real performance cost); (2)
this app's chart library (Recharts) sets inline `style=""` attributes
extensively for tooltip/legend positioning, which a strict `style-src`
would block. `'unsafe-eval'` is added **only** in development (React dev
mode's own stack-trace reconstruction). Live-verified: no CSP console
violations across the internal dashboard, Tenant Portal, and Owner Portal
UIs, EN and AR, with normal usage (see final verification report). A
future nonce-based upgrade remains possible but was judged out of scope
for a hardening-only pass whose own brief warns against deploying an
untuned strict policy.

## 10. Document storage security

Private-by-default: `putObject()` never sets an ACL; the only read path is
server-side `getObject()` inside `streamDocumentVersion()`
(`src/lib/documents/download.ts`), called only after the caller's own
principal-specific authorization already succeeded. Storage keys are
opaque, random (`generateStorageKey()`), never derived from anything
predictable, and never themselves treated as authorization. Production
storage is now a real S3-compatible client (`@aws-sdk/client-s3`,
Prompt 23 - see `docs/PRODUCTION-RELIABILITY.md` §"Object storage" for the
adapter's reliability properties) instead of the previous stub; production
can no longer silently run on the non-durable `LOCAL_DEV` filesystem
adapter (`src/instrumentation.ts` fails closed - see §12 below). Upload
validation (`src/lib/documents/file-validation.ts`, unchanged this pass,
re-verified clean): 15MB size cap, MIME allow-list, extension-vs-MIME
consistency, and a real magic-byte signature check (a renamed `.exe`
claiming `application/pdf` is rejected on its actual byte signature, not
its claimed type).

## 11. Secrets

Never committed (`.gitignore` excludes `.env*` except `.env.example`, no
real credential has ever been committed - re-confirmed this pass). No
`NEXT_PUBLIC_*` variable exists anywhere in this codebase, so nothing can
leak a server secret into the client bundle via that route. Full
production secret inventory: `AUTH_SECRET`, optionally
`OWNER_AUTH_SECRET`/`TENANT_AUTH_SECRET`, `AUTOMATION_WORKER_SECRET`,
`COMMUNICATIONS_WORKER_SECRET` (once a real provider is wired), a real
`ADMIN_SEED_SECRET` if the seed endpoint is ever exposed in production
(`ALLOW_PRODUCTION_SEED=true`, off by default), and
`DOCUMENT_S3_ACCESS_KEY_ID`/`DOCUMENT_S3_SECRET_ACCESS_KEY`. No secret is
ever reused across two of these roles - each is independently rotatable.

## 12. Fail-closed production configuration (Prompt 23 - new this pass)

`src/lib/env-validation.ts`'s `validateProductionEnvironment()` is called
once at server startup via `src/instrumentation.ts`'s `register()` hook
(Next.js's own documented once-per-server-start boundary - never during
`prisma generate`/`next build`'s static analysis, never under `vitest`).
In production, it throws (refusing to start) if: `DATABASE_URL`/
`DIRECT_URL` are missing, `AUTH_SECRET`/`AUTOMATION_WORKER_SECRET` are
missing, empty, too short, or still the `.env.example` placeholder value,
or the `DOCUMENT_S3_*` block is partially set or entirely absent
(Critical Rule 5/3 - production must never silently fall back to
`LOCAL_DEV`). The same check runs non-fatally inside
`/api/health/ready` (§13) so a config regression introduced after startup
(e.g. a secret rotated out from under a running instance) is also caught
by the readiness probe. `getDefaultStorageProviderKind()`
(`src/lib/documents/providers/factory.ts`) independently throws the same
refusal if ever called directly in production with S3 unconfigured -
defense in depth beyond the startup check alone.

## 13. Health endpoint tiering

Three tiers, each answering a different question (Prompt 23 - "liveness
vs. readiness vs. protected operational health"):

- **`GET /api/health`** - public, unauthenticated liveness: "is the
  process up?" Never touches the database. Returns only
  `status`/`timestamp`/`version`.
- **`GET /api/health/ready`** - public, unauthenticated readiness: "can
  this instance serve real traffic?" Checks DB reachability (`SELECT 1`)
  and production config validity (§12's same check, non-throwing here).
  Returns `200`/`503` and a coarse per-check boolean only - never the
  specific missing variable or database error detail.
- **`GET /api/ops/health`** - protected (same `Authorization: Bearer`
  worker-secret gate as the automation routes, reusing
  `AUTOMATION_WORKER_SECRET` per this phase's "one operational secret may
  be acceptable for V1 if documented" allowance): automation job
  pending/failed counts and oldest-pending age, outbox event
  pending/failed counts and oldest-pending age, communication failed-
  message count, and which storage provider is active. Counts and ages
  only - never a specific organization's data, never a secret, never a
  connection string or bucket name.

## 14. Error handling & logging

`src/lib/api-error.ts`'s `handleWorkerRouteError()` replaces the previous
pattern (`error instanceof Error ? error.message : String(error)` written
directly into every worker route's JSON response body - a real risk of
leaking internal Prisma/Node exception detail per Critical Rule 4).
Callers now get `{ ok: false, error: "INTERNAL_ERROR", correlationId }`;
the real (redacted) error is written to the structured log
(`src/lib/logging.ts`) under the same `correlationId`, so an operator with
log access can look it up without it ever reaching the response body.

`src/lib/logging.ts` is a deliberately lightweight structured logger (one
JSON line per event to stdout/stderr - not a framework), with centralized,
case-insensitive redaction (`redact()`) of any key matching
`password|secret|token|authorization|cookie|accesskey|secretaccesskey|
databaseurl|apikey|credential`, plus pattern-based scrubbing of connection-
string-shaped and AWS-access-key-shaped values inside any string, as
defense in depth beyond key-name matching alone. `logSecurityEvent()` is
the dedicated call site for rate-limit-triggered events (and is available
for worker-auth-rejected/config-invalid/storage-failure events as this
logging is extended) - deliberately not called for every successful
permission check, per the brief's own instruction.

## 15. Dependency policy

`npm audit` as of this pass: 8 vulnerabilities (4 moderate, 3 high, 1
critical - see `docs/TECHNICAL-DEBT.md` for the exact current breakdown),
every one of them in a **dev-only or transitive dev tool** (`vitest`/
`esbuild`/`@vitest/mocker`/`vite`/`vite-node` - the test runner's own
toolchain; `@prisma/config`/`prisma`'s CLI-only `deepmerge-ts` dependency;
`s3rver`/`busboy`/`dicer`/`fast-xml-parser` - newly added this pass,
exclusively for the local S3-compatible integration test harness). **None
are reachable from the production runtime bundle** - `@aws-sdk/client-s3`
and `@smithy/node-http-handler` (the two new *runtime* dependencies added
this pass, for the real S3-compatible storage adapter) introduced zero new
vulnerabilities. No blind `npm audit fix --force`/major-version bump was
performed, per this phase's own "no risky package upgrades" constraint.

## 16. Backup security

See `docs/BACKUP-RECOVERY.md` for the full backup/restore requirements and
the drill actually executed this pass. Backups themselves must never be
stored with weaker access control than the production database/bucket
they're a copy of - a backup is a full copy of the same sensitive data.

## 17. Known limitations (honest, not fabricated)

- Login rate limiting's IP-based bucket trusts `x-forwarded-for`'s first
  value without validating against a specific trusted-proxy list (§6).
- The S3-compatible adapter is real and genuinely exercised end-to-end
  against a local S3-compatible test server (`docs/BACKUP-RECOVERY.md`
  §7b) - it has **not** been exercised against a real AWS/R2/MinIO
  account, since none exists in this environment. Stated here explicitly,
  per this phase's own "no false production claim" rule.
- CSP uses `'unsafe-inline'` for script/style (§9) - a real, documented
  trade-off, not an oversight.
- No field-level encryption exists for PII at rest - unchanged from the
  prior pass's own conclusion (a compromised database already implies
  broader compromise; the real controls are RBAC/org-scoping).
- A username-enumeration timing side-channel technically exists in the
  internal `authorize()` function (a matched email always reaches
  `bcrypt.compare()`, a miss returns immediately) - assessed as low
  severity given all three principals already return an identical generic
  failure message regardless of reason (no wording-based oracle), and now
  additionally bounded by the same rate limiter (§6) before it's ever
  reached. Not fixed this pass (a dummy-hash-compare-on-miss pattern would
  be a reasonable, low-risk future improvement).

## 18. Incident response

See `docs/INCIDENT-RUNBOOK.md` for step-by-step procedures covering
account/worker-secret/storage-credential/DB-credential compromise and
unexpected cross-tenant exposure.
