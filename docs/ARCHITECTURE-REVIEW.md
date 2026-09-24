# Architecture Review

Written as part of the production-readiness hardening pass (see
`docs/SECURITY-REVIEW.md`, `docs/TECHNICAL-DEBT.md`, and
`docs/PERFORMANCE-REVIEW.md` for the findings this document's map was used
to produce). This documents the codebase **as it actually is**, not an
idealized target architecture.

## 1. Stack

Next.js 16 (App Router, Turbopack), React 19, Prisma 6 + PostgreSQL,
NextAuth v5 (Auth.js) with the JWT session strategy and a Credentials
provider, Tailwind CSS 4, Zod for validation, Vitest for both mocked-DB
unit tests and real-DB integration tests. No separate backend service -
every mutation is a Next.js Server Action (`"use server"` functions in
`src/lib/actions/*.ts`), called directly from Server/Client Components as
`<form action={...}>` or plain async calls.

## 2. Authentication (`src/lib/auth.ts`, `src/lib/session.ts`)

- `NextAuth({ session: { strategy: "jwt" }, providers: [Credentials(...)] })`.
  `authorize()` looks up the user by lowercased email + `isActive: true`,
  compares the password with `bcrypt.compare`, and writes a `LOGIN`/
  `LOGIN_FAILED` `AuditLog` row (never logging the password itself).
- The JWT callback embeds `userId`/`role`/`organizationId`/
  `organizationName` in the signed cookie at sign-in. **Hardening
  addition** (see `src/lib/auth-session-refresh.ts`): the same callback
  now re-verifies those claims against the database roughly every 5
  minutes for the life of the session, so a deactivated user or a role/
  organization change takes effect without waiting for the JWT's full
  30-day `maxAge` - previously, once issued, a token's role/org claims
  were never checked again. See `docs/SECURITY-REVIEW.md` for the before/
  after.
- `requireSession()`/`requirePermission()`/`getCurrentUserRole()`
  (`src/lib/session.ts`) are the only way any Server Action reads "who is
  calling and what can they do" - they always read from the signed
  session, never from a client-supplied field. `requirePermission()` is
  the single authorization gate: it throws `AuthorizationError` if the
  role doesn't grant the requested `Permission`.

## 3. Organization isolation

Every tenant-owned table carries its own `organizationId` column (never
inferred through a join alone) and every Prisma query in
`src/lib/actions/*.ts` filters on it directly - the convention, applied
without exception across ~30 action modules, is `where: { id, organizationId }`
for a single-row lookup and `where: { organizationId, ... }` for a list.
There is no shared "current org" middleware or Prisma extension that
injects this automatically; it is enforced by convention plus the real,
database-backed cross-org/IDOR test suite (`src/lib/actions/__dbtests__/
*cross-org*.db.test.ts`, `*idor*.db.test.ts`) that runs two fully seeded
organizations and asserts one cannot read/mutate the other's data through
any server action. See `docs/SECURITY-REVIEW.md` §"Multi-tenant security
audit" for the audit results.

## 4. RBAC (`src/lib/permissions.ts`)

A flat `Permission` string-union type (`"contract.create"`,
`"moveIn.complete"`, etc.), a `ROLE_PERMISSIONS: Record<UserRole,
Permission[]>` table, and a single pure `can(permission, role): boolean`
function. Five roles: `OWNER`/`ADMIN` (full access), `MANAGER` (full
operational access, no org settings), `ACCOUNTANT` (financial workflow +
broad read access, no CRM/property mutation), `VIEWER` (read-only
everywhere). No row-level/attribute-based permissions - authorization is
role-based only, with the sole documented exception being
`approveOffer()`'s own business-data-layer discount-threshold check
(`canApproveDiscount()`), which is a business rule layered *on top of* the
`offer.approve` permission grant, not a permission split. See
`docs/PERMISSIONS.md` for the full matrix and rationale per module.

## 5. Property hierarchy

`Compound → Building → Floor → Unit`, each with its own `organizationId`
and CRUD actions in `src/lib/actions/{compounds,buildings,floors,units}.ts`.
A legacy flat `Property`/`Unit.propertyId` pairing survives for
pre-migration data (nullable, no longer written by new code) - see
`docs/PROPERTY-HIERARCHY.md`. `unitLocationLabel()` centralizes the
Compound/Building display string so no page hand-rolls that traversal.

## 6. Owners & ownership accounting

`Owner` → `PropertyOwnership` (a percentage assignment at exactly one of
Compound/Building/Unit level, `CHECK` and application-enforced) →
`OwnerLedgerEntry`. `getEffectiveOwners()` (`src/lib/ownership.ts`)
implements ownership *inheritance*: a Unit with no direct ownership record
inherits its Building's, which inherits its Compound's -
`pickEffectiveOwnershipLevel()` is the single, pure, unit-tested function
deciding which level actually applies. `activeOwnershipTotalForAsset()`
enforces the "never exceed 100% at one exact level" invariant; as of this
hardening pass, the write path (`createOwnership()`) runs that
check-then-insert inside a `Serializable` transaction (previously it did
not - see `docs/SECURITY-REVIEW.md` §"Ownership concurrency").

## 7. CRM: Leads → Viewings → Offers → Reservations → Contract

A five-stage funnel, each stage its own module
(`src/lib/actions/{leads,viewings,offers,reservations,reservation-contract}.ts`)
with its own pure rules module (`src/lib/crm/{lead,viewing,offer,
reservation}-rules.ts`) holding status-transition tables, conflict/overlap
checks, and pricing math - kept separate from the Prisma-calling action
layer so the rules themselves are unit-testable with zero database
dependency. `Lead.status` is updated as a side effect by the later
stages (viewing scheduled → `VIEWING_PENDING`, offer sent → etc.) via
direct `tx.lead.update()` calls inside each stage's own transaction -
there is no separate "funnel orchestrator" object; each module knows how
to advance the Lead one step forward. Reservation creation, confirmation,
and Reservation→Contract conversion all run inside `Serializable`
transactions (the codebase's chosen concurrency strategy for every
check-conflicts-then-write critical section - see §14 below).

## 8. Financial core

`Contract` → `PaymentSchedule` (generated once at contract creation by
`createContractWithSchedule()`/`generateSchedule()`) → `Invoice`/
`InvoiceLine` (issued against one schedule row, possibly partially) →
`Payment` (capped at the invoice's remaining balance) → optional
`Payment`/`Invoice` reversal (never mutates the original row's amounts,
only flips `status` and links a new reversal row back via
`reversalOfPaymentId`). VAT/ZATCA math lives in `src/lib/zatca/vat.ts`
(`computeLine()`/`computeInvoiceTotals()`) and is reused by every
invoice-issuing call site - there is exactly one VAT calculation
implementation in the codebase. `recomputeScheduleStatus()`
(`src/lib/schedule-status.ts`) derives each schedule row's status from
everything billed/paid against it so far, since partial invoicing means
no single invoice/payment event can just flip a status directly. See
`docs/SECURITY-REVIEW.md` §"Financial integrity" for the money-rounding
classification.

## 9. Audit (`src/lib/audit.ts`)

One `writeAuditLog()` choke point every higher-level helper
(`auditCreate`/`auditUpdate`/`auditAction`/`auditPermissionDenied`) funnels
through, always called with the same transaction client as the mutation it
records so both commit or roll back together. Redaction
(`REDACTED_FIELDS`/`OMITTED_FIELDS`/`MASKED_TAIL_FIELDS`) is applied
unconditionally inside `writeAuditLog()` itself, not left to call sites to
remember. `diffFields()` means an `UPDATE` entry stores only the fields
that actually changed, not a full duplicate row. See
`docs/AUDIT-AND-FINANCIAL-CONTROLS.md` for the original design and
`docs/SECURITY-REVIEW.md`/`docs/PERFORMANCE-REVIEW.md` for this pass's
scalability findings.

## 10. Move-In & Handover Inspection

The newest module (`docs/MOVE-IN-HANDOVER.md`), deliberately never writes
to `Unit.status`/`Contract.status` (occupancy is already correct from
Contract creation) and never creates a financial record - both properties
are covered by dedicated regression tests. Its own `blocksNewMoveInForContract()`
one-per-Contract rule mirrors `blocksNewReservationForOffer()`'s
established pattern exactly.

## 11. Tenant Portal: a second, independent authentication principal

The Tenant Portal (`docs/TENANT-PORTAL.md`) is the first externally-facing
(non-staff) surface in this codebase, and its authentication is
deliberately **not** an extension of §2 above. `src/lib/tenant-auth.ts`
constructs a second, fully independent `NextAuth({...})` instance - its
own JWT claim shape (`{ tenant: { id, organizationId, renterId, email } }`
vs. the internal session's `{ user: { id, role, organizationId, ... } }`),
its own signing secret (`TENANT_AUTH_SECRET`, or `AUTH_SECRET` + a suffix
if unset - never equal to the internal secret), its own cookie name
(`tenant-portal.session-token` vs. the internal default), and its own
`basePath` (`/api/portal-auth`). This is the actual mechanism, not a
convention, that keeps an internal staff session and a tenant session from
ever being confused in the same browser: a `TENANT` value was deliberately
**not** added to the internal `UserRole` enum, since a tenant is not an
internal staff user and never flows through `src/lib/session.ts`'s
`requirePermission()`/`can()` at all.

Its own authorization boundary (`src/lib/tenant-session.ts`) mirrors this
separation: `requireTenantSession()` (never `requireSession()`) and a
family of `requireTenant*Access()` entitlement helpers, each re-deriving
`organizationId`/`renterId` from the signed tenant session and re-querying
the database fresh on every call - `TenantPortalAccount → Renter →
Contract → resource`, never from a client-supplied id or `organizationId`
alone (the same "organization scoping alone is not sufficient" principle
this document's §3 established for internal isolation is applied one
level stricter here, since two tenants can share an `organizationId`).
See `docs/TENANT-PORTAL.md` for the full entitlement architecture,
settlement-visibility policy, and the real-DB isolation test suite
(`src/lib/actions/__dbtests__/tenant-portal-*.db.test.ts`) that verifies
it end-to-end, including same-organization tenant-to-tenant isolation.

## 12. Owner Portal: a third, independent authentication principal

The Owner Portal (`docs/OWNER-PORTAL.md`) is the second externally-facing
surface, structurally parallel to §11 but for a different principal:
`src/lib/owner-auth.ts` constructs a third, fully independent
`NextAuth({...})` instance - its own JWT claim shape
(`{ owner: { id, organizationId, ownerId, email } }`), its own signing
secret (`OWNER_AUTH_SECRET`, or a distinct `AUTH_SECRET`-derived suffix if
unset - never equal to either the internal or the tenant secret), its own
cookie name (`owner-portal.session-token`), and its own `basePath`
(`/api/owner-portal-auth`). No `OWNER_PORTAL`/`PROPERTY_OWNER` value was
added to `UserRole`, and `TenantPortalAccount` was not extended with a
`principalType` union either - an owner's identity and entitlement
question are structurally different from both an internal `User` and a
tenant `Renter`.

Its authorization boundary (`src/lib/owner-session.ts`) is stricter than
§11's in one specific way: entitlement is never "does this owner belong to
this organization" (§3's own principle, applied here too) *or* "does this
Contract/Renter reference this owner" - it is always re-derived through
the existing `PropertyOwnership` → `getEffectiveOwners()` inheritance
chain (§6), the exact same Unit → Building → Compound override resolver
every internal ownership screen and report already uses. No second
ownership engine exists; the Owner Portal only ever reads through this one
resolver. Ledger visibility is scoped even more narrowly still -
`entry.ownerId` match only, never asset-based - so two owners who
legitimately co-own the same Unit never see each other's financial
history. See `docs/OWNER-PORTAL.md` for the full entitlement architecture,
the ownership-override/shared-ownership/revocation semantics, and the
real-DB isolation test suite
(`src/lib/actions/__dbtests__/owner-portal-*.db.test.ts`).

## 13. Shared domain services (not tied to one module)

- `src/lib/numbering.ts` - the one `Counter`-table-backed sequence
  generator every module's human-readable number (`LEAD-`, `VIEW-`,
  `OFFER-`, `RES-`, `CTR-`, `MI-`, `INV-`, `RCT-`) goes through.
- `src/lib/contract-schedule.ts` - the one Contract-creation +
  schedule-generation service, called by manual creation, renewal, and
  Reservation→Contract conversion alike (never reimplemented per caller).
- `src/lib/i18n/*` - locale resolution (`locale` cookie, default `ar`),
  the `Dictionary` type + `en`/`ar` implementations, and
  `pickLocalized()`/date-and-currency formatters shared by every page.
- `src/lib/unit-location.ts` - the one Compound/Building display-label
  function.

## 14. Concurrency strategy

Postgres `SERIALIZABLE` transactions are this codebase's deliberate,
consistently-applied answer to every "read some aggregate/existence check,
then write based on it" race: reservation creation/confirmation,
Reservation→Contract conversion, Move-In creation/completion, and (as of
this hardening pass) ownership allocation. It is not used for simple
single-row updates with no such check (those need no more than Postgres's
default `READ COMMITTED`). See `docs/SECURITY-REVIEW.md`
§"Concurrency audit" for the case-by-case necessity review.

## 15. Database access pattern

No repository/DAO layer - Server Actions call `prisma.*`/`tx.*` directly.
Every module that reuses one Prisma sub-query pattern for multiple call
sites factors it into a small helper (`activeOwnershipTotalForAsset()`,
`checkAgentAvailability()`, `syncExpiredReservations()`, etc.) rather than
duplicating the query. Pagination is a hand-applied `skip`/`take` pair
with a per-module `PAGE_SIZE` constant (uniformly 25) - there is no shared
pagination helper, but the pattern itself is consistent everywhere it's
needed (Leads, Viewings, Offers, Reservations, Move-Ins, Audit Logs).

## 16. Notifications & Communications: a queue + provider boundary

The first outbound-communications code in this codebase (`docs/
NOTIFICATIONS-COMMUNICATIONS.md` has the full architecture). Business
modules never call a provider directly; they call
`enqueueCommunicationEvent()` (`src/lib/communications/enqueue.ts`)
strictly after their own transaction commits - the same post-commit gap
`revalidatePath()` calls already use - which only ever writes a `QUEUED`
`CommunicationMessage` row and never throws. A separate queue processor
(`processQueuedCommunications()`, called only from the shared-secret-
protected `POST /api/communications/process` route - not from any user
session) claims and sends messages later via a provider-agnostic
`CommunicationProvider` interface, currently resolved only to a
deterministic mock (no real vendor credential exists in this codebase
yet). Concurrency-safe claiming reuses this codebase's existing
conditional-`updateMany` idiom rather than raw `SELECT ... FOR UPDATE
SKIP LOCKED`; idempotency is a DB-unique key derived from business
identifiers, never a timestamp. `CommunicationMessage`/
`CommunicationDeliveryAttempt` are a deliberately separate concern from
`AuditLog` (§9) - never overloaded into it.

## 17. What this map deliberately does not cover

Page-by-page UI component inventory, the exact Tailwind design tokens,
and the CRM/Operations report catalog are already documented in each
module's own `docs/*.md` (`CRM-LEADS.md`, `VIEWING-MANAGEMENT.md`,
`LEASING-OFFERS.md`, `RESERVATION-MANAGEMENT.md`,
`RESERVATION-TO-CONTRACT.md`, `MOVE-IN-HANDOVER.md`,
`OWNERSHIP-ACCOUNTING.md`, `AUDIT-AND-FINANCIAL-CONTROLS.md`,
`MAINTENANCE-MANAGEMENT.md`, `MOVE-OUT-MANAGEMENT.md`,
`SECURITY-DEPOSIT-SETTLEMENT.md`, `TENANT-PORTAL.md`,
`NOTIFICATIONS-COMMUNICATIONS.md`) - this document exists to connect
those module-level maps into one picture of how the whole system
actually fits together, not to repeat their detail.
