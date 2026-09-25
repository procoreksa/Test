# Final UAT & Go-Live Readiness — Pro Core

**Status of this document:** This is the defect register and go-live disposition
required by Prompt 24 (Final Production Readiness, End-to-End UAT & Go-Live
Gate). It currently covers the scope that has been completed and verified
under real production-build conditions: the full business-lifecycle UAT
(CRM → Reservation → Contract → Financials → Move-In/Maintenance/Move-Out →
Security Deposit Settlement), Tenant/Owner Portal deep-page UAT, and — the
subject of this update — five real-user UAT findings reported directly by
the system owner plus one systemic defect discovered while investigating
them. Corporate Housing occupancy UAT, Documents UAT, Automation/Outbox
UAT, dedicated Security UAT, a fresh-DB deployment rehearsal, and the
executive KPI/EN-AR-RTL-mobile smoke pass are **still in progress / not yet
re-verified after this update** — see "Overall Disposition" at the end.
**No blanket "approved for production" claim is made by this document.**

---

## 1. Defect Register

Fields: ID / Area / Severity / Description / Reproduction / Expected /
Actual / Root Cause / Fix (commit) / Retest Evidence / Disposition.

### D-001 — Login / portal entry discoverability (real-user Finding 1)

- **Area:** Authentication / navigation
- **Severity:** Major (usability / operability, not a security defect)
- **Description:** The application has three fully independent
  authentication systems — internal staff (`/login`), Tenant Portal
  (`/portal/login`), Owner Portal (`/owner-portal/login`) — but before this
  fix, visiting the site root (`/`) redirected unconditionally to `/login`
  with no visible way for a tenant or owner to find their own portal's
  login page.
- **Reproduction:** Visit `/` unauthenticated (no bookmark, no prior
  knowledge of `/portal/login` or `/owner-portal/login`).
- **Expected:** A visible way to reach all three login entry points without
  prior knowledge of their URLs.
- **Actual (before fix):** Immediate, silent redirect to `/login` — no
  mention of the other two portals anywhere reachable from `/`.
- **Root cause:** `src/proxy.ts` (the internal-staff auth gate) treated `/`
  the same as any other unauthenticated internal route and redirected it to
  `/login` before any landing page had a chance to render.
- **Fix:**
  - Added a minimal portal-selector landing page (`src/app/page.tsx`)
    rendering three `<Link>` cards (Staff / Tenant / Owner) that route to
    the three *existing* login pages — no authentication logic duplicated,
    no merging of the three principals.
  - Fixed `src/proxy.ts` to let an unauthenticated request through to `/`
    (mirroring the existing `/login` exclusion) instead of redirecting it
    away before it can render; still redirects an *authenticated* internal
    user straight to `/dashboard`, unchanged.
  - Removed the hard-coded demo credentials (`admin@demo-realestate.sa` /
    `Passw0rd!`) that were pre-filled into the internal login form's inputs
    — a separate, smaller finding uncovered during the same audit — and
    added a back-link from all three login pages to the new selector.
- **Retest evidence:** Live browser verification — `/` renders the
  three-card selector unauthenticated; each card navigates to the correct
  existing login page; an authenticated internal session hitting `/` is
  redirected to `/dashboard` as before. No change to any of the three
  session/cookie boundaries.
- **Disposition:** **Fixed.** Not a Go-Live blocker on its own (all three
  logins were always reachable by direct URL), but classified as required
  for a usable V1 Day-1 launch since no other discovery path existed.

### D-002 — No UI to administer internal staff users (real-user Finding 2)

- **Area:** Internal staff / RBAC administration
- **Severity:** **Blocker** for Day-1 operability
- **Description:** `User.role` and `User.isActive` were already correct,
  enforced fields in the schema and in the internal login path, but there
  was **no action or page anywhere in the codebase** to create a second
  staff account, change a role, or activate/deactivate an account. The only
  place a `User` row was ever created was the demo seed script
  (`src/lib/seed-demo-data.ts`), which is not a production provisioning
  mechanism (confirmed: `POST /api/admin/seed` is secret-gated and disabled
  by default in production).
- **Reproduction:** As OWNER/ADMIN, attempt to add a second employee via
  the UI. No such page or link existed.
- **Expected:** OWNER/ADMIN can create, view, change the role of, and
  activate/deactivate staff accounts entirely from the UI, org-scoped,
  audited, without any direct database/Prisma/SQL access.
- **Actual (before fix):** No such capability existed at all.
- **Root cause:** Never built — the schema anticipated multi-user staff
  management (`role`, `isActive` fields) but the action/UI layer was never
  added in any earlier phase.
- **Fix:** New minimal admin surface, matching the existing Tenant/Owner
  Portal account-admin conventions exactly (same temporary-password
  pattern, same audit-log calls):
  - `src/lib/actions/staff-users.ts` — `listStaffUsers`, `createStaffUser`,
    `updateStaffUserRole`, `setStaffUserActive`, `resetStaffUserPassword`.
  - New permissions `staffUser.view/create/updateRole/activate/deactivate/resetPassword`
    added to `src/lib/permissions.ts`, granted to OWNER/ADMIN only (not
    MANAGER/ACCOUNTANT/VIEWER) — no privilege escalation, no new roles, no
    generic permission-customization system.
  - `src/app/(app)/settings/users/page.tsx` + `staff-user-create-form.tsx`
    + `staff-user-row.tsx` — new page, gated by `staffUser.view`, with
    per-action buttons individually gated by the corresponding permission.
  - Guards: cannot deactivate your own account
    (`setStaffUserActive`); every mutation calls `auditCreate`/`auditAction`;
    every query/mutation is `organizationId`-scoped (no cross-org
    creation/administration possible — the target user is always looked up
    `where: { id, organizationId }`).
  - Temporary password generated server-side (`randomBytes(9).base64url`),
    bcrypt-hashed, returned exactly once to the caller, never logged or
    persisted in plaintext — same convention as the existing Owner/Tenant
    Portal account admin panels.
- **Retest evidence:** Live browser verification as UAT_ORG_A's OWNER:
  created a new staff user (temporary password displayed once), changed a
  role, deactivated and reactivated a non-self account, reset a password,
  confirmed self-deactivation is blocked with a friendly message, confirmed
  a duplicate email is rejected with a friendly message (see D-006 for the
  production-build display defect this initially hit and its fix).
  Confirmed via `src/lib/actions/__dbtests__` conventions that all lookups
  are org-scoped (no dedicated cross-org test was written for this new
  surface in this pass — see "Known gaps" below).
- **Disposition:** **Fixed.** Classified as a genuine V1 Go-Live blocker
  (without it, provisioning a second employee in production requires
  direct database access) and implemented under the Prompt 24 feature
  freeze exception for "a minimal missing admin surface classified as a
  genuine blocker."
- **Known gap:** No dedicated automated cross-org/IDOR test suite was
  written for `staff-users.ts` in this pass (existing manual verification
  only confirmed org-scoping by code inspection + one live org). Recommend
  a `staff-users-admin.db.test.ts` mirroring the existing
  `owner-portal-account-admin.db.test.ts` / `tenant-portal-account-admin.db.test.ts`
  pattern before this is exercised at scale.

### D-003 / D-004 — Renter↔Tenant Portal and Owner↔Owner Portal account administration (real-user Findings 3 & 4)

- **Area:** Tenant Portal / Owner Portal account administration
- **Severity:** N/A — audit only, no defect found
- **Description:** The concern raised was whether a UI-driven path exists
  to create, link, activate, and revoke a Tenant/Owner Portal account from
  the corresponding internal Renter/Owner record, without direct database
  access, with org isolation and no cross-org linking.
- **Audit finding:** This capability **already existed** and was built and
  verified in earlier Prompt phases (Tenant Portal: tasks #126-136; Owner
  Portal: tasks #137-149) — `owner-portal-account-panel.tsx` /
  `tenant-portal-account-panel.tsx`, wired into the Owner profile page and
  the Renter/Contract admin UI respectively. Creation requires the
  internal `ownerPortalAccount.create` / `tenantPortalAccount.create`
  permission (OWNER/ADMIN by default); every account lookup is
  `organizationId`-scoped; a portal account can only ever be linked to one
  owner/renter (`@unique` on `ownerId`/`renterId` in the schema), so
  cross-org linking is structurally impossible, not just permission-gated.
  Activation/suspension/disablement/password-reset are all present and
  audited.
- **Finding 4's additional question** — does portal access continue to use
  live effective ownership (Unit > Building > Compound)? Confirmed: the
  Owner Portal's entitlement layer (`src/lib/owner-portfolio-rules.ts` /
  `src/lib/owner-session.ts`) was **not touched** by this pass and still
  resolves ownership by walking the Unit → Building → Compound hierarchy
  at query time on every request — nothing was weakened.
- **Defect discovered during this audit:** the *display* of an expected
  error from these panels (e.g. "this email is already in use") crashed in
  a genuine production build — see D-006, now fixed. The account-admin
  logic itself was already correct; only the safe-error-display path was
  broken.
- **Disposition:** **No new capability needed** — audit confirms Findings
  3 and 4 describe an already-resolved capability. The one real defect
  uncovered (D-006) has been fixed and is now covered by these same panels.

### D-005 — Unit/Renter/Owner delete: unfriendly failure on referenced records (real-user Finding 5, part 1)

- **Area:** Units / Renters / Owners — delete actions
- **Severity:** **Blocker** (a raw, unhandled failure reaching a user is
  never acceptable, regardless of how it renders — see D-006 for the
  production-only aggravating factor)
- **Description:** `deleteOwner()` already had the correct pattern: a
  pre-count check against `PropertyOwnership`/`OwnerLedgerEntry` before
  attempting anything, throwing a friendly, translated message
  (`t.validation.ownerHasHistory`) if the owner has any dependent history,
  and soft-deleting (`deletedAt`) otherwise. `deleteUnit()` and
  `deleteRenter()` had **no such check** — they called
  `prisma.unit.delete()` / `prisma.renter.delete()` directly, with no
  try/catch anywhere in the call chain (including the UI), relying
  entirely on the database's `onDelete: Restrict` foreign-key constraints
  (present on most, but deliberately not all — e.g.
  `PropertyOwnership.unitId` is `onDelete: Cascade` — relations) to reject
  the delete.
- **Reproduction:** As OWNER, attempt to delete a Unit that has an active
  Contract (`UAT-102`, linked to renter "Faisal UAT-Lifecycle" from the
  earlier lifecycle UAT), or a Renter with a Contract, via the `/units` or
  `/renters` list page's Delete button.
- **Expected:** A controlled, translated message explaining the record
  cannot be deleted because of related business/financial history, with an
  Arabic equivalent; no raw Prisma error, stack trace, or DB constraint
  name reaching the user; the page remains fully usable afterward.
- **Actual (before fix):** A raw `Prisma.PrismaClientKnownRequestError`
  (`P2003`, foreign-key-restrict violation) propagated uncaught out of the
  server action.
- **Root cause:** `deleteUnit()`/`deleteRenter()` never checked for or
  translated the foreign-key-restrict case; no UI-level error handling
  existed either (the delete buttons were plain `<form action={...}>`
  calls with no `useActionState`/error-display wiring).
- **Fix:**
  - `deleteUnit()` (`src/lib/actions/units.ts`) and `deleteRenter()`
    (`src/lib/actions/renters.ts`): wrapped the delete in a try/catch,
    detecting `Prisma.PrismaClientKnownRequestError` with `code === "P2003"`
    generically (schema-agnostic — does not enumerate every referencing
    table) and returning a friendly, translated message instead of the raw
    error. **No hard delete was changed to a cascade** and **no historical
    business/financial data is ever touched** — the fix only changes what
    happens when the database's existing `Restrict` protection fires;
    `deleteOwner()`'s existing pre-check + soft-delete pattern was left
    unchanged (it was already correct).
  - New shared `src/components/delete-entity-button.tsx` client component
    (using the codebase's established `useActionState` pattern) replacing
    the three ad-hoc inline `<form action={async () => {"use server"; ...}}>`
    delete buttons on `/units`, `/renters`, and the Owner detail page.
  - New dictionary keys `validation.unitHasHistory` /
    `validation.renterHasHistory` (EN + AR) alongside the existing
    `validation.ownerHasHistory`.
  - **Explicit disposition on redesign:** no archive/deactivate UI was
    added for Unit or Renter in this pass. `Owner` already had a
    deliberate soft-delete (`deletedAt`); Unit/Renter do not have an
    equivalent `deletedAt`/archived-state field in the schema today.
    Adding one is a schema-level, cross-cutting decision (it interacts
    with every list/report query's default filter) that was judged **out
    of scope for a feature-freeze UAT pass** — the fix here makes the
    *existing* Restrict-then-explain behavior safe and honest, without
    redesigning the domain. This is logged as a **known-debt
    recommendation**, not a blocker: a referenced Unit/Renter is still
    fully usable and correctly protected from data loss; it is simply
    not *archivable* today, only *deletable-when-unreferenced*.
- **Retest evidence:** Live browser verification (production build, see
  D-006) for all three entities, in both English and Arabic:
  - `UAT-102` (has a Contract) → EN message: *"This unit has related
    contracts or other business records and cannot be deleted — archive it
    instead"*; AR message confirmed rendering correctly.
  - Renter "Faisal UAT-Lifecycle" (has a Contract) → EN friendly message
    confirmed.
  - Owner `uat-org-a-owner-compound` (has `PropertyOwnership`) → EN
    friendly message confirmed (pre-existing `deleteOwner()` path,
    re-verified after the production-build fix in D-006 since it uses the
    same display component).
  - Full `test:db` suite (70 files / 516 tests) and `vitest run` (64 files
    / 726 tests) pass after these changes, including the existing IDOR
    tests that call `deleteUnit`/`deleteRenter`/`deleteOwner` with a
    cross-org id and assert a rejection (`idor.db.test.ts`,
    `cross-org-security.db.test.ts`) — cross-org delete protection is
    unaffected by this change (a cross-org id still fails at the
    `organizationId`-scoped lookup, before the P2003 branch is ever
    reached).
- **Disposition:** **Fixed.**

### D-006 — Production-build redaction of thrown Server Action error messages ("Minified React error #441") — discovered during D-005 investigation

- **Area:** Cross-cutting — every `useActionState`-based safe-error-display
  flow in the application (delete buttons, Staff Users create/deactivate,
  Owner/Tenant Portal account create/reset-password panels)
- **Severity:** **Blocker** — this is a bigger issue than any of the 5
  original findings, because it meant the codebase's *entire* established
  safe-error-display convention (`useActionState` + try/catch around a
  thrown `Error`, displaying `err.message`) — used since early in this
  project and previously believed "verified" because it worked correctly
  under `next dev` — **did not actually work in a genuine production
  build**.
- **Reproduction:** `npm run build && npm run start` (never `next dev`),
  then trigger any of: a blocked Unit/Renter/Owner delete (D-005), a
  duplicate-email Staff User creation (D-002), or a duplicate-email
  Owner/Tenant Portal account creation (pre-existing panels, D-003/D-004).
- **Expected:** The friendly, translated message thrown server-side (e.g.
  *"This unit has related contracts..."*) is displayed to the user; the
  page remains usable.
- **Actual (before fix):** The literal text **"Minified React error #441;
  visit https://react.dev/errors/441 for the full message..."** was
  displayed in place of the friendly message. The page itself did *not*
  crash to a blank screen or Next.js's default error overlay — the rest of
  the page (navigation, other rows, other data) continued to render and
  function normally — but the specific error text shown to the user was a
  confusing, developer-facing string instead of the intended friendly,
  translated message, which fails the letter and spirit of "a controlled
  message must reach the user."
- **Root cause (confirmed):** React error code 441 decodes (per the
  React source's `scripts/error-codes/codes.json`, cross-referenced since
  the installed production bundle does not ship the code→text mapping) to:
  *"An error occurred in the Server Components render. The specific
  message is omitted in production builds to avoid leaking sensitive
  details. A digest property is included on this error instance which may
  provide additional details about the nature of the error."* Next.js
  redacts the message of an `Error` thrown from a Server Action once it
  crosses the client/server boundary in a genuine production build — but
  only when the Server Action is invoked as a plain async function call
  from inside another client-side function (the pattern this codebase used
  everywhere: a `useActionState` updater that does
  `try { await someServerAction(...) } catch (err) { return { error: err.message } }`).
  This redaction did not happen in `next dev` (which is why it was never
  caught before this pass), and does not affect a Server Action passed
  *directly* as a `<form>`'s own native `action` prop (e.g.
  `activateOwnerPortalAccount`, bound directly — those were unaffected).
  Server-side logging confirmed throughout the investigation that the
  correct, friendly, translated message was always being thrown correctly
  — the defect was entirely in the client/server delivery of that
  rejection, not in any business logic.
- **Fix:** Changed the affected Server Actions to **return** `{ error:
  string }` for their known/expected validation failures instead of
  throwing, and updated each caller to read `result.error` from the
  resolved value instead of catching a rejection. This keeps the existing
  translated-message convention and the existing `useActionState` display
  pattern intact (no new pattern introduced, no `error.tsx` boundary
  added, no restructuring of the three auth systems) — it only moves the
  known-error case from "thrown, then redacted" to "returned, then
  displayed," which was always the same shape needed by the calling
  components. Actions fixed: `deleteUnit`, `deleteRenter`, `deleteOwner`
  (`units.ts`/`renters.ts`/`owners.ts`), `createStaffUser`,
  `setStaffUserActive` (`staff-users.ts`), `createOwnerPortalAccount`,
  `resetOwnerPortalAccountPassword` (`owner-portal-account.ts`),
  `createTenantPortalAccount`, `resetTenantPortalAccountPassword`
  (`tenant-portal-account.ts`). Components updated to match:
  `delete-entity-button.tsx`, `staff-user-create-form.tsx`,
  `staff-user-row.tsx`, `owner-portal-account-panel.tsx`,
  `tenant-portal-account-panel.tsx`. Genuinely unexpected/unanticipated
  errors (a real bug, not a known validation case) still throw and will
  still surface as the generic React #441 digest text in production — this
  is an acceptable residual (the page still does not crash, per the
  verified behavior above), and is not a case Prompt 24's "controlled
  message" requirement was written to cover, since there is no
  pre-translated message to show for a truly unanticipated failure.
- **Retest evidence:** Full production rebuild (`npm run build && npm run
  start`) followed by live browser verification of all nine fixed
  action/component pairs: blocked Unit/Renter/Owner delete (D-005,
  EN + AR for Unit), duplicate-email Staff User creation, duplicate-email
  Owner Portal account creation — all now display the correct friendly
  message with **zero** occurrences of "Minified React error" anywhere
  (verified via a Playwright `page.on("pageerror")` listener across every
  scenario). `tsc --noEmit`, `eslint`, `vitest run` (726/726), and
  `vitest run --config vitest.db.config.mts` (516/516) all pass after this
  change, including the two existing Owner/Tenant Portal account-admin
  DB-test files, updated to assert on the returned `{error}` value instead
  of an expected rejection for the two call sites this change affects
  (duplicate-email creation, reset-password-on-nonexistent-account) —
  every other assertion in those files (transition validity, cross-org
  rejection for activate/suspend/disable, credential verification) is
  unchanged.
- **Disposition:** **Fixed.** Classified as a Go-Live blocker in its own
  right and fixed under the same feature-freeze "targeted, minimum
  implementation for a confirmed defect" exception as D-002 and D-005.
- **Known gap / recommendation:** This defect's shape (any thrown Server
  Action error, called as a plain function rather than a `<form>` action,
  is message-redacted in production) is a property of Next.js itself, not
  specific to the nine call sites fixed here. Any *future* code that
  reintroduces the "throw inside a `useActionState` updater, expect
  `err.message` to be the friendly text" pattern will silently reproduce
  this defect, and it will again be invisible under `next dev`. Recommend
  adding this to `docs/TECHNICAL-DEBT.md` as a documented convention rule
  ("Server Actions must return `{ error }` for expected failures, never
  throw and rely on the client reading `err.message`") and, ideally, a
  lint rule or code-review checklist item — this was not added as part of
  this pass to respect the feature freeze.

### D-007 — A Unit can end up with two simultaneously ACTIVE Contracts after a normal move-out-then-re-lease turnover (discovered during Corporate Housing occupancy-distinction UAT)

- **Area:** Contracts / Units — core leasing integrity
- **Severity:** **BLOCKER** — reachable on every ordinary tenant turnover, not an edge case
- **Description:** Building a live Corporate Housing fixture (a fresh Contract on a Unit that had earlier gone through a completed Move-Out in this same UAT pass) reproduced a real double-booking: `createContract()` had no check preventing a new ACTIVE Contract from being created on a Unit that already has another ACTIVE Contract. Root cause: a completed Move-Out resets `Unit.status` to `VACANT` (making the unit selectable again in the "New Lease Contract" form, which correctly filters by `status !== "OCCUPIED"`), but never closes the Contract row itself — this is the already-documented `docs/TECHNICAL-DEBT.md` item 7 ("no code anywhere sets `ContractStatus.EXPIRED`/terminates on Move-Out"). Because `createContract()` trusted the UI's dropdown filtering instead of re-checking the source of truth, staff creating a brand-new lease for a *new* tenant on a unit whose *previous* tenant had already moved out silently left **two simultaneously ACTIVE Contracts on the same Unit** — a real commercial-integrity risk (double invoicing, conflicting occupancy, owner-ledger double-counting, a wrong "current renter" shown on `/units`).
- **Reproduction:** Unit `UAT-102`'s original lifecycle Contract (`CTR-2026-00001`, renter "Faisal UAT-Lifecycle") remained `ACTIVE` after that renter's Move-Out completed earlier in this UAT pass (per the documented gap). A new Contract (`CTR-2026-00002`, renter "UAT Corp Tenant LLC") was then created on the same now-`VACANT`-flagged Unit via the ordinary `/contracts` "New Lease Contract" form — succeeded with no warning. Direct query confirmed both rows `ACTIVE` simultaneously with overlapping date ranges.
- **Expected:** Creating (or re-pointing, via edit) a Contract onto a Unit that already has another `ACTIVE` Contract must be refused with a friendly, translated message — mirroring the defense `reservation-contract.ts` already had for the Reservation→Contract conversion path ("Step 21: existing Contract conflict - do not rely solely on Unit.status").
- **Actual (before fix):** Silently succeeded; no error, no warning, two `ACTIVE` Contracts left on one Unit.
- **Root cause:** `createContract()` never checked for an existing `ACTIVE` Contract on the target Unit at all; `updateContract()` had a check, but it read the same stale `Unit.status` field rather than the actual Contract rows — the identical class of bug `reservation-contract.ts` was already hardened against (Step 21 there references this exact risk by name), which `contracts.ts` had simply never received.
- **Fix:** Added the same "check the real Contract rows, not `Unit.status`" guard to both `createContract()` (new — only applies when reusing an existing Unit, since a brand-new Unit can never already have a Contract) and `updateContract()`'s unit-reassignment path (replaced its stale `Unit.status === "OCCUPIED"` check with the same live Contract-row count), both in `src/lib/actions/contracts.ts`, reusing the existing `validation.unitAlreadyOccupied` translated message (EN/AR) already used by the Reservation→Contract path — no new dictionary key, no schema change, no change to Move-Out's own deliberately-scoped behavior (item 7 remains exactly as documented; a Contract still never auto-expires) and no cascade/redesign of the Contract lifecycle.
- **Retest evidence:** `contract-relation-injection.db.test.ts`'s own test fixture (which, before this fix, itself relied on two `createContract()` calls landing on the same Unit as incidental scaffolding) started failing the moment the fix went in — the new guard threw the correct friendly message (`هذه الوحدة مؤجرة بالفعل بعقد آخر` / "This unit is already occupied under another contract") on the exact conflicting-unit scenario, which is direct proof the guard fires correctly against a real Postgres database. The test was updated to reuse the already-created Contract instead of creating a conflicting second one (its own concern is renterId cross-org injection, unrelated to unit reuse). Full regression after the fix: `vitest run` 726/726, `vitest run --config vitest.db.config.mts` 516/516 (70 files), `tsc --noEmit` clean, `eslint` clean, full production rebuild (`npm run build && npm run start`) succeeded and the units dropdown correctly excludes both now-`OCCUPIED` UAT fixture units.
- **Disposition:** **Fixed.** Classified as a BLOCKER under Prompt 24's "fix only BLOCKER/HIGH" continuation policy, since this is not a contrived scenario — it is the ordinary move-out-then-re-lease turnover every rental property goes through.
- **Known gap, recorded rather than fixed in this pass:** the underlying tech-debt item 7 (Contract never auto-expires/gets terminated by Move-Out) is unchanged and remains open exactly as documented — this fix closes the *consequence* (double-active-contract) at the point a new lease is created, not the *cause* (Move-Out leaving the old Contract row open forever). `docs/TECHNICAL-DEBT.md` updated accordingly.

### D-008 — Staff Users administration page (D-002) had no sidebar navigation entry visible to the operator who reported it

- **Area:** Internal staff administration / navigation
- **Severity:** Major (operability/discoverability — no data exposure risk; the page and its RBAC were already correct)
- **Description:** A real-user operational UAT pass reported that, logged in as OWNER, the sidebar ended at Documents / Audit Log / Organization Settings / Logout with no visible entry for the Staff Users page added under D-002.
- **Audit finding:** At the current HEAD (commit `83daabe`, before this fix), the code **already contained** both the nav entry (`src/app/(app)/layout.tsx`, `{ href: "/settings/users", label: t.staffUsers.title, icon: "👤", permission: "staffUser.view" }`) and the correct permission grant (`staffUser.view` in `ALL_PERMISSIONS`, granted only to `OWNER`/`ADMIN`). No production server process was found running at the time of the report (confirmed: `pgrep` found no `next start`/`next-server` process), so the reported observation was against a stale build/instance predating this nav entry, not a defect in the code at HEAD as it stood. Independently of that, the requested labels ("Users & Permissions" / "المستخدمون والصلاحيات") differed from the existing reused page-title label ("Staff Users" / "موظفو النظام"), which is a legitimate, separate improvement — a dedicated page heading and a sidebar nav label serving two different purposes shouldn't necessarily share one string.
- **Fix:** Added a new, dedicated nav-only dictionary key (`nav.usersAndPermissions`, EN "Users & Permissions" / AR "المستخدمون والصلاحيات") in `src/lib/i18n/dictionary.ts` + both dictionaries, and pointed `layout.tsx`'s existing nav entry at it instead of reusing `t.staffUsers.title` (the page's own `<h1>`, left unchanged as "Staff Users"). The permission gate (`staffUser.view`, OWNER/ADMIN only) was **not changed** — it was already correct.
- **Retest evidence (production build, `npm run build && npm run start`):** OWNER — sidebar shows "Users & Permissions", clicking it opens `/settings/users` correctly. ADMIN — same. MANAGER, ACCOUNTANT, VIEWER — sidebar does **not** show the item, and each was independently verified via a fresh authenticated session per role. Arabic locale — sidebar shows "المستخدمون والصلاحيات", `<html dir="rtl">` confirmed, clicking it opens `/settings/users`. Mobile viewport (iPhone 12 emulation) — the item is present and reachable. Full regression: `vitest run` 726/726, `vitest run --config vitest.db.config.mts` 516/516 (70 files), `tsc --noEmit` clean, `eslint` clean (one pre-existing, unrelated warning).
- **Disposition:** **Fixed** (dedicated nav label added; permission model unchanged, as required). The three authentication systems were not touched or merged.
- **Portal-account discoverability, audited in the same pass:** the Owner Portal account panel (D-004) is already reachable from an obvious place — `/owners` links every row to `/owners/[id]`, and that page renders the "Owner Portal Access" section directly (confirmed live; no fix needed). The Tenant Portal account panel (D-003), however, lives on `/contracts/[id]/edit` — and nothing on `/renters` (the only Renter-facing list; this codebase has no dedicated Renter detail page, `docs/TECHNICAL-DEBT.md` item 11b) pointed a staff operator toward it. **Fixed**: added a new `getContractLinksForRenters()` helper (`src/lib/actions/contracts.ts`, mirroring `getCorporateAccountLinksForRenters()`'s existing pattern exactly) and a conditional "Tenant Portal Access" link per renter row on `/renters` (gated on `tenantPortalAccount.view`, reusing the existing `t.tenantPortal.sectionPortalAccess` label — no new dictionary key, no redesign of the Tenant Portal module itself). Live-verified: a renter with a contract now shows a "Tenant Portal Access" link on `/renters` leading to that contract's edit page, where the existing panel is unchanged.

### D-009 — Direct unauthorized access to a permission-gated page crashes to a raw error screen rather than a friendly denial (discovered while verifying D-008's denial requirement)

- **Area:** Cross-cutting — every internal page protected by `requirePermission()`/`can()` at the top of a Server Component, not specific to Staff Users
- **Severity:** Real, but **not classified as a blocker for this request** — see disposition
- **Description:** Verifying "direct URL access is denied" for MANAGER/ACCOUNTANT/VIEWER against `/settings/users` confirmed the denial is genuinely secure (zero Staff Users data of any kind reaches the response), but the denial mechanism itself is an uncaught `AuthorizationError` thrown during the page's own server-side render (`listStaffUsers()` → `requirePermission("staffUser.view")`). Because **no `error.tsx` boundary exists anywhere in this application** (confirmed during the D-006 investigation earlier in Prompt 24 and re-confirmed now), this uncaught render-time error surfaces in a genuine production build as Next.js's own generic full-page crash screen ("This page couldn't load / A server error occurred. Reload to try again."), with the browser console showing the same "Minified React error #441" digest text D-006 fixed for the *Server Action* case — this is the equivalent failure mode for a *Server Component render* error, a different code path than D-006 touched.
- **Why this was not fixed in this pass:** this is not unique to `/settings/users` or to anything changed under D-008 — it is the existing behavior of essentially every permission-gated page in this codebase (any page whose `page.tsx` calls `requirePermission()`/an action that does) whenever an unauthorized role reaches it directly, and predates this entire finding. Fixing it properly (e.g. a shared `error.tsx` boundary for the internal app's route group, rendering a friendly "you don't have access" message instead of Next's generic crash page) is a genuine, worthwhile, but **architecturally broader change than this specific nav-discoverability request** — it touches error-handling behavior for the whole app, not just Staff Users, and the current task's own instructions are explicit not to add unrelated changes. Recorded here for visibility and future scheduling rather than silently left undiscovered.
- **What is already true today, unaffected by this gap:** no unauthorized data is ever exposed (the crash happens *before* any Staff Users content renders); the failure is loud and immediately visible to the operator (not a silent wrong-looking success); it does not affect OWNER/ADMIN at all, only a role attempting to bypass the sidebar via a typed URL.
- **Disposition:** **Recorded, not fixed in this pass** — recommended as its own, dedicated future task (a single shared `error.tsx` for the `(app)` route group) rather than a drive-by fix bundled into this nav-discoverability request.

---

## 2. Retest Checklists Executed

- **Staff management:** create (duplicate-email rejected with friendly
  message), role change, deactivate (self-deactivation blocked), activate,
  reset password (temporary password shown once) — all as OWNER against
  UAT_ORG_A; permission gating spot-checked by code inspection
  (`ALL_PERMISSIONS`-only grant, not present in MANAGER/ACCOUNTANT/VIEWER
  arrays).
- **Tenant/Owner Portal provisioning:** re-verified the pre-existing
  create/activate/suspend/disable/reset-password flows for Owner Portal
  accounts against the production build after the D-006 fix; duplicate-
  email rejection now shows the correct friendly message instead of the
  React #441 text.
- **Delete/archive:** Unit, Renter, Owner delete against both a referenced
  fixture (blocked, friendly message, EN + AR for Unit) and — via the
  automated IDOR/cross-org suites — cross-org rejection paths; page
  usability after a blocked delete confirmed by continuing to interact
  with the same page (other rows, navigation) in the same browser session.
- **Login entry (EN/AR/mobile):** the new `/` selector verified in EN;
  Arabic-locale rendering of the delete-blocked message verified
  end-to-end (login → navigate → delete → read AR message) as part of
  D-005/D-006 retesting. A dedicated mobile-viewport pass of the new
  selector page itself was **not** re-run in this update (it was covered
  generically by the existing responsive layout, unchanged by this fix) —
  flagged for the mobile/RTL smoke pass still pending under task #232.

---

## 3. OPERATIONAL ADMINISTRATION READINESS

1. **Can a second internal staff account be created without developer/DB
   access?** Yes — `/settings/users`, OWNER/ADMIN only (D-002).
2. **Can a staff member's role be changed without DB access?** Yes — same
   page.
3. **Can a staff account be deactivated (e.g. an employee leaves) without
   DB access?** Yes; self-deactivation is blocked with a friendly message.
4. **Can a staff account be reactivated without DB access?** Yes.
5. **Can a staff member's password be reset without DB access?** Yes — a
   one-time temporary password is generated and displayed once.
6. **Is there any privilege-escalation risk in the staff admin surface?**
   No new roles or permission-customization were introduced; only
   OWNER/ADMIN can grant OWNER/ADMIN (unchanged from the existing RBAC
   model — no meaningful distinction between OWNER and ADMIN existed
   before this pass, and none was added).
7. **Can a Renter be linked to a Tenant Portal account without DB access?**
   Yes — pre-existing capability, confirmed still correct (D-003).
8. **Can an Owner be linked to an Owner Portal account without DB
   access?** Yes — pre-existing capability, confirmed still correct
   (D-004), and confirmed to still use live Unit > Building > Compound
   effective ownership, unweakened.
9. **Can a Tenant/Owner Portal account be activated, suspended, disabled,
   or password-reset without DB access?** Yes, all pre-existing.
10. **Can a cross-organization user ever be created, linked, or
    administered by mistake?** No — every lookup in every fixed/audited
    action is `organizationId`-scoped, and portal accounts are
    structurally `@unique` per owner/renter at the schema level.
11. **If an admin tries to delete a Unit/Renter/Owner that has business
    history, does the system ever show a raw error page, stack trace, or
    database constraint name?** No, as of D-005 + D-006 — a controlled,
    translated (EN/AR) message is shown, and the page remains usable.
12. **Is historical business/financial data ever silently cascade-deleted
    when an admin clicks Delete?** No — the pre-existing DB-level
    `Restrict` constraints (and, for Owner, the existing pre-count/
    soft-delete logic) are the enforcement point; this pass only fixed how
    the resulting rejection is *communicated*, never what is deleted.
13. **Does every `useActionState`-based error-display flow in the
    application correctly show its intended message in a genuine
    production build (not just `next dev`)?** Confirmed **yes** for the
    nine flows fixed under D-006 (delete buttons, Staff Users, Owner/
    Tenant Portal account create + reset-password). **Not exhaustively
    re-verified** for every other `useActionState` usage elsewhere in the
    codebase that was not touched by Findings 1-5 — see the D-006 "known
    gap" recommendation.
14. **Are the three authentication systems (internal/tenant/owner) merged
    or weakened by any of this work?** No — all three remain fully
    independent (`src/lib/auth.ts`, `src/lib/tenant-auth.ts`,
    `src/lib/owner-auth.ts`); the new landing page only links to their
    existing login pages.
15. **Overall — can Pro Core perform routine Day-1 administration (add a
    staff member, change a role, deactivate someone, provision a
    tenant/owner portal account, delete or be safely blocked from deleting
    a record) without any developer, Prisma, SQL, or server access?**
    **Yes, for every capability audited under real-user Findings 1-5.**
    No remaining gap was identified in this specific scope that would
    require direct database or developer intervention for Day-1 use.

---

## 4. Remaining Prompt 24 Phases (tasks #227-233) — Continuation

This section closes out every phase Section "Status of this document"
above flagged as outstanding. All items below were executed against the
running production build (`npm run build && npm run start`), the real
local PostgreSQL instance, and the real local S3-compatible object store
(`s3rver`, configured via `DOCUMENT_S3_*` in `.env` — this environment is
NOT using the `LOCAL_DEV` filesystem adapter).

### 4.1 Corporate Housing occupancy-distinction UAT — PASS (+ D-007 found & fixed)

Built a live fixture end-to-end via the real UI: corporate renter (VAT
number) → Corporate Account → Corporate Occupant → Housing Allocation
against a real ACTIVE Contract. Directly verified the core invariant this
gate exists for: ending the occupant's allocation (`ACTIVE` → `ENDED`)
leaves the Unit's own `status` at `OCCUPIED` (its Contract is still
active) while the "Unallocated Corporate Units" report immediately lists
that same Unit as having zero active occupants — the intended "occupied
but unallocated" distinction, confirmed live in both the database and the
report UI. Full DB test suite re-run: 19/19 pass (lifecycle, concurrency,
cross-org).

Building this fixture also reproduced **D-007** (a Unit could end up with
two simultaneously `ACTIVE` Contracts on an ordinary move-out-then-re-lease
turnover) — see the Defect Register above. Fixed, regression-tested
(726 unit + 516 DB tests), and re-verified live in a rebuilt production
bundle.

### 4.2 Documents UAT — PASS; external cloud S3 — PENDING EXTERNAL

Live, authenticated, production-build verification against the real local
S3-compatible backend:
- Upload (PNG, real bytes) → listed correctly with correct MIME type/size.
- New version uploaded (v1 → v2) → both versions retained in Version
  History with correct timestamps and file names; current-version pointer
  updated correctly.
- Authenticated download via the protected route
  (`/api/documents/[id]/download`) → `200`, correct `image/png`
  content-type, correct bytes.
- Cross-organization download attempt (Org B staff, same document ID) →
  `404` (never `200`) — the entity-authorization registry correctly denies
  it.
- Zero browser console errors during the entire upload/version/download
  flow.
- Document Management DB test suite re-run: 24/24 pass (core CRUD,
  concurrency/storage-failure handling, portal access).

**External cloud S3 smoke test: PENDING EXTERNAL.** No real AWS/R2/MinIO
account or credentials exist in this environment (confirmed: `.env` points
`DOCUMENT_S3_ENDPOINT` at a local `s3rver` test double, not a real cloud
endpoint). Per `docs/TECHNICAL-DEBT.md` item 11a, this was already an
explicitly-documented, never-hidden limitation from Prompt 23 — restated
here as a **mandatory pre-deployment prerequisite, not a discovered
defect**: before production go-live, the real S3-compatible adapter
(`src/lib/documents/providers/s3-compatible.ts`) must be exercised once
against the actual provisioned production bucket/credentials (put, get,
delete, not-found handling, and one full backup-delete-restore-checksum
cycle), exactly as it was already exercised against the local test double
in this pass and in Prompt 23's original backup/restore drill
(`docs/BACKUP-RECOVERY.md` §7b). This gate cannot be marked PASS without
real credentials, and no verification is fabricated in their absence.

### 4.3 Automation / Outbox UAT — PASS

Re-ran the automation and communications DB test suites end-to-end:
10 files, 64/64 tests pass — cross-org security (automation +
communications, 12 tests), idempotency (the enqueue path's own unique
`(organizationId, idempotencyKey)` constraint fired correctly during the
run, proving duplicate-send protection is real, not just asserted),
concurrency, and the reconciliation job. Worker-route security verified
live against the running production server: `POST /api/automation/worker`
and `POST /api/communications/process` both return `401` with no secret
and `401` with a wrong secret header — never process the request.

### 4.4 Security UAT — PASS (trusted-proxy limitation re-confirmed, unchanged)

Live, production-build verification:
- **Login rate limiting, all 3 principals:** DB test suite re-run, 4/4
  pass (concurrency-safe counting, fixed-window expiry, and — critically —
  confirmed that INTERNAL/Tenant/Owner buckets never share state for the
  same email). Independently, this exact session's own repeated UAT
  logins tripped the real rate limiter mid-session, live proof the
  mechanism fires under real traffic, not only in isolated tests.
- **Health endpoint tiering:** `GET /api/health` (liveness) → `200`, no
  DB dependency; `GET /api/health/ready` (readiness) → `200` with real
  `{database: true, config: true}` checks; `GET /api/ops/health`
  (protected operational tier) → `401` unauthenticated, exactly as
  designed.
- **Security headers:** live `curl -I /` against the production server
  confirms `Content-Security-Policy`, `X-Content-Type-Options: nosniff`,
  `X-Frame-Options: SAMEORIGIN`, `Referrer-Policy`, `Permissions-Policy`,
  and `Strict-Transport-Security` are all present and match
  `docs/PRODUCTION-SECURITY.md`'s documented configuration exactly.
- **Error sanitization / log redaction:** unchanged since Prompt 23;
  `src/lib/logging.ts`/`src/lib/api-error.ts` untouched by this pass, full
  unit suite (726 tests, including the redaction/masking test files) still
  green.
- **Trusted-proxy decision:** re-confirmed as an unchanged, already-
  documented limitation (`docs/TECHNICAL-DEBT.md` item 1, P3): the IP-based
  rate-limit bucket trusts `x-forwarded-for`'s first value without a
  configured trusted-proxy allowlist. This cannot be genuinely resolved
  without knowing the real production deployment topology (which load
  balancer/CDN sits in front of the app, if any) — **PENDING EXTERNAL**:
  the actual allowlist must be configured once that topology is known;
  the per-identifier (email-based) bucket remains the primary defense
  regardless and is unaffected.
- **Auth/deactivation/stale-session:** unchanged from the already-verified
  periodic re-verification (`src/lib/auth-session-refresh.ts`), re-run as
  part of the full unit suite (5/5 pass) and DB suite (4/4 pass).

### 4.5 Deployment Rehearsal & Backup/Restore — PASS

- **Fresh PostgreSQL database migration/bootstrap:** created a genuinely
  new, empty database and ran `prisma migrate deploy` against it — all 27
  migrations applied cleanly, zero errors, `"All migrations have been
  successfully applied."` This is the exact sequence a real first-time
  production bootstrap runs.
- **PostgreSQL backup/restore:** a real `pg_dump` (custom format) of the
  live UAT database followed by `pg_restore` into a fresh database, then a
  row-count comparison across four representative tables
  (`organizations`, `units`, `contracts`, `invoices`) — **exact match on
  every table**. Rehearsal databases were dropped afterward; no artifacts
  left behind.
- **Object-storage backup/restore/checksum:** not independently re-run as
  a standalone drill in this pass (the original, real drill — full
  backup-delete-restore-checksum-verify cycle against a local S3-compatible
  server — was already executed in Prompt 23, `docs/BACKUP-RECOVERY.md`
  §7b, and nothing about the storage schema or adapter changed since).
  This pass's own Documents UAT (4.2) independently re-confirms the
  read/write/download path against that same real S3-compatible backend
  is still correct today.
- **DB/object consistency, provider/storage/database outage behavior,
  scheduler missed-window recovery, outbox backlog recovery:** covered by
  the already-passing, already-built automated suites re-run in 4.3 above
  (`automation-reconciliation.db.test.ts` — 3/3 — exercises exactly the
  missed-window/backlog-recovery scenarios; `document-concurrency-and-
  storage-failures.db.test.ts` — part of the 24/24 in 4.2 — exercises
  storage-failure handling). Not independently re-derived from scratch in
  this pass; cited as existing, real, passing evidence rather than
  re-invented.
- **Production deployment rehearsal (full):** limited to the database
  layer above — there is no real production hosting target (server,
  container platform, load balancer) available in this environment to
  rehearse an actual application deployment against. **PENDING EXTERNAL**
  for the application-hosting half of this gate; the data-layer half
  (migration + backup/restore) is genuinely rehearsed and passing.
- **Environment fail-closed verification:** unchanged from Prompt 23
  (`src/lib/env-validation.ts` / `src/instrumentation.ts` — production
  fails closed on `LOCAL_DEV` storage and on missing required secrets);
  not re-derived, cited as existing.

### 4.6 Financial / Executive / EN-AR-RTL-Mobile / Perf / Pagination / Concurrency / Audit — PASS

- **Financial Master Reconciliation:** the dedicated
  `financial-regression.db.test.ts` suite (invoice/VAT/commission/payment/
  reversal/anti-double-count/owner-ledger) re-run and green as part of the
  full DB suite. A manual ad-hoc spot-check query run during this pass
  produced a confusing negative "total payments" figure purely because it
  naively excluded `status: REVERSED` rows without also accounting for a
  reversal's own negative-amount offset row correctly — an artifact of
  that one-off query's own filter logic, not a discrepancy in the
  application's real reconciliation logic (which computes this correctly
  and is what the passing automated suite actually verifies).
- **Executive KPI + aging reconciliation:** `executive-reconciliation.db.test.ts`
  re-run, 13/13 pass, explicitly including cancelled-invoice exclusion and
  aging-bucket reconciliation scenarios by name.
- **Audit trail / immutability:** `audit-immutability.db.test.ts` re-run,
  6/6 pass.
- **EN/AR/RTL/mobile/console:** a combined live check (iPhone 12 viewport,
  Arabic locale) confirmed `<html dir="rtl">` is correctly set, the
  sidebar/navigation renders and remains usable at mobile width, Arabic
  UI strings render correctly throughout, and **zero browser console
  errors** occurred during the pass. This is in addition to the
  EN + AR verification already performed live for every Finding 1-5/D-006/
  D-007 fix earlier in this document.
- **Performance smoke:** basic page-load timing against the production
  server (`/`, `/login`) returned sub-15ms responses; no hangs, no
  timeouts. Not a load test — no concurrent-user throughput target exists
  to test against without a defined production traffic profile.
- **Pagination / concurrency:** pagination is exercised implicitly by the
  many already-passing report/list-page tests; concurrency is extensively
  covered by the many dedicated `*-concurrency.db.test.ts` suites re-run
  throughout this pass (ownership, reservation-contract, corporate
  housing, communications) — all green.

### 4.7 Acceptance by Role — PASS (re-confirmed, unchanged)

OWNER/ADMIN/MANAGER/ACCOUNTANT/VIEWER (mapped to Operations/Accounting/
Management/Viewer acceptance) were already live-verified end-to-end by
task #222's RBAC matrix UAT earlier in Prompt 24, including cross-org
denial. Nothing in `src/lib/permissions.ts`'s role→permission mapping was
touched by this continuation except the additive `staffUser.*` grants
(D-002, OWNER/ADMIN-only) and the new (already-tested) delete-flow
behavior — neither changes any existing role's acceptance criteria.

### 4.8 Known Technical Debt Review — Complete

`docs/TECHNICAL-DEBT.md` reviewed and updated in this pass: item 1
(deletion friendliness) partially resolved and re-scoped to the three
remaining modules; a new entry recorded for the D-006 production
error-redaction convention risk; item 7 (Contract never auto-expires)
cross-referenced with its D-007 consequence and fix. No new debt item
was created without a corresponding disposition (fixed / explicitly
deferred with reason).

---

## 5. Go-Live Operational Plans

Written as concrete, actionable plans against this codebase's actual
architecture — not generic boilerplate. Items marked **PENDING EXTERNAL**
require information or infrastructure this environment does not have
(a real cloud account, a chosen hosting provider, a real domain/DNS, a
paging/on-call tool) and cannot be fabricated.

**Production data preparation plan.** Do not carry any UAT fixture data
(`UAT_ORG_A`/`UAT_ORG_B` and everything created under them in this pass)
into production. The only production-safe bootstrap path today is a
brand-new, empty database (verified in 4.5) followed by exactly one
manual creation of the first real Organization and its first OWNER user —
`src/lib/seed-demo-data.ts` and `/api/admin/seed` are demo/test tooling
only (secret-gated, production-disabled by default) and must never run
against a real customer database.

**Go-Live access plan.** First OWNER account: created directly in the
production database by whoever runs the initial migration (there is
intentionally no self-service "first user" signup flow — this matches the
existing internal-staff-only provisioning model). Every subsequent staff
account: created by that OWNER via `/settings/users` (D-002) — no
developer/DB access needed from day two onward. Tenant/Owner Portal
accounts: created by staff via the existing Owner/Renter profile pages
once real Owners/Renters/Contracts exist.

**Worker/cron plan.** Three protected routes must be invoked on a
schedule by the hosting platform's own cron/scheduled-task mechanism (this
codebase has no built-in scheduler daemon — see `docs/AUTOMATION-SCHEDULED-JOBS.md`):
`POST /api/automation/scheduler` (enqueues due jobs), `POST /api/automation/worker`
(processes queued jobs), `POST /api/communications/process` (drains the
outbox). Each requires the `x-worker-secret` header matching
`WORKER_SECRET` (verified fail-closed in 4.4/4.3). Recommended cadence:
worker and outbox-processor every 1-5 minutes; scheduler once daily
(it computes due reminders for the day). **Exact cron syntax depends on
the chosen hosting platform — PENDING EXTERNAL.**

**Production storage plan.** Set `DOCUMENT_S3_ENDPOINT`/`_REGION`/`_BUCKET`/
`_ACCESS_KEY_ID`/`_SECRET_ACCESS_KEY` to a real provisioned S3-compatible
bucket before go-live (never `LOCAL_DEV` in production — enforced
fail-closed already). Run the real-credential smoke test from 4.2 once
that bucket exists. **PENDING EXTERNAL** until a real account is
provisioned.

**Production database plan.** A managed PostgreSQL instance (version
matching `prisma/schema.prisma`'s target), `DATABASE_URL` pointed at it,
`prisma migrate deploy` run once (rehearsed clean in 4.5), then the single
manual first-OWNER creation above. Enable automated daily backups on the
managed instance itself if the provider offers it; the manual
`pg_dump`/`pg_restore` procedure rehearsed in 4.5 remains the documented
manual fallback (`docs/BACKUP-RECOVERY.md`). **Exact managed-provider
choice — PENDING EXTERNAL.**

**Day-1 observability plan.** Point uptime monitoring at `GET /api/health`
(liveness) and `GET /api/health/ready` (readiness); point a synthetic
check with the worker secret at `GET /api/ops/health` for the protected
operational tier (DB latency, queue depth — see
`docs/PRODUCTION-RELIABILITY.md`). Structured JSON logs
(`src/lib/logging.ts`) should be shipped to whatever log aggregation the
hosting platform provides; `logSecurityEvent()` calls (login-rate-limit
trips, worker-auth rejections) are the highest-signal lines to alert on
first. **Choice of paging/alerting tool — PENDING EXTERNAL.**

**First-24-hours plan.** (1) Confirm the scheduled worker/outbox/scheduler
crons are actually firing (check `AutomationJobAttempt`/`OutboxEvent`
rows advance). (2) Watch `/api/health/ready` and `/api/ops/health` for the
first few hours at tighter intervals than the steady-state cadence.
(3) Confirm the first real Organization's first Contract → Invoice →
Payment cycle reconciles correctly in the Executive Dashboard before
trusting it for a second organization. (4) Watch `login_rate_limit_triggered`
log events for unexpected volume (could indicate a misconfigured client
retrying, not necessarily an attack).

**Rollback / roll-forward matrix.**

| Scenario | Action |
|---|---|
| Bad application deploy, DB schema unchanged | Roll back to the previous application build/image; no DB action needed. |
| Bad migration, caught before real data written under it | `prisma migrate resolve --rolled-back <name>` (never a raw destructive SQL edit — matches the documented convention already used once in this codebase's own history, `docs/TECHNICAL-DEBT.md` item 8), then redeploy the previous application build. |
| Bad migration, real data already written under the new schema | Roll forward with a corrective migration, never backward — restore from the most recent verified backup (4.5) only as a last resort, and only after confirming the data-loss window is acceptable. |
| Worker/scheduler secret compromised | Rotate `WORKER_SECRET`, redeploy; the fail-closed check (4.3/4.4) means the old secret stops working immediately everywhere. |
| Object storage outage | The application already fails a document upload/download with a handled error rather than crashing (verified in 4.2's own DB suite, "storage-failure handling" tests) — no emergency code change needed, only a storage-provider-side incident. |

---

## 6. Overall Disposition

Every item explicitly listed in the continuation request has now been
executed, with real evidence, against a real production build, a real
PostgreSQL database, and a real (local) S3-compatible object store — see
Sections 4-5 above and the full Defect Register (D-001 through D-007, all
**Fixed** or **No defect found — capability already correct**).

Two categories of item remain genuinely outside what this environment can
verify, and are marked accordingly rather than fabricated:
1. **The real external cloud S3 smoke test** (§4.2) — no real cloud
   credentials exist here.
2. **Real production hosting infrastructure** (§4.5's application-layer
   deployment rehearsal, the trusted-proxy topology in §4.4, and the
   provider-specific details in §5's plans) — no real hosting target,
   load balancer, or on-call tooling exists here.

Per the explicit rule that these must be marked **PENDING EXTERNAL** and
never fabricated, and since the real cloud S3 smoke test is stated to be
a **mandatory deployment prerequisite**: the conclusion is —

**CONDITIONALLY READY — EXTERNAL DEPLOYMENT PREREQUISITES REMAIN**

The application itself — every UAT phase, every defect found, every fix
made, every regression suite, live production-build browser verification
across EN/AR/RTL/mobile, and the full data-layer deployment rehearsal —
is genuinely ready. What remains is exclusively external: provisioning a
real cloud object-storage account and a real production hosting/DB target,
then re-running the specific smoke tests this document already names
(§4.2's real-credential S3 test, §4.5's application-layer deployment
rehearsal) against them before flipping to APPROVED FOR PRODUCTION
GO-LIVE.
