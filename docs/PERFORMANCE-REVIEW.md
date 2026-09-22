# Performance Review

Production-readiness hardening pass. Method: static inspection of query
patterns across every dashboard/list/report page, cross-referenced
against `prisma/schema.prisma`'s indexes - not a load-tested benchmark
(see §"What was not measured" below for why, per the brief's own "do not
fabricate benchmarks" instruction). One confirmed, fixed issue; everything
else is a "reviewed, found adequate" result or a documented future
scaling concern.

## Fixed this pass

### Dashboard invoice totals - unbounded full-history read

- **Finding.** `getDashboardStats()` (`src/lib/actions/dashboard.ts`)
  ran `prisma.invoice.findMany({ where: { organizationId }, select: {...} })`
  with **no limit and no date filter** - every invoice the organization
  has ever issued, loaded into Node memory, on every single dashboard
  view, purely to sum four totals and bucket a 6-month trend via `.reduce()`/
  `.filter()` in JavaScript.
- **Why it matters at scale.** This is the exact pattern Step 56 of the
  hardening brief names directly ("100,000 audit rows" - the same
  unbounded-table-scan shape applies here to invoices): for an
  organization with years of billing history, this query's cost and
  memory footprint grows with *total lifetime invoice count*, forever,
  on a page loaded by every user on every visit.
- **Fix.** Replaced with `prisma.invoice.aggregate({ _sum: {...} })` for
  the lifetime totals (one row back from Postgres, not N), and a
  `date_trunc('month', ...)`-grouped raw SQL query bounded to the trend's
  actual 6-month window for the monthly series - Postgres does the
  summing, not Node. A new composite index,
  `@@index([organizationId, issueDate])` on `Invoice` (migration
  `20260922204200_invoice_dashboard_index`, purely additive), supports
  the bounded query's `WHERE organizationId = ? AND issueDate >= ?`
  filter.
- **Business definition preserved exactly** (Step 27's "do not change
  business definitions silently"): every invoice regardless of status
  still counts toward the lifetime totals, matching the original
  (unfiltered) behavior - this was a performance fix, not a correctness
  change. That said, the review did surface that neither the old nor new
  implementation excludes `CANCELLED` invoices from these totals, unlike
  several other places in the codebase (e.g. `getContractEditContext()`'s
  `status: { not: "CANCELLED" }` invoice count) - flagged in
  `docs/TECHNICAL-DEBT.md` as a P2 business-logic question for the product
  owner to confirm, not silently "corrected" here.
- **Test.** `src/lib/actions/__dbtests__/dashboard-invoice-totals.db.test.ts`
  (3 tests): lifetime totals correctly sum an invoice from 20 months ago
  (proving nothing is wrongly excluded) while a different organization's
  invoice never leaks in; the 6-month trend correctly bounds to exactly 6
  entries, zero-fills a month with no invoices (proving the grouped query
  doesn't just omit empty months), and excludes that same 20-month-old
  invoice from the trend (proving the date bound actually works).
- **Live verification.** Dashboard screenshotted live (both English and
  Arabic) against real seeded data post-fix - all KPI tiles render
  correct, non-zero, consistent values with zero console errors.

## Reviewed and found adequate (no change made)

### N+1 queries (Step 24)

Every list/report page reviewed loads its relations via a single Prisma
`include`/`select` tree (Prisma compiles a `findMany` with nested
`include` into a bounded number of queries - typically one plus one per
distinct relation table, never one query per row), not a loop issuing a
query per row. Spot-checked: `listMoveIns()`, `listReservations()`,
`getDashboardStats()`'s remaining `findMany` calls, the CRM dashboard, and
the Move-In/Operations dashboards - all single-`include`-tree, no loop-
issued query found anywhere.

### Pagination (Step 25)

Every list page reviewed (Leads, Viewings, Offers, Reservations,
Contracts, Invoices, Payments, Owner Ledger, Move-Ins, Audit Logs) uses
server-side `skip`/`take` with a per-module `PAGE_SIZE` constant
(uniformly 25) - none fetches an entire table to render page 1. Reports
that intentionally aggregate across the whole dataset (funnel, occupancy,
origination reports) correctly use `count()`/`groupBy()`-shaped queries
rather than loading every row to aggregate in JS - reviewed and found
consistent with this pattern, with the one exception (dashboard invoice
totals) fixed above.

### Report query audit (Step 26)

CRM funnel, reservation conversion, contract origination, owner, and
Move-In reports were reviewed for cross-org leakage (none found - every
report scopes by `organizationId` via `requirePermission()`'s returned
value, same as every other module), incorrect denominators (percentage
helpers consistently divide by the *applicable* count, not a hardcoded
total - see `docs/MOVE-IN-HANDOVER.md`'s own progress-formula section for
the clearest example), and double-counting from joins (no report was
found joining a one-to-many relation and then summing the parent's own
field without first deduplicating - the one place this pattern could bite,
`Invoice.totalAmount` summed alongside a `lines` join, was checked and
confirmed to sum the invoice-level field once per invoice, never once per
line).

### Dashboard query audit (Step 27)

Every dashboard query is `organizationId`-scoped (verified per query, not
just at the top of the function). Money totals are Decimal-derived at the
source and only converted to `Number` for the final returned value (never
mid-calculation on multiple accumulated rows) since the rewrite above.
Date boundaries ("today," "next 90 days," "6 months ago") are computed
once via `date-fns` and reused across all sibling queries in the same
`Promise.all` - no inconsistent "now" between two queries on the same
page load. See `docs/SECURITY-REVIEW.md` §"Timezone" for the one
unresolved item here: those boundaries are computed against the Node
process's local timezone, not an explicit `Asia/Riyadh` - a deployment-
environment fix (`TZ=Asia/Riyadh`), not a query-shape issue, so it's
tracked there and in `docs/PRODUCTION-DEPLOYMENT.md`, not duplicated here.

### Audit Log scalability (Step 29)

`/audit-logs` is already server-side paginated (`PAGE_SIZE = 25`) with
`organizationId`/`action`/`entityType`/date-range filters applied at the
database level before pagination, not after loading a page's worth into
memory. Indexed on the columns its own filters use.

## Indexes reviewed this pass (Step 23)

Beyond the one addition above, the schema's existing index set was
cross-checked against actual query `where`/`orderBy` clauses across every
module built in this codebase (property hierarchy, CRM funnel,
Reservation/Contract, Move-In, Audit Log, Owner ledger) - every module
already documents its own indexing rationale in its own `docs/*.md` (see
e.g. `docs/MOVE-IN-HANDOVER.md` §22, `docs/AUDIT-AND-FINANCIAL-CONTROLS.md`).
No redundant index (two indexes covering the same leftmost-prefix query
shape), no poorly-ordered composite index (a composite index whose
leading column is never the most selective/most-filtered-on one), and no
obviously-missing index for a real query pattern was found, other than
the Invoice one fixed above.

## Large-tenant scenario reasoning (Step 56)

Full 10,000-lead/10,000-contract/50,000-payment/100,000-audit-row datasets
were **not generated** for this pass - doing so costs real time/resources
disproportionate to what static analysis already tells us, and the brief
explicitly permits reasoning over fabricating a benchmark. Reasoning per
entity, based on the query-pattern review above:

- **Leads/Viewings/Offers/Reservations/Contracts** - every list page is
  paginated and indexed on `organizationId` (+ the specific filter columns
  each page exposes); a query against any of these tables at 10,000+ rows
  for one organization returns a bounded, indexed result set regardless of
  total row count.
- **Payments** - `payment.create`'s own read path (`recordPayment()`)
  looks up one `Invoice` by id (indexed, `O(1)`-ish via the unique/lookup
  index), never scans the Payments table; `/payments` itself is paginated.
  No dashboard/report was found summing raw `Payment` rows in JS at this
  scale other than through an already-`groupBy`/`aggregate`-shaped query.
- **Audit Logs** - the one table genuinely expected to grow the largest
  and fastest in absolute terms (one row per mutation, forever, with no
  deletion path by design - see `docs/AUDIT-AND-FINANCIAL-CONTROLS.md`).
  Already paginated and indexed; see `docs/TECHNICAL-DEBT.md` for the
  future retention/archival strategy this implies (not undertaken now,
  per the brief's own "do not implement archival infrastructure yet"
  instruction).
- **Invoices** - the one table with a confirmed, now-fixed, unbounded read
  (dashboard totals, above). No other unbounded Invoice read was found.

## Report export readiness (Step 57)

Every report reviewed (CRM, financial, ownership, Move-In) already
computes its dataset server-side, filtered by the same query parameters
its own UI exposes, and returns a plain array/object - not HTML baked in
before the data is assembled. A future Excel/PDF/CSV export could reuse
each report's existing server action directly (feed its return value to a
serializer) without restructuring any query. No blocker found.

## Bundle/dependency review (Step 43)

See `docs/SECURITY-REVIEW.md` §"Dependencies" for the full finding (one
unused dependency, `uuid`, removed) - recorded there since it was found
during the security sweep, not duplicated here. No duplicate library, no
disproportionately heavy package for a trivial task, found.

## What was not measured (and why)

Actual query-execution timing (`EXPLAIN ANALYZE`, request-latency
percentiles) was not captured, per the brief's explicit "do not fabricate
benchmarks" instruction - this environment has no representative
production-scale dataset to measure against truthfully, and inventing
numbers would be worse than reporting none. Everything above is a
query-*pattern* finding (bounded vs. unbounded, indexed vs. not,
aggregated-in-SQL vs. aggregated-in-JS), which is the correct level of
evidence to act on without a real dataset - and is exactly what the brief
asks for as the fallback ("report query-pattern findings instead").
