# Corporate Housing Management

This document describes the Corporate Housing Management module: an
operational layer that lets internal staff manage B2B corporate customers
("Corporate Accounts"), the employees they house ("Corporate Occupants"),
and which Unit each employee currently occupies under an existing lease
Contract ("Housing Allocations"). It is purely additive on top of the
existing Contract/Renter/Invoice/Payment/Unit engines - see §2 for the
architecture audit that established this. See `docs/PERMISSIONS.md` for
the RBAC system this module extends, `docs/MOVE-IN-HANDOVER.md` and
`docs/MOVE-OUT-MANAGEMENT.md` for the modules whose boundaries this one
respects, and `docs/MAINTENANCE-MANAGEMENT.md` for the Maintenance engine
this module traces into (never duplicates).

Scope of this task, per the brief: **Corporate Housing Management only.**
A Corporate Portal, corporate user authentication/employee login/employee
self-service, dependent/family management, a room/bed inventory engine,
capacity billing, subleases, a new Contract/Invoice/Payment engine, owner
accounting changes, a Security Deposit redesign, corporate credit limits
or approval workflow, Purchase Orders, vendor accounting, payroll/HR,
employee salary, passport/document storage, real object storage,
WhatsApp/email/SMS automation, AI allocation/pricing/occupancy
optimization, e-signature, access-control hardware/smart locks, and
utility billing are all explicitly **not implemented** here (see §33).

## 1. Overview & scope

A Corporate Account wraps an existing, VAT-registered `Renter` (the
commercial legal party who is financially responsible for one or more
lease Contracts) and adds operational structure on top of it: named
Contacts at the company, a roster of Occupants (the individual employees
who physically live in a Unit), and Housing Allocations that record which
Occupant is currently assigned to which Unit, under which Contract, for
what period. None of this is financial: Contract/PaymentSchedule/Invoice/
Payment remain the sole source of truth for what is owed and paid (see
§9). None of it is a new tenancy: an Occupant is never a Renter, never a
Contract party, never an Invoice customer (see §7).

## 2. Architecture audit (Step 1 findings)

Before writing any schema, this session audited whether a second Renter-
like or Contract-like engine was needed. It is not, for two independently
verified reasons:

- **`Renter` already fully represents the corporate legal customer.**
  `src/lib/invoicing.ts`'s `issueInvoice()` already branches
  `kind: renter.vatNumber ? "STANDARD" : "SIMPLIFIED"` - proving a
  VAT-registered (B2B) `Renter` is already a first-class, fully-supported
  invoicing customer with no code changes needed. `docs/CRM-LEADS.md` §6
  independently documents Lead's `CORPORATE` fields as "the foundation a
  future Corporate Housing feature would build on... NOT a separate
  Corporate Client module" - i.e. this exact module was anticipated to
  build on `Renter`, not replace it.
- **`Contract` already fully represents the commercial lease.** A
  corporate customer's lease of a Unit is not functionally different from
  any other lease - same rent, same schedule, same VAT treatment, same
  renewal/termination lifecycle. Introducing `CorporateLease`/
  `CorporateRentalContract` would fork that entire engine for no
  behavioral gain.

Conclusion, and the five critical principles that followed from it,
enforced throughout this implementation:

1. **Do not rebuild Contracts** - Corporate Housing only ever references
   an existing `Contract` (§8), never creates a competing lease/financial
   model.
2. **Do not rebuild Renters** - `CorporateAccount` wraps an existing
   `Renter` via a unique foreign key (§3), never duplicates its fields.
3. **Occupant ≠ Renter** - a `CorporateOccupant` is never a Contract
   party, Invoice customer, or Payment customer (§7).
4. **Allocation ≠ Contract** - a `CorporateHousingAllocation` is an
   operational assignment record, never a lease, sublease, financial
   contract, invoice, or payment schedule (§9).
5. **Financial authority stays put** - Contract/PaymentSchedule/Invoice/
   Payment/OwnerLedgerEntry remain financially authoritative; this module
   never calculates a second rent receivable (§9, §26).

## 3. Corporate Account vs Renter

`CorporateAccount` has a required, unique `renterId` (`onDelete: Restrict`
- a Renter with a Corporate Account can never be deleted out from under
it). It stores only what a `Renter` doesn't already have: `accountNumber`
(`CORP-000001`, §12), `displayName` (a commercial name, which may differ
from the Renter's own legal `fullName`), `status` (§4),
`industry`/`website` (optional profile fields), `accountManagerUserId`
(an internal staff relation), and `notes`. Company legal name, VAT number,
contact email/phone all continue to live on the wrapped `Renter` and are
read through the relation, never copied. Creating a Corporate Account is
manual only (an internal staff action, §13) - there is no automatic
CRM-lead-to-Corporate-Account conversion in this phase, matching the
"foundation, not automation" framing in `docs/CRM-LEADS.md` §6.

### `CorporateAccountStatus`

`PROSPECT` (default on creation) → `ACTIVE` / `INACTIVE` / `SUSPENDED`,
freely settable by staff via `updateCorporateAccount()` - no enforced
transition graph, since account status is a commercial/relationship
label, not an operational state machine. The dashboard's "Active
Corporate Accounts" KPI (§24) counts only `ACTIVE`.

## 4. Corporate Contacts

`CorporateContact` is a lightweight, per-Account contact list - **no login
account in this phase** (explicitly out of scope, §33). Fields:
`name`/`jobTitle`/`department`/`email`/`phone`, `contactType`
(`CorporateContactType`: `PRIMARY` / `HR` / `ADMINISTRATION` / `FINANCE` /
`HOUSING_COORDINATOR` / `EMERGENCY` / `OTHER`), `isPrimary` (at most one
per Account - `upsertCorporateContact()` unsets any existing primary
before setting a new one), and `isActive` (deactivated, never deleted -
see §22's no-hard-delete policy). Managed entirely from the Account
profile page (§27) via `upsertCorporateContact()`/
`activateCorporateContact()`/`deactivateCorporateContact()`.

## 5. Corporate Occupants

`CorporateOccupant` is the individual employee physically residing in a
Unit. **Deliberately minimal PII** - the model has no passport/national-ID
scan field, no medical data, no salary, no bank details (§33's boundary
list forbids all of these). Fields: `employeeNumber` (free text, optional
- not a generated sequence, since employee numbering is the corporate
customer's own HR system's business, not this one's), `fullName`/
`fullNameAr`, `email`/`phone`, `nationality`, `jobTitle`/`department`,
`status` (`CorporateOccupantStatus`: `ACTIVE` / `INACTIVE` /
`LEFT_COMPANY`), `emergencyContactName`/`emergencyContactPhone`, and
`notes`. `status` is **kept independent of allocation state** - an
Occupant can be `ACTIVE` with no current allocation (between assignments)
or `LEFT_COMPANY` while a historical `ENDED` allocation still references
them; the two are tracked separately on purpose (occupant employment
status vs. housing assignment status answer different questions).

## 6. Corporate Occupant vs Renter (critical invariant)

An Occupant is **never** automatically turned into a `Renter`, Contract
party, Invoice customer, or Payment customer, and this codebase never
creates a `Renter` row for every employee merely to reuse tenancy pages.
`CorporateOccupant` has no relation to `Contract`/`Invoice`/`Payment` at
all - the only two tables that ever reference a `CorporateOccupant.id` are
`CorporateHousingAllocation` (§9) and, optionally, `MaintenanceRequest`
(§20). This is enforced structurally (there is no schema path from
Occupant to any financial table), not just by convention.

## 7. Housing Allocations

`CorporateHousingAllocation` records "this Occupant is assigned to this
Unit, under this Contract, for this period" - nothing else. Fields:
`allocationNumber` (`CHA-000001`, §12), `corporateAccountId`/`occupantId`/
`contractId`/`unitId` (all required relations), `startDate`/
`plannedEndDate`/`actualEndDate`, `bedroomNumber`/`roomLabel` (free-text
context only - no capacity engine, §11), `status` (§8), `notes`,
`createdByUserId`/`endedByUserId`. **`unitId` is always derived
server-side from `contract.unitId` at creation and transfer time - never
accepted from the client** (mirroring `createMoveIn()`'s own established
"Unit/Renter must derive from Contract" convention). The create/transfer
schemas don't even declare a `unitId` field, so an injected one is
silently dropped by `z.object().parse()` before it can be read (verified
in `corporate-housing-cross-org-security.db.test.ts`, "Contract A + Unit
B").

## 8. Allocation status lifecycle (`CorporateHousingAllocationStatus`)

`PLANNED → {ACTIVE, CANCELLED}`, but **`ACTIVE → {ENDED}` only** (an
allocation that has genuinely started is a historical fact, not something
to retroactively cancel away). `ENDED` and `CANCELLED` are both terminal -
neither can transition anywhere else, including back to each other. This
asymmetry is enforced by `isValidAllocationTransition()` in
`src/lib/corporate-housing-rules.ts` (unit-tested for every legal and
illegal transition) and re-checked server-side on every mutation, never
trusted from client state.

## 9. Allocation ≠ Contract (critical invariant)

`CorporateHousingAllocation` has **no rent, schedule, invoice, or payment
field of its own** - it is deliberately not a financial record. Creating,
activating, transferring, ending, or cancelling an allocation never
creates or mutates an `Invoice`/`InvoiceLine`/`Payment`/`PaymentSchedule`/
`OwnerLedgerEntry`/`SecurityDepositSettlement`/`SecurityDepositLedgerEntry`
row - verified directly in `corporate-housing-lifecycle.db.test.ts`
("Corporate Housing financial isolation"), which snapshots every one of
those tables before and after a full create → activate → end cycle and
asserts byte-for-byte equality.

## 10. Server-side re-verification pattern

Every mutation re-fetches Account/Occupant/Contract fresh inside the same
`$transaction` and re-derives eligibility/dates/overlap from that fresh
state - **never trusting a client-supplied id combination**, exactly
mirroring the established pattern from Owner Portal's
`ownerHasEffectiveAccess()` and Move-In's `blocksNewMoveInForContract()`.
Concretely, `createCorporateAllocation()`:

1. Re-fetches the Account, Occupant (scoped by `organizationId` **and**
   `corporateAccountId`, so an Occupant belonging to a different Account
   in the same org can never be attached - §21), and Contract.
2. Calls `evaluateContractEligibility()` (§11).
3. Calls `validateAllocationDates()` (§11).
4. Calls `canOccupantBeAllocated()` against freshly-queried existing
   allocations (§11), inside a `Serializable` transaction so a genuine
   concurrent race is caught by Postgres rather than a client-side check
   (§25).

`activateCorporateAllocation()`/`endCorporateAllocation()`/
`cancelCorporateAllocation()`/`transferCorporateOccupant()` only ever
accept an `allocationId` (plus, for transfer, the new Contract/dates) -
there is no `occupantId` field on any of their schemas, so the allocation
row's own `occupantId` is what gets re-verified and acted on, never
whatever a caller might additionally submit (verified in
`corporate-housing-cross-org-security.db.test.ts`, "Allocation A +
Occupant B").

## 11. Centralized pure-logic rules (`src/lib/corporate-housing-rules.ts`)

- **`evaluateContractEligibility()`** - a Contract is eligible for a new
  allocation only if it belongs to the same organization, its `renterId`
  matches the Corporate Account's own `renterId`, and its `status` is
  `ACTIVE` (`ELIGIBLE_CONTRACT_STATUSES_FOR_ALLOCATION`).
- **`validateAllocationDates()`** - an allocation's `startDate`/
  `plannedEndDate` must normally fall within the Contract's own
  `startDate`/`endDate`; any exception is a documented, explicit decision
  (there is none in this implementation - every allocation date is
  validated against its Contract's occupancy period, no override path
  exists).
- **`canOccupantBeAllocated()`** - prevents the same Occupant from having
  two overlapping `PLANNED`/`ACTIVE` allocations at once
  (`BLOCKING_ALLOCATION_STATUSES`). Two date ranges overlap iff each
  starts before the other ends; a null end date (open-ended) is treated as
  unbounded, matching this codebase's existing Viewing overlap convention.
  Concurrency-safe (§25) and unit-tested for back-to-back non-overlap,
  open-ended overlap, and exclude-by-id (so an allocation doesn't "overlap
  with itself" when re-validated during its own activation/transfer).
- **`isValidAllocationTransition()` / `canTransferFromStatus()`** - the
  status graph from §8.
- **`isUnitUnallocated()` / `computeAllocationRate()`** - the dashboard
  terminology/formula from §24.
- **`isPlannedArrival()` / `isPlannedDeparture()`** - the Arrivals/
  Departures definitions from §24.

All 38 pure functions are covered by `src/lib/corporate-housing-rules.test.ts`
(unit tests, no database).

## 12. Numbering

`formatCorporateAccountNumber()` → `CORP-000001` and
`formatCorporateHousingAllocationNumber()` → `CHA-000001`, both via the
existing `nextCounterValue(tx, organizationId, key)` Counter-table
infrastructure (`src/lib/numbering.ts`) - the same org-scoped,
concurrency-safe sequence mechanism as every other non-tax-document number
in this codebase (Move-In `MI-`, Move-Out `MO-`, Lead `LEAD-`, etc.). No
year component, matching that same convention (these are internal
operational records, not legal/tax documents). Concurrency-tested in
`corporate-housing-concurrency.db.test.ts` ("allocation numbering
concurrency") with real concurrent `Promise.allSettled()` calls, not
sleeps.

## 13. Server actions layer

- **`src/lib/actions/corporate-accounts.ts`** -
  `getEligibleCorporateRenters()` (VAT-registered, no existing Account),
  `getCorporateAccountManagerOptions()`, `getCorporateAccountOptions()`,
  `getCorporateAccountLinksForRenters()` (bulk lookup for the Renters list
  integration, §19), `listCorporateAccounts()`, `createCorporateAccount()`,
  `updateCorporateAccount()`, `getCorporateAccountById()`.
- **`src/lib/actions/corporate-contacts.ts`** -
  `upsertCorporateContact()`, `activateCorporateContact()`,
  `deactivateCorporateContact()`.
- **`src/lib/actions/corporate-occupants.ts`** -
  `listCorporateOccupants()`, `upsertCorporateOccupant()`,
  `getCorporateOccupantById()`.
- **`src/lib/actions/corporate-allocations.ts`** (the largest file) -
  `getEligibleContractsForAccount()`, `getCorporateAllocationStatusForUnits()`
  (bulk lookup for the Units list integration, §19),
  `getCorporateHousingContextForContract()` /
  `getCorporateHousingContextForUnit()` /
  `getCorporateHousingContextForMaintenanceRequest()` (the three
  read-only integration-card helpers, §19/§20), `listCorporateAllocations()`,
  `getCorporateAllocationById()`, `createCorporateAllocation()`,
  `activateCorporateAllocation()`, `endCorporateAllocation()`,
  `cancelCorporateAllocation()`, `transferCorporateOccupant()`.
- **`src/lib/actions/corporate-housing-dashboard.ts`** -
  `getCorporateHousingDashboard()` (§24).
- **`src/lib/actions/corporate-housing-reports.ts`** - the 9 named
  reports (§28) plus `getCorporateAccountFinancialSnapshot()` /
  `getCorporateAccountMaintenanceSnapshot()` (single-account variants for
  the Account profile page) and `getCorporateHousingOccupancyRoster()`
  (§29).

Every list/read function requires `corporateHousing.view` (or
`corporateHousingReports.view` for reports); every mutation requires its
own specific `corporateAccount.*`/`corporateContact.manage`/
`corporateOccupant.*`/`corporateAllocation.*` permission (§21) via
`requirePermission()`/`requirePermissionAudited()` - see
`docs/PERMISSIONS.md` §2-3 for the full matrix.

## 14. Lifecycle actions summary

All internal-staff-only, all centralized in
`src/lib/actions/corporate-allocations.ts`:

- **Create** (`corporateAllocation.create`) - lands as `PLANNED` or
  `ACTIVE` depending on whether `startDate` is in the future or has
  already arrived (`startDate <= now`).
- **Activate** (`corporateAllocation.activate`) - `PLANNED → ACTIVE`,
  re-checking every relation and the overlap rule fresh (state could have
  changed since the allocation was planned).
- **End** (`corporateAllocation.end`) - `ACTIVE → ENDED`, sets
  `actualEndDate` (defaults to now) and `endedByUserId`. See §15's
  critical invariant.
- **Cancel** (`corporateAllocation.cancel`) - `PLANNED → CANCELLED` only
  (never from `ACTIVE`, §8) - for records that should never proceed.
- **Transfer** (`corporateAllocation.transfer`) - see §16.

No approval workflow anywhere in this lifecycle, per the brief's own
"keep it simple" instruction.

## 15. Critical invariant: ending an allocation

Ending an allocation **must never**: terminate the Contract, complete a
Move-Out, set `Unit.status = VACANT`, or touch `Invoice`/`PaymentSchedule`.
`endCorporateAllocation()` does exactly one thing - update the
`CorporateHousingAllocation` row's own `status`/`actualEndDate`/
`endedByUserId` - and nothing else. Verified directly in
`corporate-housing-lifecycle.db.test.ts`, which asserts `Unit.status` and
`Contract.status` are byte-identical before and after ending an allocation
on an `OCCUPIED` unit under an `ACTIVE` contract.

## 16. Transfer semantics

`transferCorporateOccupant()` is one atomic `Serializable` transaction:
it ends the old allocation (`actualEndDate = newStartDate`, `status:
ENDED`, `endedByUserId`) and creates a new one under a **new Contract that
must belong to the SAME Corporate Account's Renter** - either both happen
or neither does (rollback-tested). This is a documented V1 design
decision: moving an employee to a different employer entirely is a new
Occupant record under a new Account, not a "transfer" (a transfer is
inherently an intra-company reassignment - a change of Unit/Contract, not
of employer). The two resulting audit rows cross-reference each other via
`metadata: { transferredToAllocationId }` / `metadata: {
transferredFromAllocationId }` so the full transfer chain is traceable
from either side. The old allocation's own Unit is never mutated by a
transfer (§15's invariant applies equally here).

## 17. Move-In boundary

Corporate Housing **never modifies `MoveIn`** - it only reads a Contract's
existing Move-In (via `getCorporateAllocationById()`'s "Move-In Context"
lookup) for display, and links to it from the Allocation workspace page
(§27). `corporate-housing-lifecycle.db.test.ts`'s "Move-In immutability"
test drives a completed Move-In to its full baseline snapshot, then runs
create → activate → transfer → end on an allocation against that same
Contract, and asserts the Move-In row (plus every inspection item, meter
reading, and key item) is byte-for-byte unchanged afterward.

## 18. Move-Out and Contract-termination boundaries

Two deliberately narrow additions to pre-existing files - the only two
touch points where Corporate Housing code was added outside its own
module, following the "smallest safe change" defect/invariant protocol
since both touch existing production behavior:

- **`completeMoveOut()`** (`src/lib/actions/move-outs.ts`) now blocks
  completion while any `PLANNED`/`ACTIVE` `CorporateHousingAllocation`
  still exists on that Contract, throwing a translated error
  (`moveOutBlockedByActiveCorporateAllocations`). This is the chosen
  "block until explicitly ended" approach (preferred over silently
  orphaning active corporate occupancy) - staff must end the corporate
  allocation first, which is one click on the Allocation workspace.
- **`terminateContract()`** (`src/lib/actions/contracts.ts`) has the
  identical blocking check, with its own translated error
  (`contractTerminationBlockedByActiveCorporateAllocations`).

Both are a single `count()` query inserted at one point in an existing
transaction - no other behavior in either function was touched. Both are
regression-tested: `corporate-housing-lifecycle.db.test.ts` proves the
blocker rejects while an allocation is active/planned, then proves the
underlying action (Move-Out completion, Contract termination) succeeds
normally immediately after the allocation is ended - exercising only the
blocker's own rejection path, never touching Move-Out/Contract behavior
otherwise.

## 19. Read-only integration points (Contract/Unit/Renter)

Contract, Unit, and Renter have **no dedicated per-record profile page**
in this codebase (they are flat list pages - `/contracts`, `/units`,
`/renters` - with inline edit forms and, for Contract, a genuine
`/contracts/[id]/edit` page that other modules already use as their
integration surface). Corporate Housing follows the exact precedent each
prior module (Move-In, Move-Out) already established for this same
constraint:

- **Contract** - `/contracts/[id]/edit` (the closest thing to a Contract
  "profile" page, already carrying Move-In/Move-Out/Security-Deposit
  integration cards) gained a "Corporate Housing" card showing the
  Corporate Account link and every Allocation tied to that specific
  Contract, gated by `corporateHousing.view`.
- **Unit** - `/units` list page gained a per-row badge (mirroring the
  existing Move-In/Move-Out status badges there exactly) linking to the
  Unit's current `ACTIVE`/`PLANNED` allocation, via a new bulk
  `getCorporateAllocationStatusForUnits()` lookup (never a per-row query -
  §31).
- **Renter** - `/renters` list page gained the same per-row badge pattern,
  linking to the Renter's Corporate Account if one exists, via
  `getCorporateAccountLinksForRenters()`.

All three are internal-staff pages already (behind `requireSession()`),
so this exposure is never reachable from the Owner Portal or Tenant
Portal (§30).

## 20. Maintenance integration (narrow, optional)

A `corporateOccupantId String?` foreign key (`onDelete: SetNull`) was
added to `MaintenanceRequest`, alongside a new `CORPORATE_OCCUPANT` value
on the existing `MaintenanceReportedByType` enum - purely for
traceability ("this request was reported by this corporate occupant"),
never a duplicate Maintenance engine and never a client-facing "report
as this corporate occupant" flow (there is no such field on
`createMaintenanceRequest()`'s own schema - an injected
`corporateOccupantId` is silently dropped, verified in both the internal
and Tenant Portal cross-org test suites). The internal Maintenance detail
page (`/operations/maintenance/requests/[id]`) gained a read-only
"Corporate Housing Traceability" card (Occupant / Corporate Account /
current Allocation, if any), gated by `corporateHousing.view`. See §30 for
the mandatory Owner Portal/Tenant Portal privacy regression this required.

## 21. RBAC

Ten new `Permission` keys: `corporateHousing.view`,
`corporateHousingReports.view`, `corporateAccount.create`/`.update`,
`corporateContact.manage`, `corporateOccupant.create`/`.update`,
`corporateAllocation.create`/`.update`/`.activate`/`.end`/`.cancel`/
`.transfer`. OWNER/ADMIN hold all of them. MANAGER holds the full
operational set (everything except - there is nothing MANAGER lacks here,
matching its existing Contract/Move-In/Maintenance access tier).
ACCOUNTANT gets `corporateHousing.view` + `corporateHousingReports.view`
only. VIEWER gets `corporateHousing.view` only. **The internal `OWNER`
role is unrelated to the Owner Portal's own external principal** - an
Owner Portal account never receives any Corporate Housing permission; see
`docs/PERMISSIONS.md` §3 for the full matrix and rationale. Full details
in `docs/PERMISSIONS.md`, section "Corporate Housing".

## 22. Audit & no-hard-delete

Every mutation writes an `AuditLog` row via `auditCreate()`/
`auditUpdate()`/`auditAction()` (the existing centralized audit
infrastructure - see `docs/AUDIT-AND-FINANCIAL-CONTROLS.md`). Two new
`AuditAction` values were added: `END` and `TRANSFER` (alongside the
existing `CREATE`/`UPDATE`/`ACTIVATE`/`CANCEL`). Nothing in this module is
ever hard-deleted: Accounts move through status, Contacts deactivate,
Occupants move through status, Allocations move through status - matching
every other module's own established policy. Every entity's Audit
Timeline is visible on its own page (Account profile, Occupant profile,
Allocation workspace).

## 23. Multi-tenancy

Every table carries `organizationId` and every query filters on it, like
every other table in this schema. Beyond the baseline, this module
specifically re-verifies **relation consistency within the same
organization** on every write (§10) - the mandated defense against
same-org relation injection (mixing two different Accounts'/Occupants'/
Contracts' records together even though both belong to the caller's own
org). Full cross-org IDOR and same-org relation-injection coverage is in
`corporate-housing-cross-org-security.db.test.ts` (§31).

## 24. Dashboard KPIs and terminology discipline

`getCorporateHousingDashboard()` computes every KPI centrally - no page
recomputes any of these ad hoc. The most consequential terminology
decision in this module:

- **"Unallocated Corporate Units" is never "Vacant Units."**
  `isUnitUnallocated()` checks only whether any `ACTIVE` allocation exists
  for a Unit - **completely independent of `Unit.status`**, which can
  remain `OCCUPIED`. A corporate-leased Unit is contractually occupied
  (the company is paying rent on it) while having zero occupants
  currently assigned - that Unit is "unallocated," never "vacant," and
  every dashboard card/report label reflects this distinction explicitly.
- **Allocation Rate is unit-based, never occupant-based.**
  `computeAllocationRate({ corporateLeasedUnitCount,
  unitsWithActiveAllocationCount })` = `round(unitsWithActiveAllocationCount
  / corporateLeasedUnitCount * 100)`. A Unit with three occupants sharing
  it still counts once - this is unit-tested explicitly (`computeAllocationRate`
  test cases) and confirmed live: after allocating one Occupant to one
  Corporate-leased Unit, the dashboard showed exactly `100%` (1 of 1
  units allocated), not any occupant-count-derived figure.
- **Arrivals/Departures are allocation-date-based, never Move-In/Move-Out-based.**
  `isPlannedArrival()`/`isPlannedDeparture()` look only at
  `startDate`/`plannedEndDate` on the Allocation itself, within a 7-day or
  30-day window from now - entirely independent of whether a Move-In or
  Move-Out record exists for the underlying Contract.

Every KPI (Active Corporate Accounts, Corporate Contracts,
Corporate-Leased Units, Active Occupants, Active Allocations, Planned
Arrivals/Departures at 7d/30d, Unallocated Corporate Units, Allocation
Rate, Open Maintenance Requests, Contracts Expiring Soon at 30/60/90d) was
verified live against real fixtures (§32) and matched the expected math
exactly.

## 25. Concurrency

`Serializable` isolation is used only where concurrency-sensitive
(allocation create/activate/end/transfer, account creation's counter
increment) - not mechanically applied everywhere. Four scenarios are
tested with genuinely concurrent `Promise.allSettled()` calls (never
sleeps) in `corporate-housing-concurrency.db.test.ts`:

1. **Allocation-number generation** - two concurrent creations across
   different occupants/contracts never produce the same number.
2. **Occupant overlap** - two concurrent allocation attempts for the
   *same* occupant on overlapping dates: exactly one succeeds.
3. **Simultaneous activation** - two concurrent `activate` calls on the
   same `PLANNED` allocation: exactly one commits the transition (proven
   via exactly one `ACTIVATE` audit row, not zero, not two).
4. **Transfer-vs-end conflict** - a transfer racing a plain `end` on the
   same `ACTIVE` allocation: exactly one of the two conflicting
   transitions applies, under Postgres's own write-conflict detection.

## 26. Corporate Financial Snapshot

Uses **strictly the existing Contract/Invoice/Payment engine** - never a
new corporate ledger, never `OwnerLedgerEntry`. Labeled carefully as
Contract Value / Invoiced / Paid / Outstanding / Overdue (never "Corporate
Account Balance," which would imply a ledger this module doesn't have).
Available both per-account (Account profile page) and org-wide (Report 9,
§28) - both computed by the identical math, one just scoped to a single
account.

## 27. Pages

Internal-staff pages under `/corporate-housing`, all gated by
`corporateHousing.view` (or the relevant mutation permission for
forms/actions):

- **`/corporate-housing`** - dashboard (§24).
- **`/corporate-housing/accounts`** (list, server-paginated, search +
  status filter) and **`/corporate-housing/accounts/new`**.
- **`/corporate-housing/accounts/[id]`** - profile: Account Summary
  (editable), Corporate Renter, Contacts (add/activate/deactivate),
  Contracts, Units, Occupants, Active/Upcoming/Recent-History
  Allocations, Financial Snapshot, Maintenance Snapshot, Audit Trail.
- **`/corporate-housing/occupants`** (list, search + account + status
  filter) and **`/corporate-housing/occupants/new`** (accepts
  `?accountId=`).
- **`/corporate-housing/occupants/[id]`** - profile: Employee Summary
  (editable), Contact Details, Current Allocation, Allocation History,
  Maintenance Requests Reported, Corporate Account link, Notes, Audit
  Trail.
- **`/corporate-housing/allocations`** (list, status + account filter,
  server-paginated) and **`/corporate-housing/allocations/new`** (accepts
  `?accountId=`/`?occupantId=`/`?contractId=` - the server remains
  authoritative regardless of which query params are supplied).
- **`/corporate-housing/allocations/[id]`** - the workspace: Allocation
  Summary, Corporate Account, Occupant, Contract (with Unit/property
  hierarchy), Move-In Context, Maintenance Context, Audit Trail, and the
  lifecycle action buttons (Activate/End/Cancel/Transfer, each gated by
  its own permission and current status).
- **`/corporate-housing/reports`** - index (§28) plus
  **`/corporate-housing/roster`** - the printable Occupancy Roster (§29).

All list pages use server-side pagination/filtering throughout - no page
loads an unbounded dataset for client-side filtering.

## 28. Reports (9 named reports)

All under `/corporate-housing/reports`, all server-side paginated
(`PAGE_SIZE = 25`), gated by `corporateHousingReports.view`:

1. **Account Summary** - every Account with active contract/occupant/
   allocation counts.
2. **Occupancy** - per-Account corporate contract/unit counts,
   units-with-allocation, unallocated-unit count, active occupants, and
   the centralized Allocation Rate (§24).
3. **Occupant Allocation** - every allocation with occupant/unit/dates/
   status - no financial data.
4. **Planned Arrivals** (7d/30d toggle, §24's definition).
5. **Planned Departures** (7d/30d toggle, §24's definition) - never
   confused with Move-Out.
6. **Contract Expiry** (30/60/90d toggle) - corporate contracts only.
7. **Unallocated Corporate Units** (§24's terminology, never "vacant").
8. **Corporate Maintenance** - requests against corporate-leased units,
   with the reporting occupant if any - never duplicates cost/accounting
   logic.
9. **Corporate Financial Snapshot** (§26) - org-wide.

## 29. Printable Occupancy Roster

A professional, bilingual printable page (`/corporate-housing/roster`,
reusing the existing print architecture - `PrintButton`, the same
logo/org-header layout as the Move-In report) that always shows **both**
titles regardless of the viewer's active locale: "CORPORATE HOUSING
OCCUPANCY ROSTER" / "كشف إشغال إسكان الشركات". Lists every currently
`ACTIVE` allocation (Allocation #, Corporate Account, Occupant, Unit +
property hierarchy, Start/Planned-End dates). Internal-staff-only
(`corporateHousingReports.view`) - **never public, never exposed to any
portal**.

## 30. Privacy regressions (Owner Portal & Tenant Portal)

The Maintenance integration (§20) is the only point where
`CorporateOccupant` data could theoretically leak into a portal's own
data layer through a shared `MaintenanceRequest` join. Both portals'
existing owner-safe/tenant-safe `select` clauses were confirmed to
**never** include `corporateOccupantId`/`corporateOccupant` (they were
defined before this module existed and were not modified). Two dedicated
regression tests prove this structurally, not just by inspection:

- **`owner-portal-dto-privacy.db.test.ts`** ("Corporate Housing privacy
  regression") - creates a Maintenance Request reported by a real
  Corporate Occupant with a distinctive name, then asserts the Owner
  Portal's list and detail DTOs have neither a `corporateOccupantId` nor
  a `corporateOccupant` key, and that the occupant's name/employer never
  appears anywhere in the serialized JSON.
- **`tenant-portal-maintenance-mutation.db.test.ts`** ("Corporate Housing
  privacy regression") - proves an injected `corporateOccupantId` in a
  tenant's own maintenance-creation form is silently dropped (the
  create schema has no such field), and that the tenant-facing detail DTO
  is likewise clean.

## 31. Real-DB test suite

Four dedicated `.db.test.ts` files (plus the two portal-privacy
extensions above), run via `npm run test:db` against a disposable
Postgres database (never the dev/prod database):

- **`corporate-housing-lifecycle.db.test.ts`** - full Account → Contact →
  Occupant → Allocation create/activate/transfer/end/cancel lifecycle;
  financial isolation (§9); Move-In immutability (§17); the Move-Out
  completion blocker's rejection-then-success path (§18); the Contract
  termination blocker's rejection-then-success path (§18); the
  Unit-status/Contract-status invariants (§15).
- **`corporate-housing-cross-org-security.db.test.ts`** - cross-org IDOR
  on every entity (Account/Contact/Occupant/Allocation) and every
  integration helper, plus the five mandated same-org relation-injection
  combinations: Account A + Occupant B, Account A + Contract B, Contract A
  + Unit B (structurally impossible by design - proven by showing an
  injected `unitId` has no effect, §7), Allocation A + Occupant B
  (structurally impossible by design - proven by showing an injected
  `occupantId` has no effect, §10), and Maintenance A + Occupant B.
- **`corporate-housing-concurrency.db.test.ts`** - the four scenarios in
  §25.
- Extensions to **`owner-portal-dto-privacy.db.test.ts`** and
  **`tenant-portal-maintenance-mutation.db.test.ts`** - §30.

30 real-DB tests total for this module (19 lifecycle/cross-org/concurrency
+ 2 privacy regressions on top of each portal's existing suite), on top of
38 pure-logic unit tests (§11). Full suite result at time of writing: 55
real-DB test files / 411 tests passing, 28 unit test files / 468 tests
passing, zero regressions in any pre-existing module.

## 32. Live verification

Verified directly in a running `next dev` instance (Turbopack), logged in
as the seeded `OWNER`-role demo user, via a scripted Playwright session
(not just manual spot-checks):

- All 18 Corporate Housing routes return `200` with zero page errors and
  zero `5xx` responses, in **both** English and Arabic locales.
- The English dashboard, both `new` forms, the Account profile page, and
  the Arabic-locale dashboard/roster were visually inspected via
  full-page screenshots - correct layout, correct RTL flow and alignment
  in Arabic (including the sidebar nav group, breadcrumb-style quick
  links, and KPI card grid), no untranslated strings, no overflow.
- **A complete golden path was driven end-to-end through the real browser
  forms** (not direct database writes): create a VAT-registered Renter →
  create a Corporate Account from it → create a Corporate Occupant →
  create an ACTIVE Contract for that Renter → create a Housing Allocation
  from it (landing `ACTIVE`, since its start date had already arrived) →
  confirm the Allocation workspace correctly shows the Corporate
  Account/Occupant/Contract/Unit and a full audit trail with the
  server-derived relation ids. Zero page errors or `5xx` responses
  throughout.
- The dashboard KPIs were confirmed **live**, not just unit-tested, after
  that golden path: Corporate Contracts = 1, Corporate-Leased Units = 1,
  Active Occupants = 2, Active Allocations = 1, Unallocated Corporate
  Units = 0, Allocation Rate = 100% - all matching the expected math
  exactly, and correctly rendered again in Arabic after switching locale.
  "Active Corporate Accounts" correctly stayed at `0` throughout (the test
  Account was left in its default `PROSPECT` status), confirming the KPI
  distinguishes account *status*, not mere existence.
- All test fixtures created during this live pass (the temporary Renter/
  Corporate Account/Occupant/Contract/Allocation) were deleted from the
  database afterward; the dev server was stopped.

## 33. Explicitly not implemented (strict no-feature-creep boundary)

Per the brief's own boundary list, none of the following exist anywhere
in this module: a Corporate Portal, corporate user authentication,
employee login, employee self-service, dependent/family management, a
room inventory engine, a bed inventory engine, capacity billing,
subleases, a new Contract engine, a new Invoice engine, a new Payment
engine, owner accounting changes, a Security Deposit redesign, corporate
credit limits, a corporate approval workflow, Purchase Orders, vendor
accounting, payroll, an HR system, employee salary, passport/document
storage, real object storage, WhatsApp/email/SMS automation, AI
allocation/pricing/occupancy optimization, e-signature, access-control
hardware/smart locks, or utility billing. `CorporateOccupant`'s field list
(§5) was designed from the start to make several of these structurally
impossible to add by accident (there is nowhere to put a passport scan or
a salary figure on the model as it stands).
