# Executive & Operations Dashboards

## 1. Overview & scope

A read-only management-intelligence layer on top of the existing multi-tenant
property management system: `Authoritative Domain Data -> Central KPI
Definitions -> Bounded Aggregate Queries -> Dashboard DTOs -> Executive
Views -> Drill-Down Reports`. It introduces no second accounting, leasing,
occupancy, maintenance, or reporting engine - every KPI is computed by
reusing an existing pure formula function or an existing field/status
definition already authoritative elsewhere in this codebase. The module adds
a new internal-staff-only `/executive` route tree; it changes no existing
page's behavior and performs no domain mutation on its own read paths.

## 2. Architecture audit (Step 1 findings, summary)

Conducted before any code was written. Findings that shaped every decision
below:
- `getDashboardStats()`/`getInvoiceTotals()` (src/lib/actions/dashboard.ts)
  do not exclude `CANCELLED` invoices from lifetime totals - a known,
  already-documented gap (docs/TECHNICAL-DEBT.md item 5). The Executive
  module deliberately diverges from this and excludes `CANCELLED` invoices
  everywhere.
- `ContractStatus.EXPIRED` and `UnitStatus.MAINTENANCE` have zero writers
  anywhere in the codebase (grep-confirmed) - "Active Contracts" therefore
  over-counts contracts past their own `endDate`; this is surfaced via the
  Attention Center rather than silently inferred or "fixed."
- `OwnerLedgerEntry` has exactly two `.create()` call sites in the entire
  codebase (`src/lib/actions/owner-ledger.ts`, the security-deposit
  settlement posting path) - maintenance cost, rent invoicing, and every
  other module have zero automatic paths that post to the owner ledger.
- The payment-reversal design (`reversePayment()`,
  src/lib/actions/payments.ts:133) never mutates the original `Payment` row;
  it flips its status to `REVERSED` and inserts a second, negative-amount
  row. Any `SUM(amount)` over ALL statuses already nets to zero.
- No `Organization.timezone` field exists; every date-bounded query in this
  codebase (dashboard, reports, move-in/out dashboards) already assumes
  server-local time.
- `syncOverdueStatuses()` (src/lib/actions/collections.ts:13) is an
  unprotected housekeeping mutation called lazily inside several existing
  *read* actions (`getDashboardStats()`, `getOverdueReport()`,
  `listCollections()`).

## 3. The seven Critical Principles (binding constraints)

1. **One KPI, one definition** - every KPI has exactly one formula, defined
   once in `src/lib/executive/kpi-registry.ts` and computed once per domain
   module.
2. **Authoritative source, never a convenient substitute** - `Unit.status`
   for occupancy, `Invoice`/`Payment`/`PaymentSchedule` for receivables,
   `OwnerLedgerEntry` ONLY for owner financials, `CorporateHousingAllocation`
   for corporate occupancy, `MaintenanceRequest`/`MaintenanceWorkOrder` for
   maintenance, `CommunicationMessage` for communications.
3. **No double counting** - Outstanding vs. Overdue Receivables, Maintenance
   Cost vs. Owner Expense, and Corporate-Leased-but-Unallocated vs. Vacant
   are each kept as two structurally distinct populations, never summed.
4. **Snapshot vs. period metric** - a snapshot metric (Occupied Units, Active
   Contracts, Outstanding Receivables) is never silently date-filtered; only
   genuinely period-based metrics accept the Period filter
   (`KpiDefinition.periodFilterable`, src/lib/executive/kpi-registry.ts).
5. **Drill-down reconciliation** - every KPI card links to the real,
   pre-existing list/report page that contains the reconciling records
   (`KpiDefinition.drillDownRoute`) - never a parallel drill-down UI.
6. **Decimal money** - every money aggregation uses `Prisma.Decimal`
   arithmetic end to end (`sumDecimal()`, src/lib/executive/format.ts); a
   value only becomes a JS `number` in the browser, at render time.
7. **Executive Dashboard is read-only** - no mutation action exists anywhere
   under `src/lib/executive/` or `src/app/(app)/executive/`; see §33.

## 4. Central KPI Registry

`src/lib/executive/kpi-registry.ts` is the single code-level metadata catalog
(never an executable SQL string) - one entry per KPI: `key`, `domain`
(`PORTFOLIO | LEASING | CONTRACTS | COLLECTIONS | OPERATIONS | MAINTENANCE |
SECURITY_DEPOSIT | CORPORATE_HOUSING | OWNER_FINANCIALS | COMMUNICATIONS |
DOCUMENTS`), `measurement` (`SNAPSHOT | PERIOD`), `isMoney`,
`periodFilterable`, and `drillDownRoute`. The UI's KPI-info tooltip (§28)
looks up the matching dictionary entry `t.executive.kpiInfo[key]` for its
title/description - the registry itself carries no user-facing text.

## 5. Centralized date-range abstraction

`src/lib/executive/date-range.ts` implements `TODAY | THIS_WEEK | THIS_MONTH
| LAST_MONTH | THIS_QUARTER | THIS_YEAR | CUSTOM`, every range
start-inclusive/end-exclusive (`{ start, end }`, converted to Prisma's `{
gte, lt }` via `toPrismaRange()`). `resolveDateRange()` is pure and takes
`now` as an explicit parameter - never reads the clock internally - so every
boundary (month/quarter/year/leap-day) is directly unit-testable
(`date-range.test.ts`).

## 6. Timezone decision

No `Organization.timezone` field is added in this phase. Every date boundary
is computed against the Node process's local server time - the same
pre-existing, already-shared assumption as every other date-bounded query in
this codebase. This is a deliberate non-overbuild: centralizing the
computation in one module (`date-range.ts`) means a future timezone feature
has exactly one call site to change, without pretending "organization-local
reporting" exists today. Carried forward as docs/TECHNICAL-DEBT.md item 3.

## 7. RBAC: six new permissions

`executiveDashboard.view`, `executiveFinancials.view`,
`executiveOperations.view`, `executiveMaintenance.view`,
`executiveOwnerFinancials.view`, `executiveCorporateHousing.view`
(src/lib/permissions.ts). Role grants:

| Permission | OWNER/ADMIN | MANAGER | ACCOUNTANT | VIEWER |
|---|---|---|---|---|
| executiveDashboard.view | Yes | Yes | Yes | Yes |
| executiveFinancials.view | Yes | Yes | Yes | Yes |
| executiveOperations.view | Yes | Yes | Yes | Yes |
| executiveMaintenance.view | Yes | Yes | Yes | Yes |
| executiveCorporateHousing.view | Yes | Yes | Yes | Yes |
| **executiveOwnerFinancials.view** | Yes | **No** | Yes | **No** |

The first five mirror each role's existing `*.view` breadth elsewhere in the
app (MANAGER/ACCOUNTANT/VIEWER already see property/invoice/payment/
maintenance/corporate-housing data operationally). **Owner Financials is
deliberately more restrictive**: the org-wide, every-owner-at-once
`OwnerLedgerEntry` aggregate is a materially more sensitive exposure than
the single-owner statement `ownerLedger.view` already grants MANAGER/VIEWER
elsewhere - so it stays OWNER/ADMIN/ACCOUNTANT-only, a deliberate,
documented field-level restriction (see §21's real-DB RBAC tests).

## 8. Field-level redaction: Maintenance Cost

Even a caller who holds `executiveMaintenance.view` does not automatically
see `maintenanceCostThisPeriod`: `src/lib/executive/maintenance.ts` accepts
an explicit `costVisible` boolean, computed server-side in
`src/lib/actions/executive.ts` from `can("maintenance.cost.view", role)`.
VIEWER holds `executiveMaintenance.view` but not `maintenance.cost.view`, so
the cost figure comes back `null` from the server action itself - never
hidden only in the UI. Verified by a real-DB test (§21).

## 9. Portfolio KPIs (`src/lib/executive/portfolio.ts`)

Total/Occupied/Vacant Units and Occupancy Rate reuse
`computeOccupancySummary()` (src/lib/owner-portfolio-rules.ts) - the exact
formula the Owner Portal and legacy `/dashboard` already share. Snapshot
only; the Period filter never applies. Compound/Building filters narrow the
same snapshot (they are location filters, not time filters). Includes a
by-Compound and by-Building occupancy breakdown for `/executive/properties` -
no invented "best/worst performer" score.

## 10. Contracts KPIs (`src/lib/executive/leasing.ts`)

Active Contracts (status = ACTIVE, snapshot) and 30/60/90-day expiry windows
(`endDate` between now and now+N days, snapshot - the window is a fixed
forward look, not the selected period). `contractsPastEndDate` surfaces the
`ContractStatus.EXPIRED`-never-set gap from §2 directly, without inventing a
status transition here.

## 11. Leasing Funnel (`src/lib/executive/leasing.ts`)

Reuses every existing conversion-rate formula verbatim:
`computeConversionRate()` (Lead), `computeViewingCompletionRate()` (Viewing),
`computeOfferAcceptanceRate()` (Offer), `computeReservationConfirmationRate()`
/`computeReservationToContractConversionRate()` (Reservation) - all from
`src/lib/crm/*-rules.ts`. Per-stage timing is deliberately mixed because the
underlying schema is mixed: Offer/Reservation carry real per-outcome
timestamps (`acceptedAt`/`rejectedAt`, `confirmedAt`/`cancelledAt`/
`expiredAt`/`convertedAt`/`releasedAt`), so those counts are genuinely
"outcome happened in this period." Lead/Viewing have no such timestamp
(Lead has no wonAt/lostAt; Viewing has `completedAt` but no
cancelledAt/noShowAt), so those two are a documented cohort metric instead:
"of the Leads/Viewings *created* in this period, how many are, as of now, in
each terminal status." No single cross-stage "Lead-to-Contract %" is
computed - leads/offers/reservations/contracts created in the same period
are not the same cohort (documented limitation, not a shortcut).

## 12. Collections: Invoiced / Collected / Collection Rate

`src/lib/executive/collections.ts`. Invoiced This Period sums
`Invoice.totalAmount` over `issueDate` in the period, **excluding
`CANCELLED`** (the deliberate deviation from §2's legacy-dashboard gap).
Collected This Period sums `Payment.amount` over `paymentDate` in the period
with **no status filter at all** - see §13. Collection Rate = Collected /
Invoiced for the *same* period, with an explicit UI/tooltip caveat: a
payment this period may settle an invoice from a prior period (cohort-timing
mismatch), so the rate is documented, not hidden.

## 13. Payment reversal and Collected Amount

`reversePayment()` never deletes or edits the original row; it sets its
`status` to `REVERSED` (amount unchanged, still positive) and inserts a new
row with a **negative** amount and `status: POSTED` (default). Summing
`Payment.amount` with **no** `status` filter therefore nets every reversal to
zero automatically. Filtering by `status: "POSTED"` would be **wrong**: it
would drop the original row (now REVERSED) while keeping the negative
reversal row, understating collections by the reversed amount. Verified by
the mandatory real-DB test (§21): a $9,000 payment reversed in the same
period reports Collected This Period = exactly $0.

## 14. Outstanding vs. Overdue Receivables (never summed)

Two structurally distinct populations, computed independently:
- **Outstanding Receivables** (snapshot): `SUM(totalAmount - paidAmount)`
  over every non-CANCELLED invoice, regardless of issue date.
- **Overdue Receivables** (snapshot): reuses `getOverdueReport()`'s own exact
  definition (src/lib/actions/reports.ts:196) -
  `PaymentSchedule.status === "OVERDUE"`, summed over `PaymentSchedule.amount`.

A `PaymentSchedule` row leaves `PENDING`/overdue-eligibility the moment it is
invoiced (its status becomes `INVOICED`/`PARTIALLY_INVOICED`/etc.), so these
two figures do not double-count in practice - documented here rather than
assumed, and exercised by the aging-reconciliation test in §21.

## 15. Receivables Aging

`src/lib/executive/kpi-rules.ts`: `bucketReceivableAge()` assigns exactly one
bucket per outstanding invoice - `CURRENT | DAYS_1_30 | DAYS_31_60 |
DAYS_61_90 | DAYS_90_PLUS | UNDATED` - due-date-based, outstanding-only
(`outstanding > 0`, non-CANCELLED). `UNDATED` (a null `dueDate`) is kept as
its own visible bucket rather than silently folded into CURRENT. Because
every row is assigned to exactly one bucket by construction, bucket totals
always sum to the Outstanding Receivables total - the mandatory aging
reconciliation invariant, unit-tested (`kpi-rules.test.ts`) and verified
against real invoice rows (`executive-reconciliation.db.test.ts`).

## 16. Upcoming Due (7/30-day)

`PaymentSchedule` rows with status `PENDING`/`PARTIALLY_INVOICED` (not yet
fully invoiced - a distinct set from the Overdue population above) due within
7 or 30 days. No double-count with Overdue: a schedule already `OVERDUE`
does not appear here.

## 17. Property Performance (`/executive/properties`)

By-Compound and by-Building occupancy breakdown from §9's own
`PortfolioSummary`. Deliberately no invented "best/worst" score - every
figure is the same occupancy definition, just grouped.

## 18. Operations (`src/lib/executive/operations.ts`)

Move-In/Move-Out today/upcoming-week/overdue counts reuse the exact
status/date definitions already in `getOperationsDashboard()` (move-ins.ts)
and `getMoveOutDashboardKpis()` (move-outs.ts) - re-queried here (not
called directly) only so a location filter and the
`executiveOperations.view` gate can apply. Security Deposit refunds-due
reuses `computeRefundRemaining()` (src/lib/security-deposit-rules.ts) - the
same math `getSecurityDepositDashboardKpis()` already uses.

## 19. Maintenance (`src/lib/executive/maintenance.ts`)

Open/Emergency/SLA-breached counts reuse `computeResponseSlaStatus()`/
`computeResolutionSlaStatus()`/`computeOverallSlaStatus()` (src/lib/
operations/maintenance-rules.ts) - the same formulas
`getMaintenanceDashboardKpis()` already uses. Location filtering uses
`MaintenanceRequest.compoundId`/`buildingId` directly (denormalized by
`resolveMaintenanceLocation()` for every scope type, including
COMPOUND/BUILDING-scope requests that have no `unit` at all) rather than a
Unit/Floor join.

## 20. Maintenance-Cost-vs-Owner-Expense boundary

`maintenanceCostThisPeriod` is `MaintenanceWorkOrder.actualCost` - an
**operational** cost - and is never labeled or treated as "Owner Expense."
A real Owner Expense figure exists only when a distinct `OwnerLedgerEntry`
of type `MAINTENANCE_EXPENSE` was separately posted, which (per §2) has zero
automatic code paths today. Verified by a real-DB test: a $5,000 work-order
cost with no matching `OwnerLedgerEntry` leaves Owner Financials' Total
Expenses at exactly $0 (§21).

## 21. Corporate Housing (`src/lib/executive/corporate-housing.ts`)

Reuses `isUnitUnallocated()`/`computeAllocationRate()`
(src/lib/corporate-housing-rules.ts) - the same pure functions
`getCorporateHousingDashboard()` already uses; no second allocation-rate
formula. **Corporate-leased-but-unallocated is never `VACANT`**: a
corporate-leased Unit can be contractually `OCCUPIED` (an ACTIVE Contract
exists) with zero currently-ACTIVE occupant allocations -
`unallocatedCorporateUnits` surfaces exactly that population, structurally
distinct from Portfolio's own Vacant Units count (verified by a real-DB
test: an OCCUPIED, unallocated corporate unit never appears in the Vacant
Units set).

## 22. Owner Financial Overview (`src/lib/executive/owner-financials.ts`)

The **sole** source is `OwnerLedgerEntry`, via `summarizeOwnerLedgerEntries()`
(src/lib/owner-ledger-rules.ts) - the exact function `getOwnerBalance()`
already uses. **Never** `Invoice x ownership%`. Mandatory real-DB test: an
Invoice with `totalAmount = 100,000` alongside a single `RENT_INCOME`
OwnerLedgerEntry of `credit = 60,000` reports Executive Owner Income as
**exactly 60,000** - proving the invoice total is never touched.

## 23. Tenant-Receivables vs. Owner-Ledger visual boundary

The landing page renders Collections (§12) and Owner Financial Overview
(§22) as two separate, clearly labeled sections - never merged into one
"Revenue" card. This mirrors the two figures' genuinely different meanings:
what tenants owe vs. what an owner's ledger records.

## 24. Communications Health (`src/lib/executive/communications.ts`)

SENT != DELIVERED (Critical Principle 2/3): `sent` counts messages that
reached `SENT`, `DELIVERED`, or `READ` (i.e., left the queue successfully);
`delivered` counts only provider-confirmed `DELIVERED`/`READ`. Delivery Rate
is `delivered / sent`, never treating `sent` as a proxy for success.

## 25. Document Health (`src/lib/executive/documents.ts`)

Deliberately minimal: a count of `ACTIVE` documents. No storage internals
(bytes on disk, provider health), no vanity metrics (download counts).

## 26. Attention Center (`src/lib/executive/attention.ts`)

Deterministic, non-AI/ML: `classifyCountSeverity(count, warnAt, criticalAt)`
against fixed, documented thresholds - never learned or inferred. Synthesizes
from already-computed domain summaries (no extra queries of its own).
Current rules: contracts past end date, overdue receivables count, 90+-day
aging count, maintenance SLA breaches, emergency maintenance requests,
unallocated corporate units, communication failures. Sorted CRITICAL before
WARNING; a count of zero never produces an item.

## 27. Filters: Period / Compound / Building

`src/lib/executive/filters.ts` - `resolveExecutiveFilters()` is the **only**
place a URL query param becomes a Prisma `where` fragment. Every id is
re-validated against `organizationId`:
- a `compoundId`/`buildingId` belonging to a **different organization**
  resolves to `null` (filter silently ignored) - never a thrown error, which
  would otherwise let an attacker distinguish "exists in another org" from
  "doesn't exist";
- a `buildingId` that exists in **this** org but under a **different**
  Compound than the given `compoundId` (same-org, invalid hierarchy) is
  likewise dropped.
Both degrade to "no filter on that dimension" - never a 500, never a leaked
existence signal. Verified by real-DB tests (§21).

## 28. KPI-definition tooltip

Each KPI card's info affordance looks up `t.executive.kpiInfo[key]` (a
`{ title, description }` pair per locale) - a plain-language formula
description ("Occupancy Rate = Occupied Units / Total Units"), never
implementation SQL or a Prisma field name.

## 29. Dashboard DTOs & Decimal serialization

Every money value crosses the server/client boundary as a fixed-point string
(`serializeMoney()`, `Prisma.Decimal.toFixed(2)`) - never a bare `number`,
avoiding float-precision loss on large SAR amounts. `src/lib/actions/
executive.ts` is the single place this serialization happens, right before
returning from each server action.

## 30. Server-side aggregation, no fetch-then-sum-in-browser

Every domain module uses Prisma `count`/`aggregate`/`groupBy`/bounded
`findMany` (selecting only the columns needed), composed via `Promise.all` -
the same pattern every pre-existing dashboard in this codebase already uses.
No page ever fetches raw rows to sum client-side.

## 31. Charts

Reuses the existing `recharts` dependency and `CollectionsChart` component
(src/components/charts/collections-chart.tsx) pattern - no second charting
library. No fabricated historical-occupancy trend is rendered: no
status-history table exists for `Unit.status`, so no such chart appears in
this phase (a documented limitation, not worked around with synthetic data).

## 32. Pagination

Every Executive page here shows bounded, small result sets (per-compound/
per-building breakdowns, a handful of aging buckets) - none requires
pagination. Any genuinely large table (raw invoices, raw payment schedules)
is reached by drilling down to an existing, already-paginated page (§5)
rather than being duplicated here.

## 33. Read-only guarantee

No file under `src/lib/executive/` or `src/app/(app)/executive/` calls a
Prisma `create`/`update`/`updateMany`/`delete`. Unlike `getDashboardStats()`/
`getOverdueReport()`, the Executive read path deliberately does **not** call
`syncOverdueStatuses()`. Tradeoff, accepted and documented: Overdue
Receivables here may lag by up to one page-view of `/dashboard`,
`/collections`, or `/reports/overdue` elsewhere in the app (which already
perform that sync as a side effect of being viewed). Verified by a real-DB
test: loading the Executive overview leaves a past-due `PENDING`
PaymentSchedule/`ISSUED` Invoice completely untouched.

## 34. Multi-tenancy & cross-org isolation

Every query in every domain module filters by `organizationId` from the
signed session (`requirePermission()`), never from client input. Verified by
real-DB tests: an Org A overview's unit/contract counts exactly match Org
A's own seeded data regardless of what Org B contains, and a
`compoundId`/`buildingId` belonging to Org B passed on an Org A request is
silently ignored (§27).

## 35. Money/percentage formatting

`src/lib/executive/format.ts` centralizes `sumDecimal()` (Decimal-safe
summation - no native float addition), `safeRate()` (whole-percent,
zero-denominator-safe), and `serializeMoney()`. UI rendering continues to use
the existing `currencyFormatter()`/`numberFormatter()`
(src/lib/i18n/format.ts) - no second formatting scheme.

## 36. Bilingual (EN/AR) support

`t.executive` in `src/lib/i18n/dictionary.ts` (types) and
`src/lib/i18n/dictionaries/{en,ar}.ts` (values) covers every label, KPI
title/description, aging-bucket label, attention-item label, and filter
control on every Executive page. No hardcoded UI string exists in any
`src/app/(app)/executive/**` page.

## 37. Responsive design

Every Executive page uses the same Tailwind grid/stack patterns
(`grid-cols-1 sm:grid-cols-2 lg:grid-cols-4`, `StatCard`) as the existing
`/dashboard` and report pages - no separate mobile-only layout.

## 38. Navigation & portal boundaries

A single `/executive` entry appears in the internal sidebar (gated by
`executiveDashboard.view`), immediately after Dashboard. **No org-wide
executive metric is ever exposed to the Tenant Portal, Owner Portal, or any
future Corporate Portal** - those remain strictly per-tenant/per-owner
scoped, exactly as before this module (`getTenantDashboard()`/
`getOwnerPortalDashboard()` are unchanged).

## 39. Schema changes

Purely additive, index-only (`prisma/migrations/
20261220090000_executive_dashboard_indexes`): `@@index([organizationId,
status])` on `Unit`, `@@index([organizationId, status, endDate])` on
`Contract`, `@@index([organizationId, status, dueDate])` on `Invoice` - no
new table, no new column, no data migration.

## 40. Explicitly not implemented (strict no-feature-creep boundary)

AI analytics/forecasting/occupancy-prediction/rent-price-prediction/
cash-flow-forecasting, budgeting, a General Ledger/P&L/Balance Sheet/cash
accounting engine, an owner payout engine, a BI warehouse/ETL pipeline/data
lake, a custom report builder or user-created/drag-and-drop dashboards, a
generic chart builder, scheduled report emailing, an Excel/PDF export
engine, a notifications/rent-reminder/contract-expiry scheduler, a real S3
implementation, OCR, a Corporate Portal, a Vendor Portal, marketing
analytics, or any external BI integration. None of these exist anywhere
under `src/lib/executive/` or `src/app/(app)/executive/`.

## Technical debt carried forward

1. **Timezone** (§6) - every date boundary assumes server-local time; no
   `Organization.timezone` field exists (docs/TECHNICAL-DEBT.md item 3).
2. **Communications outbox durability gap** - unchanged by this module; see
   docs/NOTIFICATIONS-COMMUNICATIONS.md §16.
3. **Document storage** - LOCAL_DEV only; a real S3-compatible provider is
   still required for production (docs/TECHNICAL-DEBT.md item 11).
4. **Read-path staleness on Overdue Receivables** (§33) - an accepted,
   documented tradeoff of keeping the Executive read path free of any
   domain mutation.
