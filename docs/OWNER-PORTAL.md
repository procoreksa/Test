# Owner Portal

The second externally-facing (non-staff) surface in this codebase, after the
Tenant Portal. A property owner authenticates independently of both the
internal staff application and the Tenant Portal and may view their own
portfolio, financials, and maintenance activity, read-only, in this phase.
Every design decision here is driven by principles stated verbatim in the
brief that produced this module: **"AN OWNER IS NOT AN INTERNAL STAFF
USER"**, **"AN OWNER IS NOT A TENANT PRINCIPAL"**, and **"Organization
isolation alone is NOT sufficient"** - ownership access must always derive
from the actual `PropertyOwnership` chain, never from organization
membership, a Contract, an `OwnerLedgerEntry`, or a URL id.

## 1. Pre-implementation architecture audit

Before any code was written, twenty questions were answered (abbreviated
here; the full reasoning appears throughout this document):

1. **Compound/Building/Unit entitlement rules?** An owner is entitled to an
   asset only if `getEffectiveOwners()` (`src/lib/ownership.ts`) resolves
   them as an owner of that exact asset, following the existing
   Unit → Building → Compound inheritance/override chain - see §9.
2. **Inheritance/override mechanics reused, not reinvented?** Yes -
   `pickEffectiveOwnershipLevel()` is the single source of truth, reused by
   every new entitlement helper and query - see §8/§9.
3. **Shared ownership?** Multiple `PropertyOwnership` rows on the same asset
   are already supported by the schema; the portal must show each owner
   only their own percentage and never another co-owner's ledger - see §10.
4. **Historical vs. current percentage?** Only "as of now" is surfaced in
   V1; `getEffectiveOwners()`'s `asOfDate` parameter exists but no
   historical-date UI is built - see §12.
5. **Owner cardinality across organizations?** `Owner.organizationId` is a
   required singular field; an owner spanning two organizations needs two
   `Owner` rows today - a documented limitation, not fixed - see §12.
6. **`OwnerLedgerEntry` types/balance calculation?** Reused exactly as
   already defined and already tested (`summarizeOwnerLedgerEntries()`,
   extracted from the pre-existing internal report) - see §21/§22.
7. **Allocation-at-posting-time?** Already exists
   (`src/lib/owner-allocation.ts`) - the ledger already holds each owner's
   final, percentage-split amount; the portal never recomputes
   `invoice × percentage` - see §21.
8. **Ledger metadata safety?** `referenceType`/`referenceId` and any
   actor/staff detail are deliberately omitted from every owner-facing
   ledger row - see §24.
9. **Owner-safe maintenance/tenant-PII fields?** An explicit allow-list,
   never a block-list - see §19/§20.
10. **Tenant Portal auth reuse?** Never - a third, fully independent
    NextAuth instance - see §5.
11. **Session staleness?** Mirrored from both prior hardenings into its own
    module, `src/lib/owner-session-refresh.ts` - see §7.
12. **Ownership-change session behavior?** Ownership is never cached in the
    JWT; every entitlement check re-queries `PropertyOwnership` live, so a
    revocation takes effect on the very next request, with no re-login -
    see §11, proven in §31/§32.
13. **Zero-active-ownership handling?** An owner with no current
    `PropertyOwnership` row anywhere sees empty lists everywhere (Properties,
    Units, Contracts, Maintenance) and zeroed dashboard KPIs - never an
    error.
14. **Historical access after ownership changes?** Not built in V1 - see
    §12.

## 2. Principal separation: why `UserRole` and `TenantPortalAccount` were NOT reused

Exactly the same reasoning as the Tenant Portal's own §2/§3
(`docs/TENANT-PORTAL.md`), restated for the third principal: `UserRole`
remains `OWNER | ADMIN | MANAGER | ACCOUNTANT | VIEWER` - no `OWNER_PORTAL`
or `PROPERTY_OWNER` value was added, and nothing here is checkable by
`can(permission, role)`. `TenantPortalAccount` was not extended with a
`principalType` union either, even though it already supports external
authentication: an owner's authorization question ("which assets does this
owner effectively own") is structurally different from a tenant's ("which
Contract is this renter's own"), and conflating the two models would risk
a future check on one accidentally validating against the other's identity
space. `OwnerPortalAccount` is its own model - see §3.

## 3. `OwnerPortalAccount` schema

```
model OwnerPortalAccount {
  id, organizationId, ownerId (String @unique, Owner relation, onDelete: Restrict)
  email, emailNormalized, phone?
  passwordHash
  status OwnerPortalAccountStatus @default(INVITED)
  mustChangePassword @default(true)
  lastLoginAt?, emailVerifiedAt?
  createdByUserId (plain string, survives the creating User being removed)
  suspendedAt?/suspendedByUserId?, disabledAt?/disabledByUserId?
  createdAt, updatedAt
  @@unique([organizationId, emailNormalized])
  @@index([organizationId, status])
}
enum OwnerPortalAccountStatus { INVITED, ACTIVE, SUSPENDED, DISABLED }
```

`ownerId` is `@unique` - one account per `Owner` in V1, mirroring
`TenantPortalAccount.renterId`'s own one-per-Renter convention.
`onDelete: Restrict` on the `Owner` relation means an `Owner` with a portal
account cannot be hard-deleted without first removing the account - the
same safety Contract/Renter's required relations already enforce elsewhere.
Migrated via the same shadow-database-bypass technique the Tenant Portal's
own migration used (`prisma migrate diff --from-url` → manual
`migration.sql` → `db execute` → `migrate resolve --applied`), since the
shadow DB is broken in this environment for unrelated, pre-existing
reasons documented in `docs/TENANT-PORTAL.md` §34.

## 4. Account lifecycle

`INVITED → ACTIVE ⇄ SUSPENDED → DISABLED` (terminal), identical shape to
the Tenant Portal's own lifecycle and enforced by the same
`ACCOUNT_TRANSITIONS` map pattern in
`src/lib/actions/owner-portal-account.ts`. An account is never deleted.
`mustChangePassword` defaults to `true` and is cleared only by the owner's
own `changeOwnerPortalPassword()` action.

## 5. Owner authentication: a third, fully independent NextAuth instance

`src/lib/owner-auth.ts` is structurally parallel to, but never shares code
or state with, `src/lib/auth.ts` (internal) or `src/lib/tenant-auth.ts`
(tenant):

| | Internal | Tenant | Owner |
|---|---|---|---|
| Cookie name | `authjs.session-token` | `tenant-portal.session-token` | `owner-portal.session-token` |
| Secret | `AUTH_SECRET` | `TENANT_AUTH_SECRET` (or derived) | `OWNER_AUTH_SECRET` (or derived) |
| `basePath` | default | `/api/tenant-portal-auth` | `/api/owner-portal-auth` |
| Sign-in page | `/login` | `/portal/login` | `/owner-portal/login` |
| Session shape | `session.user` | `session.tenant` | `session.owner` |

`OWNER_AUTH_SECRET` derives from `AUTH_SECRET + "::owner-portal"` when the
dedicated env var is unset - distinct from both the internal secret and
`TENANT_AUTH_SECRET`'s own derivation, so no token from any instance can
ever be replayed against another. The `Credentials` provider calls
`verifyOwnerCredentials()` (`src/lib/owner-credentials.ts`), which never
distinguishes *why* a login failed (unknown email, wrong password,
non-ACTIVE status) - a single generic failure, exactly like the Tenant
Portal's own login (no email-enumeration signal). Login/logout events are
audited with `userRole: "OWNER_PORTAL"` (deliberately distinct from the
internal `UserRole.OWNER` enum value, mirroring the Tenant Portal's own
`"TENANT"` convention) and `entityType: "OwnerSession"`.

## 6. Session architecture and JWT claim shape

The JWT holds `principalType: "OWNER"`, `ownerAccountId`, `organizationId`,
`ownerId`, `email`, and `verifiedAt` - and nothing else. Critically, **no
ownership/asset list is ever stored in the token**: every entitlement
question is re-resolved from the live `PropertyOwnership` table on every
request (`src/lib/owner-session.ts`). This is what makes §11's
no-re-login-required revocation guarantee true.

## 7. Stale-session hardening

`src/lib/owner-session-refresh.ts`'s `shouldRevalidateOwnerSession()` /
`refreshOwnerSessionClaims()` mirror the Tenant Portal's own
`tenant-session-refresh.ts` exactly: every 5 minutes
(`OWNER_SESSION_REVALIDATE_INTERVAL_MS`), the `jwt` callback re-queries
`OwnerPortalAccount` and ends the session (returns `null`, forcing
re-authentication) if it is no longer `status: "ACTIVE"`. This bounds how
long a suspended/disabled account can keep using an already-issued token -
proven in §31 (`owner-portal-auth.db.test.ts`). Ownership itself is
deliberately **not** part of this revalidation; it is never cached at all
(see §6), so it needs no periodic refresh - it is simply always correct.

## 8. Ownership authorization: `src/lib/owner-session.ts`

Never `requirePermission()` (internal-staff-only) and never
`src/lib/tenant-session.ts`'s own helpers (tenant-only).
`requireOwnerSession()` gates every page/action; a missing session
`redirect()`s to `/owner-portal/login` rather than throwing - directly
informed by the real bug the Tenant Portal phase found and fixed
(`docs/TENANT-PORTAL.md` §32): since `/owner-portal` is excluded from
`src/proxy.ts`'s internal gate (§17), this is the *only* defense path a
real owner hits in normal use (an expired session, a bookmarked page after
logout), so it must degrade gracefully.

Six resource-specific helpers, each re-verifying fresh against the
database on every call via the one private `ownerHasEffectiveAccess()`
(which itself only ever calls `getEffectiveOwners()` - never a second
ownership engine, never inferred from Contract/Unit-location/
`OwnerLedgerEntry`/a URL id/`organizationId` alone):

- `requireOwnerCompoundAccess(compoundId)`
- `requireOwnerBuildingAccess(buildingId)`
- `requireOwnerUnitAccess(unitId)`
- `requireOwnerContractAccess(contractId)` - resolves via the Contract's
  own `unitId`, never accepted on faith.
- `requireOwnerMaintenanceAccess(requestId)` - resolves via whichever of
  `unitId`/`buildingId`/`compoundId` the request actually carries.
- `requireOwnerLedgerAccess(entryId)` - **not** asset-based; see §10.

Every miss calls Next's `notFound()` - see §13.

## 9. Ownership precedence

Identical to the pre-existing internal precedence, reused verbatim: a
Unit's own `PropertyOwnership` row always wins over its Building's, which
always wins over its Compound's (`pickEffectiveOwnershipLevel()`,
`src/lib/ownership.ts`). The spec's own worked example - "Owner A owns
Compound at 60%, Unit 101 is explicitly, entirely owned by Owner B - Owner
A must NOT gain access to Unit 101" - is exactly this rule, and is proven
live in §32 and in the real-DB suite's dedicated, explicitly-named
"critical" test (§31,
`owner-portal-ownership-security.db.test.ts`).

## 10. Shared ownership

Two (or more) `PropertyOwnership` rows on the same Unit are already
supported by the schema and require no portal-specific handling for
*asset* visibility (`getEffectiveOwners()` simply returns every matching
row). The portal-specific rule is **financial identity isolation**: Owner A
and Owner B may both see the same shared Unit, but `requireOwnerLedgerAccess()`
and every ledger/statement/financial-summary query filter strictly by
`entry.ownerId === session.owner.ownerId` - never by property access - so
neither co-owner can ever see the other's ledger entries, even though both
legitimately see the Unit itself. Each sees only their own recorded
`ownershipPercentage` on that Unit (§18/§19), never the co-owner's.
Proven in §31's shared-ownership test.

## 11. Ownership revocation

Because ownership is never cached in the JWT (§6), ending a
`PropertyOwnership` row (`status: "ENDED"`, the same mechanism the internal
app already uses) takes effect on the *very next* portal request for that
owner - no re-login, no waiting for the 5-minute session-refresh interval
(that interval only governs *account status*, not ownership; see §7).
Proven directly in the real-DB suite (§31): access granted, the row is
ended via a direct fixture write with no new mocked session created, and
the identical entitlement call immediately denies access.

## 12. Historical ownership limitation

`getEffectiveOwners()` accepts an `asOfDate` parameter and is fully
date-aware (`effectiveFrom`/`effectiveTo`), but every Owner Portal call
site passes only the implicit default of "now." There is no UI anywhere in
this phase to view a past ownership snapshot or a past owner's historical
statement after their `PropertyOwnership` has ended. This is a deliberate
V1 scope limitation, not an oversight - documented here and in
`docs/TECHNICAL-DEBT.md`.

## 13. Anti-enumeration

Identical convention to the Tenant Portal's own §9: every entitlement miss
in `owner-session.ts` calls `notFound()`, and
`src/app/owner-portal/(portal)/not-found.tsx` renders one neutral page
inside the portal's own shell. A malformed id, an id belonging to another
owner in the same organization, an id belonging to another organization
entirely, and - critically - a Unit id the owner would otherwise reach via
Compound/Building inheritance but which is unit-level-overridden to
someone else, are **all** indistinguishable from "does not exist." Proven
live in §32.

## 14. Owner-safe DTOs

Every query in `src/lib/actions/owner-portal/*.ts` uses a dedicated Prisma
`select`, never a full record and never a generic internal DTO - mirroring
the Tenant Portal's own §10 convention exactly. `src/lib/owner-portfolio-query.ts`
provides the one shared, DB-backed resolution primitive
(`resolveOwnerEffectiveUnits()` / `resolveOwnerEffectiveScope()`) that
every list/dashboard query reuses instead of re-implementing bulk
ownership resolution per page - the same N+1-free bulk-fetch pattern the
internal `getOwnerPortfolio()` report already established.

## 15. Routes and shell

```
/owner-portal/login
/owner-portal                      (dashboard)
/owner-portal/properties
/owner-portal/properties/[id]
/owner-portal/units
/owner-portal/units/[id]
/owner-portal/contracts
/owner-portal/contracts/[id]
/owner-portal/financials
/owner-portal/ledger
/owner-portal/statements
/owner-portal/statements/print
/owner-portal/maintenance
/owner-portal/maintenance/[id]
/owner-portal/profile
```

`src/app/owner-portal/(portal)/layout.tsx` is a dedicated shell (never the
internal sidebar, never the Tenant Portal's own layout), reusing the
generic `MobileSidebarShell`/`NavLink`/`LanguageSwitcher` components with
owner-only navigation, exactly mirroring the Tenant Portal's own §11.
Organization branding (`getOwnerPortalOrganizationBranding()`) exposes
only `name`/`nameAr`/`logoUrl` - the same already-public-facing subset the
Tenant Portal exposes, never internal configuration.

## 16. Dashboard (`/owner-portal`)

KPIs: Properties, Units, Occupied, Vacant, Occupancy Rate, Active
Contracts, Monthly Owner Income, Monthly Owner Expenses, Net Owner
Position, Outstanding Owner Balance, Open Maintenance
(`getOwnerPortalDashboard()`, `src/lib/actions/owner-portal/dashboard.ts`).
Occupancy always comes from the one centralized `computeOccupancySummary()`
helper (§17); every financial figure comes exclusively from
`OwnerLedgerEntry` via `summarizeOwnerLedgerEntries()` (§21) - never a
tenant Invoice/Payment sum. "Net Owner Position" is this month's ledger
net movement (income − expenses); "Outstanding Owner Balance" is the
all-time cumulative ledger balance - two deliberately distinct figures,
matching the Financial Summary page's own split (§21).

## 17. Portfolio (Properties/Units)

`computeOccupancySummary()` (`src/lib/owner-portfolio-rules.ts`) is the
single, pure, unit-tested occupancy formula (`occupied/total`, rounded)
reused by both the dashboard and the Properties page - never re-derived
per page, and byte-identical to the pre-existing internal
`dashboard.ts` formula it was extracted from. The Properties list
(`getOwnerPortalProperties()`) groups the owner's effective Units by
Compound and rolls up counts/occupancy; it deliberately does **not** show
an ownership percentage at the Compound level (a Compound can legitimately
mix a uniform Compound-level percentage with Unit-level overrides at
different percentages), pushing the unambiguous per-Unit figure down to
the Units page instead. The Property detail page
(`getOwnerPortalPropertyDetail(compoundId)`) is filtered from the same
`resolveOwnerEffectiveUnits()` primitive rather than gated by a
whole-Compound entitlement check, so an owner who owns only one Unit
within a Compound (never the Compound itself) still sees that Unit on the
Compound's own detail page - anti-enumeration (§13) still holds, since a
nonexistent Compound and a Compound the owner owns nothing in both produce
the identical empty result.

## 18. Units

`getOwnerPortalUnits()` lists every effectively-owned Unit with its
resolved `ownershipPercentage` and `sourceLevel`; `getOwnerPortalUnitDetail(unitId)`
uses `requireOwnerUnitAccess()` directly (a genuine single-asset
entitlement check, correctly walking the full override chain for that one
id) and adds the Unit's active Contract summary plus **high-level**
Move-In/Move-Out status only (`moveIn.status`/`moveOut.status` - no
inspection notes, no tenant acknowledgement detail), per the spec's
explicit "no dedicated modules" instruction.

## 19. Contracts

`src/lib/actions/owner-portal/contracts.ts`'s `OWNER_SAFE_CONTRACT_SELECT`
is an explicit allow-list: `id/contractNumber/status/startDate/endDate/
rentAmount/paymentFrequency/unit{…}/renter{fullName,fullNameAr}` - nothing
else. Rent-collection detail (invoices/payments/schedules) is never
surfaced anywhere in the Owner Portal; that boundary belongs to the Tenant
Portal and the internal app only. See §20 for the Renter minimization
itself.

## 20. Tenant privacy

The Renter relation on every Contract DTO is deliberately reduced to
`fullName`/`fullNameAr` only - `idType`/`idNumber`/`vatNumber`/`phone`/
`email`/`address` are never selected, structurally absent from the object
itself (not merely unrendered - proven by the dedicated DTO test in §31
that asserts `Object.keys(renter)` equals exactly
`["fullName", "fullNameAr"]`). No Lead/Viewing/CRM-notes history is ever
exposed. This is the single clearest embodiment of the spec's "do not
expose" list.

## 21. Owner financial architecture: `OwnerLedgerEntry` is the sole authority

Every financial figure in the Owner Portal - dashboard KPIs, Financial
Summary, Ledger, Statement - is read exclusively from `OwnerLedgerEntry`.
Nothing here sums a tenant `Invoice`/`Payment`, and nothing recomputes
`ownership% × invoice amount` on the fly: `src/lib/owner-allocation.ts`'s
`allocateIncomeToOwners()`/`allocateExpenseToOwners()` already perform that
split once, at posting time, so the ledger already holds each owner's
final amount. Both properties are proven directly in the real-DB suite
(§31, `owner-portal-financial-integrity.db.test.ts`): a 100,000 tenant
Invoice with only a 60,000 `OwnerLedgerEntry` posted reports exactly
60,000, never 100,000; and changing the Invoice's total *after* the ledger
entry exists never changes the portal's reported figure.

`src/lib/owner-ledger-rules.ts`'s `summarizeOwnerLedgerEntries()` /
`buildOwnerStatement()` are the same pure, unit-tested functions the
pre-existing internal `getOwnerBalance()`/`getOwnerStatement()` reports
were refactored to use during this phase (a minimal, behavior-preserving
extraction, re-verified by the full existing test suite before any new
Owner Portal code was built on top) - one non-conflicting classification
and sign convention, never a duplicated or divergent implementation.
Income = `RENT_INCOME` + `OTHER_INCOME` credits only (deliberately
excluding `OWNER_CONTRIBUTION`); expenses = the six operating-expense
debit types (deliberately excluding `OWNER_DISTRIBUTION`, tracked
separately); `ADJUSTMENT`/`REVERSAL` affect balance only.

## 22. Financial Summary (`/owner-portal/financials`)

Current Balance (all-time), This Month/Year-to-Date Income and Expenses,
Net Movement, and the 10 most recent ledger entries
(`getOwnerPortalFinancialSummary()`). Existing `OWNER_DISTRIBUTION`
records, if any, are surfaced through the same ledger read as any other
entry type - no new payout workflow was invented (see §36).

## 23. Owner Ledger (`/owner-portal/ledger`)

Deliberately **not** asset-based: `getOwnerPortalLedger()` filters strictly
by `{ organizationId, ownerId }`, mirroring `requireOwnerLedgerAccess()`'s
own single-entry rule (§10) - `entry.ownerId === session.owner.ownerId`,
never by which asset the entry references. The owner-safe row shape
(`resolveLedgerPropertyLabel()`) deliberately omits `referenceType`/
`referenceId` (internal metadata pointing at whatever posted the entry)
and any actor/staff detail - only Date/Type(translated)/Description/
Property reference (resolved Unit number or Compound name)/Debit/Credit
are shown, plus the running balance on the Statement (§24).

## 24. Owner Statement and running balance (`/owner-portal/statements`)

`getOwnerPortalStatement({ from, to })` always resolves the authenticated
owner from their own session - `ownerId` is never accepted as a parameter,
so nothing in a URL or form can request another owner's statement (proven
in §31). `buildOwnerStatement()` (§21) computes a correct, non-zero opening
balance from every pre-period entry (`computeOwnerOpeningBalance()`) and a
running balance per dated row that carries forward exactly the sign
convention `summarizeOwnerLedgerEntries()` itself uses - never a
diverging calculation. `/owner-portal/statements/print` is the
professional, bilingual printable statement - English **"OWNER
STATEMENT"** / Arabic **"كشف حساب المالك"** (`t.ownerPortal.statementTitle`,
rendered uppercase for the English letterhead) - reusing the exact same
print architecture the Tenant Portal's own Security Deposit Statement
established (`no-print` class + `<PrintButton>` + `window.print()`, never
a bespoke PDF pipeline).

## 25. Opening/closing balance semantics

Opening balance = the ledger's own cumulative credit-minus-debit total over
every entry strictly before the requested `from` date; closing balance =
opening + net movement (period credits − period debits) - this identity is
directly asserted in the pure unit test suite
(`owner-ledger-rules.test.ts`) and re-used unmodified by both the internal
report and the Owner Portal.

## 26. Maintenance (`/owner-portal/maintenance`)

Read-only in V1 - no create/triage/assign/status-change action exists
anywhere in this file, matching the spec's explicit "no feature creep"
instruction. `resolveOwnerEffectiveScope()` (§14) additionally resolves
which Buildings/Compounds the owner is entitled to *at that level itself*
(not merely via Unit inheritance), since a Maintenance Request can be
scoped to an entire Building or Compound with no `unitId` at all -
mirroring `requireOwnerBuildingAccess()`/`requireOwnerCompoundAccess()`'s
own single-asset logic, just batched for the list view.
`OWNER_SAFE_MAINTENANCE_SELECT` is an explicit allow-list: request
number/property/category/priority/status/reported date/completion date/
description, and from the Work Order only status/completedAt/
costResponsibility/actualCost. Vendor identity, internal
diagnosis/work-performed/verification notes, tenant contact fields
(`reportedByName`/`reportedByPhone`), and internal `triageNotes` are all
structurally absent - proven by the dedicated DTO test in §31 that asserts
the exact key set of both the request and its Work Order.

## 27. Operational Maintenance Cost vs. Owner Expense

The Work Order's own `actualCost` is always labeled "Operational
Maintenance Cost" - the cost of the work performed, never itself an
accounting claim. It only becomes an "Owner Expense" once an actual
`OwnerLedgerEntry` (`entryType: MAINTENANCE_EXPENSE`, matched by
`referenceType: "MaintenanceRequest"` + `referenceId`) exists for that
request; `getOwnerPortalMaintenanceRequestDetail()` returns
`ownerExpenseAmount: null` when none does (the common case today - the
Security Deposit Settlement audit in this phase confirmed no automatic
maintenance-to-ledger posting exists anywhere), and the UI states this
plainly rather than implying a charge exists.

## 28. Profile (`/owner-portal/profile`)

Deliberately conservative, mirroring the Tenant Portal's own §22: `Owner.name`/
identity fields and the account's own login email are read-only in V1 - no
verification workflow exists for changing an identity-critical field
safely. The one genuinely safe, authoritative edit is the portal account's
own contact phone (`OwnerPortalAccount.phone`), separate from `Owner.mobile`,
which stays the staff-managed official record. Password change requires the
current password and does not force-logout other sessions (no such
mechanism exists anywhere in this codebase yet).

## 29. Internal account administration

`src/lib/actions/owner-portal-account.ts` mirrors
`src/lib/actions/tenant-portal-account.ts` exactly - the same
`ACCOUNT_TRANSITIONS` map, the same `generateTemporaryPassword()`, the same
FormData-with-hidden-id convention, the same audit-write pattern. No public
self-registration exists anywhere; every account is staff-created, and a
generated temporary credential is returned exactly once, to the calling
UI, and never persisted or logged anywhere. `src/components/owner-portal-account-panel.tsx`
integrates into the existing internal Owner profile page
(`src/app/(app)/owners/[id]/page.tsx`) using the identical one-time-reveal
`useActionState` pattern the Tenant Portal's own
`tenant-portal-account-panel.tsx` established - Portal Access section
showing Email/Account Status/Last Login, with Create/Activate/Suspend/
Disable/Reset Password buttons gated per-permission (§30).

## 30. RBAC / permission matrix

Six new `Permission` keys following the Tenant Portal's own precedent
exactly (`src/lib/permissions.ts`):

| Permission | OWNER/ADMIN | MANAGER | ACCOUNTANT | VIEWER |
|---|---|---|---|---|
| `ownerPortalAccount.view` | ✅ | ✅ | ✅ | ✅ |
| `ownerPortalAccount.create` | ✅ | ✅ | ❌ | ❌ |
| `ownerPortalAccount.activate` | ✅ | ✅ | ❌ | ❌ |
| `ownerPortalAccount.suspend` | ✅ | ✅ | ❌ | ❌ |
| `ownerPortalAccount.disable` | ✅ | ❌ | ❌ | ❌ |
| `ownerPortalAccount.resetPassword` | ✅ | ❌ | ❌ | ❌ |

The same higher-trust split already applied to `tenantPortalAccount.*`:
MANAGER may create/activate/suspend (day-to-day leasing-operations tier),
but disabling an account permanently and resetting a credential stay
OWNER/ADMIN-only - the same tier that already gates `settings.update`.

## 31. Real-DB test suite

Six new `.db.test.ts` files (35 real-DB tests) plus the existing two pure
unit-test files written earlier in this phase
(`owner-ledger-rules.test.ts`, 11 tests; `owner-portfolio-rules.test.ts`,
5 tests), all passing alongside the full pre-existing project suite with
zero regressions (430 unit tests; the full `.db.test.ts` suite, 52 files/
390 tests, project-wide):

- `owner-portal-auth.db.test.ts` (11) - login success/wrong-password/
  INVITED/SUSPENDED/DISABLED/nonexistent-email, case-insensitive email,
  and stale-session revalidation.
- `owner-portal-account-admin.db.test.ts` (8) - the internal admin action
  layer, including its own cross-org isolation.
- `owner-portal-same-org-isolation.db.test.ts` (8) - **the most important
  Owner Portal test**: two owners, one organization; Owner B against every
  entity type belonging to Owner A (Unit/Contract/OwnerLedgerEntry/
  MaintenanceRequest), plus a dashboard-reflects-own-portfolio-only check.
- `owner-portal-ownership-security.db.test.ts` (4) - cross-organization
  isolation; the **critical** ownership-override test (Owner A's 60%
  Compound vs. Owner B's 100% Unit override); the shared-ownership test
  (60%/40% co-owners, each seeing only their own percentage and ledger);
  and the ownership-revocation-without-relogin test (same mocked session,
  access granted then denied immediately after the `PropertyOwnership` row
  is ended).
- `owner-portal-financial-integrity.db.test.ts` (2) - the ledger-based
  financial-source test (100,000 Invoice / 60,000 ledger entry → reports
  exactly 60,000) and the ownership%-vs-ledger regression test (changing
  the Invoice afterward never changes the reported figure).
- `owner-portal-dto-privacy.db.test.ts` (2) - the tenant-PII-minimization
  DTO test (asserts the exact key set of the owner-facing Renter DTO) and
  the maintenance-privacy DTO test (asserts the exact key set of the
  Request/Work Order DTO, excluding vendor/diagnosis/tenant-contact
  fields).

`src/lib/actions/__dbtests__/owner-portal-test-helpers.ts` adds
`createTestOwnerPortalAccount()`, `ownerSessionFor()`, and
`seedOwnerPortalOwnership()` (a fresh Owner + ACTIVE account + a Unit they
own 100%) to the shared fixture library, reusing every existing helper
(`seedFullOrg`, `createTestOwner`, `createTestCompound/Building/Floor/Unit`,
`createContractWithSchedule`, `issueInvoice`) rather than duplicating
fixture logic.

## 32. Live verification results

A dedicated dev-server session (disposable fixtures, cleaned up
afterward - a fresh Organization deleted via cascade at the end) with a
real Chromium browser (Playwright) confirmed, beyond what the automated
suite covers:

- **`GET /owner-portal/login` is publicly reachable** (200, never
  redirected into the internal `/login`) - the exact bug class the Tenant
  Portal phase found in `src/proxy.ts`, verified fixed for the Owner
  Portal from the start (§8, this phase built the `proxy.ts` exclusion
  *before* any page, specifically to avoid repeating that mistake).
- **Default locale renders RTL** (`<html dir="rtl">`), and switching to
  English renders `dir="ltr"` with the correct English strings ("Owner
  Portal", the English login subtitle) - both locales confirmed live, not
  just via the dictionary type-check.
- **Live ownership-override attack**: authenticated as an owner who owns
  the parent Compound at 60%, direct URL navigation to a Unit explicitly,
  entirely owned by a different owner returned **404 / the neutral Not
  Found page** - never the unit. The actual owner of that Unit was then
  confirmed to load it normally (200).
- **Live session-collision check**: in the **same browser context** (same
  cookie jar), an Owner Portal session, an internal-staff session, and a
  Tenant Portal session were all established one after another without
  logging out of any of them - all three remained independently valid
  afterward (each subsequent full-page load stayed on its own
  `/owner-portal`, `/dashboard`, `/portal` route rather than being bounced
  to any login page), proving the three distinct cookie names (§5) never
  collide or overwrite one another in a real browser.
- All 12 scripted checks passed on the final run.

## 33. Performance / index decisions

`@@index([organizationId, status])` on `OwnerPortalAccount` supports the
internal admin panel's per-owner lookup pattern, identical to
`TenantPortalAccount`'s own index. `resolveOwnerEffectiveUnits()`/
`resolveOwnerEffectiveScope()` (§14) bulk-fetch `PropertyOwnership` and the
relevant Unit/Building/Compound rows **once** per page load and resolve
ownership in memory - never one ownership query per row - mirroring the
internal `getOwnerPortfolio()` report's own N+1-free pattern. Every
ledger/statement query is a single indexed `findMany` on
`{organizationId, ownerId}` (already indexed via `OwnerLedgerEntry`'s
existing `ownerId` relation), never an unbounded scan.

## 34. Printable statement

`/owner-portal/statements/print` is the only printable Owner Portal
document in V1, reusing the identical `no-print`/`PrintButton`/
`window.print()` architecture already established by the internal
ZATCA invoice pages and the Tenant Portal's Security Deposit Statement -
no new PDF library or print pipeline was introduced.

## 35. Bilingual coverage

A full `ownerPortal` dictionary block plus `ownerPortalAccountStatus` enum
labels exist in both `en.ts` and `ar.ts`
(`src/lib/i18n/dictionaries/*.ts`), reusing the exact Arabic glossary terms
supplied in the original specification (بوابة المالك, عقاراتي, وحداتي,
الملكية, نسبة الملكية, الملكية الفعلية, الإشغال, مؤجرة, شاغرة, العقود,
البيانات المالية, حساب المالك, كشف حساب المالك, الرصيد الافتتاحي,
الإيرادات, المصروفات, صافي الحركة, الرصيد الختامي, الرصيد الحالي, الصيانة,
تكلفة الصيانة التشغيلية, الملف الشخصي, تسجيل الخروج) rather than inventing
independent terminology. Every page, error message, and the internal
admin-panel integration render correctly in both locales (§32).

## 36. Future: Owner representatives

Not built. A future "an owner can grant a third party read access to their
own portfolio" feature would need its own delegation model
(`OwnerRepresentative` or similar) and its own entitlement layer - it must
never be retrofitted as a shortcut inside `owner-session.ts`'s existing
`ownerId`-based checks, which assume exactly one principal per
`OwnerPortalAccount`.

## 37. Future: Owner requests/approvals

Not built. The spec's explicit "no feature creep" list forbids any Owner
approval workflow (maintenance approval, rent-price approval, contract
approval) in this phase. A future version could add an `OwnerRequest`
model with its own staff-facing review queue, but no such surface, form,
or mutation exists anywhere in this codebase today - the portal is fully
read-only financially and operationally, confirmed in §26/§28 and by the
absence of any mutation action beyond the owner's own profile
phone/password (§28) and the internal admin actions (§29).

## 38. Future: Owner payouts

Not built. `OWNER_DISTRIBUTION` ledger entries are displayed exactly like
any other ledger entry (§22) if they already exist, but no payout
initiation, bank-transfer integration, or bank-account-editing capability
exists anywhere in the Owner Portal or was added to the internal app
during this phase - the explicit "no feature creep" boundary. A future
Owner Payouts feature would need its own approval workflow and its own
integration with a real payment rail; it is out of scope here by design.

## Real-world limitations (V1)

- **Historical ownership** (§12) - no point-in-time snapshot UI.
- **Single-organization owners** (§1, item 5) - a real owner spanning two
  organizations needs two `Owner` rows today.
- **No login rate limiting** on `/owner-portal/login`, reassessed and
  documented (not newly built) alongside the identical, pre-existing gap
  already noted for `/login` and `/portal/login` in
  `docs/TECHNICAL-DEBT.md`.
- **No password-reset-by-email flow** - no email infrastructure exists
  anywhere in this codebase; a forgotten password is staff-assisted (§29),
  by design.
- **Security Deposit Settlement visibility** - confirmed via the existing
  codebase audit that no Security Deposit Settlement action ever posts to
  `OwnerLedgerEntry`; the Owner Portal therefore shows nothing
  settlement-specific beyond whatever a real future ledger effect might
  represent.

## Production readiness and final recommendation

All of the mandatory verification passed with zero regressions: `prisma
validate`, `tsc --noEmit`, `eslint` (all new/changed files), the full unit
suite (430 tests), the full real-DB suite (390 tests across 52 files,
including the 35 new Owner Portal tests), `next build`, and the live
Chromium verification pass in §32 (12/12 checks, including the critical
ownership-override attack and the three-principal session-collision
check). No forbidden financial/operational mutation exists anywhere in the
Owner Portal (§26/§28/§37/§38), and every item on the spec's "no feature
creep" list remains unimplemented, confirmed by direct code review during
this write-up.

**READY FOR CORPORATE HOUSING DEVELOPMENT.**

Remaining risks are all documented limitations (see "Real-world
limitations" above and `docs/TECHNICAL-DEBT.md`), not defects: none of
them affect the correctness or security of what has been built. As with
the Tenant Portal, `OWNER_AUTH_SECRET` should be set to a distinct,
explicit value (rather than the `AUTH_SECRET`-derived default) in any real
production deployment.
