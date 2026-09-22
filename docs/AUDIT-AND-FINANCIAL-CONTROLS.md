# Audit Logging & Financial Controls

This document describes the audit-logging and financial-mutation-control
foundation added on top of the existing modules (auth, RBAC, property
hierarchy, contracts, invoicing, payments, owner ownership/accounting). It
is purely additive: no VAT calculation, ZATCA behavior, rent schedule
calculation, invoice calculation, payment allocation logic, owner financial
allocation math, or ownership inheritance logic was changed. See
`docs/PERMISSIONS.md` and `docs/OWNERSHIP-ACCOUNTING.md` for the systems
this builds on.

## 1. The `AuditLog` model

Defined in `prisma/schema.prisma`, migration
`20260923080000_audit_log_and_financial_controls`:

```
AuditLog {
  id                String   @id
  organizationId    String   // plain string, not a relation - see below
  userId            String?
  userEmail         String?
  userRole          String?
  action            String   // see "Audited actions" below
  entityType        String   // e.g. "Owner", "Contract", "Invoice"
  entityId          String
  entityDisplayName String?
  previousValues    Json?
  newValues         Json?
  metadata          Json?
  ipAddress         String?
  userAgent         String?
  createdAt         DateTime @default(now())
}
```

Design choices:

- **`organizationId`/`userId`/`userEmail`/`userRole` are plain denormalized
  strings, not Prisma relations.** This mirrors the existing
  `Owner.createdBy`/`updatedBy` pattern: an audit trail must remain
  queryable and intact even if the `User` who performed an action, or the
  `Organization` itself, is later renamed or deleted. There is no
  `onDelete: Cascade` risk of an audit trail disappearing when its actor
  does.
- **`action`/`entityType` are plain strings, not Prisma enums.** A new
  audited action or entity type should never require a schema migration.
  Type safety for `action` is enforced at the application layer only, via
  the `AuditAction` union in `src/lib/audit.ts`.
- **No `updatedAt`, no `deletedAt`.** A row is written once and never
  touched again - see "Immutability" below.
- Indexes: `[organizationId, createdAt]` (default log listing),
  `[organizationId, entityType, entityId]` (`AuditTimeline`/entity trail),
  `[organizationId, action]`, `[userId]`.

## 2. Audited actions

`AuditAction` (`src/lib/audit.ts`) is a plain string union, not an enum, per
the same "no migration for a new action" rationale as `entityType`:

```
CREATE | UPDATE | DELETE | SOFT_DELETE | ACTIVATE | DEACTIVATE | APPROVE |
REJECT | TERMINATE | RENEW | ISSUE | CANCEL | VOID | PAYMENT_RECORDED |
PAYMENT_REVERSED | OWNERSHIP_ASSIGNED | OWNERSHIP_ENDED | LEDGER_POSTED |
LEDGER_REVERSED | LOGIN | LOGIN_FAILED | LOGOUT | PERMISSION_DENIED
```

`APPROVE`/`REJECT`/`VOID` are defined but not currently emitted anywhere -
kept for forward compatibility since nothing in the current feature set has
an approval workflow or a distinct "void" (as opposed to "cancel") concept.

### Entities and actions currently audited

| Entity | Actions |
|---|---|
| Organization | UPDATE (settings) |
| Compound / Building / Floor / Unit | CREATE, DELETE |
| Renter | CREATE, DELETE |
| Contract | CREATE, UPDATE, TERMINATE, RENEW (both predecessor and successor contract get a RENEW entry) |
| Invoice | ISSUE, CANCEL |
| Payment | PAYMENT_RECORDED, PAYMENT_REVERSED |
| Owner | CREATE, UPDATE, DEACTIVATE, ACTIVATE, SOFT_DELETE |
| PropertyOwnership | OWNERSHIP_ASSIGNED, OWNERSHIP_ENDED |
| OwnerLedgerEntry | LEDGER_POSTED (manual entry and each allocation batch), LEDGER_REVERSED |
| Session (no entity row) | LOGIN, LOGIN_FAILED, LOGOUT |
| (varies - `metadata.permission`/`metadata.entityType`) | PERMISSION_DENIED |

Ordinary read operations (`list*`, `get*By Id`) are never audited, per the
brief. There is no `updateProperty`/`updateUnit`/`updateRenter` action in
the codebase yet (see `docs/PERMISSIONS.md` §2), so no UPDATE audit exists
for those entities either - nothing was invented here that doesn't already
exist as a real mutation.

### UPDATE audits record only what changed

`auditUpdate()` diffs the before/after row via `diffFields()`
(`src/lib/audit.ts`) and stores only the fields whose value actually
changed - never a full row dump. Bookkeeping columns that change on every
save regardless of real edits (`id`, `createdAt`, `updatedAt`,
`organizationId`) are always ignored, so re-saving a form with identical
values produces no diff. `Decimal`/`Date` values are normalized before
comparison so e.g. `Decimal("1000.00")` vs `Decimal("1000")` isn't reported
as a change.

CREATE audits store the relevant created fields (not the full DB row, e.g.
no auto-generated `id`/timestamps beyond what's useful). DELETE/SOFT_DELETE
audits store the pre-deletion state relevant to reconstructing what was
removed.

## 3. Immutability

There is no update or delete action for `AuditLog` anywhere in the
codebase - `src/lib/actions/audit.ts` exports exactly three functions,
`listAuditLogs`, `getEntityAuditTrail`, `listAuditActors`, all read-only.
`src/lib/audit.ts`'s write helpers (`writeAuditLog`, `auditCreate`,
`auditUpdate`, `auditAction`) are plain library functions, not `"use
server"` actions - they are not directly callable from client code at all,
only from other server-side modules that import them, and every call site
derives `organizationId`/`userId`/`userEmail`/`userRole` from the server
session (`requireSession()`), never from caller-supplied input. This is
covered by `src/lib/actions/__dbtests__/audit-immutability.db.test.ts`,
which asserts the export list directly and verifies (against a real
database) that an audit row is byte-for-byte unchanged after the record it
describes is later deactivated.

Corrections elsewhere in the app are made by adding a new row (a reversal,
a cancellation, a new CREATE/DEACTIVATE audit entry), never by editing
history - this mirrors the design principle behind
`OwnerLedgerEntry`/`Payment` reversals (§7-8 below).

## 4. Redaction

Central redaction happens inside `writeAuditLog()` (`src/lib/audit.ts`)
before anything is persisted - callers never redact themselves. Three
strategies, applied to every object passed as `previousValues`/`newValues`:

- **Full redaction** (`REDACTED_FIELDS`): `password`, `passwordHash`, any
  `*token*`/`*secret*`/`*apiKey*` field name → replaced with the literal
  string `"[redacted]"`. Password hashes are never stored in an audit row
  even though they're already hashed - there's no legitimate reason to keep
  them there.
- **Omission** (`OMITTED_FIELDS`): `logoUrl` → replaced with `"[omitted]"`.
  Not a secret, but a multi-MB base64 data URL that has no business being
  duplicated into every organization-settings audit row.
- **Tail-masking** (`MASKED_TAIL_FIELDS`): `iban` → only the last 4
  characters survive, e.g. `SA1234567890123456789012` → `****9012`. An
  owner's IBAN is sensitive banking information; the masked form is enough
  to recognize which bank account changed without exposing the full number
  in every audit history view.

Login events (`LOGIN`/`LOGIN_FAILED`/`LOGOUT`, written from `src/lib/auth.ts`
directly - see §9) never go through `writeAuditLog()`'s redaction at all,
because they never carry `previousValues`/`newValues` in the first place -
only `metadata: { attemptedEmail }` on failure, never the password.

## 5. Database transaction strategy

For mutations where the audit trail is legally/financially load-bearing -
contract create/update/terminate/renew, invoice issue/cancel, payment
record/reverse, ownership assign/end, owner ledger post/reverse, owner
create/update/deactivate/reactivate/delete, organization settings update -
the audit row is written **inside the same `prisma.$transaction` as the
mutation itself**, so both commit or both roll back together. There is no
scenario where the business mutation succeeds but its audit record is
silently lost (or vice versa).

The one non-trivial wiring problem this created: `issueInvoice()`
(`src/lib/invoicing.ts`) is a shared library function also called
non-transactionally by `prisma/seed-demo-data.ts`, and it always opened its
own `prisma.$transaction` internally. `issueInvoiceForSchedule` (the server
action) needed to write an audit row atomically alongside the invoice
without nesting a second transaction inside the one `issueInvoice` already
opens (Prisma doesn't support nested transactions safely). Solved by giving
`issueInvoice` an optional `existingTx?: Tx` parameter: when provided, it
reuses that transaction instead of opening its own; when omitted, it
self-transacts exactly as before. The seed script's call site is unchanged.

## 6. Permission model

Two new permissions, added to `src/lib/permissions.ts` and documented in
`docs/PERMISSIONS.md`:

- **`audit.view`** - OWNER/ADMIN (full), MANAGER (operational entries
  only), ACCOUNTANT (financial entries only), VIEWER (none).
- **`audit.export`** - OWNER/ADMIN only (gates the print button on
  `/audit-logs`).

There is deliberately no `audit.create`/`audit.update`/`audit.delete` -
audit rows are system-written only, so no permission for those verbs
exists at all (see §3).

Category (`operational`/`financial`/`security`) is **derived, not stored**
- `categorizeAuditEntry(entityType, action)` in `src/lib/audit.ts` computes
it at query time from `entityType`/`action`:

- `financial`: `entityType` is `Invoice`, `Payment`, or `OwnerLedgerEntry`.
- `security`: `action` is `LOGIN`, `LOGIN_FAILED`, `LOGOUT`, or
  `PERMISSION_DENIED`.
- `operational`: everything else, explicitly including
  `PropertyOwnership` (ownership assignment is MANAGER's own
  `ownership.manage` responsibility, not ACCOUNTANT's financial domain).

This avoids a stored category column that would need backfilling and could
drift from the actual entity/action if either changes later.

### Permission-denial auditing

`requirePermissionAudited()` is an **opt-in** drop-in replacement for
`requirePermission()` that also writes a `PERMISSION_DENIED` audit row
(with `metadata: { permission, entityType, entityId }`) when the check
fails. It is applied only to a curated list of high-value/destructive
mutations - contract terminate/renew, invoice cancel, payment reversal,
ledger reversal, ownership assign/end, owner deactivate/delete - not to
every `requirePermission()` call site in the app. The brief explicitly
warned against logging "excessive noise for every harmless read denial";
routine list/view permission checks are unchanged and unaudited.

## 7. Payment reversal

**Decision: implemented.** The existing architecture (a `Payment` row with
a plain positive `amount`, several reports doing `SUM(payment.amount)`)
made a safe, additive reversal design possible without touching any
existing report/query:

- `PaymentStatus` enum (`POSTED` | `REVERSED`) added to `Payment`,
  defaulting to `POSTED` for every existing row.
- `reversePayment(paymentId)` (`src/lib/actions/payments.ts`) posts a
  **new** `Payment` row with a **negative** `amount` equal to
  `-original.amount`, linked via `reversalOfPaymentId`, and flips the
  original to `status: REVERSED`. The original row's `amount` and every
  other field are never edited.
- Because the reversal's amount is negative, every existing
  `SUM(amount)`-based query (the payments list, the collections report,
  renter/unit statement ledgers) nets out correctly automatically - **zero
  query changes were required anywhere else in the codebase.**
- The invoice's `paidAmount`/`status` are recomputed the same way
  `recordPayment` computes them going forward (unchanged calculation,
  just re-run with the reversal netted in), and
  `recomputeScheduleStatus()` (unchanged, pre-existing function) is called
  for every affected schedule.
- A payment can be reversed at most once - both `original.status ===
  "REVERSED"` and a `reversalOfPaymentId` unique-constraint lookup are
  checked before posting a second reversal.
- Gated by `requirePermissionAudited("payment.create", "Payment",
  paymentId)` - the same permission that gates recording a payment in the
  first place, since a reversal is the financial inverse of that same
  privileged action.

Verified end-to-end (VAT-inclusive invoice → payment → reversal → invoice
status/paidAmount/schedule status all recomputed correctly, and
`SUM(payment.amount)` for the invoice nets to exactly `0`) in
`src/lib/actions/__dbtests__/financial-regression.db.test.ts`.

## 8. Contract renewal chain

**Decision: implemented, purely additively.** `renewContract()` already
existed and already created a brand-new `Contract` row while marking the
old one `RENEWED`, but the two rows had no explicit link - "which contract
preceded/replaced this one" could only be inferred from status, renter, and
unit matching, which is fragile once a unit/renter has several historical
contracts.

Added a nullable self-relation on `Contract`:

```
renewedFromContractId String?   @unique
renewedFromContract   Contract? @relation("ContractRenewal", fields: [renewedFromContractId], references: [id])
renewedIntoContract   Contract? @relation("ContractRenewal")
```

`renewContract()` now sets `renewedFromContractId` on the new contract at
renewal time. Every pre-existing contract simply has `renewedFromContractId
= NULL` (unlinked) - no backfill, no migration risk, no change to
`createContractWithSchedule()` or any other contract-creation path. Both
sides of a renewal also get an audit entry cross-referencing the other
contract's id/number (`RENEW` on the old contract, `RENEW`/`auditCreate` on
the new one).

## 9. Login security events

**Decision: implemented**, with one deliberate architectural compromise
documented here rather than hidden.

`src/lib/auth.ts`'s NextAuth `Credentials.authorize(credentials, request)`
now extracts `x-forwarded-for`/`user-agent` from the second `request`
parameter and writes:

- `LOGIN_FAILED` when a matching, active user exists but the password is
  wrong (`metadata: { attemptedEmail }` - the email string only, never the
  password, whether correct or not).
- `LOGIN` on successful authentication.
- **Nothing** when no matching user exists at all (including a
  deactivated account) - there is no `organizationId` to attribute the
  attempt to, and `AuditLog.organizationId` is a required column. This is
  an intentional gap, not an oversight: logging unattributed login attempts
  would need either a nullable `organizationId` (weakening every other
  query's tenant-scoping guarantee) or a separate un-scoped log, neither of
  which seemed proportionate to add for this feature.
- `LOGOUT` via a NextAuth `events.signOut(message)` handler, reading
  `organizationId`/`userId`/`role` off the JWT `token` (JWT-strategy
  sessions only ever hand this event a `token`, never a `session`).

### The circular-import problem

`src/lib/audit.ts` imports `requireSession`/`requirePermission` from
`src/lib/session.ts`, which imports `auth` (a value) from `src/lib/auth.ts`.
If `auth.ts` imported any *value-level* export from `audit.ts`, that would
close a real circular dependency: `auth.ts` → `audit.ts` → `session.ts` →
`auth.ts`. Node/webpack can sometimes tolerate this by handing back a
partially-initialized module, but it's exactly the kind of fragility the
brief warned against ("if NextAuth hooks make this awkward or brittle,
document it rather than introducing unsafe auth changes").

**Resolution:** `auth.ts` has its own small, standalone `auditLoginEvent()`
function that writes directly via `prisma.auditLog.create()` - it does not
call `writeAuditLog()`/`auditAction()` from `audit.ts` at all. It only takes
a **type-only** import, `import type { AuditAction } from "@/lib/audit"`,
which is erased at compile time and never participates in the runtime
module graph, so it can't close the cycle. This is safe specifically
because login events carry no `previousValues`/`newValues` needing
redaction - there's nothing lost by bypassing `writeAuditLog()`'s
redaction pipeline for this one call site.

**Known technical debt:** `audit.ts` still exports its own
`auditLoginEvent()`, which is now dead code (nothing calls it - `auth.ts`
has its own copy instead, for the reason above). It has been left in place
for now rather than removed, on the theory that a future contributor might
reasonably expect to find it there; a cleanup pass should either delete it
or add a comment pointing at `auth.ts`'s copy. Flagged here so it isn't
mistaken for an oversight.

## 10. Cross-tenant database testing strategy (mandatory per the brief)

Prior to this task, cross-organization isolation was verified only by
manual code review and by unit tests that **mock** the session
(`src/lib/actions/rbac.integration.test.ts` and similar) - none of them
exercised a real database, so a broken `organizationId` filter in an
actual Prisma query could pass every existing test. This gap is now closed.

### Test database

- A dedicated, disposable local Postgres database, `rental_saas_test`,
  separate from the development database (`rental_saas`).
- Its connection string lives in `.env.test` (gitignored, alongside every
  other `.env*` file - see `.gitignore`), never in `.env`.
- `vitest.db.config.mts` is a **separate** Vitest config, invoked only via
  `npm run test:db` - it is never included by the default `npm test`
  (`vitest.config.mts` now has `exclude: ["src/**/*.db.test.ts"]`
  specifically to guarantee this: `*.test.ts`'s glob would otherwise also
  match `*.db.test.ts`, which was caught and fixed during this task).

### Production-safety guard

`src/lib/test-db-guard.ts`'s `assertSafeTestDatabaseUrl()` runs **three
times** before a single row is ever touched - at `vitest.db.config.mts`
load time, again inside the Vitest `globalSetup` script, and a third time
inside `db-test-helpers.ts`'s `resetDatabase()` itself (belt and suspenders
at the exact point that runs `TRUNCATE`) - and refuses to proceed unless
**all** of the following hold:

1. The URL's host is `localhost`/`127.0.0.1`/`::1` - never a remote host.
2. The host doesn't match a known managed-Postgres provider pattern (Neon,
   RDS/amazonaws.com, Supabase, Azure, DigitalOcean, Render, Railway,
   Koyeb, PlanetScale, CockroachDB Cloud), even on a non-standard port.
3. The database name contains the substring `"test"`.
4. The resolved test URL is not textually identical to the main `.env`'s
   `DATABASE_URL`, read directly off disk independently of whichever env
   file the current process happens to have loaded.

Any failure throws before `TRUNCATE TABLE ... CASCADE` (used by
`resetDatabase()` between test files) or `prisma migrate deploy` (used by
`globalSetup` to keep the test database's schema current) can run.

### What the real-DB suite covers

Four files under `src/lib/actions/__dbtests__/`, all run via `npm run
test:db`:

- **`cross-org-security.db.test.ts`** (STEP 19) - two real organizations
  (`Organization A`/`B`), each with a real ADMIN user, a full
  Compound→Building→Floor→Unit→Renter→Owner→Ownership fixture, and a full
  contract→invoice→payment→owner-ledger-entry fixture. Every assertion
  calls the actual server action (only the NextAuth session boundary is
  mocked, the same pattern already used by `rbac.integration.test.ts`) and
  verifies Admin A cannot read or mutate any of Organization B's Compound,
  Building, Unit, Contract, Invoice, Payment, Owner, PropertyOwnership, or
  OwnerLedgerEntry rows (and vice versa for Admin B against Organization
  A), including the specific "attach Owner B to a Compound/Unit A asset"
  case called out in the brief.
- **`idor.db.test.ts`** (STEP 20) - explicit direct-ID substitution tests:
  an Org A session supplies an id (unit/building/compound/floor/renter/
  asset) that belongs to Org B, and the action must reject it. Includes a
  positive control (a legitimate same-org id succeeds) so a passing
  negative test can't be hiding a query that's broken for everyone.
- **`audit-immutability.db.test.ts`** (STEP 21) - asserts
  `src/lib/actions/audit.ts`'s export list contains only read functions;
  creates a real Owner, captures its CREATE audit row, deactivates the
  owner, and asserts the original CREATE row is byte-for-byte unchanged
  afterward; asserts `AuditLog` rows have no `updatedAt`/`deletedAt`
  property; asserts Org A's `listAuditLogs`/`getEntityAuditTrail` never
  return Org B's rows.
- **`financial-regression.db.test.ts`** (STEP 22) - a full real-DB
  contract → schedule → partial invoicing (rent and commission billed as
  separate invoices, per `ONE_TIME` extra-charges mode) → payment →
  reversal flow, asserting VAT/subtotal/total match `computeInvoiceTotals`
  exactly; a 60/40 owner allocation asserting the two ledger entries sum
  to exactly the original amount (largest-remainder rounding, unchanged);
  and a manual-entry reversal asserting the owner's net balance returns to
  exactly zero.

Running `npm run test:db` also incidentally surfaced and fixed one real
IDOR gap unrelated to audit logging itself: `postManualLedgerEntry`
accepted a caller-supplied `compoundId`/`unitId` without checking it
belonged to the caller's own organization (unlike `createOwnership`'s
existing `assertAssetInOrg` check). Fixed by adding the equivalent
organization-ownership check before the entry is created - see
`src/lib/actions/owner-ledger.ts`.

### Shared fixtures

`src/lib/actions/__dbtests__/db-test-helpers.ts` provides `resetDatabase()`
(dynamically `TRUNCATE`s every `public` table except
`_prisma_migrations`, so it never needs updating when the schema grows),
`seedFullOrg(label)` (one fully-wired organization), and
`seedFinancialsForOrg(org)` (adds a real contract/invoice/payment/ledger
entry to an already-seeded org, using the actual `createContractWithSchedule`/
`issueInvoice` library functions so amounts/VAT/schedule generation are
the genuine calculation logic, not a hand-rolled substitute).

Next.js request-scoped APIs (`cookies()` for locale detection,
`revalidatePath()` for cache invalidation) throw when called outside an
actual Next.js request, which every server action does unconditionally.
`src/lib/actions/__dbtests__/next-server-mocks.setup.ts` stubs both via
`vi.mock("next/headers", ...)`/`vi.mock("next/cache", ...)` so the actions'
real authorization and business logic executes to completion - this was
caught during development of this suite: without the stub, several
"expected to reject" tests were incidentally passing for the wrong reason
(a `cookies()` environment error thrown before the real organizationId
check was ever reached), which would have made those tests worthless as
security proofs. Fixing it and re-running confirmed every rejection now
happens at the real Prisma `organizationId` filter (visible in the
Prisma error logs as `findUniqueOrThrow`/`delete`/`update` "record not
found," i.e. the query legitimately found nothing because the row belongs
to the other organization).

## 11. Financial-control findings (STEP 9 review)

Reviewed `Invoice`/`InvoiceLine`/`Payment`/`OwnerLedgerEntry` for silent
destructive mutation paths:

- **Invoice**: no update/edit action exists for a posted invoice's amounts
  at all (`cancelInvoice` only changes `status`); invoice numbers/ICV are
  never reused (`nextCounterValue` only increments); cancelled invoices
  remain in the table and in every list/report. Safe as-is.
- **Payment**: previously had no correction mechanism beyond direct
  database access. Addressed by the reversal design in §7.
- **OwnerLedgerEntry**: already immutable by design before this task - no
  update/delete action existed; `reverseLedgerEntry()` already used the
  reversal-entry pattern. No change needed beyond adding its audit
  entries.
- **`postManualLedgerEntry` compoundId/unitId IDOR gap**: found and fixed,
  see §10.

No other "clearly dangerous" mutation path was found; nothing else was
changed per the brief's "only fix clearly dangerous mutation paths if
found" instruction.

## 12. Developer instructions: auditing a future mutation

1. Decide whether the mutation is "critical" (contracts, invoices,
   payments, owners, ownership, owner ledger, organization settings) or a
   simple record create/delete (compounds/buildings/floors/units/renters).
   Critical mutations must write their audit row inside the same
   `prisma.$transaction` as the mutation (§5); simple creates/deletes may
   use a lightweight `prisma.$transaction` wrapping just the create/delete
   + `auditCreate`/`auditAction` call, following the existing
   `properties.ts`/`compounds.ts`/etc. pattern.
2. Import from `@/lib/audit`:
   - `auditCreate(tx, { entityType, entityId, entityDisplayName?, newValues })`
     for CREATE.
   - `auditUpdate(tx, { entityType, entityId, entityDisplayName?, before, after })`
     for UPDATE - pass the full before/after rows, `diffFields()` handles
     narrowing to what actually changed.
   - `auditAction(tx, { action, entityType, entityId, entityDisplayName?, previousValues?, newValues?, metadata? })`
     for everything else (DEACTIVATE, TERMINATE, CANCEL, etc.).
3. If the field set includes anything password/token/secret-like or an
   IBAN, check whether `REDACTED_FIELDS`/`MASKED_TAIL_FIELDS` in
   `src/lib/audit.ts` already covers the field name; add it there (not at
   the call site) if not - redaction is a single choke point on purpose.
4. If the mutation is high-value/destructive enough that a denied attempt
   is itself worth recording, use `requirePermissionAudited(permission,
   entityType, entityId)` in place of `requirePermission(permission)` -
   don't do this for routine reads or low-value creates (see §6).
5. If the entity has a meaningful detail page, add `<AuditTimeline
   entityType="X" entityId={id} />` (`src/components/audit-timeline.tsx`)
   to it, following the existing Owner/Invoice/Contract detail pages.
6. Add a real-DB regression test under `src/lib/actions/__dbtests__/*.db.test.ts`
   if the change affects cross-tenant isolation or financial math; add a
   mocked-session test under `src/lib/actions/*.test.ts` if it's primarily
   an authorization-gate change. Run `npm run test:db` locally (requires a
   local Postgres with a `rental_saas_test` database - see §10) before
   pushing.

## 13. Remaining risks / explicitly out of scope

- No `SERIALIZABLE` isolation was added for the ownership
  percentage-cap race condition (`createOwnership`'s "sum of active
  ownership ≤ 100%" check-then-insert) - it is wrapped in a
  `prisma.$transaction` (so the check and insert are at least atomic
  against the audit write) but Postgres's default `READ COMMITTED`
  isolation does not prevent two concurrent transactions from both reading
  a pre-insert total and both succeeding. This pre-dates this task
  (introduced with the ownership feature) and was not in scope to redesign
  here; flagged for a future task if concurrent ownership assignment on the
  same asset becomes a real operational scenario.
- `audit.ts`'s dead `auditLoginEvent()` export (see §9) should be removed
  or annotated in a follow-up cleanup.
- CSV export for `/audit-logs` was deliberately not built - no reusable
  export framework existed anywhere in the codebase before this task, and
  the brief explicitly said not to add one "only for this task." The
  print-friendly report (`<PrintButton>`, gated by `audit.export`) covers
  the "printable/exportable" requirement without introducing new
  infrastructure.
