# Move-Out Management

## 1. Overview & scope

Move-Out Management is the physical unit hand-back counterpart to Move-In
& Handover Inspection (`docs/MOVE-IN-HANDOVER.md`): the operational record
of a tenant physically vacating a Unit at the end (or early termination)
of a tenancy - preparation, inspection, findings review, tenant
acknowledgement, and completion.

This phase was built in two stages:

- **Phase 1 (architecture audit, read-only)** - a pure discovery pass over
  the existing Contract/Unit/Move-In/Maintenance architecture, producing a
  report of findings (most notably: `ContractStatus.EXPIRED` is never
  actually set by any code anywhere, and `terminateContract()` used to set
  `Unit.status = VACANT` unconditionally and synchronously) and five open
  architectural questions.
- **Phase 2 (this document)** - implementation, following five explicit,
  binding decisions the user made in response to Phase 1's open questions
  (recapped in §2), plus a detailed numbered specification covering
  lifecycle, schema, RBAC, security, financial isolation, and testing.

Move-Out is deliberately **not** a mirror-image, shared-table extension of
Move-In. It is its own model family that reads Move-In (and every one of
its child tables) as read-only historical baseline data, and never writes
back to it.

## 2. The five binding decisions (Phase 2)

1. **Physical vacancy belongs to Move-Out.** `Unit.status = VACANT` must
   represent confirmed physical vacancy. A Unit must not become VACANT
   merely because a Contract is terminated - only a **completed** Move-Out
   may transition the Unit to VACANT, subject to strict transactional
   re-validation (§8). This tightens `terminateContract()`'s previous
   behavior (it used to vacate the Unit unconditionally).
2. **Move-Out does not terminate the Contract.** Move-Out never
   automatically terminates, expires, renews, or otherwise mutates a
   Contract. A Move-Out may be created for an eligible `ACTIVE` or
   `TERMINATED` Contract; `RENEWED` and `DRAFT` are never eligible. For an
   `ACTIVE` Contract, a Move-Out may be prepared before the Contract
   formally ends - including during the existing Contract-expiry gap (§14).
3. **Outstanding balances do not block Move-Out.** Unpaid/partial
   invoices, payment schedules, rent, commissions, and security-deposit
   invoices never prevent physical Move-Out. Move-Out is operational, not
   financial - there is no financial-balance gate anywhere in this module.
4. **Security-deposit settlement is out of scope.** No deposit refund,
   deduction, credit note, damage billing, tenant charge, accounting
   entry, `OwnerLedgerEntry` posting, or automatic invoice/payment
   creation. Damage/findings are operational records only
   (`requiresAttention`/`condition` on `MoveOutInspectionItem`).
5. **Automatic Contract expiry is out of scope.** No automatic
   `ACTIVE -> EXPIRED` process was implemented. The existing gap is
   documented as technical debt (§14, `docs/TECHNICAL-DEBT.md`), not fixed.

## 3. Domain model

```
Contract (ACTIVE or TERMINATED, never RENEWED/DRAFT)
  └── MoveOut (0 or 1 "active" at a time - see §6)
        ├── moveInId? ──────► MoveIn (read-only baseline, same Contract)
        ├── inspectionItems[] ──(optional)──► MoveInInspectionItem (read-only link)
        ├── inventoryItems[]        (no stored link - diffed by category+itemName)
        ├── meterReadings[]         (no stored link - diffed by meterType)
        ├── keyItems[]              (no stored link - reconciled by keyType+description)
        ├── attachments[]
        └── maintenanceRequests[] ◄── MaintenanceRequest.moveOutId (reference only)
```

`MoveOut` is created with `unitId`/`renterId` **always derived server-side
from the verified Contract** inside the same transaction - never trusted
from client-supplied form fields, exactly like Move-In's own precedent.

### Reused enums (no duplication)

Per the explicit "reuse, don't duplicate" instruction, Move-Out reuses:

- `ConditionRating`, `InspectionCategory`, `MeterType`, `KeyType` (shared
  with Move-In's own inspection/inventory/meter/key models).
- `MoveInAttachmentType` on `MoveOutAttachment.attachmentType` - PHOTO/
  DOCUMENT/OTHER applies equally to a Move-Out photo, so no
  `MoveOutAttachmentType` enum was created.

Two new enums were added: `MoveOutStatus` and `MoveOutCancelReason`.

## 4. `MoveOut` model fields

| Field | Purpose |
|---|---|
| `organizationId`, `moveOutNumber` | Standard multi-tenant + `MO-000001` numbering (Counter key `moveOut`, no year component, matching Move-In/Reservation/Offer). |
| `contractId`, `unitId`, `renterId` | `unitId`/`renterId` always derived from `contractId` at creation - never client-supplied. |
| `moveInId` | Optional reference to the Contract's own baseline Move-In (auto-derived at creation - see §7). |
| `status` | `MoveOutStatus` - see §5. |
| `scheduledAt`, `startedAt`, `completedAt`, `vacateDate` | Lifecycle timestamps; `vacateDate` is the tenant-facing "moved out on" date, separate from `completedAt` (the staff-side record-closure timestamp). |
| `inspectedByUserId`, `handedOverByUserId` | Always the authenticated session's own user id - no action accepts a client-supplied user id for these fields. |
| `findingsReviewedAt`, `findingsReviewedByUserId` | Set only by `reviewMoveOutFindings()` - the gate for `PENDING_FINDINGS_REVIEW -> READY_FOR_CLOSURE` (no Move-In equivalent - a deliberate addition beyond the user's explicit minimum field list, directly implied by the approved lifecycle's own distinct review step). |
| `tenantRepresentativeName`, `tenantRepresentativeId` | Free text, same as Move-In - the person present may not be an app user. |
| `overallCondition`, `tenantComments`, `internalNotes` | Same shape as Move-In. |
| `tenantAcknowledgedAt`, `tenantAcknowledgementOverride(+Reason)`, `staffAcknowledgedAt` | Operational acknowledgement, explicitly not a legal e-signature - same pattern as Move-In. |
| `noKeysToReturn` | Escape hatch for the key-return completion gate (mirrors `MoveIn.noKeysToRecord`). |
| `cancelReason`, `cancelReasonNote`, `cancelledAt` | See §5/§9. |
| `createdByUserId` | Plain string, not a relation - survives the creating user being removed. |

### Child models

`MoveOutInspectionItem`, `MoveOutInventoryItem`, `MoveOutMeterReading`,
`MoveOutKeyItem`, `MoveOutAttachment` - structurally identical to their
Move-In counterparts. `MoveOutInspectionItem` additionally carries an
optional `moveInInspectionItemId` (`onDelete: SetNull`, reference-only) for
a direct before/after condition delta on the same checklist item.

## 5. Status lifecycle (`MoveOutStatus`)

```
DRAFT ──► SCHEDULED ──► IN_PROGRESS ──► PENDING_FINDINGS_REVIEW ──► READY_FOR_CLOSURE ──► COMPLETED
  │           │              │                    │                        │
  └───────────┴──────────────┴────────────────────┴────────────────────────┴──► CANCELLED
```

Implemented as a single, authoritative pure function,
`isValidMoveOutTransition(from, to)`, in `src/lib/operations/move-out-rules.ts`
- lifecycle legality is never scattered across actions. `COMPLETED` and
`CANCELLED` are strictly terminal (`isMoveOutTerminal()`).

Two small backward moves are also legal - `PENDING_FINDINGS_REVIEW ->
IN_PROGRESS` and `READY_FOR_CLOSURE -> PENDING_FINDINGS_REVIEW`
(`reopenMoveOutStage()`), mirroring the exact same reopen allowance
`move-in-rules.ts` already grants (`READY_FOR_HANDOVER -> IN_PROGRESS`) so
staff can correct a premature advance without cancelling and starting
over. Stepping back out of `READY_FOR_CLOSURE` clears the findings-review
stamp, since it must be redone.

**Editable statuses** (`isMoveOutEditable()`): `IN_PROGRESS` and
`PENDING_FINDINGS_REVIEW` only. Every inspection/inventory/meter/key/
attachment/acknowledgement/vacate-date mutation must happen **before**
findings review advances the record into `READY_FOR_CLOSURE` - after that,
the record is locked pending completion (or a `reopenMoveOutStage()` step
back).

## 6. One active Move-Out per Contract

Enforced the same way "one active Move-In per Contract" and "one active
Reservation per Offer" already are elsewhere in this codebase: an
application-layer predicate, `blocksNewMoveOutForContract()`, checked
inside a **Serializable** transaction inside `createMoveOut()` - not a
database unique constraint (which would permanently prevent a cancelled
Move-Out from being followed by a legitimate new attempt). Every status
except `CANCELLED` blocks a new Move-Out for the same Contract; a
Contract may accumulate several cancelled Move-Out attempts before a
successful one.

## 7. Contract eligibility & Move-In baseline linking

`createMoveOut()` accepts a Contract only when `status` is `ACTIVE` or
`TERMINATED` (`MOVE_OUT_ELIGIBLE_CONTRACT_STATUSES`). `DRAFT` and
`RENEWED` are rejected by this single check - which also satisfies
requirement 4's "creating a Move-Out for a RENEWED Contract must be
rejected."

At creation, the Contract's most relevant Move-In (preferring a
non-cancelled one, same "most relevant record" rule
`getMoveInForContract()` already uses) is looked up and auto-linked as
`moveInId` - **never client-supplied**. When one exists, its inspection
checklist is **cloned** as the Move-Out's own baseline checklist (each
cloned item carries `moveInInspectionItemId` pointing at its source, for a
direct before/after diff). When none exists, the same centralized default
checklist template Move-In itself uses (`getDefaultInspectionChecklist()`,
imported, never duplicated) is seeded fresh.

## 8. Unit vacancy invariant - the critical change

### `terminateContract()`

Previously set `Unit.status = VACANT` unconditionally as part of
termination. **That line was removed.** Every other effect of termination
is unchanged: `Contract.status -> TERMINATED`, pending `PaymentSchedule`
rows cancelled, audit entry written. No financial side effect was
introduced or removed - this is a pure vacancy-timing change. Verified by
a regression test (`move-out-lifecycle.db.test.ts`, "terminateContract()
Unit-vacancy regression").

### `completeMoveOut()`

The sole, authoritative trigger that may set `Unit.status = VACANT`
anywhere in this codebase. Runs inside a single **Serializable**
transaction and performs, in order:

1. **Idempotency check** - a second call on an already-`COMPLETED`
   Move-Out returns the same id, re-running no side effect and
   re-checking no safety invariant.
2. **Transition check** - `READY_FOR_CLOSURE -> COMPLETED` must be legal
   (this alone enforces "Move-Out is in `READY_FOR_CLOSURE`").
3. **Fresh re-verification of every relation**, read again inside this
   same transaction (never trusting anything read before it started):
   - The Contract (`moveOut.contractId`) still belongs to the session's
     Organization.
   - `contract.unitId === moveOut.unitId` and `contract.renterId ===
     moveOut.renterId` (catches Contract/Unit and Contract/Renter drift -
     `updateContract()` can still change a Contract's `unitId`/`renterId`
     pre-billing).
   - If `moveOut.moveInId` is set, that Move-In belongs to the **same**
     Contract (`moveIn.contractId === moveOut.contractId`) - catches a
     MoveOut/MoveIn cross-Contract injection.
   - The Unit belongs to the same Organization.
4. **Completion-requirements validation** (`validateMoveOutCompletion()`,
   §10) - operational only, no financial check.
5. **Conflicting-occupancy check** - the explicit, pure, unit-tested
   definition of "unsafe to vacate"
   (`isUnsafeToVacate()` in `move-out-rules.ts`):
   > Another `ACTIVE` Contract already exists for the Unit (besides this
   > Move-Out's own), **or** the Unit is currently held by a live
   > (`PENDING`/`CONFIRMED`) Reservation.

   Both counts are computed fresh, inside the same transaction,
   immediately before the write. If either is non-zero, completion is
   **rejected outright and every record is left exactly as it was** - the
   Move-Out stays `READY_FOR_CLOSURE`, the Unit is untouched, no audit
   entry is written. There is no partial write; verified by
   `move-out-completion-safety.db.test.ts`.
6. **Atomic write** (only once every check above passes): mark
   `COMPLETED`, set `completedAt`, set `Unit.status = VACANT` **only if it
   isn't already** (`unit.status !== "VACANT"`, avoiding a no-op write),
   write one audit entry.

## 9. Renewal conflict & one-active-Move-Out predicate reuse

`blocksNewMoveOutForContract()` and the renewal-conflict predicate
(`moveOutBlocksContractRenewal`) are **the exact same function** - every
status except `CANCELLED` blocks both a new Move-Out for the Contract
*and* a Contract renewal. `COMPLETED` blocks renewal too: a Contract whose
physical hand-back is already done has nothing left to legitimately
renew.

`renewContract()` (in `src/lib/actions/contracts.ts`) now runs its whole
body inside a **Serializable** transaction (elevated from its previous
default isolation specifically for this check) and rejects with
`contractRenewalBlockedByMoveOut` when a blocking Move-Out exists - this
closes the race against a concurrent `createMoveOut()` call, which uses
Serializable for the identical Contract/MoveOut tables. See
`move-out-renewal-conflict.db.test.ts` and
`move-out-concurrency.db.test.ts`'s own "Move-Out vs Contract renewal"
race test.

## 10. Completion validation

`validateMoveOutCompletion()` (`move-out-rules.ts`) is the single
centralized gate `completeMoveOut()` runs, returning **every** missing
requirement at once:

| Requirement | Failure code |
|---|---|
| `vacateDate` set | `VACATE_DATE_MISSING` |
| Every applicable inspection item has a recorded condition | `INSPECTION_INCOMPLETE` |
| Findings have been reviewed (`findingsReviewedAt` set) | `FINDINGS_NOT_REVIEWED` |
| ELECTRICITY + WATER meter readings recorded | `REQUIRED_METERS_MISSING` |
| Keys reconciled (see §11) or `noKeysToReturn` | `KEYS_NOT_RECONCILED` |
| Tenant acknowledgement OR authorized override | `TENANT_ACKNOWLEDGEMENT_MISSING` |
| Staff acknowledgement (no override) | `STAFF_ACKNOWLEDGEMENT_MISSING` |

Deliberately **excludes** any financial check (Decision 3) and any
inventory/furnished-unit requirement (no equivalent decision requires
one - damages are operational-only per Decision 4 and never gate
completion).

## 11. Key-return reconciliation

`reconcileKeyReturns()` compares what the baseline Move-In recorded as
`returnedExpected = true` against what Move-Out actually recorded as
returned, matched by `keyType + description` (case/whitespace-insensitive)
- there is no stored row-to-row link, since keys aren't individually
tracked with a stable identity, same reasoning as inventory (§12).
`isKeyReturnSatisfied()` combines this with the `noKeysToReturn` override
and a no-baseline fallback (at least one `MoveOutKeyItem` recorded, or the
explicit flag) - mirroring Move-In's own `KEYS_NOT_RECORDED` gate for the
no-baseline case.

## 12. Baseline comparison against Move-In (read-only)

Per the Phase 1 audit's own conclusion - furniture/meters have no stable
identity across records - these are diffed **at read time**, never via a
stored link:

- **Inventory** (`diffInventoryItems()`): matched by `category + itemName`
  (case/whitespace-insensitive); status is `MATCHED`, `QUANTITY_MISMATCH`,
  `MISSING_AT_MOVE_OUT`, or `ADDED_AT_MOVE_OUT`.
- **Meters** (`computeMeterConsumption()`): matched by `meterType`;
  `consumption = moveOutReading - moveInReading`, computed on demand and
  **never stored** as a third persisted value.
- **Inspection items**: since `MoveOutInspectionItem.moveInInspectionItemId`
  *is* a direct stored link (cloned at creation), `compareInspectionCondition()`
  gives a direct before/after delta for those.

`getMoveOutById()` bundles all three (`inventoryDiff`, `meterConsumption`,
`keyReconciliation`) alongside the baseline Move-In record itself - all
reads, nothing is ever written back to any `MoveIn*` table. Verified
byte-for-byte by `move-out-movein-immutability.db.test.ts` across a full
create-to-complete lifecycle, including a Maintenance Request raised from
a finding.

## 13. RBAC

New permissions: `moveOut.view/create/update/start/complete/cancel` +
`moveOutInspection.update`. No new role.

| Role | Grant |
|---|---|
| OWNER / ADMIN | All `moveOut.*`/`moveOutInspection.*` |
| MANAGER | All `moveOut.*`/`moveOutInspection.*` (same operational tier as Move-In/Maintenance) |
| ACCOUNTANT | `moveOut.view` only |
| VIEWER | `moveOut.view` only |

Every action calls `requirePermission()`/`requirePermissionAudited()` as
its first line - never relies on UI visibility. See
`docs/PERMISSIONS.md` §2/§3 for the full policy and the reasoning behind
each grant.

## 14. Financial isolation & the Contract-expiry gap

Move-Out never creates, updates, deletes, or reverses an `Invoice`,
`InvoiceLine`, `Payment`, `PaymentSchedule`, or `OwnerLedgerEntry` - and
never itself calls `terminateContract()` (the one place
`PaymentSchedule.status` legitimately changes as a side effect of
Contract-side actions, not Move-Out's). No "estimated tenant charge" or
similar pseudo-financial field exists anywhere in this module. Verified
end-to-end by `move-out-financial-isolation.db.test.ts` against a real
Contract with an issued Invoice, a posted Payment, and an
`OwnerLedgerEntry` - zero unintended mutations across a full lifecycle.

Move-Out's own eligibility check (`ACTIVE` or `TERMINATED`, §7)
deliberately tolerates the pre-existing Contract-expiry gap documented in
`docs/TECHNICAL-DEBT.md`: an `ACTIVE` Contract remains eligible for a
Move-Out even after its `endDate` has passed, since nothing in this
codebase ever flips it to `EXPIRED`. Fixing that gap was explicitly out
of scope for this phase (Decision 5).

## 15. Maintenance integration

`createMaintenanceRequestFromMoveOut()` (`src/lib/actions/maintenance.ts`)
mirrors `createMaintenanceRequestFromMoveIn()` field-for-field: the source
Move-Out and inspection item are re-verified same-organization and
mutually consistent, `scopeType`/`unitId` are always derived from the
Move-Out's own (Contract-derived) `unitId` - **never** trusted from a
client-supplied field even if one is smuggled into the form - and the
resulting `MaintenanceRequest` carries `moveOutId`/
`moveOutInspectionItemId` (both nullable, `onDelete: SetNull`,
reference-only). A new `MaintenanceRequestSource` enum value,
`MOVE_OUT_INSPECTION`, was added (additive migration) alongside the
existing `MOVE_IN_INSPECTION`. Never mutates the Move-Out/inspection item
it was raised from, never posts anything financial, and does not alter
Maintenance's own lifecycle, permissions, assignment, or cost behavior in
any way - this integration is purely additive.

## 16. Audit

No new `AuditAction` values were needed - `CREATE`/`UPDATE`/`CANCEL`
(the same actions Move-In already uses) cover create, schedule, start,
findings-review advancement, readiness acknowledgement, complete, and
cancel. No per-keystroke noise: individual inspection-item/inventory/
meter/key edits are not separately audited (matching Move-In's own
policy), only status transitions and acknowledgement/vacancy writes are.

## 17. Security & IDOR

Every read and mutation is organization-scoped via `requirePermission()`'s
returned `organizationId`, applied to every Prisma query. Explicitly
tested (`move-out-cross-org-security.db.test.ts`):

- Cross-org `contractId`/`moveOutId`/`inspectionItemId` on every action.
- Contract/Unit and Contract/Renter mismatch at completion time (a
  Contract's `unitId`/`renterId` drifting after Move-Out creation).
- MoveOut/MoveIn cross-Contract injection (a `moveInId` manually pointed
  at a different Contract's Move-In).
- MoveOut/inspection-item mismatch (an inspection item belonging to a
  different Move-Out attached via `addAttachmentMetadata()`).
- `inspectedByUserId`/`handedOverByUserId`/`findingsReviewedByUserId`
  always derive from the authenticated session - no action even accepts a
  client-supplied user id for these fields, so there is no code path for
  an "inspector/handler from another Organization" injection to exploit.
- Cross-org Maintenance Request creation from a Move-Out finding.

## 18. Migration

Two additive migrations, both applied to the dev (`rental_saas`) and test
(`rental_saas_test`) databases, generated via `prisma migrate diff` and
manually reviewed before applying:

- `20261105090000_move_out_management` - 2 new enums
  (`MoveOutStatus`, `MoveOutCancelReason`), 6 new tables (`move_outs` and
  its 5 child tables), 2 new nullable columns on `maintenance_requests`
  (`moveOutId`, `moveOutInspectionItemId`) plus their FKs/indexes. No
  drops, no column alterations on any existing table.
- `20261106090000_maintenance_move_out_source` - one `ALTER TYPE ...
  ADD VALUE` adding `MOVE_OUT_INSPECTION` to `MaintenanceRequestSource`.

## 19. Tests

- **Pure rules** (`move-out-rules.test.ts`, 57 tests): every valid/invalid
  transition (including an exhaustive all-pairs check), terminal-state
  immutability, editability, the shared one-active/renewal-conflict
  predicate, findings-review eligibility, key reconciliation (including
  case/whitespace-insensitivity and partial returns), completion
  validation (every requirement individually and combined), the
  conflicting-occupancy predicate, inventory/meter/inspection baseline
  diffing, `computeConditionComparisonLabel()` (Phase 3), and
  `isMoveOutOverdue()` (Phase 3).
- **Lifecycle** (`move-out-lifecycle.db.test.ts`): full happy path for
  both `ACTIVE`- and `TERMINATED`-Contract eligibility, idempotent
  completion, post-completion immutability, `reopenMoveOutStage()`,
  cancellation, and the `terminateContract()` Unit-vacancy regression.
- **Completion safety** (`move-out-completion-safety.db.test.ts`):
  conflicting-ACTIVE-Contract rejection, conflicting-live-Reservation
  rejection, CANCELLED/RELEASED reservations not blocking, and the
  Unit-already-VACANT no-op case - all with no-partial-write assertions.
- **Renewal conflict** (`move-out-renewal-conflict.db.test.ts`): every
  blocking status individually (`it.each`), CANCELLED not blocking, and
  creating a Move-Out for an already-RENEWED Contract rejected.
- **Financial isolation** (`move-out-financial-isolation.db.test.ts`):
  full lifecycle against a real Invoice/PaymentSchedule/Payment/
  OwnerLedgerEntry, zero unintended mutations.
- **Move-In immutability** (`move-out-movein-immutability.db.test.ts`):
  snapshot-before/byte-for-byte-after across a full lifecycle including
  the Maintenance integration path.
- **Maintenance integration** (`move-out-maintenance-integration.db.test.ts`):
  UNIT-scope derivation, default title/category, no financial record, and
  Maintenance's own lifecycle unaffected.
- **Cross-org/IDOR/relation-injection** (`move-out-cross-org-security.db.test.ts`):
  see §17.
- **Concurrency** (`move-out-concurrency.db.test.ts`): duplicate Move-Out
  creation for the same Contract, Move-Out-number uniqueness under
  concurrent creation, double-completion (exactly one COMPLETED, exactly
  one "to COMPLETED" audit entry), and Move-Out-vs-renewal (never both
  succeed) - all via genuine `Promise.allSettled()` races, no sleeps.

## 20. Remaining architectural risks & future scope

- **The Contract-expiry gap remains unfixed** (Decision 5, §14,
  `docs/TECHNICAL-DEBT.md`) - by design, not an oversight, and Phase 3's
  UI work did not touch it (it never blocked the UI).
- **Security-deposit settlement remains entirely out of scope**
  (Decision 4) - no refund/deduction/credit-note/damage-billing mechanism
  exists yet; damages are operational records only. Phase 3's UI
  reinforces this at every surface (see §21 below).
- **No inventory-based completion gate exists** (unlike Move-In's
  furnished-unit inventory requirement) - this was a deliberate choice
  since no equivalent decision was made requiring one, not an oversight.

Core architecture and invariants are green (schema validated, `tsc`/
`eslint`/unit tests/real-DB tests all passing - see the final report for
exact counts).

## 21. Phase 3 - UI, operational workspace, reports & printable report

Phase 3 built the entire UI/operational layer on top of the Phase 2
backend above, without changing a single lifecycle rule, permission
mapping, or adding any new status. Every mutation in the UI calls an
existing Phase 2 (or Phase-2-pattern) server action directly; the UI
never writes to `Unit.status`, never re-derives eligibility/condition-
comparison/overdue logic locally, and never introduces a financial
concept.

1. **Navigation**: `Move-Outs` and `Reports` (Move-Out reports landing)
   added to the Operations nav group in `src/app/(app)/layout.tsx`,
   immediately after `Move-Ins`, mirroring how `Maintenance Reports`
   already has its own nav entry (unlike the Move-In reports landing,
   which is reachable only via a dashboard link - both existing
   precedents are preserved, one per module).
2. **List** (`/operations/move-outs`): server-side-paginated, search +
   status + compound filters, plus `hasFindings` / `hasMaintenanceRequests`
   / `completedOnly` / `cancelledOnly` / `overdueOnly` checkboxes, all
   pushed into `listMoveOuts()`'s `where` clause - never client-side
   filtered. The "overdue" badge here, on the dashboard, and in the
   workspace all call the single `isMoveOutOverdue()` pure function added
   to `move-out-rules.ts`; it is never re-implemented inline.
3. **Creation** (`/operations/move-outs/new`): Contract-first, exact
   mirror of Move-In's own `new/page.tsx` - `?contractId=` prefill,
   `listEligibleContractsForMoveOut()` (Phase 2, unmodified), a
   `createMoveOutAndRedirect()` wrapper action for the redirect. No
   eligibility rule is re-derived in the page; ineligible contracts are
   simply absent from the server-returned list.
4. **Workspace** (`/operations/move-outs/[id]`): Summary, Lifecycle
   status/actions, Contract link, Tenant/Unit, Move-In Baseline (read-
   only, id/number only - never any Move-In field value that could imply
   the UI edits it), Findings Summary, a conditional Findings Review
   panel (`PENDING_FINDINGS_REVIEW` only), the full Inspection Checklist
   with a per-item Move-In-condition vs Move-Out-condition comparison
   (via `computeConditionComparisonLabel()`, the same new pure function
   the reports and print report also call), Inventory Comparison, Meter
   Readings, Keys & Access, Maintenance Requests (linked, read-only),
   Attachments, Acknowledgements, `AuditTimeline`, and a print-report
   link. Status-workflow buttons are gated strictly by `moveOut.status`
   plus the existing `can(permission, role)` checks - no new transition
   is invented, and the Completion button is additionally disabled by
   `completion.canComplete` (Phase 2's own `validateMoveOutCompletion()`).
5. **Condition-comparison vocabulary**: `IMPROVED` / `UNCHANGED` /
   `DETERIORATED` / `NO_BASELINE` / `NOT_COMPARABLE`, computed by the new
   `computeConditionComparisonLabel()` (severity-ranked, `NOT_APPLICABLE`
   excluded as `NOT_COMPARABLE`) - the single source for this label
   everywhere it appears (workspace, print report, Unit Condition report,
   Findings report).
6. **Maintenance-from-finding**: the workspace is the first UI in the
   codebase to wire up `createMaintenanceRequestFromMoveOut()` (it existed
   in Phase 2 but had no caller), shown inline on a checklist item only
   when `requiresAttention && !item.maintenanceRequests.length`. A thin
   `createMaintenanceRequestFromFinding()` wrapper in the page revalidates
   the Move-Out path after the shared action returns (the shared action
   itself only revalidates the Maintenance paths).
7. **Completion Preview**: a `<details>/<summary>` popover (the same
   confirmation-UI pattern Move-In's own Cancel flow already established -
   no new modal library), showing the completion-preview title/body and
   the explicit statement that completion does **not** settle a deposit,
   charge the tenant, create an invoice, post accounting, or determine
   liability, plus any outstanding `MissingRequirement` reasons, before
   the real `completeMoveOut()` call.
8. **Vacancy-conflict UX**: `completeMoveOut()`'s occupancy-conflict check
   (§8) is never bypassed or weakened. A live test (temporarily flipping a
   second Contract on the same Unit to `ACTIVE`, then completing via the
   UI) confirmed the safety net holds end-to-end: the transaction is
   rejected, `Move-Out.status` stays `READY_FOR_CLOSURE`, `completedAt`
   stays null, and `Unit.status` stays unchanged - no partial write. The
   error currently surfaces via the same generic Next.js error boundary
   every other uncaught server-action error in this codebase surfaces
   through (see §22, technical debt - this is a pre-existing, app-wide
   gap, not new to Move-Out).
9. **Completed state**: read-only banner, no editable checklist/inventory/
   meter/key/acknowledgement forms render once `status === "COMPLETED"`
   (`editable` only spans `IN_PROGRESS`/`PENDING_FINDINGS_REVIEW`, exactly
   as Phase 2 already defines editability).
10. **Cancel UI**: the same `<details>` popover pattern as Move-In/
    Maintenance, calling the existing `cancelMoveOut()` - never deletes
    the record.
11. **Integrations**: a Move-Out card on the Contract edit page (mirrors
    the existing Move-In card), Move-Out status badges on the Units and
    Renters list pages (via the new `getMoveOutStatusForUnits()` /
    `getMoveOutStatusForRenters()` bulk lookups, shown only for `OCCUPIED`
    units - exactly Move-In's own precedent), a read-only "Related
    Move-Out" block on the Move-In workspace page, and a "Move-Out
    Source" traceability section on the Maintenance Request detail page
    (mirrors the existing "Move-In Source" section, using the
    `moveOut`/`moveOutInspectionItem` relations Phase 2 already included).
12. **Operations Dashboard**: a new Move-Outs KPI section
    (`getMoveOutDashboardKpis()`, nine bounded `prisma.count()` aggregates
    run via `Promise.all`) appended after the existing Move-In/Maintenance
    sections - neither of which was altered.
13. **Move-Out reports** (`/operations/move-outs/reports`, its own landing
    page): Schedule, Completion, Unit Condition, **Findings** (never
    "Tenant Damage Charges" - see §22 below), Inventory Variance, Meter
    Reading, Keys & Access, and Maintenance Findings - all backed by the
    new `src/lib/actions/move-out-reports.ts`, all org-scoped via
    `requirePermission("moveOut.view")`, all calling the same centralized
    `diffInventoryItems()` / `reconcileKeyReturns()` /
    `computeConditionComparisonLabel()` Phase 2/Phase 3 pure functions
    rather than re-deriving any comparison. Consistent with Move-In's own
    report precedent (`move-in-reports.ts`), these are unpaginated
    `findMany` queries - the same volume assumption Move-In's reports
    already make, not a new inconsistency.
14. **Printable report** (`/operations/move-outs/[id]/report`): title
    "Move-Out Final Inspection & Unit Handover Report" /
    "تقرير الفحص النهائي وإخلاء الوحدة", full header (org, Move-Out #,
    Contract #, Tenant, Unit+location, lease term, handover date, vacate
    date, inspection date, inspector, status), the condition-comparison
    table (Category/Item/Move-In Condition/Move-Out Condition/Condition
    Change/Requires Attention/Notes), Inventory Comparison, Meter
    Readings, Keys & Access, Findings Summary, linked Maintenance
    Requests only (never unrelated history), Acknowledgement, and the
    exact required bilingual disclaimer verbatim in both locales. Uses
    the existing `PrintButton`/`.no-print` browser-print architecture -
    no PDF library introduced.
15. **i18n**: every new string added to the `Dictionary` interface and
    both `en.ts`/`ar.ts` (TypeScript's structural check enforces 1:1 key
    parity); the Arabic terms the spec suggested were used verbatim where
    given.
16. **RBAC**: unchanged from Phase 2 - `permissions.ts` was not modified
    in this phase. The UI's `can()` checks are usability-only; every
    mutation is still gated server-side by the same
    `requirePermission()`/`requirePermissionAudited()` calls Phase 2
    already put in each action.
17. **Live verification**: a full English lifecycle (create → schedule →
    start → inspect, including one deliberately deteriorated item →
    inventory/meters/keys → vacate date → findings review → Maintenance
    Request from a finding → Ready for Closure → Completion Preview →
    Complete) was driven end-to-end in a real browser against the
    real dev database, confirming `Unit.status` → `VACANT`, the
    read-only completed state, every cross-page integration, the print
    report (including the verbatim disclaimer and the absence of any
    forbidden liability/charge/deduction vocabulary outside that
    disclaimer), the dashboard KPIs, and all 8 reports - zero console/
    page errors throughout. The same set of pages was re-verified in
    Arabic (RTL layout, exact bilingual report title/disclaimer, no
    leftover untranslated/`undefined` text). The vacancy-conflict path
    (§8 above) was also verified live. All fixtures created purely for
    this verification (a second test Move-Out and a temporary duplicate
    Contract) were cleaned up afterward via the app's own Cancel action
    and a direct delete of the fabricated fixture row, respectively - no
    real seed data was altered beyond the one Move-In/Move-Out pair
    deliberately taken to completion as the demonstrated example.
18. **No backend defect was found or fixed in this phase.** Step 2's
    document/regression-test/smallest-safe-fix/rerun protocol was never
    invoked because no genuine Phase 2 defect surfaced; every apparent
    issue encountered during UI construction traced back to either a
    UI-side selector/wiring detail (fixed in the UI layer only) or the
    pre-existing, app-wide lack of a server-action error boundary (§22,
    documented as technical debt, not fixed - fixing it is a UI-
    architecture change spanning every existing module, not a Move-Out
    concern).

## 22. Phase 3 technical debt (new)

- **No React error boundary / graceful server-action error UI exists
  anywhere in this codebase** (Move-In, Move-Out, Contracts, everywhere).
  An uncaught error thrown by a `"use server"` action bound directly to a
  `<form action={...}>` - including Move-Out's own controlled
  vacancy-conflict rejection - surfaces as Next.js's generic "This page
  couldn't load" client error boundary rather than an in-page banner. The
  safety invariant itself is never compromised (the throw still aborts
  the transaction with no partial write), only the presentation is
  generic. Fixing this well would mean introducing `error.tsx` boundaries
  and/or a `useActionState` pattern across every mutating form in the
  entire application - a cross-cutting UI-architecture change, not a
  Move-Out-specific fix, and out of this phase's scope.
