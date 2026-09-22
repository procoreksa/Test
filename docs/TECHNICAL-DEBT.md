# Technical Debt Register

Produced during the production-readiness hardening pass. Purpose is
visibility, not perfection - per the brief, only P0/P1 items were fixed in
this pass; P2 items were fixed only where low-risk, localized, and clearly
beneficial. Everything below that wasn't fixed is intentionally left for
a future, separately-scoped task.

Severities: **P0 Critical** (data loss/security breach risk, fix
immediately) · **P1 High** (real risk, fix soon) · **P2 Medium** (real but
bounded risk or cost, schedule it) · **P3 Low** (cosmetic/nice-to-have).

## P0 - Critical

None found.

## P1 - High (all fixed this pass)

| Issue | Risk | Module | Status |
|---|---|---|---|
| Ownership allocation race could push total ownership over 100% | Silent corruption of an accounting invariant every owner statement depends on | `src/lib/actions/ownership.ts` | **Fixed** - `Serializable` isolation + regression test (`ownership-concurrency.db.test.ts`) |
| `Contract.renterId` accepted from client with no organization check | Cross-tenant data linkage (a Contract from Org A pointing at Org B's Renter) | `src/lib/actions/contracts.ts` | **Fixed** - org-verified like `unitId` already was + regression test (`contract-relation-injection.db.test.ts`) |
| JWT session never re-verified role/active-status after sign-in | A deactivated/demoted user keeps old access for up to 30 days | `src/lib/auth.ts` | **Fixed** - periodic re-verification via `src/lib/auth-session-refresh.ts` + tests |
| Dashboard invoice totals read the organization's entire invoice history unbounded | Dashboard load time/memory scales with lifetime invoice count forever | `src/lib/actions/dashboard.ts` | **Fixed** - bounded aggregate + grouped query + new index + regression test |

See `docs/SECURITY-REVIEW.md` and `docs/PERFORMANCE-REVIEW.md` for full
write-ups, evidence, and residual-risk notes on each.

## P2 - Medium (documented, not fixed this pass)

| # | Issue | Affected module | Recommended future action |
|---|---|---|---|
| 1 | `deleteUnit()`/`deleteRenter()`/`deleteBuilding()`/`deleteFloor()`/`deleteCompound()` have no pre-check for dependent history (Contracts/Invoices/etc.) before attempting delete - unlike `deleteOwner()`, which already checks and raises a friendly error. The underlying safety property already holds (Postgres's default FK behavior blocks the delete), so this is a UX/error-clarity gap, not a data-loss risk. | `src/lib/actions/{units,renters,buildings,floors,compounds}.ts` | Add the same `count()`-then-friendly-error pattern `deleteOwner()` already uses, one module at a time, each with its own translated validation message and test. |
| 2 | VAT/invoice-total calculation (`src/lib/zatca/vat.ts`) uses native floating-point arithmetic with a manual `round2()` helper, not `Prisma.Decimal`, despite computing values that ARE persisted (unlike the presentation-only/classification-only rounding used elsewhere). Not demonstrated to produce an actual wrong total at this codebase's real-estate transaction scale, and explicitly out of scope for this hardening pass ("VAT logic unchanged," "do NOT redesign accounting"). | `src/lib/zatca/vat.ts` | A dedicated future task: migrate to `Prisma.Decimal` arithmetic throughout, with full ZATCA re-certification testing (this is tax-authority-facing code; any change here needs its own compliance sign-off, not a drive-by edit). |
| 3 | No business timezone is pinned anywhere - every "today"/date-boundary calculation (dashboard KPIs, Move-In overdue, reservation expiry) resolves against the Node process's own local timezone, not an explicit `Asia/Riyadh`. | Dashboard, Move-In, Reservation, report date-range logic (many files) | Set `TZ=Asia/Riyadh` on the production Node process (see `docs/PRODUCTION-DEPLOYMENT.md`) - a single, code-free deployment fix. A true per-organization timezone feature (for expanding beyond Saudi Arabia) is a separate, larger future project. |
| 4 | No Content-Security-Policy header - `next.config.ts` now sets the other standard headers (`X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy`, HSTS), but a real CSP needs staged rollout against this app's actual script/style sources first. | `next.config.ts` | Inventory every script/style source the app actually loads (fonts, any future third-party embed), start with a `Content-Security-Policy-Report-Only` header to observe violations in production without breaking anything, then enforce. |
| 5 | Neither `getDashboardStats()`'s totals (old or new implementation) exclude `CANCELLED` invoices, unlike several other places in the codebase that explicitly do (`getContractEditContext()`'s invoice count, for one). Found while fixing the dashboard's performance issue; **not changed**, since altering a business total silently is exactly what the hardening brief says not to do. | `src/lib/actions/dashboard.ts` | Needs a product-owner decision (should a cancelled invoice count toward "Total Invoiced"?), then a single, deliberate, tested change - not a side effect of an unrelated task. |
| 6 | Transitive dependency vulnerabilities reported by `npm audit` (3 moderate, 4 high, 1 critical, all in indirect dependencies as of this pass) - not remediated here per the brief's explicit "do not perform risky package upgrades"/"do not upgrade major framework versions" constraints. | `package-lock.json` (transitive) | Run `npm audit` for the current, specific list; evaluate and apply each fix individually (not `--force`), starting with anything reachable from user input. |

## P3 - Low

| # | Issue | Affected module | Recommended future action |
|---|---|---|---|
| 1 | No login rate limiting - no public, unauthenticated, abuse-sensitive endpoint exists today other than `/login` itself, so this isn't urgent, but it's a standard production hardening step. | `src/lib/auth.ts` / `/login` | Add IP- or account-based throttling (a small in-memory/Redis-backed limiter, or the hosting platform's own edge rate limiting if Render/similar offers one) before this app is exposed to the public internet at scale. |
| 2 | Zero application-level logging anywhere (`console.log`/`console.error` count: 0) - clean from a leakage standpoint (nothing to leak), but means there's no operational visibility into errors that don't reach the `AuditLog` (e.g. a failed external call, once one exists). | Whole codebase | See `docs/PRODUCTION-DEPLOYMENT.md` §"Observability" for the recommended lightweight structured-logging approach for future work - not built now, since nothing currently needs it (no external integrations exist yet to fail). |
| 3 | `src/lib/zatca/client.ts` has one unused variable (`_signedXml`, pre-existing ESLint warning, unrelated to this pass). | `src/lib/zatca/client.ts` | Trivial cleanup whenever that file is next touched for a real ZATCA change - not worth a standalone commit. |
| 4 | Duplicated UI pickers (`CascadingLocationPicker`, and the conceptually similar unit-selection UI embedded separately in the Viewing/Offer "new" forms) were inspected for consolidation potential per Step 45 of the brief. **Not consolidated**: each picker's selection model differs meaningfully enough (single-unit vs. multi-unit vs. hierarchy-drill-down) that forcing one shared component would add an abstraction layer without removing real duplication - documented here rather than refactored, per the brief's own "only refactor if duplication is meaningful and complexity decreases" instruction. | Various `.tsx` form components | Revisit only if a *third* near-identical picker is about to be built - that's the point at which extracting a shared base component pays for itself. |

## Fixed this pass (for completeness - not "still open")

- Unused npm dependency `uuid` removed (zero usages anywhere in `src/`;
  the codebase's only UUID need, ZATCA's invoice UUID field, already used
  Node's built-in `crypto.randomUUID()`).
- Missing security headers added (`X-Content-Type-Options`,
  `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy`, HSTS in
  production).
- `scripts/check-data-integrity.ts` added - a read-only, standing tool to
  re-verify the cross-org/state-consistency/ownership-total invariants
  this document and `docs/SECURITY-REVIEW.md` describe, against real data,
  at any time in the future without writing a one-off query.
- `/api/health` added - minimal, unauthenticated, leaks nothing beyond
  "database reachable: yes/no."

## Explicitly not addressed (by design, per the hardening brief's scope)

- Any new business module (Maintenance, Move-Out, Tenant/Owner Portal,
  WhatsApp/email automation, AI, payment gateway, Document Management,
  object-storage uploads, e-signature, mobile app, subscription billing,
  marketplace) - out of scope for a hardening-only task.
- Redesigning VAT/ZATCA/accounting logic - frozen by the brief's own
  explicit instruction; issues found there (P2 #2 above) are recorded,
  not touched.
- A full Content-Security-Policy, backup automation, or a monitoring
  vendor integration - each requires either staged rollout, an
  infrastructure decision outside this codebase, or ongoing cost, and is
  documented (`docs/PRODUCTION-DEPLOYMENT.md`,
  `docs/BACKUP-RECOVERY.md`) rather than half-implemented here.
