# Role-Based Access Control (RBAC)

This document describes the permission system introduced in `src/lib/permissions.ts`
and `src/lib/session.ts`. It replaces the previous state, where the `UserRole`
column existed on `User` but was never actually checked anywhere.

## 1. Available roles

Defined by the `UserRole` enum in `prisma/schema.prisma` (unchanged):

- `OWNER`
- `ADMIN`
- `MANAGER`
- `ACCOUNTANT`
- `VIEWER`

## 2. Available permissions

Permissions are typed as the `Permission` union in `src/lib/permissions.ts`,
one per resource + action:

```
dashboard.view

property.view / property.create / property.update / property.delete
unit.view     / unit.create     / unit.update     / unit.delete
renter.view   / renter.create   / renter.update   / renter.delete

contract.view / contract.create / contract.update / contract.renew / contract.terminate

invoice.view  / invoice.create  / invoice.cancel
payment.view  / payment.create

report.view

settings.view / settings.update

owner.view    / owner.create    / owner.update
ownership.view / ownership.manage
ownerLedger.view / ownerLedger.create / ownerLedger.reverse

audit.view / audit.export

lead.view / lead.create / lead.update / lead.assign / lead.convert / lead.archive
leadActivity.view / leadActivity.create

viewing.view / viewing.create / viewing.update / viewing.assign / viewing.complete / viewing.cancel

offer.view / offer.create / offer.update / offer.submit / offer.approve / offer.send / offer.revise / offer.accept / offer.reject / offer.cancel

reservation.view / reservation.create / reservation.update / reservation.confirm / reservation.cancel / reservation.release / reservation.amount.update / reservation.convert

moveIn.view / moveIn.create / moveIn.update / moveIn.start / moveIn.complete / moveIn.cancel / moveInInspection.update

maintenance.view
maintenance.request.create / maintenance.request.update / maintenance.request.triage / maintenance.request.cancel
maintenance.workOrder.create / maintenance.workOrder.assign / maintenance.workOrder.update / maintenance.workOrder.start / maintenance.workOrder.complete / maintenance.workOrder.verify / maintenance.workOrder.close / maintenance.workOrder.cancel
maintenance.cost.view / maintenance.cost.manage
maintenance.vendor.view / maintenance.vendor.manage

moveOut.view / moveOut.create / moveOut.update / moveOut.start / moveOut.complete / moveOut.cancel / moveOutInspection.update

securityDeposit.view / securityDeposit.create / securityDeposit.assess / securityDeposit.review / securityDeposit.approve / securityDeposit.post / securityDeposit.refund.view / securityDeposit.refund.manage / securityDeposit.dispute.manage
```

The `owner.*`/`ownership.*`/`ownerLedger.*` keys were added for the internal
ownership & owner-accounting foundation (see
`docs/OWNERSHIP-ACCOUNTING.md`). There is no `owner.delete` - owners are
soft-deleted (only when they have no ownership/ledger history at all) or
deactivated, both gated by `owner.update`; there was no separate permission
requested for that distinction. `ownership.manage` covers both creating a
new ownership assignment and ending one (a single "manage" permission,
mirroring how `settings.update` covers every settings field rather than one
permission per field).

`audit.view`/`audit.export` gate the new `/audit-logs` page (see
`docs/AUDIT-AND-FINANCIAL-CONTROLS.md`). There is deliberately no
`audit.create`/`audit.update`/`audit.delete` - audit rows are written only
by the system itself (`src/lib/audit.ts`), never by a user-facing action, so
no permission for those verbs exists at all. `audit.export` is granted only
to OWNER/ADMIN (via `ALL_PERMISSIONS`) - MANAGER/ACCOUNTANT can view the
audit log filtered to their category but not export it, per the brief's
"Optionally: audit.export" wording.

`lead.*`/`leadActivity.*` gate the CRM Leads foundation (see
`docs/CRM-LEADS.md`). MANAGER gets every CRM permission (full leasing-agent
CRM access, mirroring MANAGER's full operational access elsewhere).
ACCOUNTANT gets none at all - the brief's own policy explicitly excludes
ACCOUNTANT from CRM. VIEWER gets `lead.view` only (not `leadActivity.view`)
per the brief's literal "lead.view only" instruction: a VIEWER can see a
lead's core profile (contact info, requirements, budget, status) but not
its activity interaction history, mirroring how `owner.view` and
`ownerLedger.view` are separate grants elsewhere in this table. There is no
`lead.delete` - leads are archived (`lead.archive`, sets `status:
ARCHIVED`), never deleted, so no delete verb exists at all.

`viewing.*` gate the Viewing Management foundation (see
`docs/VIEWING-MANAGEMENT.md`). Policy mirrors `lead.*` exactly: OWNER/ADMIN/
MANAGER get every viewing permission, ACCOUNTANT gets none, and VIEWER gets
`viewing.view` only - consistent with VIEWER's `lead.view`-only grant above.
There is no `viewing.reschedule` or `viewing.noshow` permission:
rescheduling is gated by `viewing.update` (it's fundamentally an edit to
the same record) and marking a no-show is gated by `viewing.cancel` (it
closes out the viewing negatively, the same authorization tier as
cancelling it), rather than inventing a permission per verb.

`offer.*` gate the Leasing Offer Management foundation (see
`docs/LEASING-OFFERS.md`). ACCOUNTANT gets none at all, and VIEWER gets
`offer.view` only - deliberately mirroring `lead.*`/`viewing.*` exactly:
Offers are pre-contract commercial/negotiation data, and ACCOUNTANT's
financial visibility begins at Contract/Invoice stage, same policy as
Leads and Viewings. MANAGER holds every `offer.*` permission, **including
`offer.approve`** - unlike every other permission in this table, that one
is further restricted at the business-data layer, not the RBAC layer: a
MANAGER's `approveOffer()` call additionally checks
`canApproveDiscount(role, discountPercentage)`
(`src/lib/crm/offer-rules.ts`), which returns `false` for MANAGER above a
10% discount even though the flat permission grant passes. This was a
deliberate choice per `docs/LEASING-OFFERS.md` §6/§13: the brief asks for
"MANAGER can create offers but cannot self-approve >10% discount," which
is a data-dependent rule, not a role-only one - representing it as an RBAC
permission split (e.g. a separate `offer.approveHighDiscount`) would wrongly
imply *no* MANAGER can ever approve *any* discount, when the real rule is
threshold-based per offer. There is no `offer.delete`: offers are
cancelled (`offer.cancel`, terminal `CANCELLED` status) or superseded by a
revision, never deleted, matching the no-hard-delete policy `lead.*`/
`viewing.*` already established.

`reservation.*` gate the Reservation Management foundation (see
`docs/RESERVATION-MANAGEMENT.md`). MANAGER holds every `reservation.*`
permission, matching its full operational access to `lead.*`/`viewing.*`/
`offer.*`. VIEWER gets `reservation.view` only, same pattern as the other
three CRM modules. **ACCOUNTANT is the one deliberate exception**: unlike
`lead.*`/`viewing.*`/`offer.*` (ACCOUNTANT gets none of those), ACCOUNTANT
here gets `reservation.view` **and** `reservation.amount.update` - the
reservation amount is money-adjacent operational tracking (though never an
accounting entry - see `docs/RESERVATION-MANAGEMENT.md` §7), so ACCOUNTANT
is given visibility and the ability to mark it received/refunded/
forfeited, but not to create/submit/confirm/cancel/release a Reservation
itself (that stays an agency/CRM operational decision). There is no
`reservation.delete`: a Reservation row is never deleted (cancelled,
released, or lazily expired instead - all three preserve the row),
matching the no-hard-delete policy every other CRM module already
established.

`reservation.convert` gates Reservation → Contract conversion (see
`docs/RESERVATION-TO-CONTRACT.md`). OWNER/ADMIN/MANAGER only - the same
three roles as every other `reservation.*` mutation; ACCOUNTANT and
VIEWER do not get it, consistent with ACCOUNTANT's policy above (its
`reservation.*` grant stops at `view`/`amount.update`, never an
operational mutation) and VIEWER's read-only policy everywhere.

`moveIn.*`/`moveInInspection.update` gate the Move-In & Handover
Inspection foundation (see `docs/MOVE-IN-HANDOVER.md`). MANAGER holds
every `moveIn.*`/`moveInInspection.*` permission, matching its full
operational access to every other leasing-operations module in this
table (`contract.*`, `reservation.*`, etc.) - Move-In/handover is
day-to-day operations work, not CRM pipeline work. ACCOUNTANT gets only
`moveIn.view` (operational visibility, matching its broad `*.view` access
elsewhere - e.g. `contract.view`, `ownerLedger.view`), no mutation
permission at all. VIEWER gets `moveIn.view` only, same read-only pattern
as everywhere else in this table. `moveInInspection.update` is a
deliberately separate permission from `moveIn.update` (Step 44 of the
brief) - it specifically gates checklist/inventory/meter/key/attachment
data entry (the actual physical inspection work), while `moveIn.update`
gates higher-level record fields (scheduling, readiness flags,
acknowledgements). In practice every role that gets one gets the other
(OWNER/ADMIN/MANAGER), but keeping them separate matches the brief's own
instruction and leaves room for a future narrower "inspector" role to
hold only `moveInInspection.update` without full `moveIn.update`. There
is no `moveIn.delete`: a Move-In row is never deleted (only cancelled,
`moveIn.cancel`, which preserves the row), matching the no-hard-delete
policy every other module in this table already established.

`moveOut.*`/`moveOutInspection.update` gate Move-Out Management (see
`docs/MOVE-OUT-MANAGEMENT.md`). No new role was introduced. MANAGER holds
every `moveOut.*`/`moveOutInspection.*` permission, matching its full
operational access to Move-In/Maintenance/Contract elsewhere in this
table. ACCOUNTANT gets `moveOut.view` only (operational visibility,
matching its `moveIn.view`-only policy above), no mutation permission at
all. VIEWER gets `moveOut.view` only, same read-only pattern as
everywhere else. `moveOutInspection.update` is deliberately separate from
`moveOut.update`, mirroring `moveInInspection.update`'s own precedent
exactly - it gates the inspection/inventory/meter/key/attachment
workspace, while `moveOut.update` gates higher-level record fields
(scheduling, vacate date, findings-review advancement, acknowledgements).
There is no `moveOut.delete`: a Move-Out row is never deleted (only
cancelled, `moveOut.cancel`, which preserves the row), matching the
no-hard-delete policy every other module in this table already
established. Completing a Move-Out (`moveOut.complete`) is the sole
action anywhere in this codebase that may set `Unit.status = VACANT` -
see `docs/MOVE-OUT-MANAGEMENT.md` for the strict re-validation that
requires.

`property.update`, `unit.update`, and `renter.update` are defined for
completeness (the spec that introduced this system asked for them, and any
future edit action on those entities should be gated by them), but as of this
writing **no `updateProperty`/`updateUnit`/`updateRenter` server action
exists yet** - properties, units and renters currently only support
create/delete, not edit. When one is added, gate it with the matching
`*.update` permission; the permission key is already there waiting for it.

## 3. Role → permission matrix

| Permission | OWNER | ADMIN | MANAGER | ACCOUNTANT | VIEWER |
|---|:---:|:---:|:---:|:---:|:---:|
| dashboard.view | ✅ | ✅ | ✅ | ✅ | ✅ |
| property.view | ✅ | ✅ | ✅ | ✅ | ✅ |
| property.create | ✅ | ✅ | ✅ | ❌ | ❌ |
| property.update | ✅ | ✅ | ✅ | ❌ | ❌ |
| property.delete | ✅ | ✅ | ❌ | ❌ | ❌ |
| unit.view | ✅ | ✅ | ✅ | ✅ | ✅ |
| unit.create | ✅ | ✅ | ✅ | ❌ | ❌ |
| unit.update | ✅ | ✅ | ✅ | ❌ | ❌ |
| unit.delete | ✅ | ✅ | ❌ | ❌ | ❌ |
| renter.view | ✅ | ✅ | ✅ | ✅ | ✅ |
| renter.create | ✅ | ✅ | ✅ | ❌ | ❌ |
| renter.update | ✅ | ✅ | ✅ | ❌ | ❌ |
| renter.delete | ✅ | ✅ | ❌ | ❌ | ❌ |
| contract.view | ✅ | ✅ | ✅ | ✅ | ✅ |
| contract.create | ✅ | ✅ | ✅ | ❌ | ❌ |
| contract.update | ✅ | ✅ | ✅ | ❌ | ❌ |
| contract.renew | ✅ | ✅ | ✅ | ❌ | ❌ |
| contract.terminate | ✅ | ✅ | ✅ | ❌ | ❌ |
| invoice.view | ✅ | ✅ | ✅ | ✅ | ✅ |
| invoice.create | ✅ | ✅ | ✅ | ✅ | ❌ |
| invoice.cancel | ✅ | ✅ | ❌ | ✅ | ❌ |
| payment.view | ✅ | ✅ | ✅ | ✅ | ✅ |
| payment.create | ✅ | ✅ | ✅ | ✅ | ❌ |
| report.view | ✅ | ✅ | ✅ | ✅ | ✅ |
| settings.view | ✅ | ✅ | ❌ | ❌ | ❌ |
| settings.update | ✅ | ✅ | ❌ | ❌ | ❌ |
| owner.view | ✅ | ✅ | ✅ | ✅ | ✅ |
| owner.create | ✅ | ✅ | ✅ | ❌ | ❌ |
| owner.update | ✅ | ✅ | ✅ | ❌ | ❌ |
| ownership.view | ✅ | ✅ | ✅ | ✅ | ✅ |
| ownership.manage | ✅ | ✅ | ✅ | ❌ | ❌ |
| ownerLedger.view | ✅ | ✅ | ✅ | ✅ | ✅ |
| ownerLedger.create | ✅ | ✅ | ❌ | ✅ | ❌ |
| ownerLedger.reverse | ✅ | ✅ | ❌ | ✅ | ❌ |
| audit.view | ✅ | ✅ | ✅ (operational only) | ✅ (financial only) | ❌ |
| audit.export | ✅ | ✅ | ❌ | ❌ | ❌ |
| lead.view | ✅ | ✅ | ✅ | ❌ | ✅ |
| lead.create | ✅ | ✅ | ✅ | ❌ | ❌ |
| lead.update | ✅ | ✅ | ✅ | ❌ | ❌ |
| lead.assign | ✅ | ✅ | ✅ | ❌ | ❌ |
| lead.convert | ✅ | ✅ | ✅ | ❌ | ❌ |
| lead.archive | ✅ | ✅ | ✅ | ❌ | ❌ |
| leadActivity.view | ✅ | ✅ | ✅ | ❌ | ❌ |
| leadActivity.create | ✅ | ✅ | ✅ | ❌ | ❌ |
| viewing.view | ✅ | ✅ | ✅ | ❌ | ✅ |
| viewing.create | ✅ | ✅ | ✅ | ❌ | ❌ |
| viewing.update | ✅ | ✅ | ✅ | ❌ | ❌ |
| viewing.assign | ✅ | ✅ | ✅ | ❌ | ❌ |
| viewing.complete | ✅ | ✅ | ✅ | ❌ | ❌ |
| viewing.cancel | ✅ | ✅ | ✅ | ❌ | ❌ |
| offer.view | ✅ | ✅ | ✅ | ❌ | ✅ |
| offer.create | ✅ | ✅ | ✅ | ❌ | ❌ |
| offer.update | ✅ | ✅ | ✅ | ❌ | ❌ |
| offer.submit | ✅ | ✅ | ✅ | ❌ | ❌ |
| offer.approve | ✅ | ✅ | ✅ (≤10% discount only - see §2) | ❌ | ❌ |
| offer.send | ✅ | ✅ | ✅ | ❌ | ❌ |
| offer.revise | ✅ | ✅ | ✅ | ❌ | ❌ |
| offer.accept | ✅ | ✅ | ✅ | ❌ | ❌ |
| offer.reject | ✅ | ✅ | ✅ | ❌ | ❌ |
| offer.cancel | ✅ | ✅ | ✅ | ❌ | ❌ |
| reservation.view | ✅ | ✅ | ✅ | ✅ | ✅ |
| reservation.create | ✅ | ✅ | ✅ | ❌ | ❌ |
| reservation.update | ✅ | ✅ | ✅ | ❌ | ❌ |
| reservation.confirm | ✅ | ✅ | ✅ | ❌ | ❌ |
| reservation.cancel | ✅ | ✅ | ✅ | ❌ | ❌ |
| reservation.release | ✅ | ✅ | ✅ | ❌ | ❌ |
| reservation.amount.update | ✅ | ✅ | ✅ | ✅ | ❌ |
| reservation.convert | ✅ | ✅ | ✅ | ❌ | ❌ |
| moveIn.view | ✅ | ✅ | ✅ | ✅ | ✅ |
| moveIn.create | ✅ | ✅ | ✅ | ❌ | ❌ |
| moveIn.update | ✅ | ✅ | ✅ | ❌ | ❌ |
| moveIn.start | ✅ | ✅ | ✅ | ❌ | ❌ |
| moveIn.complete | ✅ | ✅ | ✅ | ❌ | ❌ |
| moveIn.cancel | ✅ | ✅ | ✅ | ❌ | ❌ |
| moveInInspection.update | ✅ | ✅ | ✅ | ❌ | ❌ |
| maintenance.view | ✅ | ✅ | ✅ | ✅ | ✅ |
| maintenance.request.create | ✅ | ✅ | ✅ | ❌ | ❌ |
| maintenance.request.update | ✅ | ✅ | ✅ | ❌ | ❌ |
| maintenance.request.triage | ✅ | ✅ | ✅ | ❌ | ❌ |
| maintenance.request.cancel | ✅ | ✅ | ✅ | ❌ | ❌ |
| maintenance.workOrder.create | ✅ | ✅ | ✅ | ❌ | ❌ |
| maintenance.workOrder.assign | ✅ | ✅ | ✅ | ❌ | ❌ |
| maintenance.workOrder.update | ✅ | ✅ | ✅ | ❌ | ❌ |
| maintenance.workOrder.start | ✅ | ✅ | ✅ | ❌ | ❌ |
| maintenance.workOrder.complete | ✅ | ✅ | ✅ | ❌ | ❌ |
| maintenance.workOrder.verify | ✅ | ✅ | ✅ | ❌ | ❌ |
| maintenance.workOrder.close | ✅ | ✅ | ✅ | ❌ | ❌ |
| maintenance.workOrder.cancel | ✅ | ✅ | ✅ | ❌ | ❌ |
| maintenance.cost.view | ✅ | ✅ | ✅ | ✅ | ❌ |
| maintenance.cost.manage | ✅ | ✅ | ✅ | ❌ | ❌ |
| maintenance.vendor.view | ✅ | ✅ | ✅ | ✅ | ❌ |
| maintenance.vendor.manage | ✅ | ✅ | ✅ | ❌ | ❌ |
| moveOut.view | ✅ | ✅ | ✅ | ✅ | ✅ |
| moveOut.create | ✅ | ✅ | ✅ | ❌ | ❌ |
| moveOut.update | ✅ | ✅ | ✅ | ❌ | ❌ |
| moveOut.start | ✅ | ✅ | ✅ | ❌ | ❌ |
| moveOut.complete | ✅ | ✅ | ✅ | ❌ | ❌ |
| moveOut.cancel | ✅ | ✅ | ✅ | ❌ | ❌ |
| moveOutInspection.update | ✅ | ✅ | ✅ | ❌ | ❌ |
| securityDeposit.view | ✅ | ✅ | ✅ | ✅ | ✅ |
| securityDeposit.create | ✅ | ✅ | ✅ | ❌ | ❌ |
| securityDeposit.assess | ✅ | ✅ | ✅ | ❌ | ❌ |
| securityDeposit.review | ✅ | ✅ | ✅ | ✅ | ❌ |
| securityDeposit.approve | ✅ | ✅ | ❌ | ❌ | ❌ |
| securityDeposit.post | ✅ | ✅ | ❌ | ✅ | ❌ |
| securityDeposit.refund.view | ✅ | ✅ | ❌ | ✅ | ✅ |
| securityDeposit.refund.manage | ✅ | ✅ | ❌ | ✅ | ❌ |
| securityDeposit.dispute.manage | ✅ | ✅ | ✅ | ❌ | ❌ |

Notes on judgment calls made while encoding the brief's policy:

- **Maintenance Management (docs/MAINTENANCE-MANAGEMENT.md).** No new role
  was introduced. MANAGER holds every `maintenance.*` operational
  permission (create/triage/assign/start/complete/verify/close/cancel),
  the same tier as its own Move-In/Contract permissions. ACCOUNTANT gets
  `maintenance.view` + `maintenance.cost.view` + `maintenance.vendor.view`
  only - it can see what maintenance is costing and which vendors exist,
  but cannot triage a Request, create/assign/progress a Work Order, or
  add/edit cost entries; this mirrors ACCOUNTANT's existing "broad *.view,
  narrow mutation" posture everywhere else in this table. VIEWER gets
  `maintenance.view` only, same read-only pattern as every other module.
  `maintenance.cost.manage` is deliberately separate from
  `maintenance.workOrder.update` (a technician can update a Work Order's
  diagnosis/schedule without necessarily being trusted to enter costs, and
  vice versa for a back-office user who only enters costs after the fact)
  - in practice MANAGER/ADMIN/OWNER hold both. There is no
  `maintenance.request.delete`/`maintenance.workOrder.delete`: neither is
  ever hard-deleted (only cancelled, which preserves the row), matching
  the no-hard-delete policy every other module in this table already
  established - and a CLOSED Work Order is additionally immutable at the
  service-layer regardless of permission (see docs/MAINTENANCE-MANAGEMENT.md
  §23).

- **Move-Out Management (docs/MOVE-OUT-MANAGEMENT.md).** No new role was
  introduced. MANAGER holds every `moveOut.*`/`moveOutInspection.*`
  permission, the same operational tier as its own Move-In/Maintenance
  permissions. ACCOUNTANT and VIEWER both get `moveOut.view` only - no
  mutation permission for either. This mirrors Move-In's own role policy
  exactly, since Move-Out is the same day-to-day leasing-operations tier
  of work, not CRM pipeline work or an accounting function.

- **Security Deposit & Move-Out Financial Settlement
  (docs/SECURITY-DEPOSIT-SETTLEMENT.md).** No new role was introduced. This
  is the one module in this table with genuine segregation of duties across
  three different roles rather than one operational tier: MANAGER holds
  `securityDeposit.view/create/assess/review/dispute.manage` - it can
  create a settlement, add/edit liability assessments, submit and review
  them, and manage disputes, but can **never approve, post, or manage a
  refund**. ACCOUNTANT holds `securityDeposit.view/review/post/refund.view/
  refund.manage` - the genuinely financial half (reviewing, posting the
  approved figures, recording/paying refunds) but can **never create a
  settlement, add/edit an assessment, approve, or manage a dispute**.
  `securityDeposit.approve` is OWNER/ADMIN-only - approval freezes the
  commercial snapshot and is deliberately the single highest-trust action
  in the whole workflow, held by neither MANAGER nor ACCOUNTANT alone.
  VIEWER gets `securityDeposit.view` + `securityDeposit.refund.view` only,
  consistent with VIEWER's read-only posture everywhere else. There is no
  `securityDeposit.delete`: a settlement is never deleted, only cancelled
  pre-posting (`securityDeposit.review` covers `cancelSettlement()`, the
  same authorization tier as reviewing) or reversed post-posting via a
  dedicated reversal entry, matching this table's no-hard-delete policy.

- **`property.delete` / `unit.delete` / `renter.delete` are OWNER/ADMIN-only.**
  The brief listed `property.delete` etc. as permission keys to define but
  didn't put deletion in MANAGER's "Allowed" list (only create/update), so
  delete stays reserved for the top two roles - deleting a property/unit/
  renter is a destructive, hard-to-reverse action.
- **`settings.view`/`settings.update` are OWNER/ADMIN-only.** The brief's
  MANAGER and ACCOUNTANT sections both explicitly forbid touching
  organization settings and neither lists "view settings" as allowed;
  VIEWER's read-only list omits settings entirely. So nobody except
  OWNER/ADMIN can even see the Settings page.
- **MANAGER does not have `invoice.cancel`.** The brief's MANAGER "Allowed"
  list says "view/create invoices" - cancellation isn't mentioned, so it
  isn't granted. Only ACCOUNTANT and OWNER/ADMIN can cancel an invoice.
- **MANAGER can manage ownership assignments but cannot post or reverse
  owner ledger entries.** This mirrors the existing property/unit/renter
  split (MANAGER creates/updates the operational records, ACCOUNTANT owns
  the financial postings): MANAGER gets `ownership.view`/`ownership.manage`
  but only `ownerLedger.view`, while ACCOUNTANT gets the reverse emphasis
  (`ownerLedger.create`/`ownerLedger.reverse` but only `ownership.view`, no
  `ownership.manage`) - this was explicit in the brief's own role policy.

## 4. How to protect a new server action

Every mutating server action, and every read of business/financial data,
must go through `requirePermission()` from `src/lib/session.ts` as its
**first line**, before touching Prisma or doing any other work:

```ts
"use server";

import { requirePermission } from "@/lib/session";

export async function createWidget(formData: FormData) {
  const { organizationId } = await requirePermission("widget.create");
  // ...parse formData, then use organizationId exactly as requireOrgId() used to provide it
}
```

`requirePermission(permission)`:
1. Verifies there's an authenticated session (`requireSession()` under the hood).
2. Reads the role from the **signed session JWT** - never from a client-supplied
   field, form value, or header. A client cannot claim a role they don't have.
3. Checks `can(permission, role)` against the centralized `ROLE_PERMISSIONS`
   map in `permissions.ts`.
4. Throws `AuthorizationError` (a bilingual message, via the existing
   dictionary system - `t.validation.notAuthorized`) if the role doesn't
   have the permission.
5. On success, returns `{ organizationId, role }` so you don't need a
   separate `requireOrgId()` call - though `requireOrgId()` is still
   exported and still works exactly as before, for the couple of places
   (like locale switching) that aren't permission-gated at all because
   they touch no business data.

**If you add a new `Permission` key**, add it to the `Permission` union,
add it to `ALL_PERMISSIONS`, and add it to whichever role arrays should
grant it. TypeScript will not compile if you reference a permission string
that isn't in the `Permission` union, which is what keeps this centralized
instead of scattering ad-hoc role checks through the codebase.

## 5. UI visibility is not security

Pages filter which buttons/links/forms they render based on
`can(permission, role)` (imported directly, or via `getCurrentUserRole()`
from `session.ts`), purely so a user isn't shown an action they can't
perform. **This is a usability convenience only.** Every one of those
actions is independently enforced server-side by `requirePermission()`
inside the action itself. Hiding a button never substitutes for that check
- a user (or a script) that calls the server action directly, bypassing the
UI entirely, is still blocked by the exact same `requirePermission()` call.
This was verified directly in this session: see `src/lib/actions/rbac.integration.test.ts`,
which calls the real action functions (not the UI) and asserts that
unauthorized roles are rejected before any database write happens.

## 6. Rule for all future work

**Every new mutation, and every new read of non-trivial business data, must
call `requirePermission()` with an appropriate permission before doing
anything else.** If no existing permission fits, add a new one following
the `resource.action` naming convention, add it to the relevant role
arrays in `ROLE_PERMISSIONS`, and document the decision here. A mutation
protected only by `requireSession()`/`requireOrgId()` (authentication and
tenant isolation, but no role check) is treated as a bug in this codebase
going forward.

## 7. Deliberately unprotected actions (and why)

Two exported functions intentionally do **not** call `requirePermission()`:

- **`setLocale`** (`src/lib/actions/locale.ts`) - sets a UI-language cookie.
  It isn't org-scoped, doesn't touch any business data, and runs even on
  the pre-login page. Every authenticated (and unauthenticated) user should
  be able to switch language regardless of role.
- **`syncOverdueStatuses`** (`src/lib/actions/collections.ts`) - internal
  housekeeping that flips stale `PENDING` schedules/invoices to `OVERDUE`
  based on the current date. It's not a user-initiated action; it's called
  as a side effect of the `*.view`-gated reads (`listCollections`,
  `getDashboardStats`, `getOverdueReport`) to keep their data fresh. Gating
  it separately would only block lower-privileged roles (who can rightly
  view overdue data) from seeing accurate statuses.

Both are called out explicitly here so a future reviewer doesn't mistake
them for gaps.
