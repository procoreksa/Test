# CRM: Reservation → Contract Conversion

This document describes the module that connects the CRM/leasing funnel to
the existing financial leasing core: converting a `CONFIRMED` Reservation
into a real Lease Contract. It is purely an **orchestration layer** - no
VAT/ZATCA/invoice-calculation/payment-recording logic, owner ledger,
ownership allocation, Viewing double-booking logic, Offer pricing/
versioning logic, Reservation concurrency rules, audit architecture, or
property hierarchy was changed. See `docs/RESERVATION-MANAGEMENT.md` for
the foundation this builds on, and `docs/PERMISSIONS.md` for the RBAC
system.

Flow: **Lead → Viewing → accepted Leasing Offer → Confirmed Reservation →
Lease Contract → Payment Schedule → future Move-In.**

Scope of this task, per the brief: **Contract creation from a Confirmed
Reservation only**, reusing the existing Contract engine end to end.
Move-In, Move-Out, handover inspection, e-signature, document storage,
reservation-payment accounting, and a payment gateway are a future task
and are explicitly not implemented here (see §19).

## 1. Eligibility

Only a Reservation with `status === "CONFIRMED"` may convert
(`convertReservationToContract()` in `src/lib/actions/reservation-contract.ts`).
Every relation is re-read and cross-verified from the database inside the
conversion transaction - never trusted from the client, and never trusted
from the Reservation row alone:

- The Reservation's `offerId`/`leadId`/`unitId` must be mutually
  consistent with the Offer's own `leadId`/`unitId`
  (`t.validation.reservationOfferMismatch` otherwise).
- The Offer must still be `status === "ACCEPTED"` - re-checked even though
  `docs/RESERVATION-MANAGEMENT.md` §11 already guarantees an `ACCEPTED`
  Offer can never be revised or leave that status on its own.
- The Offer must have a `leaseStartDate` set (it's a nullable field on
  `LeasingOffer` - Step 6's "reject rather than silently adjust" applies:
  no fallback date is invented if it's missing).
- Reusing the single source of truth for legal status moves
  (`isValidReservationTransition()` in `src/lib/crm/reservation-rules.ts`,
  additively extended with `CONFIRMED -> CONVERTED_TO_CONTRACT` as the
  only legal target for that new state) rather than a second, parallel
  eligibility check.

## 2. Commercial source of truth

The accepted `LeasingOffer` is the sole source of commercial truth - never
the Unit's own base rent. Mapping is a pure, unit-tested function
(`mapOfferToContractInput()` in `src/lib/crm/reservation-contract-mapping.ts`):

| Offer field | Contract field | Notes |
|---|---|---|
| `netAnnualRent` | `rentAmount` | **Converted, not copied** - see §3 |
| `paymentFrequency` | `paymentFrequency` | direct |
| `securityDeposit` | `securityDeposit` | direct (0 → `undefined`, matching Contract's own optional-field convention) |
| `leasingCommissionAmount` | `commissionAmount` | direct |
| `leaseStartDate` | `startDate` | required (§1) |
| `leaseStartDate` + `leaseDurationMonths` | `endDate` | via `date-fns`'s `addMonths()` - the same function `src/lib/schedule.ts` already uses to step installment periods, not a new date convention |
| `specialTerms` | `notes` | direct |

Fields with no Contract equivalent are simply **not mapped** (documented,
not invented): `Offer.contractFee` (Contract has no such column - shown on
the create-contract preview page for reference only, with an explicit
"not carried into the contract record" note), `Offer.furnishedStatus`
(Contract has no furnishing column). `Contract.cleaningAmount` has no
Offer equivalent either, since Offer never captures a cleaning fee.
`extraChargesMode` defaults to `"ONE_TIME"`, matching both `Contract`'s
own schema default and the manual creation form's default selection.
`vatApplicable` defaults to the target Unit's own `vatApplicable` flag,
mirroring the same fallback intent in `createContract()`'s own
`vatApplicable ?? unit.vatApplicable` expression.

## 3. `Contract.rentAmount` is per-installment, not annual

The one genuinely non-obvious piece of this mapping: `Contract.rentAmount`
is the amount due **per installment** at the chosen frequency (confirmed
by `src/lib/schedule.ts`'s own doc comment and the manual form's field
label, "Installment Amount (SAR)") - never the annual total.
`computeContractRentAmount(netAnnualRent, paymentFrequency, leaseDurationMonths)`
converts correctly for every frequency:

- `QUARTERLY`: `netAnnualRent / 4` (the brief's own worked example:
  80,000 annual → 20,000 × 4 quarterly installments).
- `MONTHLY` / `SEMI_ANNUAL` / `ANNUAL`: divided by the frequency's
  installments-per-year.
- `ONE_TIME`: the entire lease term is a single installment, so the
  amount is `netAnnualRent × (leaseDurationMonths / 12)` (a 24-month
  `ONE_TIME` offer's annual rent is doubled, not passed through as-is).

Getting this wrong would have silently mis-priced every invoice a
Quarterly/Monthly contract issues - this is the reason the mapping lives
in its own pure, directly unit-tested module rather than inline in the
action.

## 4. Renter conversion behavior

Reuses (never duplicates) the exact duplicate-detection logic
`convertLeadToRenter()` already uses. Both now call a shared, extracted
predicate (`findDuplicateRenterCandidate()` in `src/lib/actions/leads.ts`)
- refactored out of `convertLeadToRenter()`'s own inline check without
changing that action's own observable behavior at all.

- **`Lead.convertedRenterId` already set** → that Renter is reused
  outright, no new row.
- **Not yet converted** → the same phone/email duplicate match is run.
  Unlike `convertLeadToRenter()`'s own interactive "new" mode (which
  *blocks* on an ambiguous match and asks a human to explicitly choose
  "link" instead - there is a UI step for that decision), this automated
  flow (`resolveRenterForLead()`) has **no interactive step to ask**, so a
  match is **auto-linked** rather than blocking contract creation, and no
  match creates a fresh Renter. Both branches are audited identically to
  `convertLeadToRenter()`'s own "new Renter" path.
- `Lead.status` is **never** touched by `resolveRenterForLead()` itself -
  only the caller (`convertReservationToContract()`) moves the Lead to
  `WON`, and only after the Contract itself is created (§11).

## 5. Payment schedule reuse

Zero new schedule logic. `createContractWithSchedule()`
(`src/lib/contract-schedule.ts`) - the exact same core service both
`createContract()` (manual) and `renewContract()` (renewal) already call
- is called a **third time**, from `convertReservationToContract()`,
with the mapped `ContractInput`. This single function allocates the
Contract number (§7), calls `generateAndCreateSchedule()` (which calls
the unmodified `generateSchedule()` in `src/lib/schedule.ts`), and sets
`Unit.status = OCCUPIED` (§9) - all reused verbatim, never reimplemented.
A real-DB regression test proves the schedule the conversion flow
produces is identical (installment count, amounts) to what
`generateSchedule()` produces for equivalent manually-constructed inputs,
across `MONTHLY`/`QUARTERLY`/`SEMI_ANNUAL`/`ANNUAL` frequencies.

## 6. Contract dates

`leaseStartDate` comes directly from the Offer (required - §1).
`leaseEndDate` is computed via `date-fns`'s `addMonths(leaseStartDate,
leaseDurationMonths)` - the exact function `src/lib/schedule.ts` already
uses for stepping installment periods, so date arithmetic follows one
single existing convention across the whole codebase, never a second one
invented for this task.

## 7. Contract numbering

Reused verbatim via `createContractWithSchedule()` →
`nextCounterValue()`/`formatContractNumber()` (`src/lib/numbering.ts`) -
the exact same Counter-backed sequence manual contract creation and
renewal already use. No new numbering system.

## 8. Architecture: no second contract-creation engine

`createContractWithSchedule()` was **already** the shared core service
both `createContract()` and `renewContract()` call - it was not created
for this task. `convertReservationToContract()` is simply a **third
caller** of that same function, wrapped in its own orchestration
(eligibility checks, Renter resolution, Offer→Contract mapping,
Reservation/Lead/Unit/Audit/LeadActivity updates). No refactor of
`contracts.ts` or `contract-schedule.ts` was needed or made - the
"don't duplicate `createContract()`" requirement was satisfied by this
codebase's pre-existing design, not by new abstraction work.

## 9. Unit status behavior

`createContractWithSchedule()` always creates the Contract as `status:
"ACTIVE"` (never `DRAFT`, regardless of the schema's own `@default(DRAFT)`)
and always writes `Unit.status = OCCUPIED` in the same call - this is
`contracts.ts`'s existing, unmodified behavior for **every** contract
creation path (manual, renewal, and now conversion). Since occupancy
begins immediately for a manually-created contract, it begins immediately
here too: `RESERVED → OCCUPIED`, never staying `RESERVED` and never
released to `VACANT`.

Before that write, `convertReservationToContract()` verifies the Unit is
still exactly `RESERVED` (covers `OCCUPIED`/`MAINTENANCE`/an unexpected
`VACANT` drift with one check - this schema has no separate "BLOCKED"
status) and that no *other* `PENDING`/`CONFIRMED` reservation is also
contesting the Unit, rejecting with a clear error rather than silently
repairing the state.

## 10. Reservation terminal state

On success, `Reservation.status → CONVERTED_TO_CONTRACT` and
`convertedAt = now`, in the same transaction as the Contract creation.
This is the enum's own designed hook point (added in the Reservation
Management task, never settable by any action until now) and is terminal
- `RESERVATION_TRANSITIONS["CONVERTED_TO_CONTRACT"]` remains `[]`.

## 11. Lead WON behavior

`Lead.status → WON` (plus `convertedContractId`/`convertedRenterId`) is
written **only after** the Contract row itself has been created inside
the same transaction - never optimistically before the transaction is
guaranteed to commit. If any later step in the transaction fails, the
whole thing rolls back and the Lead is never marked `WON` (verified by
the rollback test - §16).

## 12. Contract ↔ Reservation relation

**One physical relation**, not two duplicated FK columns (the brief's own
Step 13 instruction: "avoid duplicated inconsistent relationships if one
relation can provide both directions"). The real foreign key is
`Contract.reservationId` (nullable, `@unique`); `Reservation.convertedContract`
is Prisma's virtual back-relation over that same column - it answers
"which Contract resulted from this Reservation" for free, while
`Contract.reservation` answers "which Reservation created this Contract,"
both from the one column. The `@unique` constraint on
`Contract.reservationId` is the actual DB-level guarantee that a
Reservation can never be linked to two Contracts.

## 13. Audit

Reuses only existing `AuditAction` values - no new one:

| Event | `AuditAction` | Notes |
|---|---|---|
| Contract created | `CREATE` | `metadata` carries `reservationId`/`reservationNumber`/`offerId`/`offerNumber`/`leadId`/`unitId`/`renterId`/`contractId`/`contractNumber` together, per Step 29 |
| Reservation → `CONVERTED_TO_CONTRACT` | `UPDATE` | `metadata.contractId`/`contractNumber` |
| Lead → `WON` | `APPROVE` | matches `convertLeadToRenter()`'s own reuse of `APPROVE` for a Lead's WON transition - one consistent convention for "Lead successfully closed," regardless of which path closed it |

`entityType` is `"Contract"`/`"Reservation"`/`"Lead"` respectively. No
change to `AuditAction`, `writeAuditLog()`, or any redaction/
categorization rule in `src/lib/audit.ts`.

## 14. LeadActivity

Reuses the existing `STATUS_CHANGE` type - no new value. One entry per
successful conversion: `t.reservation.activityContractCreated(contractNumber,
unitNumber)`, matching the exact convention every other Reservation/
Offer/Lead lifecycle event in this codebase already uses.

## 15. RBAC

One new permission: `reservation.convert`
(`src/lib/permissions.ts`). OWNER/ADMIN (via `ALL_PERMISSIONS`) and
MANAGER hold it; ACCOUNTANT and VIEWER do not - matching every other
`reservation.*` mutation's policy (ACCOUNTANT's only reservation
permissions are `reservation.view`/`reservation.amount.update`, per
`docs/RESERVATION-MANAGEMENT.md` §15). Server-side enforced via
`requirePermissionAudited("reservation.convert", ...)` as the first line
of `convertReservationToContract()` - never a client-only check.

## 16. Multi-tenant security and rollback guarantees

**Security**: every query in the conversion path filters by
`organizationId` directly - verified by a real, database-backed test
suite (`reservation-contract-cross-org-security.db.test.ts`): Org A
cannot convert, or even read the conversion preview of, Org B's
Reservation; the reverse direction is verified too; a positive control
confirms Org A can convert its own Reservation normally.

**Rollback**: the whole conversion runs inside **one** `prisma.$transaction`.
A dedicated real-DB test
(`reservation-contract-rollback.db.test.ts`) forces a genuine
mid-transaction failure - a real Postgres unique-constraint violation on
`Contract.reservationId`, occurring *after* `createContractWithSchedule()`
has already created the Contract row and its PaymentSchedule rows, but
before the transaction commits - and proves the entire transaction rolls
back atomically: the just-created Contract and its PaymentSchedule rows
vanish, no partial Renter is left behind, no false Audit entry exists,
the Reservation is still `CONFIRMED`, the Lead is not `WON`, and the Unit
is still `RESERVED`.

## 17. Concurrency and idempotency

**Concurrency** (Step 19): the same production-grade strategy as
Reservation concurrency itself - the whole conversion runs under Postgres
`SERIALIZABLE` isolation (`prisma.$transaction(fn, { isolationLevel:
"Serializable" })`). A real-DB test fires two simultaneous conversion
requests for the *same* Reservation and confirms exactly one Contract
ever exists afterward, regardless of whether the loser is aborted by
Postgres's own serialization check (surfacing as Prisma error P2034) or
gracefully sees the already-converted state via the idempotency check
below - run repeatedly to confirm it is not flaky.

**Idempotency** (Step 17): at the top of the transaction, if the
Reservation is already `CONVERTED_TO_CONTRACT`, the function looks up the
existing Contract via `Contract.reservationId` and returns its id
directly - no error, no duplicate. This handles the far more common
"user double-clicked" sequential case cleanly; the DB-level `@unique`
constraint on `Contract.reservationId` (§12) is the backstop that would
still prevent a duplicate even if this application-layer check were
somehow bypassed.

## 18. Manual contracts and renewals remain fully supported

Neither `createContract()` nor `renewContract()` in
`src/lib/actions/contracts.ts` was modified. Two dedicated regression
tests prove this: a manual contract created with no Reservation involved
still gets `reservationId: null` and behaves exactly as before; a
contract renewed via `renewContract()` still produces a new Contract row
via `renewedFromContractId`, also with `reservationId: null` - renewals
are explicitly never routed through Reservation conversion, matching
Step 33's instruction that the two flows stay entirely separate.

## 19. Future Move-In integration

Not implemented in this task, by explicit instruction. The Contract
created here is `ACTIVE` immediately (§9) - the same state a manually
created contract starts in - so no additional "pending activation" state
was introduced that a future Move-In workflow would need to unwind. The
Contract's `reservationId` (§12) already gives a future Move-In feature
full traceability back to the Lead/Viewing/Offer/Reservation chain
without any further schema change.

## Reused, not duplicated

- `createContractWithSchedule()` (`src/lib/contract-schedule.ts`) - the
  exact same core service, called a third time.
- `generateSchedule()` (`src/lib/schedule.ts`) - untouched.
- `nextCounterValue()`/`formatContractNumber()` - untouched.
- `findDuplicateRenterCandidate()` (extracted from, and still used by,
  `convertLeadToRenter()` in `src/lib/actions/leads.ts`).
- `isValidReservationTransition()`/`BLOCKING_UNIT_RESERVATION_STATUSES`
  (`src/lib/crm/reservation-rules.ts`) - additively extended, not
  replaced.
- `auditCreate`/`auditAction`/`requirePermissionAudited` helpers - used
  exactly as every other module uses them.
- `date-fns`'s `addMonths()` - the same function `src/lib/schedule.ts`
  already imports, not a new date library or convention.
- `AuditTimeline` component on both the Reservation and Contract detail
  pages.
