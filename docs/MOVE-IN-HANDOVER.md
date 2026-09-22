# Move-In & Handover Inspection

This document describes the Move-In & Handover Inspection module: the step
that establishes a reliable, auditable baseline of a Unit's condition at
the moment a tenant takes physical possession of it, following an ACTIVE
Lease Contract. It is purely additive - no VAT/ZATCA/invoice calculation/
payment logic, payment schedules, owner ledger, ownership allocation,
Offer pricing/versioning, Reservation concurrency rules, Reservation →
Contract conversion logic, contract numbering, audit architecture, or
property hierarchy was changed. See `docs/RESERVATION-TO-CONTRACT.md` and
`docs/RESERVATION-MANAGEMENT.md` for the foundations this builds on, and
`docs/PERMISSIONS.md` for the RBAC system.

Scope of this task, per the brief: **Move-In & Handover Inspection only.**
Move-Out, Security Deposit settlement, damage charging, Maintenance Work
Orders, Preventive Maintenance, a Tenant/Owner Portal, legal electronic
signature, WhatsApp/email automation, AI image damage detection, a
payment gateway, subscription billing, corporate housing, and permanent
Unit Asset Management are all explicitly **not implemented** here (see
§23).

Lifecycle this module completes: **Lead → Viewing → Offer → Reservation →
Contract → Pre-Handover Inspection → Move-In / Unit Handover → Occupied
Unit.**

## 1. Overview & scope

A Move-In record is created from one ACTIVE Contract, carries its own
inspection checklist, inventory, meter readings, keys/access items, and
operational acknowledgements, and is driven through a small status
lifecycle (`MoveInStatus`) to `COMPLETED`, at which point its baseline
data becomes read-only. It never re-derives or duplicates Contract/Unit/
Renter data - only relations to the existing rows. It never touches
`Unit.status` or `Contract.status` (see §8), never creates or alters any
financial record (see §23), and is designed from the start so a future
Move-Out module can compare its own baseline against this one without any
schema change here (see §23).

## 2. Domain model

Six new tables, each `organizationId`-scoped like every other module in
this codebase (`prisma/schema.prisma`):

- `MoveIn` - the parent record (§3).
- `MoveInInspectionItem` - one row per checklist item (§9).
- `MoveInInventoryItem` - one row per furniture/appliance item (§10).
- `MoveInMeterReading` - one row per utility meter reading (§11).
- `MoveInKeyItem` - one row per key/access-card/remote (§12).
- `MoveInAttachment` - metadata-only photo/document references (§13).

Deliberately relational, not one JSON blob per the brief's own
instruction: each concern (checklist, inventory, meters, keys, photos)
gets its own table with its own indexes, so a future Move-Out module can
query "every inspection item for this Move-In" or "every key issued"
without deserializing anything.

## 3. MoveIn model fields

`moveInNumber` (`MI-000001`, §5), `contractId`/`unitId`/`renterId` (all
required relations - `unitId`/`renterId` are **copied from the Contract at
creation and never diverge**, §7/§18 below), `status` (`MoveInStatus`,
§4), `scheduledAt`/`startedAt`/`completedAt`/`handoverDate` (nullable
lifecycle timestamps), `inspectedByUserId`/`handedOverByUserId` (real
`User` relations, `onDelete: SetNull`), `tenantRepresentativeName`/
`tenantRepresentativeId` (free text - the person physically present may
not be an app user), `overallCondition` (`ConditionRating`, optional
summary), `tenantComments`/`internalNotes`, the acknowledgement fields
(§14), `isFurnished` (§18), the readiness flags (`utilitiesReady`/
`keysReady`/`cleaningComplete`/`unitReady`, simple confirmations only -
never a Maintenance Work Order), `noKeysToRecord` (§12), the cancellation
fields (`cancelReason`/`cancelReasonNote`/`cancelledAt`, §4), and
`createdByUserId` (plain string, matches every other module's own
convention). No `deletedAt` - a Move-In row is **never deleted**,
`CANCELLED` already serves as its terminal "didn't proceed" state.

## 4. Status lifecycle (`MoveInStatus`)

`DRAFT → SCHEDULED → IN_PROGRESS → READY_FOR_HANDOVER → COMPLETED`, with
`CANCELLED` reachable from every non-terminal state. `COMPLETED` and
`CANCELLED` are both terminal (no further transitions). The single source
of truth is `MOVE_IN_TRANSITIONS`/`isValidMoveInTransition()` in
`src/lib/operations/move-in-rules.ts` - every mutating server action
checks it before writing, so an invalid jump (e.g. `DRAFT → COMPLETED`
directly) is rejected with `t.validation.moveInInvalidTransition` rather
than silently allowed.

`isMoveInEditable(status)` (also in `move-in-rules.ts`) is a second,
narrower predicate: only `IN_PROGRESS`/`READY_FOR_HANDOVER` allow editing
the checklist/inventory/meters/keys/acknowledgements. `DRAFT`/`SCHEDULED`
haven't started inspecting yet; `COMPLETED`/`CANCELLED` are locked (§16).

## 5. Numbering

`formatMoveInNumber()` (`src/lib/numbering.ts`) produces `MI-000001` via
the existing `nextCounterValue()`/`Counter` infrastructure, keyed
`"moveIn"` - no new numbering scheme, no year component (matching
`RES-`/`OFFER-`/`VIEW-`/`LEAD-` - a Move-In number is not a legal/tax
document series).

## 6. One active/completed Move-In per Contract

Enforced by `blocksNewMoveInForContract()` (`move-in-rules.ts`), a pure
predicate returning `true` for every status except `CANCELLED` - checked
inside `createMoveIn()`'s single `Serializable` transaction
(`src/lib/actions/move-ins.ts`) against every existing `MoveIn` row for
that `contractId`. This mirrors `blocksNewReservationForOffer()`'s own
precedent exactly: **no DB unique constraint** (a flat unique on
`contractId` would forever block retrying after a cancelled attempt), no
Postgres partial unique index either - a deliberate application-layer
choice for architectural consistency with the rest of this codebase. A
Contract may accumulate several `CANCELLED` Move-In attempts (data
errors, a reschedule that started a fresh record) before a successful
one, but never two simultaneously live/completed ones. `Serializable`
isolation (this codebase's established concurrency-safety strategy for
every "check-conflicts-then-write" critical section) prevents two
concurrent `createMoveIn()` calls from both passing the check.

## 7. Contract eligibility

`createMoveIn()` requires `Contract.status === "ACTIVE"` - this single
check covers `DRAFT`/`TERMINATED`/`EXPIRED`/`RENEWED` all at once, since
none of those statuses represent a tenant who should be moving in right
now. Nothing about `createContractWithSchedule()`, contract numbering, or
the Contract lifecycle's own transitions was touched. Per Step 50 of the
brief, `unitId`/`renterId` are **read from the Contract row inside the
same transaction, never from client-supplied form fields** - even if a
caller submits a different `unitId`/`renterId` in the form, `createMoveIn()`
ignores them entirely (verified by a real-DB test, §23).

## 8. Unit occupancy decision

Inspected first, per Step 8 of the brief, before writing any code:
`createContractWithSchedule()` already sets `Contract.status = "ACTIVE"`
**and** `Unit.status = "OCCUPIED"` immediately at Contract creation - both
for manually-created contracts and for Reservation-originated ones (via
`convertReservationToContract()`, which calls the same service). By the
time a Move-In can even be created (§7 requires `ACTIVE`), the Unit is
already `OCCUPIED`.

**Decision: Move-In never writes to `Unit.status` at all**, at any stage
of its own lifecycle (create/start/ready-for-handover/complete/cancel).
It only validates and displays the Contract-Unit-Renter relationship.
This was communicated to the reviewer before implementation began and is
verified by a dedicated occupancy-regression test (§23) that asserts
`Unit.status` stays `OCCUPIED` and `Contract.status` stays `ACTIVE`
straight through a full Move-In completion.

## 9. Inspection architecture & default checklist

`InspectionCategory` (18 values: `ENTRANCE`, `LIVING_ROOM`, `DINING_ROOM`,
`KITCHEN`, `BEDROOM`, `BATHROOM`, `BALCONY`, `WINDOWS_DOORS`, `FLOORING`,
`WALLS_CEILINGS`, `LIGHTING`, `ELECTRICAL`, `PLUMBING`,
`AIR_CONDITIONING`, `APPLIANCES`, `FURNITURE`, `SAFETY`, `OTHER`) is
shared by both `MoveInInspectionItem.category` and
`MoveInInventoryItem.category` - an inventory item's location is the same
set of physical areas an inspection item's category already names, so one
enum covers both rather than two parallel category systems.

`ConditionRating` (`NEW`/`EXCELLENT`/`GOOD`/`FAIR`/`POOR`/`DAMAGED`/
`NOT_WORKING`/`NOT_APPLICABLE`) is likewise shared by
`MoveIn.overallCondition`, `MoveInInspectionItem.condition`, and
`MoveInInventoryItem.condition` - one centralized vocabulary, per the
brief's explicit "do not create slightly different condition systems"
instruction.

`getDefaultInspectionChecklist()` (`src/lib/operations/move-in-rules.ts`)
is a pure function returning ~45 default items across every applicable
category (Entrance/Living Room/Dining Room/Kitchen/Bedroom/Bathroom/
Balcony/Windows & Doors/AC/Electrical/Plumbing/Safety), each with an
English name, an Arabic name, and an `isApplicable` default (e.g. a
bathtub or dishwasher defaults to `isApplicable: false`, since not every
Unit has one - checked/unchecked per-Move-In, never assumed). `isApplicable:
false` items are excluded from every progress/completion calculation's
denominator entirely (§15), and the checklist stays editable in principle
(a future admin screen could toggle `isApplicable` per item) without any
code change to the progress logic itself.

**Template architecture (Step 13):** a single centralized default
template today. `getDefaultInspectionChecklist()`'s own signature takes
no per-organization/per-compound/per-unit-type argument - the one call
site that would need to change to select among multiple future templates
is `createMoveIn()` itself, nothing else in this module or its UI
hardcodes the checklist. A full Organization/Compound/Unit-Type template
administration module is **not built** in this task, per its own explicit
"do not build a full admin module yet" instruction.

`sequence` on `MoveInInspectionItem` preserves the default template's own
ordering (set at creation from the array index), so the checklist UI
renders items in a stable, predictable order per category.

## 10. Inventory design

`MoveInInventoryItem` (`category`/`itemName`/`quantity`/`condition`/
`serialNumber`/`brand`/`model`/`notes`) is a **Move-In condition baseline
only** - a snapshot of what furniture/appliances were present and their
condition at handover, scoped to this Move-In record. It is explicitly
**not** a permanent Unit Asset Management module: there is no
organization-wide "asset registry," no depreciation, no maintenance
history tied to a piece of furniture across multiple tenancies. A future
Move-Out would create its own `MoveOutInventoryItem` rows and diff them
against this Move-In's rows by `itemName`/category - the comparison logic
is future work, but nothing here blocks it.

## 11. Meter reading design

`MoveInMeterReading` (`meterType`/`meterNumber`/`reading` - `Decimal(12,2)`
- `/unitOfMeasure`/`readingDate`/`notes`). `MeterType` is
`ELECTRICITY`/`WATER`/`GAS`/`OTHER`. `REQUIRED_METER_TYPES` in
`move-in-rules.ts` names `ELECTRICITY`/`WATER` as required before
completion (§15) - a documented, centralized policy rather than a
hardcoded check duplicated in multiple places. Multiple readings per
meter type are allowed (no unique constraint), since a reading might need
correcting before completion while the record is still editable.

## 12. Keys & access design

`MoveInKeyItem` (`keyType`/`description`/`quantity`/`identifier`/
`returnedExpected`/`notes`). `KeyType` is `KEY`/`ACCESS_CARD`/`REMOTE`/
`PARKING_REMOTE`/`OTHER`. `returnedExpected` (default `true`) flags
whether this item is expected back at a future Move-Out - the "Keys
Issued vs. Keys Returned" comparison the brief anticipates for that
future module, without implementing it now. `MoveIn.noKeysToRecord`
(boolean) is the explicit "no keys to record" acknowledgement Step 22
requires - the completion validator (§15) requires **either** at least
one `MoveInKeyItem` **or** this flag set, never silently treating zero
keys as "done."

## 13. Attachment/photo strategy

Inspected first, per Step 19: this codebase's only prior file-upload
precedent (the organization logo) stores a base64 string directly in
Postgres, capped at ~1MB - unsuitable for potentially dozens of Move-In
photos, and exactly the pattern the brief says never to introduce here.
No object-storage vendor (S3/Azure Blob/etc.) is wired up in this task
either, per the brief's own "do not introduce a production cloud vendor"
instruction.

**Decision:** `MoveInAttachment` is a pure **metadata** table -
`fileName`/`mimeType`/`fileSize`/`caption`/`attachmentType`
(`PHOTO`/`DOCUMENT`/`OTHER`), plus an optional link to one
`MoveInInspectionItem` or `MoveInInventoryItem` (so a photo can be
associated with a specific checklist item or inventory piece, per Step
20). `storageKey` is a nullable placeholder for a future object-storage
key - **no binary column exists**, and `addAttachmentMetadata()`
(`src/lib/actions/move-ins.ts`) never accepts or stores file bytes, only
records what a real upload would need. This is explicitly the
"metadata-ready architecture" fallback the brief itself sanctions when no
storage system exists yet, and is documented as deferred: wiring a real
upload UI/storage backend is future work, not part of this task. No AI
photo comparison exists or is implied.

## 14. Acknowledgement design (not a legal signature)

Per Step 21's explicit instruction, this is deliberately **not** framed
as an electronic/legal signature anywhere in code, UI copy, or this
document - every label uses "Acknowledgement" (`tenantAcknowledgedAt`,
`staffAcknowledgedAt`), never "Digital Signature" or "E-Signature." The
tenant acknowledgement (`recordTenantAcknowledgement()`) captures a
`tenantRepresentativeName`/`tenantRepresentativeId` (free text, since the
person present may be an authorized representative, not the Renter
record itself) and a timestamp. The staff acknowledgement
(`recordStaffAcknowledgement()`) auto-records the **authenticated
session's own user id** (`handedOverByUserId`) - never a client-supplied
identity. `tenantAcknowledgementOverride`/`tenantAcknowledgementOverrideReason`
let authorized staff (gated by `moveIn.complete`, the same permission as
completion itself - see §19) complete a handover without a tenant
physically acknowledging, always paired with a required reason
(`setTenantAcknowledgementOverride()` rejects an override with no
reason). Both the profile page and the printable report
(`/operations/move-ins/[id]/report`) carry an explicit disclaimer that
this is operational only, never a legal/electronic signature.

## 15. Completion validation

`validateMoveInCompletion()` (`move-in-rules.ts`) is the single
centralized gate `completeMoveIn()` runs before ever writing `COMPLETED`.
It returns **every** missing requirement at once (`MissingRequirement[]`)
rather than one error at a time, so the profile page can render a full
checklist banner. The checks: `handoverDate` set; every applicable
inspection item has a recorded `condition`
(`computeInspectionProgress()`); both required meter types present
(§11); at least one key item **or** `noKeysToRecord` (§12); at least one
inventory item **when `isFurnished`** (§18); `tenantAcknowledgedAt` set
**or** `tenantAcknowledgementOverride` (§14); `staffAcknowledgedAt` set.
`IN_PROGRESS → READY_FOR_HANDOVER` (`isReadyForHandoverEligible()`) is a
narrower, earlier gate - only the checklist itself must be fully recorded;
acknowledgements are not required until actual completion (Step 30).

Defects never block completion by themselves (§ "Defect summary" below) -
`validateMoveInCompletion()` has no defect-count check at all;
`computeDefectSummary()` is purely informational, matching Step 35's
explicit "does not automatically block handover" instruction.

**Defect summary:** `computeDefectSummary()` counts, over applicable
items only, `totalItems`/`requiresAttentionCount`/`damagedCount`/
`notWorkingCount`/`poorCount` - displayed prominently on the profile page
and in the printable report, but authorized staff may proceed with
acknowledged defects per the brief's own instruction.

**Progress formula (Step 29):** `computeInspectionProgress()` returns
`{ completed, total, percent }` where `total`/`completed` only ever count
`isApplicable: true` items (never `NOT_APPLICABLE`-condition or
template-inapplicable items in the denominator) - e.g. 34 of 40
applicable items recorded renders as "34/40, 85%" (`t.moveIn.progressLabel`).
Covered by a dedicated unit test using this exact example.

## 16. Immutability & future amendment strategy

Once `COMPLETED`, `isMoveInEditable(status)` returns `false` (§4) - every
mutating action that touches inspection items, inventory, meters, keys,
or acknowledgement timestamps (`updateInspectionItem()`,
`addInventoryItem()`, `addMeterReading()`, `addKeyItem()`,
`addAttachmentMetadata()`, `recordTenantAcknowledgement()`,
`setTenantAcknowledgementOverride()`, `recordStaffAcknowledgement()`,
`updateReadinessFlags()`, `setHandoverDate()`) calls
`assertMoveInEditableTx()` first and rejects with
`t.validation.moveInNotEditable` if the Move-In has already reached
`COMPLETED`/`CANCELLED`. Verified by a real-DB test asserting a
post-completion write attempt is rejected and the underlying row is
unchanged (§23).

**Future correction strategy (documented, not implemented):** a real
post-completion correction is intentionally **not** built in this task.
The anticipated future design is an amendment/addendum record (e.g. a
`MoveInAmendment` table referencing the original, immutable `MoveIn` row
and recording what changed, by whom, and why) rather than ever mutating
the completed baseline in place - preserving the original inspection as
the legally/operationally meaningful record of what was actually observed
at handover.

## 17. Transaction & idempotency design

`createMoveIn()` and `completeMoveIn()` both run inside a single
`prisma.$transaction(..., { isolationLevel: "Serializable" })` block -
this codebase's established concurrency-safety strategy (used identically
by `createReservation()` and `convertReservationToContract()`) rather
than row-level locking, raw SQL, or a DB constraint. `completeMoveIn()`
is explicitly **idempotent** (Step 47): if the Move-In is already
`COMPLETED` when called, it returns the existing id immediately with no
further writes - no duplicate audit row, no duplicate `LeadActivity`, no
error. Verified by a real-DB test calling `completeMoveIn()` twice and
asserting the audit-log row count is unchanged after the second call
(§23). Every other mutating action (`startMoveIn()`, `markReadyForHandover()`,
`cancelMoveIn()`, the checklist/inventory/meter/key actions) re-reads the
current row and re-validates the transition/editability before writing,
so a stale or repeated request never corrupts state.

## 18. Furnished/unfurnished handling

Neither `Unit` nor `Contract` has a furnishing field - only
`LeasingOffer.furnishedStatus` (`FurnishingPreference`), reachable only
via `Contract.reservation?.offer` and only for Reservation-originated
contracts; manually-created contracts have no such signal at all.
**Decision:** a single new `MoveIn.isFurnished` boolean, scoped
**exclusively** to the Move-In record - never a new Unit/Contract-level
"source of truth." `createMoveIn()` defaults it from the originating
Offer's `furnishedStatus` when derivable (`FURNISHED`/`SEMI_FURNISHED` →
`true`, `UNFURNISHED`/`FLEXIBLE`/absent → `false`) and leaves it
staff-editable at creation time via a checkbox, for manual contracts
where no signal exists. This directly satisfies the brief's "do not
introduce conflicting furnishing source-of-truth logic" instruction by
keeping the flag local, overridable, and never presented as an
authoritative Unit/Contract attribute elsewhere. `isFurnished` drives the
completion validator's inventory requirement (§15) and nothing else.

## 19. RBAC / permissions

Seven new `Permission` values (`src/lib/permissions.ts`): `moveIn.view`/
`create`/`update`/`start`/`complete`/`cancel`, and
`moveInInspection.update` (a separate permission specifically for
checklist/inventory/meter/key/attachment data-entry, per Step 44's own
distinction). OWNER/ADMIN hold every permission (as always).
MANAGER holds every `moveIn.*`/`moveInInspection.*` permission - Move-In/
handover is day-to-day leasing-operations work, the same tier as
Contract create/update/renew/terminate. ACCOUNTANT holds only
`moveIn.view` (operational visibility, matching its existing broad
`*.view` access elsewhere - no mutation permission at all). VIEWER holds
only `moveIn.view`. No new roles were added (PROPERTY_MANAGER/
LEASING_AGENT/MAINTENANCE remain future work, mentioned but not built).
Full matrix in `docs/PERMISSIONS.md`.

## 20. Audit integration

Every state-changing action writes an `AuditLog` row via the existing
`auditCreate()`/`auditAction()` helpers (`src/lib/audit.ts`) inside the
same transaction as the mutation itself: creation, scheduling→status
change, start, ready-for-handover, completion, cancellation, tenant/staff
acknowledgement. Per-keystroke checklist edits (`updateInspectionItem()`)
and routine inventory/meter/key additions deliberately do **not** write
an audit row each - matching the brief's own "avoid noisy per-keystroke
audit rows" instruction; the checklist's own state is fully visible on
the Move-In profile page itself, and the meaningful lifecycle events
(start/ready/complete/cancel/acknowledgements) are what the audit trail
records. `AuditTimeline` (the existing shared component) is embedded on
the Move-In profile page exactly as on every other module's own detail
page.

## 21. UI, Operations dashboard & reports

New pages, all under a new `/operations` route group:

- `/operations` - the Operations dashboard (§ "Dashboard KPIs" below).
- `/operations/move-ins` - list with search (Move-In #/renter/unit),
  status/compound filters, today/upcoming/completed/overdue toggles, and
  server-side pagination (`PAGE_SIZE = 25`, same convention as every
  other list in this codebase).
- `/operations/move-ins/new` (optionally `?contractId=`) - a Contract
  picker restricted to eligible contracts
  (`listEligibleContractsForMoveIn()`, §6/§7), prefilling from the
  Contract when linked from its edit page.
- `/operations/move-ins/[id]` - the profile/inspection workspace:
  overview, defect summary, the full checklist grouped by category (each
  item independently save-able, no single-session requirement per Step
  28), inventory/meters/keys/attachments sections with their own add
  forms, readiness flags, and the acknowledgement section - plus the
  lifecycle action buttons (Start/Mark Ready/Complete/Cancel), each
  gated by its own permission and disabled when its precondition isn't
  met (e.g. Complete is disabled while `completion.canComplete` is
  false).
- `/operations/move-ins/[id]/report` - the printable bilingual **UNIT
  HANDOVER REPORT** (§ "Print report" below).
- `/operations/reports` - an index of the 7 reports below, reusing the
  existing `PrintButton`/`no-print` browser-print convention
  (`src/components/print-button.tsx`) rather than a second
  document-rendering system.

**Dashboard KPIs** (`getOperationsDashboard()`): Move-Ins Today, Upcoming
This Week, Inspections In Progress, Ready for Handover, Completed This
Month, Units with Handover Defects, Overdue Scheduled Move-Ins - a
separate dashboard from the CRM one, per Step 39's own instruction.
**Overdue formula** (Step 40, `isMoveInOverdue()`):
`scheduledAt < now AND status NOT IN (COMPLETED, CANCELLED)`.

**The 7 reports** (`src/lib/actions/move-in-reports.ts`): Move-In
Schedule, Move-In Completion, Unit Condition, Handover Defects, Meter
Reading, Keys & Access Handover, Furnished Inventory Handover.

**Print report:** bilingual, carries organization branding (logo/name via
the existing `getOrganizationBranding()`), Move-In/Contract numbers,
tenant/unit/compound/building lease dates, handover date, checklist
summary with per-item condition/notes, defects section, inventory,
meters, keys, tenant comments, and the acknowledgement section with its
"not a legal signature" disclaimer (§14) - plain browser-print HTML, no
PDF-generation library introduced.

**Existing-page integration** (Step 36/37/38, "no module redesign"):
the Contract edit page (`/contracts/[id]/edit`) shows an Overview box
with Move-In number/status/scheduled/handover date and a Create/View
Move-In action; the Units list shows a Move-In status link for occupied
units (`getMoveInStatusForUnits()`, one bulk query for the whole page,
mirroring `getActiveReservationsForUnits()`'s own pattern); the Renters
list shows the same for each renter's current Move-In
(`getMoveInStatusForRenters()`). No standalone Unit/Renter profile page
exists yet in this codebase to extend further - these are additive rows/
links on the existing list pages, never a redesign.

## 22. Bilingual / i18n & indexes

Every string is drawn from `getDictionary()`'s new `moveIn`/`operations`/
`moveInStatus`/`moveInCancelReason`/`conditionRating`/`inspectionCategory`/
`meterType`/`keyType`/`missingRequirement` sections
(`src/lib/i18n/dictionaries/{en,ar}.ts`) - nothing is hardcoded in any
page or component. A representative Arabic terminology sample: Move-In /
استلام الوحدة, Handover / تسليم الوحدة, Inspection / الفحص, Checklist /
قائمة الفحص, Condition / الحالة, Meter Reading / قراءة العداد, Key /
مفتاح, Access Card / بطاقة دخول, Acknowledgement / الإقرار, Defect /
ملاحظة, Ready for Handover / جاهز للتسليم, Handover Date / تاريخ
التسليم, Furnished / مفروشة, Requires Attention / يتطلب اهتمامًا, Staff
Acknowledgement / إقرار الموظف, Tenant Representative / ممثل المستأجر,
Operations / العمليات, Move-In Number / رقم الاستلام, Cancellation
Reason / سبب الإلغاء, Inventory / الجرد. Verified live in both locales
via Playwright (zero console errors, full RTL layout for Arabic).

**Indexes** (Step 59): `MoveIn` - `[organizationId, status]`,
`[organizationId, contractId]`, `[organizationId, unitId]`,
`[organizationId, renterId]`, `[organizationId, scheduledAt]`,
`[organizationId, handoverDate]` (every list-page filter and the
dashboard's own date-range queries hit one of these). `MoveInInspectionItem` -
`[organizationId, moveInId]` (loading a Move-In's full checklist) and
`[moveInId, category]` (the profile page groups by category). `MoveInInventoryItem`/
`MoveInMeterReading`/`MoveInKeyItem`/`MoveInAttachment` - `[organizationId, moveInId]`
each (every one of these is only ever queried "for this Move-In," never
filtered independently, so a single composite index each is sufficient -
no per-category/per-type index was added anywhere, avoiding
over-indexing tables that will never be large per Move-In).

## 23. Tests, security results, future Move-Out linkage & remaining risks

**Pure logic tests** (`src/lib/operations/move-in-rules.test.ts`, 30
tests): every transition/editability/progress/defect-summary/completion-
validation/overdue/default-checklist function, including the brief's own
"34/40, 85%" example.

**Real, database-backed tests** (two new files under
`src/lib/actions/__dbtests__/`, run via `npm run test:db` against the
disposable `rental_saas_test` database):

- `move-in-cross-org-security.db.test.ts` - Org A cannot create a
  Move-In for Org B's Contract; cannot read/start/complete/cancel Org
  B's Move-In; cannot add inspection/inventory/meter/key items to it
  (each verified to leave the underlying rows unchanged, not merely
  reject the call); IDOR coverage across `contractId`/`unitId`/
  `moveInId`; a non-`ACTIVE` Contract is rejected; `unitId`/`renterId`
  are always derived from the Contract even when a caller supplies
  different ones in the form (Step 50); the one-active-Move-In-per-
  Contract rule blocks a second attempt but allows a fresh one after
  the first is cancelled (Step 6).
- `move-in-lifecycle.db.test.ts` - the full
  `DRAFT → IN_PROGRESS → READY_FOR_HANDOVER → COMPLETED` happy path with
  every completion requirement satisfied, asserting `Unit.status` stays
  `OCCUPIED` and `Contract.status` stays `ACTIVE` throughout (the
  occupancy regression, §8); `completeMoveIn()` idempotency (identical
  audit-log row count after a second call, Step 47); post-completion
  immutability (every mutating action rejected once `COMPLETED`, Step
  32); rejection when required completion items are missing; cancellation
  never deleting the record and requiring a note for `OTHER`; a
  Reservation-originated Contract (via the real
  `convertReservationToContract()`) producing a `LeadActivity` on
  completion, exercising compatibility with both manually-created and
  Reservation-originated contracts (Step 54); and a financial-isolation
  regression asserting the existing Invoice/PaymentSchedule/
  OwnerLedgerEntry/Payment rows are byte-for-byte unchanged and no new
  ones are created across a full Move-In create-through-complete cycle.

All 30 pure tests and all new real-DB tests pass; the full existing
real-DB suite (196 tests total after these additions) and the full
existing unit-test suite (236 tests) remain green - no existing test was
modified to make this task pass.

**Live UI verification:** a full interactive pass (login → create a
Move-In from an eligible Contract → start inspection → record a
checklist item → view the printable report) was run against the dev
server via Playwright with zero console/page errors, in addition to
static navigation of every new page in both English and Arabic.

**Future Move-Out linkage (Step 60, not implemented now):** every table
here is designed so a future Move-Out module can compare against this
baseline without a migration to this schema - `MoveInInspectionItem`/
`MoveInInventoryItem`/`MoveInMeterReading`/`MoveInKeyItem` all carry
enough structure (category/item name/condition/quantity/reading/returned-
expected) for a future `MoveOut*` counterpart to diff against by
category+name/meter type/key description, and `MoveInAttachment`'s
optional links to a specific inspection/inventory item let a future
Move-Out attach its own "after" photo against the same anchor. None of
this is built now.

**Explicitly not implemented in this task:** Move-Out, Security Deposit
settlement, damage charging, Maintenance Work Orders, Preventive
Maintenance, Tenant Portal, Owner Portal, legal electronic signature,
WhatsApp/email notification automation, AI image damage detection/AI
inspection, a payment gateway, subscription billing, Corporate Housing,
and permanent Unit Asset Management.

**Remaining risks / technical debt:**

- Attachment upload has no real binary storage yet (§13) - the metadata
  table and action exist, but no UI lets a user actually pick and upload
  a file; wiring a real object-storage backend is a prerequisite for a
  working photo-upload feature.
- The default inspection checklist is global/organization-agnostic; a
  future template-administration module (Organization/Compound/Unit-Type
  specific checklists) will need to extend `createMoveIn()`'s single call
  site, per §9.
- Post-completion correction has no real implementation yet, only a
  documented future direction (§16) - if a genuine data-entry error is
  discovered after completion, there is currently no in-app path to
  correct it short of direct database intervention.
- `REQUIRED_METER_TYPES` (`ELECTRICITY`/`WATER`) is a fixed, hardcoded
  policy - a Unit legitimately without municipal water/electricity
  metering (rare, but possible for some commercial/off-grid units) has
  no override path other than recording a placeholder reading.
