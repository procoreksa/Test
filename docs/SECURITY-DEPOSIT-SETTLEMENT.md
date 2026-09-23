# Security Deposit & Move-Out Financial Settlement

The financial settlement layer that follows a completed Move-Out
(`docs/MOVE-OUT-MANAGEMENT.md`): liability assessment, deposit
application, refund, and any additional tenant amount due.

## 1. The critical principle

**FINDING ≠ TENANT LIABILITY ≠ FINANCIAL DEDUCTION.**

A Move-Out finding (a deteriorated inspection item, a missing inventory
item, a key/access-device variance, a linked Maintenance Request) is
**evidence only**. It never, by itself, determines who is responsible, how
much (if anything) should be deducted, or whether a deduction is
appropriate at all. An authorized human must explicitly:

1. Assess responsibility (`MoveOutLiabilityAssessment.responsibility`,
   defaulting to `UNDETERMINED` - never inferred from a condition rating).
2. Decide whether a financial deduction is appropriate at all (`NO_CHARGE`
   is a first-class responsibility value, not an afterthought).
3. Propose an amount (`proposedAmount`).
4. Have a separately-authorized approver decide the actual approved amount
   (`approvedAmount`) - which is never silently derived from, or used to
   overwrite, the proposed amount.
5. Have the settlement itself approved (freezing a commercial snapshot).
6. Have the settlement posted (creating the actual financial movements).

Every function in `src/lib/security-deposit-rules.ts` and every server
action in `src/lib/actions/security-deposits.ts` enforces this chain
explicitly. `sumApprovedTenantDeductions()` is the single aggregation
point where "Finding ≠ Liability" is enforced at the calculation layer: a
non-`TENANT` responsibility (including `UNDETERMINED`, `NO_CHARGE`,
`OTHER`) always contributes zero, regardless of any amount recorded on it.

## 2. Invariants inherited from Move-Out (never touched here)

`completeMoveOut()` (`docs/MOVE-OUT-MANAGEMENT.md`) remains the **sole**
authoritative operation that transitions a Unit to `VACANT`. This module:

- Never determines tenant liability as a side effect of Move-Out
  completion.
- Never deducts the security deposit, creates an Invoice, creates a
  Payment, creates a refund, or posts any accounting entry as part of
  completing a Move-Out.
- Never mutates `MoveOut`, `MoveOutInspectionItem`,
  `MoveOutInventoryItem`, `MoveOutKeyItem`, or any of their evidence -
  Move-Out stays immutable once `COMPLETED`; this module only ever reads
  it (proven by `security-deposit-lifecycle.db.test.ts`'s explicit
  Move-Out/Unit/Contract-status assertions after every settlement action).
- Never touches `Unit.status` or `Contract.status`.

## 3. Step 1 architecture audit - why five new models, not table reuse

Before any schema was written, the existing financial architecture was
audited against four candidate "just reuse what exists" approaches, all
of which were rejected for concrete, documented reasons:

- **A fake negative `Payment`** to represent a refund. Rejected:
  `Payment.invoiceId` is required and non-nullable - a `Payment` is
  fundamentally "money received against an invoice." A refund is a
  genuine outgoing movement to the tenant with no invoice on the other
  side. `reversePayment()`'s own negated-`Payment` pattern exists to
  *correct a mis-recorded receipt*, a completely different meaning from
  "pay money out." Forcing a refund through this table would either
  require a fabricated invoice or silently redefine what `Payment` means
  everywhere else in the codebase.
- **A fake `Invoice`** for the deposit deduction itself. Rejected: an
  Invoice represents a genuine billable claim against the tenant with its
  own VAT/ZATCA compliance obligations. A deposit *application* (money
  the organization already holds, being kept rather than billed) is not a
  new claim - it needs no invoice at all. The Invoice mechanism is reused,
  correctly, only for the genuinely new receivable case (Additional
  Tenant Amount Due, §13).
- **`OwnerLedgerEntry`** for deposit collection/application. Rejected:
  that ledger has no "holding liability" entry type, and posting a
  tenant's deposit there would misrepresent money the organization holds
  *in trust* as owner income - see §16 for why this integration is
  explicitly deferred, not silently done.
- **`MaintenanceCostResponsibility`** reused as the settlement
  responsibility enum. Rejected: it lacks `NO_CHARGE`, and this codebase's
  own established precedent (`MoveOutCancelReason` vs.
  `MaintenanceCancelReason`) is to give each domain its own
  responsibility/reason enum even when conceptually similar - see the new
  `SettlementResponsibility` enum instead.

The conclusion (Step 2's stop condition): introduce a minimal, clean,
dedicated set of models rather than force-fit into any of the above.

## 4. Data model

Five new models, seven new enums, appended to `prisma/schema.prisma`
(migration `20260923094528_security_deposit_settlement`):

- **`SecurityDepositSettlement`** - one per completed Move-Out
  (`moveOutId @unique`, DB-enforced). Orchestrates the workflow; never
  duplicates Move-Out/Contract data beyond the `contractId`/`unitId`/
  `renterId` it copies once at creation (mirroring how `MoveOut` itself
  copies `unitId`/`renterId` from `Contract`).
- **`MoveOutLiabilityAssessment`** - one explicit human decision per piece
  of evidence (or a manual entry). Typed nullable FK relations
  (`moveOutInspectionItemId`/`moveOutInventoryItemId`/`moveOutKeyItemId`/
  `maintenanceRequestId`) instead of a polymorphic `sourceType` + bare
  string id, so referential integrity is real.
- **`SecurityDepositLedgerEntry`** - append-only, debit/credit columns
  (never a signed amount), exactly mirroring `OwnerLedgerEntry`'s own
  convention. `COLLECTION` / `APPLICATION` / `REFUND` / `ADJUSTMENT` /
  `REVERSAL` entry types.
- **`SecurityDepositRefund`** - a genuine outgoing-money record,
  `PENDING`/`APPROVED`/`PAID`/`CANCELLED`. V1 only ever writes `PAID`
  directly (§14).
- **`SecurityDepositSettlementNote`** - append-only operational
  discussion, explicitly separate from `AuditLog` (§26).

**Actor-field convention** (matches this codebase's established pattern):
required actor fields that must survive a `User` being deleted are plain
`String` columns (`preparedByUserId`, `assessedByUserId`,
`authorUserId`, ledger `createdBy`), not FK relations - this is why
`npx prisma format` flagged and required converting three fields away
from `onDelete: SetNull` relations (a required field cannot support
`SetNull`). Optional "live operational assignment" fields
(`reviewedByUserId`, `approvedByUserId`, `postedByUserId`,
`cancelledByUserId`, assessment `approvedByUserId`) remain real, nullable
FK relations with `onDelete: SetNull`.

## 5. Settlement status lifecycle

```
DRAFT -> UNDER_REVIEW -> PENDING_APPROVAL -> APPROVED -> POSTED -> {PARTIALLY_SETTLED -> SETTLED | SETTLED}
  \-> CANCELLED (from DRAFT/UNDER_REVIEW/PENDING_APPROVAL only)
UNDER_REVIEW -> DRAFT (sent back)
PENDING_APPROVAL -> UNDER_REVIEW (sent back)
APPROVED -> UNDER_REVIEW (reopened for correction, clearing the approved snapshot)
```

Centralized in `SETTLEMENT_TRANSITIONS` (`security-deposit-rules.ts`),
exactly mirroring `MOVE_IN_TRANSITIONS`/`MOVE_OUT_TRANSITIONS`'s own
table-driven pattern. The four required phase separations map directly:
**assessment** = `DRAFT`/`UNDER_REVIEW`/`PENDING_APPROVAL`, **approval** =
`APPROVED`, **posting** = `POSTED`, **cash settlement** =
`PARTIALLY_SETTLED`/`SETTLED`. `isSettlementEditable()` allows assessment
edits through all three assessment-phase statuses; editing stops the
instant a settlement reaches `APPROVED`.

## 6. Eligibility and duplicate prevention

`isMoveOutEligibleForSettlement()`: only a `COMPLETED` Move-Out is
eligible. `createSecurityDepositSettlement()` re-checks this fresh inside
a `Serializable` transaction and re-checks `moveOutId @unique` via both
the DB constraint and an explicit pre-check, so a duplicate settlement for
the same Move-Out is impossible even under concurrent creation attempts -
proven by `security-deposit-concurrency.db.test.ts`'s
`Promise.allSettled()` race test (exactly one settlement results).

## 7/8. Deposit-amount sourcing - required vs. actually-collected

Two numbers are deliberately never conflated:

- **Contractual required deposit** - `Contract.securityDeposit`, a static
  display-only figure. Never treated as "available."
- **Available Deposit** - `computeAvailableDepositBalance()`, always
  `SUM(credit) - SUM(debit)` over
  `SecurityDepositLedgerEntry` rows for the Contract, exactly mirroring
  `OwnerLedgerEntry`'s own balance convention. **Never independently
  stored** - always recomputed from the ledger, live, everywhere it's
  displayed (`getDepositPositionForContract()`,
  `getSecurityDepositSettlementById()`'s `availableDeposit`).

An over-collected deposit (`availableDeposit > requiredDeposit`) is
surfaced as an explicit UI notice (`depositOverCollectedNotice`), **never
silently clamped** to the contractual figure - proven by
`security-deposit-lifecycle.db.test.ts`'s dedicated over-collection test.

## 9. Collection-ledger sync - a one-time, documented operation

`syncDepositCollectionLedgerOnce()` runs exactly once, at settlement
creation, deriving `COLLECTION` ledger entries from the Contract's
existing, unmodified paid `SECURITY_DEPOSIT` Invoice line(s) - the
collection side of deposits was already correctly built in an earlier
phase (`issueInvoiceForSchedule()`, 0% VAT) and is reused, never
re-implemented. Idempotent via the
`@@unique([organizationId, referenceType, referenceId])` constraint, so
calling it twice for the same Invoice is a safe no-op.

**Per-invoice allocation precision**: `computeInvoiceDepositPortion()`
reuses the *exact same* whole-invoice proportional-share approximation
`schedule-status.ts`'s `recomputeScheduleStatus()`/`getScheduleRemaining()`
already establish and this codebase already accepts for partial payments,
rather than inventing new per-line payment-allocation precision this
codebase's data model (`Payment.invoiceId`, not
`Payment.invoiceLineId`) cannot actually support. This is a deliberate,
documented simplification, not an oversight.

**Known V1 limitation**: the sync is one-time, not a live/continuous
resync. If a deposit Invoice receives *additional* payment after
settlement creation (rare - it happens only after Move-Out completion,
i.e. near/after contract end), that additional collection is not
automatically picked up. The documented workaround: an authorized user
posts a manual `ADJUSTMENT` ledger entry
(`postSecurityDepositLedgerAdjustment()`) once they've independently
verified the additional collection. This was judged a reasonable,
honestly-scoped simplification rather than building full incremental
delta-tracking for an edge case this rare.

## 10. Historical/legacy deposit backfill policy

There is no bulk-backfill tool. A pre-existing deposit collected before
this module existed is represented the same way any other collection is:
either it already has a paid `SECURITY_DEPOSIT` Invoice line (the sync
picks it up automatically) or it doesn't, in which case an authorized
user posts an explicit `ADJUSTMENT` `credit` entry with a description
citing their independent verification. **This module never fabricates a
cash receipt** - an `ADJUSTMENT` entry is always a deliberate, audited,
human-authorized action (`securityDeposit.post` permission), never an
automatic migration script.

## 11. Liability assessment - responsibility and category

`SettlementResponsibility`: `TENANT` / `OWNER` / `PROPERTY_MANAGEMENT` /
`VENDOR` / `WARRANTY` / `UNDETERMINED` (default) / `NO_CHARGE` / `OTHER`.
`SettlementDeductionCategory`: `DAMAGE` / `MISSING_INVENTORY` /
`MISSING_KEY_OR_ACCESS_DEVICE` / `CLEANING` / `MAINTENANCE` /
`OTHER_CONTRACTUAL_CHARGE` / `OTHER` - **deliberately excludes**
`UNPAID_RENT`/`UNPAID_UTILITY` (§12).

`addLiabilityAssessment()` never infers responsibility from a condition
rating, a maintenance cost, or any other evidence field - `responsibility`
defaults to `UNDETERMINED` and is only ever set by an explicit later call
to `updateLiabilityAssessment()`. Evidence ids are re-verified,
server-side, to belong to the settlement's own `moveOutId` before
insertion (Step 82/83's relation-injection defense) - proven by
`security-deposit-cross-org-security.db.test.ts`'s same-org
relation-injection test.

## 12. Why `UNPAID_RENT`/`UNPAID_UTILITY` were deliberately excluded

This codebase already tracks unpaid rent authoritatively via
`PaymentSchedule`/`Invoice`/`recomputeScheduleStatus()`. Adding a
settlement deduction category that re-derives "how much rent is unpaid"
here would risk double-charging the tenant (once via the normal
collections/overdue flow, once via a settlement deduction) - a genuine
unpaid-rent charge is entered as `OTHER_CONTRACTUAL_CHARGE` with a manual
reference to the specific existing Invoice/PaymentSchedule row, never
re-summed by this module. There is no utility-billing feature in this
codebase at all, so `UNPAID_UTILITY` has nothing to safely re-derive from
either.

## 13. `MaintenanceWorkOrder.actualCost` is evidence, not an automatic charge

An assessment may cite a linked `maintenanceRequestId` as supporting
evidence and a preparer may *choose* to use `MaintenanceWorkOrder.actualCost`
as a reference point for their `proposedAmount`, but the assessment always
decides its own split (e.g. tenant-caused vs. normal wear, partial
tenant/partial owner responsibility) - `actualCost` is never copied in
automatically, and `MaintenanceCostResponsibility` (the maintenance
module's own responsibility enum) is never read or trusted by this
module's calculation.

## 14. The settlement calculation - one formula, no exceptions

`computeSettlementOutcome(A, D)`, where **A** = live Available Deposit and
**D** = `sumApprovedTenantDeductions()` (TENANT-responsibility approved
amounts only):

```
Deposit Applied = min(A, D)
Refund Due      = max(A - D, 0)
Additional Due  = max(D - A, 0)
```

All five worked examples from the spec are covered by both
`security-deposit-rules.test.ts` (pure) and
`security-deposit-lifecycle.db.test.ts` (real DB, end to end):

| A (Available) | D (Approved) | Applied | Refund Due | Additional Due |
|---|---|---|---|---|
| 8000 | 2500 | 2500 | 5500 | 0 |
| 8000 | 10000 | 8000 | 0 | 2000 |
| 8000 | 0 | 0 | 8000 | 0 |
| 5000 (required 8000) | 7000 | 5000 | 0 | 2000 |
| 0 | 2000 | 0 | 0 | 2000 |

An over-collected A is never clamped against the contractual requirement
- the formula only ever compares A against D, nothing else.

## 15. Waiver arithmetic - no double counting

`validateAssessmentAmounts()` enforces, per assessment:
`approvedAmount + waivedAmount <= proposedAmount`, and
`approvedAmount != 0` is rejected unless `responsibility === "TENANT"`.
Worked example from the spec (Proposed=1000, Approved=600, Waived=400)
passes; any combination that would double-count (e.g. Approved=700,
Waived=400 on a Proposed=1000 line) is rejected before it reaches the
database.

## 16. Owner Ledger is never touched by this module

Neither deposit collection nor a tenant deduction posts to
`OwnerLedgerEntry` - a tenant's security deposit is money the organization
holds *in trust*, not owner revenue, and this codebase's existing owner
ledger has no "holding liability" entry type to represent that correctly.
This is a deliberate, permanent design decision, not a placeholder: if a
future requirement needs owner-facing visibility into deposit
liabilities, it should be a new, explicit integration point (e.g. a
read-only owner-statement line), never an automatic posting from this
module.

## 17. Approval - the frozen commercial snapshot

`approveSettlement()` re-verifies every input fresh, inside a
`Serializable` transaction (never trusting anything computed before the
transaction opened): re-reads the ledger, recomputes Available Deposit,
recomputes `sumApprovedTenantDeductions()`, recomputes the outcome, then
writes five `approved*` fields onto the settlement
(`approvedAvailableDeposit`, `approvedTenantDeductions`,
`approvedDepositApplied`, `approvedRefundDue`, `approvedAdditionalDue`) -
**null until approval, never recalculated afterward** even if a source
record could theoretically change later. Posting (§18) reuses these exact
frozen values; it never re-derives new ones. `reopenSettlementForCorrection()`
is the only way to clear this snapshot (back to `UNDER_REVIEW`), and it's
an explicit, permission-gated, audited action - never a silent
recalculation.

## 18. Approval blockers

`getApprovalBlockers()` returns `UNDETERMINED_RESPONSIBILITY_EXISTS`
and/or `UNRESOLVED_DISPUTE_EXISTS`. `approveSettlement()` throws if either
is present - proven by both blocker tests in
`security-deposit-lifecycle.db.test.ts`. An **empty** assessment list is
explicitly *not* a blocker: a completed Move-Out with genuinely nothing to
assess is a valid, normal zero-deduction settlement (worked example A=8000,
D=0 above).

## 19. Posting - idempotent, atomic, re-validated server-side

`postSecurityDepositSettlement()`:

1. Re-fetches the settlement fresh inside a `Serializable` transaction.
2. **Idempotent early return**: if already `POSTED`/`PARTIALLY_SETTLED`/
   `SETTLED`, returns the existing id without creating any new movement -
   the exact same pattern `completeMoveOut()` already established.
   Proven under genuine `Promise.allSettled()` concurrency by
   `security-deposit-concurrency.db.test.ts` (exactly one `APPLICATION`
   ledger entry and one additional-due Invoice result from two
   simultaneous calls).
3. Rejects if not `APPROVED`, or if the frozen snapshot is somehow absent.
4. Posts an `APPLICATION` ledger entry (debit) for `approvedDepositApplied`,
   if positive.
5. Issues an Invoice (via the existing, unmodified `issueInvoice()`) for
   `approvedAdditionalDue`, if positive - reusing the existing Invoice/
   Payment architecture rather than building a second payment engine
   (§20).
6. Computes the new status via `computeSettlementCompletionStatus()`
   (§21) and updates the settlement.

## 20. Additional Tenant Amount Due - reuses the existing Invoice flow

`issueInvoice()` gained a `settlementId?: string | null` field
(traceability only - it changes no invoicing/VAT/numbering behavior) so
the receivable created at posting links back to its settlement
(`SecurityDepositSettlement.additionalDueInvoices`). The line is issued
`vatRate: 0` (tax-neutral, §22) with kind `OTHER`. **An Invoice for this
is created exactly once**, only at posting, only from the frozen approved
figure - never from an unapproved finding or assessment, and never a
second time on a repeat `postSecurityDepositSettlement()` call (§19).
Actual collection of this receivable is tracked by the existing,
unmodified Invoice/Payment reporting - this module does not duplicate
that tracking.

## 21. SETTLED / PARTIALLY_SETTLED - one explicit definition

`computeSettlementCompletionStatus(refundDue, refundPaid)`:

- **`SETTLED`**: `refundDue <= 0` (nothing to refund - settled
  immediately at posting), or `refundPaid >= refundDue` (fully paid).
- **`PARTIALLY_SETTLED`**: `0 < refundPaid < refundDue`.
- **`POSTED`**: `refundPaid == 0` and `refundDue > 0` (posted, nothing
  paid out yet).

The Additional-Due side is **not** a factor in this function - it's
considered "handled" the instant its receivable Invoice is `POSTED`
(§20), not once actually collected; that collection is tracked
independently, on its own terms, by the existing Invoice/Payment system.
This is the single, documented definition the spec required - never left
ambiguous, and never redefined anywhere else in the codebase.

## 22. VAT / tax-neutral posture

Neither the deposit application nor the additional-due receivable line is
assumed taxable. The additional-due Invoice line uses `vatRate: 0` with
an inline comment documenting this as tax-neutral pending an explicit
future tax-policy decision - mirroring the exact same reasoning
`issueInvoiceForSchedule()` already applies to the `SECURITY_DEPOSIT`
collection line itself ("a refundable deposit is not consideration for a
taxable supply"). No VAT is fabricated anywhere in this module.

## 23. Refund architecture

`SecurityDepositRefund` is a genuine outgoing-money record, **never** a
fake positive `Payment` (§3). `recordSecurityDepositRefund()` always
records an *already-executed* payment (status written `PAID` immediately,
`paidAt` set) - there is no separate refund-request/refund-approval UI
step in V1, since the settlement's own approval already authorizes the
refund amount. `PENDING`/`APPROVED`/`CANCELLED` remain valid schema states
reserved for a future workflow extension, without needing a migration.

## 24. Refund-due vs. refund-paid, tracked separately, and over-refund prevention

`approvedRefundDue` (frozen at approval) is never conflated with the sum
of `PAID` `SecurityDepositRefund` rows (`refundPaid`, always recomputed
live). `computeRefundRemaining()`/`isRefundAmountAllowed()` re-verify,
**inside the same `Serializable` transaction**, immediately before every
insert, that a requested amount does not exceed the live remaining
balance - proven under genuine concurrency by
`security-deposit-concurrency.db.test.ts`'s two-simultaneous-5000-refund
test against an 8000 refund-due balance (exactly one succeeds; total paid
never exceeds the due amount), and its companion test proving a valid
partial-then-remainder sequence is allowed while any further over-refund
attempt is rejected.

## 25. Reversal architecture - decided before declaring posting complete

`SecurityDepositLedgerEntry` is append-only; there is deliberately no
update/delete action for it anywhere. A mistaken entry is corrected only
by `reverseSecurityDepositLedgerEntry()`, which posts a new `REVERSAL` row
carrying the exact opposite debit/credit of the entry it reverses
(`reversalDebitCredit()`), linked back via a `@unique` self-relation FK
(`reversalOfEntryId`) so an entry can be reversed at most once. This
**never deletes financial history** - the original row remains forever,
and the reversal always references it.

## 26. Cancellation - only pre-posting, requires a reason

`isSettlementCancellable()`: only `DRAFT`/`UNDER_REVIEW`/
`PENDING_APPROVAL` may be cancelled. `cancelSettlement()` requires a
non-empty `reason` and writes `cancelledByUserId`/`cancelledAt`/
`cancelReason` - the row is never deleted. Once a settlement has
`POSTED` (real financial movements exist), cancellation is no longer
offered at all; the only path to undo a posted effect is the reversal
architecture (§25) plus, if needed, a manual settlement note explaining
why.

## 27. Post-approval / post-posting immutability

`isSettlementEditable()` excludes `APPROVED` and every status after it -
`updateLiabilityAssessment()`/`addLiabilityAssessment()` both re-check
this fresh and throw if the settlement is no longer editable, proven by
the lifecycle test's explicit "update rejected after approval" assertion.
The five `approved*` snapshot fields themselves have no update path at all
outside of `approveSettlement()` (setting them) and
`reopenSettlementForCorrection()` (clearing them) - no other function
ever writes to them.

## 28. Dispute tracking - never itself an accounting action

`SettlementDisputeStatus`: `NONE` / `RAISED` / `UNDER_REVIEW` / `RESOLVED`,
tracked per-assessment. `updateAssessmentDispute()` only ever writes
`disputeStatus`/`disputeNote` - it never creates, modifies, or reverses
any ledger entry, refund, or invoice. This module is not a legal
case-management system: a dispute is a flag that blocks approval (§18)
until resolved, nothing more.

## 29. Settlement notes - separate from AuditLog

`SecurityDepositSettlementNote` is an append-only operational discussion
log (`addSettlementNote()`), explicitly distinct from `AuditLog`. `AuditLog`
remains a pure, system-written compliance record of state
transitions/field changes - it is never used as a comments thread, and
notes never feed into any compliance report.

## 30. Audit events

Every state-changing action writes an `AuditLog` row via
`auditCreate()`/`auditAction()`: settlement created, assessment added,
responsibility/proposed/approved changed, waiver recorded, dispute
raised/resolved, submitted for review, reviewed (forward/back), approved,
reopened for correction, cancelled, posted, refund recorded, ledger
adjustment posted, ledger entry reversed. Field-level edits inside a
single assessment update are captured as one `UPDATE` audit row (not one
per keystroke) - consistent with every other module's audit granularity
in this codebase.

## 31. RBAC / segregation of duties

Nine new `Permission` keys (`securityDeposit.view/create/assess/review/
approve/post/refund.view/refund.manage/dispute.manage`). Full role
mapping and rationale: `docs/PERMISSIONS.md` §2-3. Summary: MANAGER
prepares/assesses/reviews/manages disputes but can never approve, post, or
manage a refund; ACCOUNTANT reviews/posts/manages refunds but can never
create a settlement, assess, approve, or manage a dispute; `approve` is
OWNER/ADMIN-only; VIEWER gets `view`/`refund.view` only. Every mutating
action calls `requirePermission()`/`requirePermissionAudited()` before
touching the database - UI-layer `can()` checks are usability-only, never
the actual gate (verified directly by
`security-deposit-cross-org-security.db.test.ts`, which calls the real
server actions, not the UI).

## 32. Multi-tenant isolation and test coverage

Every mutating action re-derives `organizationId` from the authenticated
session and scopes every query by it; nothing trusts a client-supplied
`organizationId`, collected-deposit figure, available-deposit figure,
total, or actor identity. Verified by real, database-backed tests:

- **`security-deposit-lifecycle.db.test.ts`** (11 tests) - eligibility,
  duplicate-creation rejection, the full happy-path lifecycle (DRAFT
  through SETTLED) with Move-Out/Unit/Contract-immutability assertions,
  posting idempotency, all five calculation worked examples, and both
  approval blockers.
- **`security-deposit-concurrency.db.test.ts`** (4 tests) - deterministic,
  no-sleep `Promise.allSettled()` races: duplicate settlement creation,
  double posting, simultaneous refund overdraw, and a valid
  partial-then-remainder refund sequence.
- **`security-deposit-cross-org-security.db.test.ts`** (12 tests) - a
  second organization is proven unable to read or mutate the first
  organization's settlement, assessment, ledger-adjustment, refund, or
  report data across every entity id in the matrix (`settlementId`,
  `moveOutId`, `contractId`, `assessmentId`, `ledgerEntryId`), plus a
  same-organization relation-injection test (evidence from one Move-Out
  cannot be attached to a different settlement in the same org).

All pre-existing financial regression suites (Invoice/Payment/
PaymentSchedule/OwnerLedger/VAT) continue to pass unmodified - full
before/after counts in the final verification report.

---

*No feature creep*: this module deliberately does not include a Tenant
Portal, an online tenant refund portal, a payment gateway/bank API/Open
Banking integration, WhatsApp/email automation, AI liability assessment
or damage valuation, automatic tenant blame, legal claims management,
debt collection automation, credit bureau reporting, a full General
Ledger, Purchase Orders/vendor accounting, a Preventive Maintenance or
Turnover/Make-Ready module, Document Management, real object storage, or
e-signature. Every one of those is either genuinely out of scope for this
module or a separate future project.
