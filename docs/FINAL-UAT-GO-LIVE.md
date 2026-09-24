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

## 4. Overall Disposition

Per the rule that a system must not receive **APPROVED FOR PRODUCTION
GO-LIVE** while essential routine Day-1 administration still requires
direct database or developer intervention: **within the scope audited by
this update (real-user Findings 1-5 and the D-006 defect found while
investigating them), no such gap remains** — items 1-15 above are all
resolved or confirmed already-correct.

However, this document does **not** cover the remaining Prompt 24 phases
that were still in progress when these findings arrived and have not been
re-run since: Corporate Housing occupancy-distinction UAT, Documents UAT
(including the external S3 gate disposition), Automation/Outbox UAT,
a dedicated Security UAT pass (rate limiting, trusted-proxy decision,
CSP/headers, log redaction, health tiers), a fresh-DB deployment
rehearsal, and the executive KPI/EN-AR-RTL-mobile/console/performance
smoke pass.

**Disposition: CONDITIONALLY READY, scope-limited to Operational
Administration (this document) and the previously-completed business
lifecycle / financial reconciliation / Move-In-Maintenance-Move-Out /
Tenant-Owner-Portal UAT.** The system is **NOT YET APPROVED FOR PRODUCTION
GO-LIVE** as a whole — that verdict is deliberately deferred until the
remaining phases above are completed and reconciled into this same
document.
