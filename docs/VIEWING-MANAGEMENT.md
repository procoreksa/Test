# CRM: Viewing Management

This document describes the Viewing Management module: scheduling,
double-booking prevention, the status lifecycle, and its integration with
the existing Lead/LeadActivity/AuditLog systems. It is purely additive -
no financial logic, VAT, ZATCA, payment schedule, owner allocation, audit
architecture, or existing Lead conversion logic was changed. See
`docs/CRM-LEADS.md` for the Lead/LeadActivity foundation this builds on
and `docs/PERMISSIONS.md` for the RBAC system.

Scope of this task, per the brief: **Viewing scheduling and lifecycle
only.** Leasing Offers, Reservations, and Contract-generation changes are
a future task and are explicitly not implemented here (see §14/§15).

## 1. Viewing model

`Viewing` (`prisma/schema.prisma`): `viewingNumber` (sequential,
`VIEW-000001`), `leadId` (required), `assignedToUserId` (required at
creation, nullable at the schema level for `onDelete: SetNull`),
`scheduledStart`/`scheduledEnd`, `status`, `customerNotes`/
`internalNotes` (nullable), `feedbackSummary`/`outcome` (nullable, set on
completion), `cancelReason`/`cancelReasonNote` (nullable, set on
cancellation), `completedAt` (nullable), `createdByUserId` (plain string,
mirrors `Lead.createdByUserId` - survives a `User` being removed).

**One deliberate deviation from the brief's suggested field list:** no
`deletedAt` column was added, for the same reason `Lead` has none (see
`docs/CRM-LEADS.md` §1) - the brief's own Step 35 says "if delete
functionality is unnecessary, do not add it," and `CANCELLED` already
serves as the terminal "this viewing didn't happen" state. A second,
unused soft-delete mechanism would be pure schema weight.

## 2. ViewingUnit

A thin join table: `viewingId` + `unitId` + `sequence` + `notes`, unique
on `(viewingId, unitId)`. No Unit data is duplicated - a viewing can cover
multiple units (e.g. touring two comparable apartments back-to-back), and
each `ViewingUnit` row is only ever created after both `Viewing.leadId`'s
organization and the unit's organization have been verified to match the
caller's own (`createViewing()`, `src/lib/actions/viewings.ts`).

## 3. Lifecycle

```
SCHEDULED -> CONFIRMED -> IN_PROGRESS -> COMPLETED
SCHEDULED -> CANCELLED          CONFIRMED -> CANCELLED
SCHEDULED -> NO_SHOW            CONFIRMED -> NO_SHOW
{SCHEDULED, CONFIRMED, IN_PROGRESS} -> RESCHEDULED -> {SCHEDULED, CONFIRMED}
```

1. **Create** (`createViewing()`, `viewing.create`) - validates the lead,
   agent, and every selected unit belong to the caller's organization; the
   lead isn't LOST/ARCHIVED; every unit is VACANT; and neither the agent
   nor any selected unit has a conflicting active viewing (§5). Writes the
   `Viewing` + `ViewingUnit` rows, an audit `CREATE` entry, moves the lead
   to `VIEWING_PENDING` (§8), and logs a `MEETING` `LeadActivity` (§9).
2. **Confirm**/**Start** (`confirmViewing()`/`startViewing()`,
   `viewing.update`) - simple status moves, each audited as `UPDATE`.
3. **Complete** (`completeViewing()`, `viewing.complete`) - only valid
   from `IN_PROGRESS`; records `outcome`/`feedbackSummary`/
   `internalNotes`, sets `completedAt`, moves the lead to
   `VIEWING_COMPLETED` (§8), and logs a `MEETING` `LeadActivity`.
4. **Cancel** (`cancelViewing()`, `viewing.cancel`) - valid from
   `SCHEDULED`/`CONFIRMED`; requires `cancelReason` (a note is required
   when the reason is `OTHER`, mirroring `Lead`'s lost-reason validation);
   audited as `CANCEL`.
5. **No-show** (`markViewingNoShow()`, `viewing.cancel`) - valid from
   `SCHEDULED`/`CONFIRMED`; audited as `REJECT` (see §10 for why).
6. **Reschedule** (`rescheduleViewing()`, `viewing.update`) - see §7.

## 4. Status transition rules

Centralized in `isValidViewingTransition()`
(`src/lib/crm/viewing-rules.ts`), a pure lookup table - no action file
re-implements this logic ad hoc:

```
SCHEDULED   -> CONFIRMED, CANCELLED, NO_SHOW, RESCHEDULED
CONFIRMED   -> IN_PROGRESS, CANCELLED, NO_SHOW, RESCHEDULED
IN_PROGRESS -> COMPLETED, RESCHEDULED
COMPLETED   -> (none - terminal)
CANCELLED   -> (none - terminal)
NO_SHOW     -> (none - terminal)
RESCHEDULED -> SCHEDULED, CONFIRMED
```

Every mutating action checks this table server-side before writing
anything (e.g. `COMPLETED -> IN_PROGRESS`, `CANCELLED -> COMPLETED`, and
`NO_SHOW -> CONFIRMED` are all rejected) - verified by real invalid/valid
transition assertions in `src/lib/crm/viewing-rules.test.ts`. `SCHEDULED
-> IN_PROGRESS` and `SCHEDULED -> COMPLETED` (skipping a step) are also
rejected - the brief's chain is sequential, not skippable.

`RESCHEDULED` is transient: `rescheduleViewing()` never leaves a viewing
sitting in that status - see §7.

## 5. Double-booking logic

`hasTimeOverlap(existingStart, existingEnd, newStart, newEnd)`
(`src/lib/crm/viewing-rules.ts`, pure and unit-tested):

```
overlaps  <=>  existingStart < newEnd  AND  existingEnd > newStart
```

A range that starts exactly when another ends does **not** overlap - two
back-to-back viewings (existing ends at 11:00, new starts at 11:00) are
allowed, verified by a real-DB test in
`viewing-double-booking.db.test.ts`.

Only `SCHEDULED`/`CONFIRMED`/`IN_PROGRESS` viewings block a new booking
(`BLOCKING_VIEWING_STATUSES`) - `CANCELLED`/`NO_SHOW`/`COMPLETED` never
do, so a cancelled or completed viewing's time slot is immediately
reusable. `createViewing()` and `rescheduleViewing()` both re-run these
checks server-side; there is no UI-only validation to bypass.

## 6. Agent conflicts / 7. Unit conflicts

`checkAgentAvailability()` and `checkUnitAvailability()`
(`src/lib/actions/viewings.ts`) both query the real, blocking viewings for
the agent (or unit) in question, then run `hasTimeOverlap()` against each
candidate. On conflict, they return an `AvailabilityConflict` (the
existing viewing's number, lead name, start/end, and unit number if
relevant) rather than a bare boolean, so the resulting error message
(`t.viewing.conflictMessage(...)`) tells the user exactly which existing
viewing they collided with - per the brief's Step 9 "return conflict
details including viewing number/lead/start-end/unit."

Both checks accept an `excludeViewingId` - `rescheduleViewing()` and
`reassignViewingAgent()` pass the viewing's own id so it never conflicts
with itself while re-validating a new time or a new agent.

## 7. Rescheduling

`rescheduleViewing()` keeps the **same** `Viewing` record (no duplicate
row) - only valid from an active status (`SCHEDULED`/`CONFIRMED`/
`IN_PROGRESS`, i.e. wherever `RESCHEDULED` is a legal transition target).
It re-runs the full agent + every-unit conflict check against the new
time (excluding itself), then in one transaction: updates
`scheduledStart`/`scheduledEnd`, sets `status` back to `CONFIRMED` if the
viewing was already confirmed (otherwise `SCHEDULED` - so an `IN_PROGRESS`
viewing being rescheduled resets to `SCHEDULED`, not left mid-way),
records an audit `UPDATE` with the old and new times, and logs a
`STATUS_CHANGE` `LeadActivity`.

## 8. Lead status integration

- **On create**: if the lead isn't already `WON`, its status is set to
  `VIEWING_PENDING` - matching the brief's own example (`QUALIFIED` →
  create viewing → `VIEWING_PENDING`). A lead already `WON` is never
  regressed (verified by a real-DB test) - this guard is stricter than
  the brief's literal wording (which only forbids scheduling for
  `LOST`/`ARCHIVED` leads) but protects against a converted lead's status
  being silently overwritten by an unrelated later viewing.
- **On complete**: if the lead isn't already `WON`, its status is set to
  `VIEWING_COMPLETED` - **regardless of `outcome`**. An outcome of
  `OFFER_REQUESTED` or `RESERVATION_REQUESTED` does **not** move the lead
  into `OFFER_PENDING`/`RESERVATION_PENDING` - those statuses exist in the
  `LeadStatus` enum (reserved since the CRM Leads task) but nothing sets
  them yet, because the Offer/Reservation modules don't exist. The Viewing
  profile page instead shows a disabled "Create Offer (coming soon)" /
  "Create Reservation (coming soon)" placeholder button when the outcome
  warrants it (see §14).
- **Cancel/no-show do not change the lead's status** - the brief doesn't
  ask for it, and a cancelled/no-show viewing doesn't mean the lead itself
  is dead (another viewing can still be scheduled).

## 9. LeadActivity integration

No new `LeadActivityType` values were added - Viewing events reuse the
existing enum:

| Viewing event | `LeadActivityType` used |
|---|---|
| Scheduled | `MEETING` |
| Completed | `MEETING` |
| Rescheduled | `STATUS_CHANGE` |
| Cancelled | `STATUS_CHANGE` |
| No-show | `STATUS_CHANGE` |

Each activity's `subject` is a bilingual, dictionary-driven summary (e.g.
`t.viewing.activityScheduled(viewingNumber, time)`) - never hardcoded
English text, and never a duplicate of the `AuditLog` row's structured
data (see §10).

## 10. Audit integration

**No new `AuditAction` values were added** - the audit architecture
itself was off-limits for this task, exactly as it was for CRM Leads.
Viewing events map onto the existing enum:

| Viewing event | `AuditAction` used |
|---|---|
| Created | `CREATE` |
| Confirmed / Started / Rescheduled / Reassigned / Completed | `UPDATE` |
| Cancelled | `CANCEL` |
| No-show | `REJECT` (same "unsuccessful outcome" semantics as `markLeadLost`) |

Every audited write happens inside the same `prisma.$transaction` as the
mutation itself, following the transaction-atomicity convention
established in `docs/AUDIT-AND-FINANCIAL-CONTROLS.md`.

## 11. Metrics

Defined in `src/lib/crm/viewing-rules.ts`, unit-tested, and used verbatim
by `src/lib/actions/viewing-reports.ts` - never hardcoded/sample data:

```
Viewing Completion Rate = Completed / (Completed + Cancelled + No-Show)
Interest Rate           = Completed viewings with outcome INTERESTED / Completed viewings
Offer Request Rate      = Completed viewings with outcome OFFER_REQUESTED / Completed viewings
Reservation Request Rate = Completed viewings with outcome RESERVATION_REQUESTED / Completed viewings
```

All four share one implementation (`computeOutcomeRate()` /
`computeViewingCompletionRate()`) and return `0` (never `NaN`) when their
denominator is `0`, matching `computeConversionRate()`'s convention from
`docs/CRM-LEADS.md`. Viewings still `SCHEDULED`/`CONFIRMED`/`IN_PROGRESS`
are excluded from every rate's denominator - they haven't reached an end
state yet.

## 12. RBAC

`viewing.view`/`viewing.create`/`viewing.update`/`viewing.assign`/
`viewing.complete`/`viewing.cancel` - see `docs/PERMISSIONS.md` for the
full policy and matrix. Summary: OWNER/ADMIN/MANAGER get everything,
ACCOUNTANT gets nothing, VIEWER gets `viewing.view` only. No new user role
was introduced - "Leasing Agent" does not exist as a role; any active
user in the organization can be selected as `assignedToUserId`
(`listAssignableUsers()`, shared with the Lead assignment picker).

## 13. Multi-tenant security

Identical pattern to every other module: `requirePermission()`/
`requirePermissionAudited()` returns `organizationId` from the **signed
session**, and every Prisma query/mutation filters or verifies by it -
including verifying that `leadId`, `assignedToUserId`, and every entry in
`unitIds` belong to the caller's own organization before a `Viewing`/
`ViewingUnit` row is ever created, and that a target `Viewing` id belongs
to the caller's organization before any status-changing action touches it.

Covered by real, database-backed tests (not mocked organizationId checks)
in `src/lib/actions/__dbtests__/viewing-cross-org-security.db.test.ts`
(read/confirm/start/complete/cancel/no-show/reschedule/reassign another
organization's viewing; attach another organization's Lead/User/Unit
during creation; reassign to another organization's user) and
`viewing-double-booking.db.test.ts` (double-booking is necessarily
org-scoped too, since every conflict query filters by `organizationId`).
All rejections are verified against the real Prisma "record not found"
error, not a mock.

## 14. Future Offer integration

Not implemented in this task. What's ready for it: `ViewingOutcome`
already includes `OFFER_REQUESTED`; `LeadStatus.OFFER_PENDING` and
`NEGOTIATION` already exist (reserved since CRM Leads); the Viewing
profile page already shows a disabled "Create Offer (coming soon)"
placeholder when a completed viewing's outcome is `OFFER_REQUESTED`
(`src/app/(app)/crm/viewings/[id]/page.tsx`) so the future Offer module
has an obvious, already-designed hook point to replace that placeholder
with a real action - no schema or lifecycle change needed to add it.

## 15. Future Reservation integration

Not implemented in this task. Same shape as §14:
`ViewingOutcome.RESERVATION_REQUESTED` and
`LeadStatus.RESERVATION_PENDING` already exist; the Viewing profile page's
matching disabled "Create Reservation (coming soon)" placeholder is the
intended hook point.

## Reused, not duplicated

- Viewing numbering reuses the existing per-organization `Counter`
  infrastructure (`nextCounterValue(tx, organizationId, "viewing")`,
  `formatViewingNumber()` in `src/lib/numbering.ts`) - no separate
  numbering scheme, and no year component (matching `formatLeadNumber()`'s
  own rationale - a viewing number isn't a legal/tax document series).
- The new-viewing Compound→Building→Floor→Unit picker
  (`src/components/viewing-unit-picker.tsx`) is a sibling of the existing
  `CascadingLocationPicker`, not a modification of it - the existing
  picker submits a single `floorId` (used for creating a new Unit under a
  chosen floor); this task's picker needed to accumulate **multiple
  existing Unit selections** instead, which is a different enough contract
  to warrant its own component rather than overloading the original one.
- Pagination (`/crm/viewings`) follows the same `skip`/`take` +
  separate `count()` pattern as `listLeads`/`listAuditLogs`.
- The Unit list page's "simple link is enough" (Step 27) integration
  (`src/app/(app)/units/page.tsx`) adds one grouped-count query
  (`getUnitViewingCounts()`) and a link to
  `/crm/viewings?unitId=<id>` per row - no Unit detail page was built or
  redesigned.
