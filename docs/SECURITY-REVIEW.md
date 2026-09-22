# Security Review

Production-readiness hardening pass. Scope, method, and constraints are
per the hardening brief: inspect first, fix only confirmed defects/
meaningful risks, no speculative refactoring, no new business modules.
Severities: **P0 Critical**, **P1 High**, **P2 Medium**, **P3 Low** -
matching `docs/TECHNICAL-DEBT.md`'s scale.

Headline: **no critical (P0) vulnerabilities were found.** Two P1 findings
were confirmed, fixed, and regression-tested. One P1 architectural gap
(stale session enforcement) was confirmed and fixed. Everything else in
this document is either a P2/P3 finding left for future work, or a
"reviewed, confirmed clean" result recorded so it doesn't need re-auditing
from scratch next time.

---

## Finding 1 (P1, fixed) - Ownership allocation race could exceed 100%

- **Finding.** `createOwnership()` (`src/lib/actions/ownership.ts`) read
  the existing ACTIVE ownership total for an asset, checked it was
  `<= 100%`, and inserted the new row - all inside a plain
  `prisma.$transaction()` with no isolation level override, i.e. Postgres's
  default `READ COMMITTED`.
- **Evidence.** A real, deterministic regression test
  (`src/lib/actions/__dbtests__/ownership-concurrency.db.test.ts`, third
  test) forces two 60% allocations for the same Unit to read the total
  before either writes, using a synchronization barrier (not a sleep).
  Run against the pre-fix code, both committed, leaving the Unit at 120%
  ownership. Run against the fixed code, exactly one commits (`prisma:error
  transaction failed to commit` from the other, a Prisma P2034
  serialization failure).
- **Exploit scenario.** Two ownership assignments submitted at
  overlapping times (two staff members, or one user double-submitting a
  slow form) for the same asset, each individually valid, together
  exceeding 100% - silently corrupting the ownership-accounting invariant
  every owner-ledger/owner-statement calculation depends on.
- **Fix.** `createOwnership()`'s transaction now runs at
  `isolationLevel: "Serializable"` - this codebase's established
  concurrency strategy for every other check-conflicts-then-write critical
  section (reservation creation/confirmation, Move-In creation/completion,
  Reservation→Contract conversion).
- **Test.** `src/lib/actions/__dbtests__/ownership-concurrency.db.test.ts`
  (3 tests): the deterministic barrier test above, a `Promise.allSettled`
  real-world-shaped companion test, and a positive control (two 40%
  allocations succeed normally, proving the fix doesn't introduce
  false-positive rejections).
- **Residual risk.** None identified. A concurrent request that loses the
  race receives a generic error (see Finding 5 below for the broader,
  pre-existing gap in translating that into a friendly message).

## Finding 2 (P1, fixed) - Cross-org relation injection via Contract.renterId

- **Finding.** `createContract()` and `updateContract()`
  (`src/lib/actions/contracts.ts`) verified the submitted `unitId` belonged
  to the caller's organization before using it, but never performed the
  equivalent check for `renterId` - it was written straight to
  `Contract.renterId` from client form input.
- **Evidence.** `src/lib/actions/__dbtests__/contract-relation-injection.db.test.ts`.
  Run against the pre-fix code: `createContract()` with another
  organization's renterId succeeded (no error), and `updateContract()`
  silently re-pointed an existing contract at another organization's
  Renter. Run against the fixed code, both are rejected and the contract
  is left unchanged.
- **Exploit scenario.** Any authenticated user holding `contract.create`/
  `contract.update` (MANAGER and above) could link a Contract - and
  therefore every future invoice/payment/schedule row generated against
  it - to a Renter record belonging to a completely different tenant
  organization, by submitting that Renter's id in the form. The Postgres
  foreign key on `Contract.renterId` only requires the row to exist
  *somewhere*, not in the same organization, so nothing at the database
  level would have caught this.
- **Fix.** Both actions now verify `renterId` with
  `tx.renter.findUniqueOrThrow({ where: { id: renterId, organizationId } })`
  before it can be written - the same pattern already used for `unitId`,
  applied consistently.
- **Test.** `contract-relation-injection.db.test.ts` (3 tests): create
  rejected, create succeeds normally with the caller's own renter (positive
  control), update rejected.
- **Residual risk.** None identified for Contract specifically. This exact
  class of bug (a relational id accepted from the client and used without
  an organization check) was swept for across every other module's create/
  update actions during this pass (see §"Cross-org relation attacks" below)
  and no other instance was found - `contracts.ts` (one of the earliest
  modules in this codebase, predating the later CRM modules' more explicit
  security-review discipline) was the only gap.

## Finding 3 (P1, fixed) - Stale JWT session outlives role/deactivation changes

- **Finding.** NextAuth's JWT callback (`src/lib/auth.ts`) embedded
  `role`/`organizationId`/`organizationName` in the signed session cookie
  once, at sign-in, and never re-checked them again for the life of the
  token (NextAuth's default JWT `maxAge` is 30 days). `requirePermission()`
  trusts the session's role unconditionally.
- **Evidence.** Direct code reading of `src/lib/auth.ts`'s `jwt`/`session`
  callbacks and `src/lib/session.ts`'s `requirePermission()` - confirmed
  no database re-verification existed anywhere in the request path before
  this fix.
- **Exploit scenario (privilege persistence, not an external attack).** An
  OWNER/ADMIN deactivates a departing employee's account, or demotes a
  MANAGER to VIEWER after a role change - the affected user's already-open
  browser session continues to exercise the OLD role/access for up to 30
  days, until the token naturally expires or they explicitly sign out.
  For a financial SaaS product this is a real, meaningful control gap:
  "deactivate this user" is reasonably expected to take effect
  immediately, not eventually.
- **Fix.** `src/lib/auth-session-refresh.ts` (new, deliberately kept free
  of any `next-auth` import so it's directly unit-testable): a pure
  `shouldRevalidateSession()` gate plus `refreshSessionClaims()`, wired
  into the `jwt` callback so it re-reads the user's `isActive`/`role`/
  `organizationId`/organization name from the database roughly every 5
  minutes (`SESSION_REVALIDATE_INTERVAL_MS`) rather than on every single
  request - bounding the staleness window to minutes instead of weeks
  without adding a database round trip to every page load/action. A
  deactivated (or deleted) user's session is ended (`jwt` callback returns
  `null`) the next time it's due for revalidation.
- **Test.** `src/lib/auth-session-refresh.test.ts` (5 pure tests covering
  the revalidation-interval boundary) + `src/lib/actions/__dbtests__/
  auth-session-refresh.db.test.ts` (4 real-DB tests: active user returns
  fresh claims, a role change is picked up, a deactivated user returns
  `null`, a nonexistent user id returns `null`).
- **Live verification.** Full login → navigate six representative pages →
  logout, in both English and Arabic, passed with zero console errors
  after this change (see §"Final verification" in the completion report) -
  confirms the fix doesn't disrupt normal authentication.
- **Residual risk.** The 5-minute window is a deliberate latency/safety
  tradeoff, not zero-latency revocation - documented, not treated as a
  defect. A true "kill this session right now" admin action (session
  denylist/short-lived-token-with-refresh) would be a larger, separate
  feature, not undertaken here per the "don't replace the authentication
  architecture unless necessary" constraint.

## Multi-tenant security audit (Steps 4-6)

Every organization-owned model's create/read/update/delete/relation-lookup
paths across all ~30 `src/lib/actions/*.ts` modules were reviewed for
`organizationId` scoping. Method: a scripted scan for every Prisma
`findUnique`/`findFirst`/`update`/`delete`/`upsert` call lacking
`organizationId` in the same statement, followed by manual verification of
every flagged call site. Every flagged instance resolved to one of two
safe patterns:

1. **Same-transaction derived id** - the id used in a bare (no
   `organizationId`) `.update()`/`.delete()` was itself read moments
   earlier in the *same transaction* via an organization-scoped
   `findUniqueOrThrow({ where: { id, organizationId } })` (e.g.
   `contract.unitId` after fetching `contract` org-scoped;
   `moveIn.id` after `assertMoveInEditableTx()`). Safe: the id cannot
   have been swapped for another organization's row between the two
   statements, and ids are globally unique (cuid), never reused.
2. **Internal helper with `organizationId` as a parameter** -
   `activeOwnershipTotalForAsset()`, `checkAgentAvailability()`,
   `checkUnitAvailability()`, `syncExpiredReservations()`,
   `releaseUnitIfSafe()`, `resolveRenterForLead()`, etc. are never
   directly reachable from a page/form; every caller already resolved
   `organizationId` from its own session.

No instance of a truly client-controlled id reaching a Prisma call with no
organization check anywhere in this scan, other than Finding 2 above
(already fixed).

## Cross-org relation attacks (Step 5)

Every mutation accepting a relational id from client form input was
enumerated (`grep` for `formData.get("...Id")` across all action modules,
~55 call sites) and each traced to its point of use. Confirmed
organization-verified before use in every module checked:
`buildings.ts` (`compoundId`), `floors.ts` (`buildingId`), `units.ts`
(`floorId`), `offers.ts` (`leadId`/`viewingId`/`unitId`/
`assignedToUserId`), `viewings.ts` (`leadId`/`assignedToUserId`/
`unitIds`), `owner-ledger.ts` (`ownerId`/`compoundId`/`unitId` - this one
already had an explicit code comment recording the exact same review
finding from an earlier hardening pass), `payments.ts` (`invoiceId`),
`reservations.ts` (`offerId`/`assignedToUserId`), `leads.ts`
(`linkRenterId`), `ownership.ts` (`ownerId`/`assetId`). The one confirmed
gap was Finding 2 (Contract's `renterId`), now fixed.

## IDOR coverage (Step 6)

Existing real-DB IDOR coverage
(`src/lib/actions/__dbtests__/idor.db.test.ts`,
`cross-org-security.db.test.ts`, `crm-cross-org-security.db.test.ts`,
`offer-cross-org-security.db.test.ts`,
`reservation-cross-org-security.db.test.ts`,
`reservation-contract-cross-org-security.db.test.ts`,
`viewing-cross-org-security.db.test.ts`) already covers Owner, Compound,
Building, Floor, Unit, Renter, Lead, Viewing, Offer, Reservation,
Contract, Invoice, Payment across READ/UPDATE/ACTION shapes, reusing
shared fixtures (`seedFullOrg()`, `createConvertibleReservation()`, etc.)
rather than one-off setups per test. This pass added Move-In's own
equivalent (`move-in-cross-org-security.db.test.ts`, built in the prior
Move-In task) and the new `contract-relation-injection.db.test.ts` above -
no wholesale re-creation of the existing matrix, since it was already
present and passing.

## RBAC coverage audit (Step 7)

Every `export async function` in `src/lib/actions/*.ts` not named
`get*`/`list*` was scanned for a `requirePermission`/`requireSession` call
in its first 10 lines; every flag was manually resolved:

- `setLocale` - intentionally unauthenticated (a UI preference, no data
  exposure).
- `syncExpiredOffers`/`syncExpiredReservations`/`syncOverdueStatuses`/
  `releaseUnitIfSafe`/`resolveRenterForLead`/`checkAgentAvailability`/
  `checkUnitAvailability` - internal helpers taking `organizationId`/`tx`
  as parameters, never directly reachable from a form/page; every caller
  is itself permission-gated.
- `cancelReservation`/`releaseReservation` - delegate to a shared
  `terminalReservationMove()` helper which calls
  `requirePermissionAudited()` internally; the gate exists, just one
  function call deeper than the scan's fixed window.
- `convertReservationToContractAndRedirect` - a thin redirect wrapper
  around the already-gated `convertReservationToContract()`.

No mutation was found relying only on UI hiding, granting VIEWER/
ACCOUNTANT an unintended permission, or bypassing `can()`/
`requirePermission()`. See `docs/PERMISSIONS.md` for the full matrix.

## Mass assignment (Step 10)

Searched for `...formData`/`...req.body`/`...input` spreads and
`.passthrough()` Zod schemas across the whole `src/` tree: **zero
instances**. Every server action parses client input through a Zod schema
into explicitly named fields first; every `{ ...parsed, organizationId,
createdByUserId }`-shaped `data:` object spreads only the *already
Zod-validated* object (which strips unknown keys by default, and no
schema anywhere opts into `.passthrough()`), with protected fields
(`organizationId`, `createdByUserId`/`createdBy`, `status`, audit fields,
financial totals) always appended *after* the spread, which would
override even a hypothetical schema collision. No mass-assignment risk
found; no fix needed.

## Financial integrity (Steps 11-13)

- **Decimal usage.** Every stored monetary column is `Decimal` in Prisma/
  Postgres; every actions-layer read/write of those columns uses
  `Prisma.Decimal` arithmetic (`.plus()`, `.greaterThan()`, etc.), not
  native `+`/`-`.
- **Money rounding classification** (Step 12 - every `Number(...)`/
  `parseFloat(...)`/`Math.round(...)`/`.toFixed(...)` occurrence on a
  value that touches money, reviewed individually):
  - **PRESENTATION ONLY** - every CRM/dashboard/report percentage
    (conversion rate, occupancy rate, vacancy rate, Move-In progress
    percent) via `Math.round((n/d)*1000)/10`-shaped helpers - these are
    display metrics computed from integer counts, never persisted as a
    monetary amount. `.toFixed(2)` calls in `zatca/ubl.ts`,
    `invoicing.ts`, and the ownership-exceeded error message all format
    an *already-computed* Decimal value into a string for XML/display -
    they don't perform the calculation.
  - **SAFE (deliberate, epsilon-guarded)** -
    `src/lib/schedule-status.ts`'s `recomputeScheduleStatus()`: converts
    Decimal amounts to native numbers purely to *classify* a schedule's
    status (PENDING/PARTIALLY_INVOICED/.../PAID) against an explicit
    `EPSILON = 0.01` tolerance - it never writes a computed monetary
    value, only the derived status enum. The underlying Decimal columns
    are never overwritten from this path.
  - **RISKY in principle, out of scope to change here** -
    `src/lib/zatca/vat.ts`'s `computeLine()`/`computeInvoiceTotals()` (the
    real VAT/invoice-total calculation engine, whose output IS persisted)
    uses native floating-point arithmetic with a manual `round2()`
    (`Math.round((v + Number.EPSILON) * 100) / 100`) applied after every
    step, rather than `Prisma.Decimal`. For real-estate-scale amounts
    (thousands to low hundred-thousands, at most 2 decimal places in) and
    "round immediately after every operation" discipline, floating-point
    drift at the cent level is not a realistic risk here in practice, and
    there is no failing test or reported miscalculation demonstrating an
    actual defect. Per the brief's explicit constraint ("VAT logic
    unchanged," "do NOT redesign accounting," "only modify code when a
    concrete defect exists"), **this was deliberately left unchanged** -
    recorded here and in `docs/TECHNICAL-DEBT.md` as a P2 item: migrating
    this specific module to `Prisma.Decimal` arithmetic would be a
    reasonable future improvement, done as its own dedicated,
    ZATCA-re-certification-tested task, not folded into this hardening
    pass.
- **Immutability (Step 13).** Attempted, via the real service/action
  layer: mutating a posted `Payment`'s amount (no such action exists -
  only `reversePayment()`, which creates a new linked row and flips
  `status`, never edits the original's `amount`); mutating a reversed
  `Payment`'s original (same - `reversePayment()` checks
  `alreadyReversed` first); mutating an immutable `OwnerLedgerEntry` (no
  update action exists for ledger entries at all - only creation and
  reversal-via-new-row); mutating finalized `Invoice` fields after
  payment (`recordPayment()` only ever touches `paidAmount`/`status`,
  never line items/totals). Existing regression coverage
  (`financial-regression.db.test.ts`, `audit-immutability.db.test.ts`) was
  reviewed and found adequate - no new test added here since no gap was
  found.

## State machines & occupancy (Steps 14-15)

Reviewed `MOVE_IN_TRANSITIONS`, `RESERVATION_TRANSITIONS`,
`VIEWING_TRANSITIONS`, `OFFER` status flow, and `ContractStatus` for
terminal states, invalid backward transitions, and double-submit/retry
safety. All five already funnel every transition through one
`isValid*Transition()` pure function per module, checked before every
write - no bypass path found. `Unit.status`/`Contract.status` consistency
across manual creation, Reservation conversion, Move-In, termination, and
renewal was traced end-to-end (see `docs/ARCHITECTURE-REVIEW.md` §6/§10 and
`docs/MOVE-IN-HANDOVER.md` §8) - no impossible combination (e.g. `VACANT`
+ active contract) is reachable through any existing action; `scripts/
check-data-integrity.ts` (new, this pass) gives a standing, read-only way
to re-verify this against real production data going forward.

## Transaction & concurrency audit (Steps 16-19)

Every logically-atomic multi-write operation already runs inside
`prisma.$transaction()`: reservation create/confirm/release/expire,
contract creation (manual, renewal, Reservation-originated), payment
posting/reversal, owner ledger posting/reversal, Move-In creation/
completion. `SERIALIZABLE` isolation is applied specifically (not
everywhere) to the subset that has a genuine
check-conflicts-then-write race: reservation creation/confirmation,
Reservation→Contract conversion, Move-In creation/completion, and (new,
this pass) ownership allocation. Simple single-row updates with no such
check correctly use the Postgres default (`READ COMMITTED`) - no
unnecessary `SERIALIZABLE` usage found anywhere. No transaction in the
codebase performs a network/external API call, file upload, email, or
WhatsApp send inside its scope (there are no such integrations at all yet
- see `docs/STORAGE-ARCHITECTURE.md`). The one confirmed unsafe race
(ownership allocation, Finding 1) is fixed.

## Numbering counters (Step 20)

`nextCounterValue()` (`src/lib/numbering.ts`) does a single
`tx.counter.upsert()` per call inside the caller's own transaction - this
naturally serializes concurrent number allocation for the same
`(organizationId, key)` counter row (confirmed by the existing
`reservation-contract-concurrency.db.test.ts`'s own note: two concurrent
`createReservation()` calls collide on the shared Counter row and Postgres
aborts one, independent of any Unit-level conflict). No duplicate-number
risk found; uniqueness (not gaplessness) is correctly the only guarantee
made, matching the brief's own instruction.

## Database constraints & FK delete behavior (Steps 21-22)

No historical/financial entity (`Contract`, `Invoice`, `Payment`,
`Reservation`, `Lead`, `Viewing`, `MoveIn`, `OwnerLedgerEntry`,
`AuditLog`) has a hard-delete action anywhere in the codebase (confirmed
by an exhaustive `.{model}.delete(` grep across `src/lib/actions`) - every
one of these uses a terminal status (`TERMINATED`/`CANCELLED`/`ARCHIVED`/
`RELEASED`/`REVERSED`) instead. `Contract.unitId`/`Contract.renterId` have
no explicit `onDelete` override, which means Postgres's default
(`RESTRICT`-equivalent "no action") already blocks deleting a Unit or
Renter that has any Contract - `deleteUnit()`/`deleteRenter()` would fail
with a foreign-key violation rather than silently orphaning or
cascade-deleting Contract history. This is a **P2 finding, not fixed
here**: the safety property already holds (no data loss), but
`deleteUnit()`/`deleteRenter()`/`deleteBuilding()`/`deleteFloor()`/
`deleteCompound()` don't pre-check for dependent history the way
`deleteOwner()` already does (which checks `ownershipCount`/`ledgerCount`
first and raises a friendly, translated error) - so a user attempting this
today would hit an unhandled Prisma constraint error instead of a clear
message. See `docs/TECHNICAL-DEBT.md`. `PropertyOwnership.compoundId`/
`buildingId`/`unitId` do cascade-delete with their parent - acceptable,
since a `PropertyOwnership` row has no independent meaning once its asset
is gone (unlike a Contract/Invoice, which represents a historical
transaction in its own right).

## Session, cookies & security headers (Steps 35, 37)

- **Cookies.** NextAuth's own cookie defaults were confirmed live
  (`authjs.csrf-token`/`authjs.callback-url`, both `HttpOnly; SameSite=Lax`)
  - `Secure` is added automatically by NextAuth once the app is served
  over HTTPS (standard behavior, not something this codebase configures
  itself); local HTTP development is correctly left un-`Secure` so it
  keeps working.
- **CSRF/Server Actions (Step 36).** Next.js Server Actions carry their
  own built-in origin-header verification (a POST to a Server Action's
  internal endpoint from a different origin is rejected by the framework
  before the action body ever runs), combined with the session cookie's
  own `SameSite=Lax`. No additional CSRF token/middleware is layered on
  top, and none is needed - this is the framework's documented protection
  model for Server Actions, not a gap.
- **Security headers.** `next.config.ts` previously set none at all.
  Added: `X-Content-Type-Options: nosniff`, `X-Frame-Options: SAMEORIGIN`,
  `Referrer-Policy: strict-origin-when-cross-origin`,
  `Permissions-Policy: camera=(), microphone=(), geolocation=(),
  interest-cohort=()`, and `Strict-Transport-Security` (production only).
  Verified live via `curl -D -` against the dev server - all four
  unconditional headers present. A full **Content-Security-Policy was
  deliberately not added** - Next.js dev mode needs script-eval
  allowances for HMR, and getting the production script/style-src list
  right needs a staged rollout against this app's actual asset sources,
  which is future work (see `docs/TECHNICAL-DEBT.md`), not something to
  guess at inside a hardening pass whose brief explicitly warns against
  breaking the app with an untuned CSP.
- **Rate limiting (Step 38).** No public, unauthenticated, abuse-sensitive
  endpoint exists today other than `/login` itself (no public inquiry
  form, no password reset flow, no file upload). Documented as a future
  production requirement (login-attempt rate limiting) in
  `docs/PRODUCTION-DEPLOYMENT.md` rather than adding Redis/a rate-limit
  library for this alone, per the brief's explicit instruction.

## Secrets & environment (Steps 33-34)

- `.gitignore` excludes `.env*` except `.env.example`; confirmed via
  `git log --all --diff-filter=A` that no real `.env`/`.env.test`/
  `.env.local` file was ever committed at any point in this repository's
  history.
- `.env.example` contains only placeholder values (a fake local Postgres
  URL, a "replace-with-a-random-32-byte-secret" placeholder, a sandbox
  ZATCA URL) - no real credential.
- No hardcoded API key/private key/connection-string-with-real-credentials
  pattern found anywhere in tracked source (`sk-`, `AKIA`, PEM headers,
  `postgres://user:pass@host` literals - all absent outside
  `.env.example`'s own placeholder).
- **No `NEXT_PUBLIC_*` variable exposes a server-only secret** - the
  codebase defines none at all currently (no `NEXT_PUBLIC_` prefix
  anywhere in `src/`), so there is nothing to leak into the client bundle
  by this route.
- **Conclusion: no committed secrets found.** No remediation needed.

## Logging (Step 32)

Zero `console.log`/`console.error`/`console.debug`/`console.warn` calls
anywhere in `src/` (production code, excluding tests). Nothing logs PII,
financial data, tokens, cookies, or full form payloads, because nothing
logs anything at all today - see `docs/PERFORMANCE-REVIEW.md`/
`docs/TECHNICAL-DEBT.md` for the corresponding observability-readiness gap
this creates (a separate, non-security finding).

## PII (Step 41)

Personal data (`Renter`/`Lead`/`Owner` names, phone, email, national
ID/Iqama numbers, `MoveIn.tenantRepresentativeId`) lives only in its
proper table columns. Reviewed for accidental leakage into: `AuditLog`
metadata (redaction already covers `password`/`token`/`secret`-shaped
keys and masks `iban`'s tail - national ID/phone are not currently masked
in audit snapshots, which is consistent with them being legitimate
business data an authorized auditor needs to see, not an accidental
leak); URLs (no id-adjacent PII appears in any route path, only opaque
cuids); client bundles (no PII is ever passed as a hardcoded value into a
Client Component - all of it is fetched server-side per request). No
field-level encryption was introduced - not justified given the current
threat model (a compromised database already implies broader compromise;
the real controls here are the organization-scoping and RBAC audits
above).

## Client/server boundary (Step 42)

Reviewed for the two known Next.js failure modes this project has hit
before: (1) passing a function value from a Server Component into a
Client Component - the newest module (Move-In) was built with this
specifically in mind and verified via live Playwright with zero console
errors; a sweep of the rest of the codebase for `onClick={...}`/
`onChange={...}` handlers defined inline inside a `.tsx` file that isn't
itself marked `"use client"` found none. (2) Prisma/server-only imports
leaking into a Client Component - every `"use client"` file
(`src/components/{language-switcher,nav-link,mobile-sidebar-shell,
print-button,searchable-select,cascading-location-picker}.tsx`, plus
scoped Client Components in a few list pages) was checked; none imports
`@/lib/prisma` or any `src/lib/actions/*` module directly - they only
receive already-resolved plain data as props.

## Dependencies (Step 43)

13 runtime dependencies, 13 dev dependencies - a deliberately lean list
with no duplicate libraries (one date library, one charting library, one
validation library). **One unused dependency found and removed:** `uuid`
(the npm package) was listed in `package.json` but never imported anywhere
- the codebase's only UUID generation (`src/lib/invoicing.ts`, for ZATCA's
UBL invoice UUID field) uses Node's built-in `crypto.randomUUID()`
instead. Removed from `package.json` and `package-lock.json`; verified
`tsc`/build still pass. `npm install` reports pre-existing transitive
vulnerabilities (3 moderate, 4 high, 1 critical, in `npm audit`'s own
count) inherited from indirect dependencies - **not remediated in this
pass** per the brief's explicit "do not perform risky package
upgrades"/"do not upgrade major framework versions" constraints; recorded
in `docs/TECHNICAL-DEBT.md` as a scoped future task (`npm audit` for the
current detail, then evaluate each fix individually rather than
`--force`).

## Timezone (Steps 46-47)

Every "today"/date-boundary calculation in the codebase (dashboard KPIs,
Move-In overdue formula, reservation expiry, report date ranges) uses
native `Date` + `setHours(0,0,0,0)`, which resolves against the **Node
process's own local timezone** - there is no explicit `Asia/Riyadh`
configuration anywhere. Postgres itself stores `timestamp` columns
correctly (UTC internally), so no data is stored wrong; the risk is purely
in how the *application process* computes "midnight" for business-day
boundaries. If deployed on a host whose container defaults to UTC (common
on Render/most PaaS), "today" would be computed using the UTC day
boundary, which is 3 hours behind Riyadh's actual midnight - a reservation
or Move-In due "today" near midnight Riyadh time could evaluate against
the wrong calendar day. **Not fixed in code** in this pass (per the
brief's explicit "do not globally rewrite date handling without evidence"
and "do not hardcode timezone throughout modules" cautions - touching
every date-boundary call site across a dozen files with no dedicated
timezone-bug reproduction would be exactly the kind of speculative,
high-blast-radius change this hardening pass is supposed to avoid).
**Recommended fix, documented in `docs/PRODUCTION-DEPLOYMENT.md`:** set
the `TZ=Asia/Riyadh` environment variable on the production Node process.
This is the standard, single-point, code-free way to pin "business
midnight" for a Node.js server without touching any of the call sites,
and keeps the architecture ready for a real per-organization timezone
feature later (a larger, separate project) without committing to it now.

## Summary table

| # | Finding | Severity | Status |
|---|---|---|---|
| 1 | Ownership allocation race could exceed 100% | P1 | Fixed + tested |
| 2 | Contract.renterId cross-org relation injection | P1 | Fixed + tested |
| 3 | Stale JWT session outlives deactivation/role change | P1 | Fixed + tested |
| 4 | `deleteUnit()`/`deleteRenter()`/etc. surface a raw FK error instead of a friendly one | P2 | Documented, not fixed |
| 5 | VAT/invoice-total math uses native floats, not Decimal | P2 | Documented, not fixed (out of scope: VAT logic frozen) |
| 6 | No timezone pinned for business-day boundary math | P2 | Documented, deployment-level fix recommended |
| 7 | No full Content-Security-Policy | P2 | Documented, staged rollout recommended |
| 8 | No login rate limiting | P3 | Documented, future production requirement |
| 9 | Transitive dependency vulnerabilities (`npm audit`) | P3 | Documented, needs individual review before upgrading |

No P0 findings. See `docs/TECHNICAL-DEBT.md` for the full register
including non-security items, and `AE` in the final report for the
overall readiness recommendation.
