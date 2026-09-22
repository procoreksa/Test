# CRM: Reservation Management

This document describes the Reservation module: the step that holds a
residential Unit for a prospective tenant after an accepted Leasing Offer
and before a future Lease Contract. It is purely additive - no VAT/ZATCA/
invoice calculation/payment logic, owner ledger, ownership allocation,
Viewing double-booking logic, Offer pricing/versioning logic, CRM lead
conversion logic, property hierarchy, or audit architecture was changed.
See `docs/CRM-LEADS.md`, `docs/VIEWING-MANAGEMENT.md`, and
`docs/LEASING-OFFERS.md` for the foundations this builds on, and
`docs/PERMISSIONS.md` for the RBAC system.

Scope of this task, per the brief: **Reservation creation, Unit hold/
release, expiry, an optional operational-only reservation amount, and
cancellation/release lifecycle only.** Actual Lease Contract creation from
a Reservation, payment/invoicing for the reservation amount, online
payment, refund accounting, e-signature, and message delivery (WhatsApp/
email) are a future task and are explicitly not implemented here (see
§18).

Flow: **Lead → Viewing → accepted Leasing Offer → Reservation → future
Contract → Move-In.**

## 1. Model

`Reservation` (`prisma/schema.prisma`): `reservationNumber` (`RES-000001`,
via the shared `Counter` infrastructure - see "Reused, not duplicated"),
`leadId`/`offerId`/`unitId` (all required, see §2), `assignedToUserId`
(optional, real relation, same pattern as `Lead`/`Viewing`/`LeasingOffer`),
`status` (`ReservationStatus`, see §5), `reservedAt`/`holdUntil`
(§3), `confirmedAt`/`cancelledAt`/`expiredAt`/`releasedAt` (nullable
lifecycle timestamps, one per terminal-or-confirming event),
`reservationAmount`/`reservationAmountStatus` (§7), `notes`/
`internalNotes` (nullable), `cancelReason`/`cancelReasonNote` (nullable,
only populated on cancellation - §8), `createdByUserId` (plain string,
mirrors `Lead`/`Viewing`/`LeasingOffer`'s own).

No `deletedAt` column, same reasoning as `Viewing`/`LeasingOffer`:
`CANCELLED`/`EXPIRED`/`RELEASED` already serve as terminal "this hold
didn't proceed" states, so a second soft-delete mechanism would be pure
schema weight. A Reservation row is **never deleted** - cancellation,
release, and expiry all preserve the row (Step 16 of the brief is
explicit: "never delete").

## 2. Relation to Offer / Lead / Unit

- `offerId` - required, `onDelete: Restrict` (a Unit with a live
  Reservation against it cannot have its originating Offer deleted out
  from under it - matches `Contract.unitId`'s `Restrict` policy).
  **Eligibility** (`createReservation()`, Step 5 of the brief): the Offer
  must belong to the same organization and have `status === "ACCEPTED"` -
  any other status (`DRAFT`, `SENT`, `REJECTED`, `EXPIRED`, `CANCELLED`,
  `SUPERSEDED`, etc.) is rejected (`t.validation.reservationOfferNotAccepted`).
  `leadId`/`unitId` are taken **from the Offer itself**, never from a
  separately supplied form field - the UI never allows changing the Lead
  or Unit away from the selected Offer (Step 13 of the brief), which also
  makes cross-org Offer/Lead/Unit substitution structurally impossible
  (the IDs are derived server-side, not accepted as independent inputs).
- `leadId` - required, `onDelete: Cascade` (matches `Viewing.leadId`/
  `LeasingOffer.leadId`). Always equals the Offer's own `leadId`.
- `unitId` - required, `onDelete: Restrict` (matches `LeasingOffer.unitId`).
  Always equals the Offer's own `unitId`. Eligibility is checked
  independently at every stage transition (§3/§4), not just at creation.

## 3. Unit hold logic

Reuses the existing `UnitStatus` enum, additively extended with one new
value: `RESERVED` (Step 7 of the brief - "reuse existing UnitStatus
model", not a parallel reservation-status field on `Unit`). Transitions:

| Reservation event | Unit status move |
|---|---|
| `confirmReservation()` (`PENDING` → `CONFIRMED`) | `VACANT` → `RESERVED` |
| `cancelReservation()` / `releaseReservation()` / expiry sync | `RESERVED` → `VACANT`, **only if safe** (see below) |
| `CONVERTED_TO_CONTRACT` (future action, not implemented here) | Unit stays reserved/occupied - **never** returns to `VACANT` on this transition |

**`releaseUnitIfSafe(tx, organizationId, unitId, excludeReservationId?)`**
(`src/lib/actions/reservations.ts`, Step 33) is the single choke point
every `RESERVED → VACANT` write passes through:

1. Idempotency guard - if the Unit isn't currently `RESERVED`, it does
   nothing (safe to call unconditionally from every terminal-event path
   without double side effects).
2. Re-checks no **other** Reservation for the same Unit is still in a
   blocking status (`PENDING`/`CONFIRMED` - see §4), excluding the
   Reservation that triggered the call.
3. Re-checks no `Contract` with `status: "ACTIVE"` already exists for the
   Unit (defense-in-depth against a hypothetical future path that creates
   a Contract without going through this Reservation's own
   `CONVERTED_TO_CONTRACT` transition).
4. Only if both checks pass does it write `Unit.status = VACANT`.

This function is called from every one of `cancelReservation()`,
`releaseReservation()`, and `syncExpiredReservations()` (never duplicated
inline), and always from inside the same transaction as the Reservation's
own status write (§16).

## 4. Reservation conflicts (Unit-level vs. Offer-level)

Two deliberately **different** rules answer two deliberately different
questions, both in `src/lib/crm/reservation-rules.ts`:

- **`isBlockingUnitReservationStatus()`** - "does this Reservation
  currently occupy the Unit?" True only for `PENDING`/`CONFIRMED`
  (`BLOCKING_UNIT_RESERVATION_STATUSES`). **`DRAFT` deliberately does
  not block** another Reservation for the same Unit (Step 8 of the
  brief's own framing: "potentially DRAFT should not block") - a DRAFT
  Reservation is an unsubmitted draft, not yet a real hold. Checked by
  `assertUnitEligibleForReservation()` at **every** stage
  (`createReservation`/`submitReservation`/`confirmReservation`), not
  just once, so each stage independently re-verifies rather than trusting
  an earlier check.
- **`blocksNewReservationForOffer()`** - "does this Offer already have an
  active Reservation attempt?" True for `DRAFT`/`PENDING`/`CONFIRMED`/
  `CONVERTED_TO_CONTRACT` (everything except `EXPIRED`/`CANCELLED`/
  `RELEASED`). This is the **Step 6** rule: at most one active Reservation
  may exist per Offer at a time, checked in `createReservation()` before
  the Unit-eligibility check even runs. Unlike the Unit-level rule, DRAFT
  *does* block here - creating two draft reservation attempts against the
  very same commercial negotiation makes no sense even before either is
  submitted.

Unit eligibility itself (`assertUnitEligibleForReservation()`) also
requires `Unit.status === "VACANT"` - a Unit that is `OCCUPIED`,
`MAINTENANCE`, or already `RESERVED` by another confirmed hold is
rejected outright (`t.validation.reservationUnitNotEligible`/
`reservationUnitConflict`).

## 5. Status lifecycle

`ReservationStatus`: `DRAFT | PENDING | CONFIRMED | EXPIRED | CANCELLED |
RELEASED | CONVERTED_TO_CONTRACT`.

```
DRAFT -> PENDING -> CONFIRMED -> {CANCELLED, RELEASED, CONVERTED_TO_CONTRACT}
DRAFT -> CANCELLED
PENDING -> {CANCELLED, EXPIRED}
CONFIRMED -> EXPIRED
```

`EXPIRED`/`CANCELLED`/`RELEASED`/`CONVERTED_TO_CONTRACT` are terminal.
Enforced server-side by `isValidReservationTransition()` in
`reservation-rules.ts`, checked before every mutating action writes
anything - a terminal or already-expired Reservation can never be
submitted, confirmed, cancelled again, or released again
(`t.validation.reservationInvalidTransition`). `CONVERTED_TO_CONTRACT` is
defined in the enum as the designed future hook point (§18) but is never
written by any action in this task - "Do not implement Contract Creation
from Reservation yet" per the brief.

## 6. Expiry design

`holdUntil` defaults to **48 hours** from creation
(`DEFAULT_HOLD_HOURS`/`defaultHoldUntil()` in `reservation-rules.ts`, a
single centralized constant - never hardcoded at each call site), but is
user-adjustable per Reservation both at creation and afterward
(`updateReservationHoldUntil()`, only while the Reservation is still in
an editable status - see §1's timestamp list).

**Lazy, self-healing reconciliation, not solely a cron job** (Step 10/32):
`syncExpiredReservations(organizationId)` in `reservations.ts` scans every
`PENDING`/`CONFIRMED` Reservation whose `holdUntil` has passed and, for
**each one individually** (not a single bulk `updateMany`, unlike Offer's
own `syncExpiredOffers()`): re-verifies staleness inside its own
transaction (defense against a second concurrent reconciliation of the
same row racing the initial scan), sets `status = EXPIRED` +
`expiredAt = now`, calls `releaseUnitIfSafe()`, writes an `AuditLog` row
(`metadata.trigger = "expiry_sync"`), and appends a `LeadActivity` entry.
This is heavier than Offer's silent bulk update specifically because the
brief requires an **audited, activity-logged** event per expired
Reservation, not just a silent status flip.

Called at the top of **every** read (`listReservations`,
`getReservationById`, `getActiveReservationForOffer`,
`getReservationsForLead`, `getActiveReservationsForUnits`) and every
mutating action (`submitReservation`/`confirmReservation`/
`cancelReservation`/`releaseReservation`) before it touches the target
row - Step 32's explicit safety requirement: no action can ever confirm
an already-expired Reservation, create a Contract from one, or hold a
Unit indefinitely because a background job never ran.

## 7. Reservation amount

Pure **operational tracking**, never an accounting entry (the brief's
explicit, repeated instruction): `reservationAmount` (`Decimal(12,2)`,
default `0`) + `reservationAmountStatus` (`ReservationAmountStatus`:
`NOT_REQUIRED | PENDING | RECEIVED | REFUNDED | FORFEITED`) live directly
on the `Reservation` row itself - no `Invoice`/`Payment`/
`PaymentSchedule`/`OwnerLedgerEntry` row is ever created or touched by any
action in `reservations.ts` (verified by a dedicated real-DB test - see
§18/§17 of the final report and `reservation-financial-isolation.db.test.ts`).

`defaultReservationAmountStatus(amount)` in `reservation-rules.ts`: `0` →
`NOT_REQUIRED`, any amount `> 0` → `PENDING` at creation time. An
authorized user (`reservation.amount.update` permission) can manually
move it to `RECEIVED`/`REFUNDED`/`FORFEITED` via
`updateReservationAmountStatus()` - a plain status field update, no
downstream financial side effect. The Reservation profile UI displays a
"Tracking only - not an accounting receipt" disclaimer next to the amount
in both Arabic and English (`t.reservation.amountDisclaimer`), so the
distinction from a real receipt is visible, not just a code-level
convention.

## 8. Cancellation

`cancelReservation()` (Step 16) **requires** a `ReservationCancelReason`
(`CUSTOMER_REQUEST | PAYMENT_NOT_RECEIVED | DOCUMENTS_INCOMPLETE |
UNIT_CHANGED | OFFER_CHANGED | TIMEOUT | MANAGEMENT_DECISION | OTHER`);
`OTHER` additionally requires a non-empty `cancelReasonNote`
(`t.validation.reservationCancelReasonNoteRequired`). Sets
`status = CANCELLED` + `cancelledAt = now`, calls `releaseUnitIfSafe()`,
writes an audited `CANCEL` action, and appends a `LeadActivity` entry. The
row is never deleted (§1). Lead status reverts to `NEGOTIATION` unless
already `WON` (§10).

## 9. Release

`releaseReservation()` (Step 17) is a distinct, **no-reason-required**
management action - freeing a `CONFIRMED` Unit hold without a customer
cancellation attached (e.g., management decides to let a stale hold go).
Sets `status = RELEASED` + `releasedAt = now`, calls
`releaseUnitIfSafe()`, writes an audited action, appends a `LeadActivity`
entry. Lead status reverts to `NEGOTIATION` unless already `WON` - **never
automatically marked `LOST`** (the brief's explicit instruction; the
accepted Offer's commercial terms still stand, only this particular
Unit-hold attempt fell through).

## 10. Lead integration

Reuses existing `LeadStatus` values only - no new value introduced.

| Reservation event | Lead status move |
|---|---|
| Created (`createReservation`) | → `RESERVATION_PENDING` (mirrors `createOffer()`'s own move to `OFFER_PENDING`), unless already `WON` |
| Confirmed (`confirmReservation`) | **No change.** Stays at `RESERVATION_PENDING` (already set by Offer acceptance / Reservation creation) - Step 15 of the brief is explicit: do not introduce a new `LeadStatus` here. `WON` is reserved **exclusively** for a future successful Contract, never for a confirmed Reservation |
| Cancelled / Released / Expired | → `NEGOTIATION`, unless already `WON`. **Never** → `LOST` |

The three "free the Unit without conversion" events (Cancel, Release,
Expire) are unified under **one** deterministic rule rather than three ad
hoc ones: the accepted Offer's commercial terms still stand even though
this specific Unit-hold attempt fell through, so `NEGOTIATION` (not back
to the earlier `OFFER_PENDING`) is the more accurate "still actively
working this deal" state. This directly resolves Step 17's "choose
deterministic behavior... NEGOTIATION or OFFER_PENDING" by picking
`NEGOTIATION` for all three events uniformly.

## 11. Offer integration

The Offer profile page (`/crm/offers/[id]`) shows, whenever the Offer is
`ACCEPTED`:

- **No active Reservation yet** - a "Create Reservation" link to
  `/crm/reservations/new?offerId=...` (gated by `reservation.create`).
- **An active Reservation already exists** - a compact summary
  (Reservation #, status, hold-until, amount status) via
  `getActiveReservationForOffer()`, deliberately **not** the full
  Reservation profile duplicated inline (Step 18 - "don't duplicate the
  full profile").

**Offer revision safety (Step 41):** investigated before writing any new
guard. `canReviseOffer()` (`src/lib/crm/offer-rules.ts`, pre-existing,
off-limits offer-versioning logic) already excludes `ACCEPTED` entirely -
its own comment states why: *"accepted moves on to Reservation"*.
`ACCEPTED` is also terminal in `OFFER_TRANSITIONS` (no outgoing
transition), so an Offer can never leave `ACCEPTED` on its own either.
Since Step 5 requires an Offer to be `ACCEPTED` before any Reservation can
ever be created against it, an Offer can **never simultaneously** carry
an active Reservation and be eligible for revision - the pre-existing,
off-limits offer-versioning logic already fully satisfies this
requirement, with **no new code needed**. (An earlier attempt added an
explicit guard inside `reviseOffer()` checking for active reservations;
it was unreachable dead code and was removed once this was discovered -
see `reservation-offer-revision-safety.db.test.ts`, which proves the
invariant holds through a real reservation lifecycle including after
cancel/release/expiry.)

## 12. Unit integration

The Units list (`/units`) shows, for a `RESERVED` unit: the status badge
plus an inline `RES-000001 · Hold Until <date>` line
(`getActiveReservationsForUnits()`, a single grouped query - not N+1 per
row). No redesign of the Unit module itself (Step 20).

## 13. LeadActivity integration

Reuses the existing `STATUS_CHANGE` `LeadActivityType` for every
Reservation lifecycle event - no new value, matching the Offer module's
own convention. Events logged: created, confirmed, cancelled, released,
expired (`t.reservation.activityCreated`/`activityConfirmed`/
`activityCancelled`/`activityReleased`/`activityExpired`). `submitted`
(DRAFT → PENDING) is treated as an internal workflow step (analogous to
Offer's own `PENDING_APPROVAL` transition, which also has no dedicated
LeadActivity entry) and is not separately logged as a LeadActivity - it
is still fully captured in the `AuditLog` (§14).

## 14. Audit integration

Reuses only existing `AuditAction` values - no new one:

| Reservation event | `AuditAction` | Notes |
|---|---|---|
| Created | `CREATE` | |
| Submitted (`DRAFT → PENDING`) | `UPDATE` | |
| Confirmed | `UPDATE` | status → `CONFIRMED`, plus the Unit's own `RESERVED` write in the same transaction |
| Cancelled | `CANCEL` | exact semantic match |
| Released | `UPDATE` | no dedicated `RELEASE` action exists in `AuditAction`; disambiguated by `newValues.status = "RELEASED"` |
| Expired (via lazy sync) | `UPDATE` | `metadata.trigger = "expiry_sync"` - the one non-interactively-triggered event, called out explicitly so a reviewer doesn't mistake it for a missing `requirePermissionAudited()` call |
| Amount status changed | `UPDATE` | via `auditUpdate()`'s automatic before/after diff |
| Hold-until changed | `UPDATE` | via `auditUpdate()` |
| Assigned agent changed | `UPDATE` | via `auditUpdate()` |

`entityType` is always `"Reservation"`. No change to `AuditAction`,
`writeAuditLog()`, or any redaction/categorization rule in
`src/lib/audit.ts`.

## 15. RBAC

New permissions added to `src/lib/permissions.ts`: `reservation.view`,
`reservation.create`, `reservation.update`, `reservation.confirm`,
`reservation.cancel`, `reservation.release`, `reservation.amount.update`.

| Role | Access |
|---|---|
| OWNER / ADMIN | All seven |
| MANAGER | All seven (full operational CRM access, matching MANAGER's Lead/Viewing/Offer policy) |
| ACCOUNTANT | **`reservation.view` + `reservation.amount.update` only** - deliberately different from ACCOUNTANT's "none at all" policy for `lead.*`/`viewing.*`/`offer.*`. Since the reservation amount is money-adjacent operational tracking (even though never a ledger entry - §7), ACCOUNTANT is given visibility and the ability to mark it received/refunded/forfeited, but not to create/confirm/cancel/release reservations themselves (that remains an agency/CRM operational decision, matching the pattern elsewhere: ACCOUNTANT owns financial postings, not operational records) |
| VIEWER | `reservation.view` only |

Every mutating action is server-side gated via `requirePermission()`/
`requirePermissionAudited()` - never a client-only check.

## 16. Concurrency and transaction strategy

**Chosen strategy (Step 35 - "this is important"):** Postgres
`SERIALIZABLE` transaction isolation
(`prisma.$transaction(fn, { isolationLevel: "Serializable" })`) wraps the
three genuinely race-sensitive "check-conflicts-then-write" critical
sections: `createReservation()`, `submitReservation()`, and
`confirmReservation()`. Neither this codebase's existing Viewing
double-booking logic nor its Offer pricing/versioning logic (both
off-limits to modify) use row-level locking or raw SQL anywhere, and
Prisma's abstraction level makes `SERIALIZABLE` the cleanest available
option without dropping to raw SQL or a new DB constraint. Under
Postgres's Serializable Snapshot Isolation, two truly concurrent
transactions that read overlapping state and then both attempt
conflicting writes will have one aborted with a serialization failure
(Prisma error code `P2034`) rather than silently double-booking a Unit.

**Every** multi-step Reservation mutation (`confirmReservation`,
`cancelReservation`/`releaseReservation` (shared via
`terminalReservationMove()`), and per-row reconciliation inside
`syncExpiredReservations`) is fully transactional: the Reservation status
write, the Unit status write, the `LeadActivity` row, and the `AuditLog`
row all succeed or all fail together (Step 34) - never a partial write
left behind by a mid-sequence error.

**Verified by a real-DB concurrency test**
(`reservation-concurrency.db.test.ts`, Step 36): two DRAFT reservations
for the same Unit racing `submitReservation()` truly concurrently via
`Promise.allSettled` - exactly one succeeds, the other is rejected, and
the DB is left in a consistent `[DRAFT, PENDING]` state, never
`[PENDING, PENDING]`. A second test races `createReservation()` itself
and documents an additional, real finding: concurrent creates in the same
organization also serialize against the **shared numbering `Counter`
row** (`nextCounterValue()`, reused Step-4 infrastructure) - a Postgres
serialization conflict on that shared row is a real, expected side effect
of reusing the org's existing Counter for reservation numbering under
`SERIALIZABLE` isolation, and "exactly one succeeds" still holds either
way. Both tests were run repeatedly (5+ times) to confirm they are not
flaky.

## 17. Multi-tenant security

Every Reservation query filters by `organizationId` directly in the
Prisma `where` clause - never inferred from a joined relation alone.
Verified by real, database-backed tests
(`reservation-cross-org-security.db.test.ts`): Org A cannot read,
submit, confirm, cancel, release, change the amount status of, or
reassign the agent/hold-until on Org B's Reservation, and Org A's
`listReservations()` never returns an Org B row. IDOR-specific tests
confirm direct ID substitution is rejected on creation: a cross-org
`offerId` is rejected (the Offer lookup itself is org-scoped, so it
simply isn't found), and a cross-org `assignedToUserId` is rejected (the
assignee lookup is org-scoped). A positive control confirms the same
action succeeds normally when every ID belongs to the caller's own
organization, ruling out a test that trivially always throws.

## 18. Financial isolation and future Contract integration

**Financial isolation** (Step 40): explicitly verified by
`reservation-financial-isolation.db.test.ts` - a full Reservation
lifecycle (create with a non-zero amount → submit → confirm → mark amount
`RECEIVED` → release) leaves `Invoice`/`InvoiceLine`/`Payment`/
`PaymentSchedule`/`OwnerLedgerEntry` row counts at **exactly zero**
throughout, and pre-existing financial records from an unrelated Contract
in the same organization are provably unaffected by any Reservation
action.

**Future Contract integration** - not implemented in this task, by
explicit instruction. The designed hook points:

- `ReservationStatus.CONVERTED_TO_CONTRACT` already exists in the enum as
  the terminal state a future "Create Contract from Reservation" action
  will transition into, but no action anywhere writes it yet.
- The Reservation profile page shows a disabled "Contract creation not
  yet implemented" placeholder whenever the Reservation is `CONFIRMED` -
  the same pattern `docs/LEASING-OFFERS.md` used for its own
  then-future Reservation placeholder, which this task has now made real
  one layer down the flow.
- `Reservation` carries no `convertedContractId` yet (unlike
  `Lead.convertedContractId`, added ahead of time in the CRM Leads task) -
  adding one when the Contract-from-Reservation module is built is a
  purely additive migration, exactly like every other step in this
  schema's history.
- `releaseUnitIfSafe()` already checks for an `ACTIVE` `Contract` on the
  Unit before ever releasing it back to `VACANT` (§3) - the future
  Contract-creation action will need no changes to this helper at all.

## Reused, not duplicated

- `nextCounterValue()`/the Counter model - `formatReservationNumber()` in
  `src/lib/numbering.ts` follows the exact `formatOfferNumber()` pattern
  (no new numbering system).
- `AuditTimeline` component, `auditCreate`/`auditUpdate`/`auditAction`/
  `requirePermissionAudited()` helpers - used exactly as every other
  module uses them.
- `PrintButton` + `no-print`/`print:` Tailwind class convention for the
  six new report pages, mirroring the Offer/Viewing report pages exactly.
- `UnitStatus` enum (additively extended with `RESERVED`, not replaced or
  paralleled by a separate reservation-status field on `Unit`).
- `LeadStatus`/`LeadActivityType` values - no new value introduced for
  either.
- `unitLocationLabel()` (`src/lib/unit-location.ts`).
