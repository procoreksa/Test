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

Notes on judgment calls made while encoding the brief's policy:

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
