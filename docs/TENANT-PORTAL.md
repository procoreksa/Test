# Tenant Portal

The first externally-facing (non-staff) surface in this codebase. A tenant
authenticates independently of the internal staff application and may view
their own tenancy data and perform one self-service action (create a
maintenance request). Every design decision in this document is driven by
one non-negotiable principle, stated verbatim in the brief that produced
this module: **"A TENANT IS NOT AN INTERNAL STAFF USER."** Internal
employee authorization (`src/lib/session.ts`) and tenant authorization
(`src/lib/tenant-session.ts`) are two separate security domains that never
share code, never share a session, and never share a role enum.

## 1. Pre-implementation architecture audit

Before any portal model was added, twelve questions were answered:

1. **Separate account model or reuse `User`?** Separate (`TenantPortalAccount`)
   - see §3 for the reasoning.
2. **Does `UserRole` gain `TENANT`?** No - see §2.
3. **Account cardinality?** One `TenantPortalAccount` per `Renter` (V1;
   `Renter.tenantPortalAccount` is optional but unique), not one per
   Contract - a renter's identity is stable across contract renewals/
   multiple leases, so the account should be too.
4. **Account status lifecycle?** `INVITED → ACTIVE ⇄ SUSPENDED →
   DISABLED` (terminal) - see §4. An account is never deleted.
5. **Credential storage?** Reuses the existing `bcryptjs` hashing
   convention (`src/lib/auth.ts`'s own pattern), never a new scheme.
6. **Session concept?** A second, fully independent NextAuth v5 instance
   - see §5.
7. **Session staleness?** Mirrored from the internal hardening
   (`src/lib/auth-session-refresh.ts`) into its own module,
   `src/lib/tenant-session-refresh.ts` - see §6.
8. **Authorization boundary?** `src/lib/tenant-session.ts` -
   `requireTenantSession()` plus six resource-specific
   `requireTenant*Access()` helpers, never `requirePermission()` - see §8.
9. **Resource entitlement source?** Always re-derived from
   `TenantPortalAccount → Renter → Contract → resource`, never a
   client-supplied id or `organizationId` alone - see §8.
10. **Anti-enumeration?** A single neutral Not Found outcome for every
    unauthorized/nonexistent id - see §9.
11. **Route namespace?** `/portal/*`, isolated from every internal route
    - see §11.
12. **UI shell?** A dedicated layout, reusing existing generic components
    (`MobileSidebarShell`, `NavLink`, `LanguageSwitcher`) with tenant-only
    navigation, never the internal staff sidebar - see §11.

## 2. Why the internal `UserRole` enum was NOT extended

The brief's acceptance criteria required a documented, compelling reason
before even considering a `TENANT` role value, and none existed: a tenant
never needs any of the ~90 internal `Permission` keys in
`src/lib/permissions.ts`, never appears in `requirePermission()`'s role
matrix, and must never be checkable by the same `can(permission, role)`
function that gates internal staff actions - conflating the two would risk
a future internal check accidentally passing for a tenant (or vice versa).
`UserRole` remains exactly `OWNER | ADMIN | MANAGER | ACCOUNTANT | VIEWER`,
unchanged.

## 3. Why a separate model (`TenantPortalAccount`), not `User` reuse

`User` carries `role: UserRole`, is created only by internal
admin/seed flows, and is the identity every `AuditLog.userId`,
`assignedToUserId`, `createdByUserId` FK across ~30 modules points at.
Reusing it for tenants would mean either inventing a fake `UserRole` (see
§2) or leaving `role` semantically undefined for a huge new class of rows,
and would let a tenant identity silently satisfy any internal FK/permission
check that merely tests "does a `User` row exist." A wholly separate model
has no such risk by construction.

## 4. Schema

```prisma
enum TenantPortalAccountStatus { INVITED  ACTIVE  SUSPENDED  DISABLED }

model TenantPortalAccount {
  id                 String   @id @default(cuid())
  organizationId     String
  renterId           String   @unique
  email              String
  emailNormalized    String
  phone              String?
  passwordHash       String
  status             TenantPortalAccountStatus @default(INVITED)
  mustChangePassword Boolean  @default(true)
  lastLoginAt        DateTime?
  emailVerifiedAt    DateTime?
  createdByUserId    String
  suspendedAt/suspendedByUserId, disabledAt/disabledByUserId
  createdAt/updatedAt

  @@unique([organizationId, emailNormalized])
  @@index([organizationId, status])
}
```

`renterId` is `@unique` (one account per renter, per Step 3 above).
`Renter.tenantPortalAccount TenantPortalAccount?` is the optional
back-relation used by the internal admin UI (§25) to check "does this
renter already have an account". The relation is `onDelete: Restrict`:
a Renter with a portal account can never be hard-deleted while the
account exists, matching this codebase's established no-silent-orphan
convention elsewhere (e.g. `Contract.unitId`/`renterId`).

`createdByUserId`/`suspendedByUserId`/`disabledByUserId` are plain
`String` columns pointing at the internal `User` who performed the
action - deliberately **not** FKs, mirroring the same "plain string actor
field, no fabricated relation" convention `MaintenanceRequest.createdByUserId`
already established for tenant-originated rows (§17) - here used in the
opposite direction (an internal actor acting on a tenant record).

Migration: `prisma/migrations/20261110090000_tenant_portal_account/` -
see §34 for a pre-existing, unrelated shadow-database ordering issue
discovered (not caused) while applying it.

## 5. Credential and session architecture: two independent NextAuth instances

`src/lib/tenant-auth.ts` constructs a **second**, fully independent
`NextAuth({...})`:

| | Internal (`src/lib/auth.ts`) | Tenant (`src/lib/tenant-auth.ts`) |
|---|---|---|
| Session shape | `{ user: { id, role, organizationId, ... } }` | `{ tenant: { id, organizationId, renterId, email } }` |
| Signing secret | `AUTH_SECRET` | `TENANT_AUTH_SECRET`, or `AUTH_SECRET + "::tenant-portal"` if unset - never equal to the internal secret |
| Cookie name | NextAuth's default (`authjs.session-token`) | `tenant-portal.session-token` |
| `basePath` | `/api/auth` (default) | `/api/portal-auth` |
| Sign-in page | `/login` | `/portal/login` |

This is the actual mechanism (not a naming convention) that keeps an
internal staff session and a tenant session from ever being confused in
the same browser: a stolen/replayed internal JWT cannot be verified by the
tenant instance's secret and vice versa, and the two live in physically
different cookies so a browser can hold both simultaneously without either
overwriting the other. `src/app/api/portal-auth/[...nextauth]/route.ts`
exposes the tenant instance's `handlers`; the internal instance's own
route is untouched.

Credential verification itself (`authorize()`'s actual rule) is factored
into `src/lib/tenant-credentials.ts`'s `verifyTenantCredentials()` -
deliberately a **separate module from `tenant-auth.ts`**, which
constructs the full NextAuth object at import time and therefore pulls in
`next-auth`/`next/server` (unresolvable outside an actual Next.js server
runtime). This split, mirroring `src/lib/auth-session-refresh.ts`'s
existing precedent of keeping security-critical logic out of the
framework-construction file, is what makes `verifyTenantCredentials()`
directly callable from a real-DB test
(`src/lib/actions/__dbtests__/tenant-portal-auth.db.test.ts`) without
needing to drive NextAuth's own HTTP layer.

Rule: only an **ACTIVE** account may authenticate. `INVITED` (not yet
activated), `SUSPENDED`, and `DISABLED` all fail with an identical
outcome to "no such account" - `LOGIN_FAILED` is still audited
server-side with a `reason: "inactive_account"` metadata tag, but nothing
about the failure is ever observable by the client (§9's anti-enumeration
principle applied to login, not just resource access - Step 57).

## 6. Stale-session hardening (mirrored, not shared)

`src/lib/tenant-session-refresh.ts` is a structural mirror of
`src/lib/auth-session-refresh.ts`: `TENANT_SESSION_REVALIDATE_INTERVAL_MS`
(5 minutes), `shouldRevalidateTenantSession()`, and
`refreshTenantSessionClaims()`, called from the JWT callback in
`tenant-auth.ts`. A suspended or disabled account loses portal access
within 5 minutes of an existing session, never waiting out the JWT's full
`maxAge` - verified live (see §32) and in
`tenant-portal-auth.db.test.ts`. Kept as an entirely separate module/
constant from the internal version so the two revalidation policies can be
tuned independently and a change to one never silently changes the other.

## 7. `src/proxy.ts`: the internal-staff gate must exclude `/portal/*` entirely

**Found and fixed during this module's own live verification (§32), not
present before this task started to matter:** `src/proxy.ts` (this
codebase's route-protection layer - Next.js 16 renamed `middleware.ts` to
`proxy.ts`, see `AGENTS.md`) wraps the entire app in one `auth((req) =>
{...})` check against the **internal** session, redirecting any
unauthenticated request to `/login` - with a matcher that excludes only
`api`/`_next`/static-file paths. Before this task, no route under
`/portal/*` existed, so the gap was latent. The moment `/portal/login`
existed, this internal-only check silently redirected every tenant,
including on the public login page itself, to the internal `/login` page
- the portal was completely unreachable. Fixed by an explicit early
return: `if (req.nextUrl.pathname.startsWith("/portal")) return
NextResponse.next();` - the portal's own protected-route boundary
(`requireTenantSession()`, applied once in
`src/app/portal/(portal)/layout.tsx`) is the correct and sufficient gate
for `/portal/*`, and the internal gate must never evaluate a tenant's
request against the internal session at all.

## 8. Entitlement architecture: never trust an id, always re-derive

`src/lib/tenant-session.ts` is the tenant portal's **only** authorization
boundary - it never imports or calls `requirePermission()`/
`requireSession()` from `src/lib/session.ts`, and nothing in
`src/lib/session.ts` is ever imported into any `/portal` code path (or
vice versa).

- `requireTenantSession()` reads the signed tenant JWT; if absent, it
  `redirect()`s to `/portal/login` (see the box in §32 for why this is a
  `redirect()`, not a bare throw, unlike the internal `requireSession()`'s
  own convention).
- `requireTenantPrincipal()` returns `{ tenantAccountId, organizationId,
  renterId }` - **always** from the signed session, **never** from a
  client-supplied field.
- Six resource-specific helpers - `requireTenantContractAccess`,
  `requireTenantInvoiceAccess`, `requireTenantMaintenanceAccess`,
  `requireTenantMoveInAccess`, `requireTenantMoveOutAccess`,
  `requireTenantSettlementAccess` - each re-query the database fresh on
  every call: `findFirst({ where: { id, organizationId, renterId } })`,
  all three conditions taken from the session, never from the id's own
  row or any join alone. **Organization scoping alone is deliberately
  treated as insufficient** (the brief's own explicit instruction): every
  check also requires `renterId` to match, so a same-organization
  tenant-to-tenant attack is blocked exactly as a cross-organization one
  is - proven in `tenant-portal-same-org-isolation.db.test.ts` (§31),
  the single most important test file in this module.

## 9. Anti-enumeration: one neutral outcome, everywhere

Every entitlement-helper miss calls Next's own `notFound()` (not a custom
thrown class) - `src/app/portal/(portal)/not-found.tsx` then renders one
neutral page inside the tenant's own portal shell. The exact same page
renders whether an id is malformed, belongs to another tenant in the same
organization, or belongs to another organization entirely - verified live
by direct URL attack (§32): both a same-org and a cross-org attempt to
open another tenant's Contract produced pixel-identical Not Found pages,
with the requesting tenant's own nav/session state fully intact.

## 10. Tenant-safe DTOs: data minimization at the query, not the render

Every read in `src/lib/actions/portal/*.ts` uses a dedicated Prisma
`select` (e.g. `TENANT_CONTRACT_SELECT` in `tenancy.ts`,
`MAINTENANCE_REQUEST_SELECT` in `maintenance.ts`) that explicitly lists
only the fields a tenant may see - `Contract.notes` (internal-only),
owner/ownership data, `Invoice.zatcaResponse`/hash-chain fields,
`MoveOut.findingsReviewedByUserId`/internal workflow timestamps, and
every staff-identity field are never selected in the first place. No page
or action ever fetches a full Prisma record and hides fields in the
React tree - the minimization boundary is the database query.

## 11. Route namespace and shell

`src/app/portal/login/page.tsx` (public, sibling) vs.
`src/app/portal/(portal)/layout.tsx` (a route group whose layout calls
`requireTenantSession()` once, wrapping every other `/portal/*` page) -
directly mirrors the existing internal pattern of `src/app/login/page.tsx`
vs. `src/app/(app)/layout.tsx`. The layout renders a completely separate
shell (own nav items, own branding pull via
`getTenantOrganizationBranding()` - name/logo only, never internal
organization configuration like VAT number), reusing `MobileSidebarShell`/
`NavLink`/`LanguageSwitcher`/`PrintButton` directly (all generic/prop-
driven enough that mobile responsiveness and bilingual switching came for
free, with zero new mobile-specific code).

## 12. "Current tenancy" - one definition, reused everywhere

`selectCurrentTenancy()` (`src/lib/portal/tenancy-rules.ts`, 12 unit
tests) is the single authoritative definition: prefers the sole `ACTIVE`
contract, else falls back to the most-recently-ended by `endDate`. Used
identically by the dashboard, `/portal/contracts`, payments, move-in,
move-out, and security-deposit pages - no page ever reinvents "what is
the tenant's current contract," and `getTenantContracts()` additionally
exposes the full historical list (`{ current, historical }`) for a tenant
with multiple past leases.

## 13. Dashboard (`/portal`)

`getTenantDashboard()` (`src/lib/actions/portal/dashboard.ts`) - current
contract summary, unit, next payment due, outstanding balance (§15), open
maintenance count, Move-In/Move-Out status badges, deposit position with
visibility already applied (§20), and the 5 most recent receipts. Every
query is bounded (a handful of `take`-limited reads plus aggregates over
already-organizationId+renterId-scoped rows), mirroring the internal
`getDashboardStats()`/`getOperationsDashboard()` convention - see §33.

## 14. Contracts (`/portal/contracts`, `/portal/contracts/[id]`)

Current tenancy plus full historical list; detail view shows unit,
dates, rent, payment frequency, security deposit (contractual figure,
not the ledger balance - see §20), and, when the contract was itself
produced by a renewal, a link to the contract it renewed into
(`renewedIntoContract`). `Contract.notes` and every internal/owner field
are never selected (§10).

## 15. Payment schedule, Invoices, Receipts, outstanding balance

`getTenantPaymentSchedule()` reuses the schedule's own authoritative
`status` column (kept correct elsewhere by `recomputeScheduleStatus()`),
never recomputed independently here. `getTenantInvoices()`/
`getTenantInvoiceDetail()` exclude ZATCA hash-chain/internal fields but
keep the QR code (a tenant-facing artifact by design).
`getTenantOutstandingBalance()` is the **one** authoritative balance
calculation (`computeTenantOutstandingBalance()`,
`src/lib/portal/tenancy-rules.ts`), computed from the exact same Invoice
rows `getTenantInvoices()` itself reads - never summed again ad hoc on a
page, so the dashboard and the invoices page can never disagree.

## 16. Move-In (`/portal/move-in`) - read-only

`getTenantMoveIn()` is a pure read; the tenant never initiates, edits, or
acknowledges a Move-In through the portal - the existing internal
"operational acknowledgement" workflow (`recordStaffAcknowledgement`/
`setTenantAcknowledgementOverride`) is never turned into anything
resembling a legal e-signature flow here (explicitly out of scope - see
§29). Internal notes and staff identity fields are excluded (§10).

## 17. Maintenance requests - the one tenant-initiated mutation

`createTenantMaintenanceRequest()` (`src/lib/actions/portal/maintenance.ts`)
is the portal's **only** mutation. Its Zod schema
(`category/priority/title/description/preferredVisitDate/
preferredTimeWindow/permissionToEnter`) accepts **zero** location or
ownership fields - there is structurally nothing in the form for a
hostile client to inject `unitId`/`contractId`/`renterId`/`organizationId`
into (verified directly in `tenant-portal-maintenance-mutation.db.test.ts`
by submitting exactly those field names anyway and confirming the created
row still derives entirely from the session). `unitId`/`contractId` come
from `selectCurrentTenancy()` (§12) over the session's own
`organizationId`/`renterId`; the request is rejected outright, with no
row created, when the tenant has no `ACTIVE` current contract.
`source: "TENANT"`, `reportedByType: "TENANT"`, `status: "OPEN"`; no
`assignedToUserId`/cost/vendor field is ever settable, and no
`MaintenanceWorkOrder` is ever created by this action - internal triage
(`maintenance.request.triage`) remains the only path to any of those.
`createdByUserId` is a plain string, `` `tenant:${tenantAccountId}` `` -
no FK, no fabricated internal `User` row (mirrors the AuditLog convention
in §19). A matching `AuditLog` row (`userRole: "TENANT"`, `userId: null`)
traces the action without inventing an internal identity.

## 18. Maintenance request cancellation

`cancelTenantMaintenanceRequest()` only succeeds while
`isTenantCancellableMaintenanceStatus(status)` is true (`OPEN` only,
`src/lib/portal/tenancy-rules.ts`) - a dedicated action, never a generic
status-update endpoint a tenant could otherwise misuse to reach any other
status. Sets `cancelReason: "TENANT_WITHDREW"`. Attempting to cancel a
request that has already progressed past `OPEN` (internal triage took
over) is rejected and the row is left untouched - verified in
`tenant-portal-maintenance-mutation.db.test.ts`.

## 19. Move-Out (`/portal/move-out`) - read-only, findings ≠ charges

`getTenantMoveOut()` is a pure read - the tenant never initiates a
Move-Out. A finding is shown only as an observed condition; the tenant
view never labels anything a "Tenant Charge" - that label (and the
financial deduction it implies) only ever appears on an **APPROVED**
`SecurityDepositSettlement` assessment, a completely separate read (§20).
`Finding ≠ Tenant Liability ≠ Financial Deduction` is preserved exactly:
Move-Out's own internal workflow fields (`findingsReviewedByUserId`,
internal notes, staff identity) are excluded (§10).

## 20. Security Deposit - visibility-by-status, one policy, applied once

`settlementVisibilityForTenant()` (`src/lib/portal/tenancy-rules.ts`, unit
tested across the full status enum) is the single, centralized,
documented policy every settlement-reading call site uses - the
dashboard's deposit-position summary and `getTenantSettlement()` alike,
never duplicated per call site:

| Settlement status | Tenant visibility |
|---|---|
| DRAFT / UNDER_REVIEW / PENDING_APPROVAL / CANCELLED | **HIDDEN** - nothing shown, not even that a settlement exists |
| APPROVED | **APPROVED_PENDING_POSTING** - figures are final but not yet posted |
| POSTED / PARTIALLY_SETTLED / SETTLED | **FINAL** - the full final view, including refund paid/remaining |

Only `TENANT`-responsibility, **approved** assessments are ever included
(never `OWNER`/`PROPERTY_MANAGEMENT`/`VENDOR`/`WARRANTY`/`UNDETERMINED`/
`NO_CHARGE`, never a proposed-but-unapproved amount, never a disputed
one). Deposit **position** (required vs. available, from the real ledger)
is shown independently of settlement visibility - a tenant can always see
their own deposit balance, which is not itself sensitive commercial
information. Verified end-to-end through the real workflow actions
(`tenant-portal-settlement-visibility.db.test.ts`): DRAFT → HIDDEN,
CANCELLED → still HIDDEN, APPROVED → APPROVED_PENDING_POSTING (with the
correct approved assessment amount), POSTED → FINAL (with refund fields
populated).

## 21. Printable documents

`/portal/security-deposit/statement` is the one printable document built
in this pass - it re-reads through the exact same authorization- and
visibility-gated actions (`getTenantContracts`, `getTenantDepositPosition`,
`getTenantSettlement`) the interactive page itself uses (re-verifying
authorization on every request, never caching a prior grant), and reuses
the existing `PrintButton` component and organization-branding pull -
no calculation logic is duplicated for print. Invoice/receipt/Move-In/
Move-Out printable views were not built as separate documents in this
pass (the interactive detail pages already show the same read-only data);
if a distinct printable layout is wanted for those later, follow this
same pattern (re-verify authorization, reuse existing calculation code).

## 22. Profile (`/portal/profile`) - read-only by default

`getTenantProfile()`/`updateTenantContactPhone()`/`changeTenantPassword()`
(`src/lib/actions/portal/profile.ts`). Deliberately conservative:
`Renter.fullName`/`idType`/`idNumber`/`vatNumber` (company registration)
and the account's own login email are all **read-only** - no verification
workflow exists yet for changing an identity-critical field safely, so
none is exposed as editable. The one genuinely safe edit is the portal
account's **own** contact phone (`TenantPortalAccount.phone`) - a
separate field from `Renter.phone`, which stays the staff-managed
official lease contact and is never touched by this action. Password
change requires the current password (`bcrypt.compare` against the
existing hash) and clears `mustChangePassword`; no password-reset email
flow exists (no email-delivery infrastructure exists anywhere in this
codebase - see §27), so a forgotten password is a staff-assisted
`resetTenantPortalAccountPassword()` (§24) exactly like account creation.

## 23. Corporate renter support

A corporate tenant is signaled purely by the existing `Renter.vatNumber`
field (already the codebase's individual-vs-corporate signal for
ZATCA invoicing) - the profile page shows the VAT/company-registration
number as read-only context when present. No sub-user concept, no
separate corporate login flow, no Corporate Housing Portal (see §29) -
V1 is one `TenantPortalAccount` per `Renter` regardless of corporate
status, exactly as decided in §1.

## 24. Internal admin account management actions

`src/lib/actions/tenant-portal-account.ts` - gated by ordinary internal
`requirePermission("tenantPortalAccount.*")` (§26), completely separate
authorization from anything a tenant can do to their own account.

- `createTenantPortalAccount()` - generates a temporary credential
  server-side (`randomBytes(9).toString("base64url")`, 12 characters) and
  returns it to the caller **exactly once**; no email-delivery
  infrastructure exists anywhere in this codebase, so this never pretends
  to send an invitation email. The account starts `INVITED`, not `ACTIVE`
  - login is blocked until a separate, deliberate
  `activateTenantPortalAccount()` call, giving staff a review step
  between "credential generated" and "tenant can actually sign in."
  Rejects a renter that already has an account, and a duplicate email
  within the same organization.
- `activateTenantPortalAccount()` / `suspendTenantPortalAccount()` /
  `disableTenantPortalAccount()` - each takes a `FormData` with a hidden
  `accountId` input (matching this codebase's established direct-`<form
  action={...}>` convention, e.g. `cancelTenantMaintenanceRequest()`), and
  only permits the exact transitions `ACCOUNT_TRANSITIONS` defines:
  `INVITED→ACTIVE`, `ACTIVE⇄SUSPENDED`, either→`DISABLED`, and `DISABLED`
  is terminal (no reactivation path - a genuinely mistaken disablement is
  a rare, deliberate future exception, not a routine UI action).
  Suspending or disabling an ACTIVE account blocks login **immediately**
  (verified live and in `tenant-portal-account-admin.db.test.ts`) - not
  merely "on next JWT expiry," because §6's stale-session revalidation
  additionally re-checks status within 5 minutes even for an already
  -established session.
- `resetTenantPortalAccountPassword()` - issues a **new** temporary
  password (never displays or returns the old one) and sets
  `mustChangePassword: true`; the old credential stops working
  immediately, verified live (§32) and in the same test file.

Every action re-verifies `organizationId` server-side; staff in one
organization cannot view or act on another organization's tenant accounts
(`tenant-portal-account-admin.db.test.ts`, "Cross-organization isolation").

## 25. Internal admin UI integration

A "Tenant Portal Access" panel (`src/components/tenant-portal-account-panel.tsx`)
on the Contract edit page (`src/app/(app)/contracts/[id]/edit/page.tsx`),
gated by `tenantPortalAccount.view`. Shows account status/email/last
login when one exists, a Create form (email/phone) when none does, and
Activate/Suspend/Disable/Reset-Password buttons - each rendered only when
both the current transition is actually permitted (`ALLOWED_TRANSITIONS`,
mirroring the server's own `ACCOUNT_TRANSITIONS`) **and** the signed-in
staff member's role holds the matching permission, so a MANAGER never
sees a Disable/Reset-Password button they'd be rejected for anyway.

**The one-time password reveal** (Create and Reset Password both return
a plaintext credential that must be shown to staff exactly once): solved
with `useActionState` (React 19), the only client component this pass
introduced. The revealed password lives only in that component's
in-memory render state - never a URL parameter, never `localStorage`,
never logged - and is discarded the moment the admin navigates away or
closes the reveal box. Verified live in Arabic (§32): the reveal panel,
its "shown once, not stored anywhere retrievable" warning text, and the
generated password itself all render correctly.

## 26. RBAC / permission matrix

Six new permissions (`docs/PERMISSIONS.md` §2/§3 fully updated):
`tenantPortalAccount.view` (all five roles), `.create`/`.activate`/
`.suspend` (OWNER/ADMIN/MANAGER - the same operational tier as
Move-In/Move-Out/Maintenance elsewhere), `.disable`/`.resetPassword`
(OWNER/ADMIN only - the same high-trust tier that already gates
`settings.update` and `securityDeposit.approve`). No
`tenantPortalAccount.delete` - an account is never deleted (§4).

## 27. No public self-registration; login rate limiting

No public sign-up flow exists anywhere - the only way a `TenantPortalAccount`
is created is the internal admin action in §24. Login rate limiting was
assessed and deliberately **not implemented** in this pass: see
`docs/TECHNICAL-DEBT.md` P3 #1 for the documented reasoning (no safe
single-process limiter exists without shared state this codebase doesn't
yet have; both login paths already share bcrypt's own cost-factor
slowdown and an identical generic-failure response with no
username-enumeration oracle).

## 28. Forbidden financial/operational mutations - confirmed absent

No portal action creates, records, reverses, or cancels a `Payment`; no
portal action issues or cancels an `Invoice`; no portal action approves,
posts, or records a refund against a `SecurityDepositSettlement`; no
portal action starts, completes, or edits a `MoveIn`/`MoveOut`. Verified
directly: `tenant-portal-maintenance-mutation.db.test.ts`'s "Financial
read-only regression" asserts zero `Payment`/`Invoice`/
`SecurityDepositSettlement`/`SecurityDepositRefund` rows exist anywhere
in the test organization after every tenant action in that file has run.

## 29. No feature creep - explicitly confirmed out of scope

Not built, and not attempted: Owner Portal, Corporate Housing Portal,
corporate sub-users, tenant self-registration, contract-number-based
account claiming, a payment gateway or any online card payment, bank
integration/Open Banking, WhatsApp/email/SMS/push automation, an AI
chatbot or AI maintenance diagnosis, tenant settlement dispute
submission, a tenant notice-to-vacate flow, e-signature, a Document
Management system, real object storage, an online refund request flow, a
Vendor Portal, owner accounting changes, a new General Ledger, or
impersonation. `docs/TECHNICAL-DEBT.md`'s "Explicitly not addressed"
section is updated to reflect the Tenant Portal as now built (mirroring
how Maintenance/Move-Out/Security-Deposit-Settlement were each noted once
built).

## 30. Bilingual coverage

Every visible string flows through the single `Dictionary` interface -
a `tenantPortal` block (~160 keys: shell/nav/login/dashboard/contracts/
finance/move-in/maintenance/move-out/security-deposit/profile/admin-
integration/errors) plus a new `tenantPortalAccountStatus` enum map, both
with full `en.ts`/`ar.ts` implementations (TypeScript's structural typing
enforces 1:1 parity - a missing key in either fails the build). No
hardcoded visible string exists in any `/portal` page or the admin
integration panel. Live-verified in both directions (§32): full RTL
layout mirroring (sidebar on the right, Arabic-Indic numerals, correct
date formatting) in Arabic, and normal LTR in English.

## 31. Real-DB test suite

Six new `.db.test.ts` files plus one pure unit-test file (54 real-DB
tests, 5 pure unit tests, all passing alongside the existing 355 real-DB
+ 414 unit tests project-wide with zero regressions):

- `tenant-portal-cross-org-security.db.test.ts` (11) - Org B's tenant
  against every entity type belonging to Org A.
- `tenant-portal-same-org-isolation.db.test.ts` (11) - **the critical
  test**: two tenants, one organization; Tenant B against every entity
  type belonging to Tenant A (Contract/Invoice/Payment/
  MaintenanceRequest/MoveIn/MoveOut/Settlement).
- `tenant-portal-maintenance-mutation.db.test.ts` (8) - derivation
  correctness, injection resistance, no-active-tenancy rejection,
  cancellation state-machine, financial read-only regression.
- `tenant-portal-settlement-visibility.db.test.ts` (5) - the visibility
  policy wired through the real workflow (§20).
- `tenant-portal-auth.db.test.ts` (11) - login success/wrong-password/
  INVITED/SUSPENDED/DISABLED/nonexistent-email, case-insensitive email,
  and stale-session revalidation (active/suspended/disabled/nonexistent).
- `tenant-portal-account-admin.db.test.ts` (8) - the internal admin
  action layer, including its own cross-org isolation.
- `src/lib/tenant-session-refresh.test.ts` (5, pure) - the revalidation
  timing function.

`src/lib/actions/__dbtests__/tenant-portal-test-helpers.ts` adds
`createTestTenantAccount()`, `tenantSessionFor()`, and `seedTenancy()`
(a second independent tenancy inside an already-seeded organization) to
the shared fixture library, reusing every existing helper
(`seedFullOrg`, `createTestContract`, `driveMoveInToCompletion`,
`driveMoveOutToCompletion`, `payDepositInvoice`) rather than duplicating
fixture logic.

## 32. Live verification results

A dedicated dev-server session (disposable fixtures, cleaned up
afterward) with a real Chromium browser (Playwright) confirmed, beyond
what the automated suite covers:

- **Two real bugs found and fixed during this pass, not before it**:
  §7 (`src/proxy.ts` made the entire portal unreachable) and §8's
  `requireTenantSession()` (a raw throw produced a raw Next.js dev-mode
  error overlay, including a source-code snippet and file path, on the
  very first thing a real tenant would hit after a session expires or a
  logout - changed to `redirect("/portal/login")`, since unlike the
  internal app, `/portal/*` has no middleware-level protection to make
  this path theoretically unreachable). Both are now covered by this
  document and by the live re-verification below.
- **EN walkthrough** (Tenant A1): login → dashboard (all KPIs correct,
  including a live "Open Maintenance Requests: 1" after the next step) →
  Contracts → **created a real maintenance request through the browser**
  (category/title/description, no location fields in the form at all) →
  redirected to its detail page (status OPEN, correct request number,
  Cancel Request available) → Profile (read-only identity fields
  correctly non-editable, Last Login correctly showing today's date).
- **Live IDOR attack, both directions**: while authenticated as Tenant
  A1, direct URL navigation to Tenant A2's contract (same organization)
  and to Tenant B1's contract (a different organization) both produced
  the **exact same, pixel-identical** neutral Not Found page inside
  Tenant A1's own portal shell - no distinguishable signal between the
  two attack types, confirming §9 end-to-end through a real browser, not
  just the test suite.
- **Logout / session termination**: signing out redirected to
  `/portal/login`; a subsequent direct visit to `/portal` correctly
  redirected back to `/portal/login` rather than serving any cached or
  stale portal content.
- **AR (RTL) walkthrough** (Tenant B1): full right-to-left layout
  mirroring (sidebar on the right, Arabic digits, Arabic date
  formatting), correct unit/contract numbers for that tenant.
- **Internal admin integration, live, in Arabic**: logged in as internal
  ADMIN, opened a Contract's edit page, saw the "الوصول إلى بوابة
  المستأجر" (Tenant Portal Access) panel showing the correct account
  email/status/last-login and exactly the Suspend/Disable/Reset-Password
  buttons an ACTIVE account with ADMIN's full permission set should show
  (no Activate button, since ACTIVE has no such transition). Clicked
  Reset Password and confirmed the one-time reveal panel (§25) rendered
  correctly with the generated credential and its "shown once" warning,
  fully localized.

## 33. Performance / index decisions

`@@index([organizationId, status])` on `TenantPortalAccount` supports the
internal admin panel's per-renter lookup pattern and any future
"list accounts by status" report. Every tenant-facing dashboard/list
query is either a single `findFirst`/`findUnique` (already indexed via
existing `organizationId`/`renterId`/`contractId` indexes on
Contract/Invoice/Payment/MaintenanceRequest) or a small, `take`-bounded
list (recent receipts) - no unbounded scan was introduced, mirroring the
internal dashboard's own post-hardening bounded-query convention
(`docs/TECHNICAL-DEBT.md`'s now-fixed P1 dashboard item).

## 34. Pre-existing issue discovered (not introduced) while migrating

Applying this module's migration surfaced a pre-existing shadow-database
migration-ordering bug (the Security Deposit Settlement migration is
timestamped before the Move-Out Management migration it actually depends
on) - worked around via `prisma migrate diff --from-url` +
`db execute` + `migrate resolve --applied` rather than touching already
-applied migration history, and does not affect the real, incremental
`migrate deploy` path used by CI/production/the real-DB test suite
(confirmed: all 46 `.db.test.ts` files, including the six new ones, ran
clean against it). Fully documented as a new P2 item in
`docs/TECHNICAL-DEBT.md`.

## 35. Remaining risks and technical debt

- No login rate limiting on either `/login` or `/portal/login` -
  documented, not fixed, in `docs/TECHNICAL-DEBT.md` P3 #1 (§27).
- No password-reset-by-email flow (no email infrastructure exists
  anywhere in this codebase) - a forgotten password is staff-assisted
  (§24), by design, not an oversight.
- Printable documents were built for the Security Deposit Statement only
  (§21) - Invoice/Receipt/Move-In/Move-Out printable layouts, if wanted,
  should follow the same re-verify-authorization pattern.
- The pre-existing shadow-database migration-ordering issue (§34) -
  documented, does not affect production/CI/test correctness.
- No structured application logging exists anywhere in this codebase
  (a pre-existing, already-documented gap, `docs/TECHNICAL-DEBT.md` P3
  #2) - tenant login/logout events are captured in `AuditLog`, which
  remains the only operational visibility into tenant portal activity.

## 36. Production readiness and final recommendation

**Blockers before a public production deployment**, beyond this
module's own scope: login rate limiting (§27/§35) should be revisited
once a shared-state store is available for the whole app, and
`TENANT_AUTH_SECRET` should be set to a distinct value (rather than the
`AUTH_SECRET`-derived default) in any real deployment, per the comment in
`src/lib/tenant-auth.ts`.

**Within this module's own scope**: schema, dual-principal
authentication, entitlement/anti-enumeration architecture, data
minimization, the one tenant mutation and its cancellation, all read-only
views with their documented visibility policies, the internal admin
account-management workflow (actions and UI, including the one-time
credential reveal), full bilingual coverage, RBAC, and a comprehensive
real-DB test suite (54 new tests, 355 project-wide, zero regressions) are
all complete and verified - both by the automated suite and by a live
browser session that found and fixed two genuine bugs (`src/proxy.ts`'s
scope, and the login-redirect UX) neither the automated suite nor a code
read alone would have caught, since both were config/framework-layer
issues rather than business-logic issues. `prisma validate`, `tsc
--noEmit`, `eslint`, the full unit-test suite, the full real-DB suite,
and `next build` are all clean.

**READY FOR OWNER PORTAL DEVELOPMENT.**

Per the brief's explicit closing instruction: **STOP here. Do not start
Owner Portal work in this session.**
