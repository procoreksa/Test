# Maintenance Management

This document describes the Maintenance Management module: Maintenance
Request intake, triage, Work Order execution, and operational cost
tracking for Compound common areas, Building common areas, and Units
(occupied or vacant). It is purely additive on top of the previous
Architecture/Security/Performance Hardening pass - no property hierarchy,
Contract/Invoice/Payment/Owner Ledger, Move-In, CRM, or audit logic was
changed. See `docs/PERMISSIONS.md` for the RBAC system this module plugs
into, `docs/MOVE-IN-HANDOVER.md` for the Move-In module this one links to
(never mutates), and `docs/AUDIT-AND-FINANCIAL-CONTROLS.md` for the audit
architecture reused here unchanged.

**CRITICAL BOUNDARY, preserved verbatim from the brief:** maintenance cost
tracking in this module is **operational**. It never creates an Invoice,
Payment, PaymentSchedule, OwnerLedgerEntry, Tenant charge, Owner charge,
VAT transaction, or ZATCA document. It answers "what did this job cost?",
never "who is financially liable and how should accounting post it?" -
that is explicitly a future module's job (see §33).

Target workflow this module implements: **Maintenance Request → Triage →
Work Order → Assignment → Scheduling → Diagnosis → Work In Progress →
Parts / Operational Costs → Completion → Verification → Closure.**

Explicitly **not implemented** here (see §31/§32/§33 for the reasoning):
Tenant Portal, Owner Portal, Vendor Portal, Preventive Maintenance,
recurring scheduled maintenance, Asset Management, Spare Parts Inventory,
Purchase Orders, accounting expense posting, owner/tenant chargeback,
security deposit deduction, VAT on maintenance, vendor invoice accounting,
WhatsApp/email/SMS/push notifications, AI diagnosis/image analysis, IoT,
QR equipment labels, Move-Out.

## 1. Request architecture

`MaintenanceRequest` represents "something is wrong / maintenance is
needed" - the intake record. It is deliberately **not** the same model as
the Work Order that resolves it (see §2): a Request can exist, be
triaged, and even be cancelled before any operational work is ever
authorized. Fields: `requestNumber` (Counter-generated, "MR-000001"),
`scopeType`/`compoundId`/`buildingId`/`unitId` (location, see §4),
`contractId`/`renterId` (optional UNIT-scope tenancy link, see §6),
`category`/`priority`/`status`, `title`/`description`,
`reportedByType`/`reportedByUserId`/`reportedByName`/`reportedByPhone`/
`reportedAt`, `preferredVisitDate`/`preferredTimeWindow`/
`permissionToEnter`, `source`, a preliminary `assignedToUserId` (set at
triage, independent of whatever the resulting Work Order is itself
assigned to), SLA fields (§8), `moveInId`/`moveInInspectionItemId` (§19),
and `createdByUserId` (a plain string, not a relation - survives the
creating User being removed, same as every other module in this
codebase).

## 2. Work Order architecture

`MaintenanceWorkOrder` represents "authorized operational work to resolve
[a Request]". Fields: `workOrderNumber` (Counter-generated,
"WO-000001"), `requestId`, `status`/`priority`,
`assignedToUserId`/`vendorId` (one responsible party, see §9),
`scheduledStart`/`scheduledEnd`, `startedAt`/`diagnosedAt`/`completedAt`/
`verifiedAt`/`closedAt`, `diagnosis`/`workPerformed`/`completionNotes`/
`requiresFollowUp`, `holdReason`/`holdReasonNote`, `estimatedCost`/
`actualCost` (the latter server-recomputed on every cost mutation, see
§16), `costResponsibility` (§17), `verifiedByUserId`/`verificationNotes`,
and cancellation fields. For V1, a Request has **at most one active
(non-CANCELLED) Work Order at a time** - enforced by
`blocksNewWorkOrderForRequest()` (`src/lib/operations/maintenance-rules.ts`),
the exact same app-layer-predicate-inside-a-Serializable-transaction
pattern `blocksNewMoveInForContract()`/`blocksNewReservationForOffer()`
already established - never a DB unique constraint, since a unique
constraint would permanently block ever creating a legitimate follow-up
Work Order after a first one is cancelled. The relation itself
(`MaintenanceRequest.workOrders MaintenanceWorkOrder[]`) is genuinely
one-to-many, so a future multi-Work-Order-per-Request policy needs no
migration - only a rules-module change.

## 3. Lifecycle

**Request:** `OPEN → TRIAGED → WORK_ORDER_CREATED → RESOLVED`, with
`CANCELLED` reachable from `OPEN`/`TRIAGED`. `WORK_ORDER_CREATED` can also
return to `TRIAGED` if its one active Work Order is cancelled (so a
follow-up Work Order can be created - see §2/§22). Both transition tables
live centrally in `isValidMaintenanceRequestTransition()`/
`isValidMaintenanceWorkOrderTransition()`
(`src/lib/operations/maintenance-rules.ts`) - no action file re-implements
this logic ad hoc.

**Work Order:** `DRAFT → ASSIGNED → SCHEDULED → IN_PROGRESS → COMPLETED →
VERIFIED → CLOSED`, with legitimate shortcuts (`ASSIGNED`/`SCHEDULED` →
`IN_PROGRESS` directly) and `IN_PROGRESS ↔ ON_HOLD`. `CANCELLED` is
reachable from every non-terminal status, including `COMPLETED`/`VERIFIED`
(cancellation is allowed any time before `CLOSED`, per the brief). `CLOSED`
is terminal - no reopen in V1 (§21/§23).

Creating a Work Order moves its Request `TRIAGED → WORK_ORDER_CREATED`
(never `RESOLVED` - creating a Work Order is not resolving the problem).
Closing a Work Order moves its Request `WORK_ORDER_CREATED → RESOLVED`,
atomically (§26).

## 4. Location model

`MaintenanceScopeType` is `UNIT` / `BUILDING_COMMON_AREA` /
`COMPOUND_COMMON_AREA`. For `UNIT` scope, `compoundId`/`buildingId` are
**denormalized onto the Request from the Unit's own authoritative
hierarchy** (`Unit → Floor → Building → Compound`) - never trusted as
given by the client, even though the columns exist directly on
`MaintenanceRequest` for query convenience (the same "copy from the
authoritative source, never let the client set it independently" pattern
`MoveIn.unitId`/`renterId` already established from Contract). For
`BUILDING_COMMON_AREA`, `buildingId` is required and `unitId` must be
null; `compoundId` is derived from the Building. For
`COMPOUND_COMMON_AREA`, `compoundId` is required and both
`buildingId`/`unitId` must be null. All of this is enforced by exactly one
function, `resolveMaintenanceLocation()`
(`src/lib/operations/maintenance-location.ts`) - no action file duplicates
hierarchy validation.

## 5. Unit / Common Area behavior

Maintenance supports vacant-unit turnover work (no Contract/Renter
required) and Building/Compound common-area work (Elevator, Pool, Gym,
Landscape, Lobby, Parking, Gate, Lighting, Fire system) with **no fake
Unit relation** - `unitId` is simply null for common-area scopes.
Maintenance Work Orders **never write to `Unit.status`** (including the
existing-but-unused `UnitStatus.MAINTENANCE` enum value) - confirmed via
`grep` that nothing in `src/` ever sets it, and this module deliberately
keeps it that way, mirroring Move-In's own precedent of never touching
`Unit.status`/`Contract.status` to avoid an undocumented side effect on
other modules' assumptions about occupancy/vacancy (which is governed by
Contract lifecycle elsewhere).

## 6. Contract / Renter relationship

For `UNIT` scope only, `contractId`/`renterId` are optional. When
supplied, `resolveMaintenanceLocation()` verifies: the Contract belongs to
the same organization **and** the same Unit (never Unit A + a Contract
that actually belongs to Unit B), and the Renter is the one actually tied
to that Contract's `renterId` (never an unrelated Renter attached to the
same Unit's Request). Supplying a `renterId` without a `contractId` is
rejected outright - a Renter is only ever linked together with its own
Contract, never floating. An active tenancy is never required - vacant-unit
maintenance supplies neither.

## 7. Category / Priority

`MaintenanceCategory` is a closed 19-value enum (PLUMBING, ELECTRICAL,
AIR_CONDITIONING, APPLIANCE, CARPENTRY, PAINTING, CIVIL, FLOORING,
DOORS_WINDOWS, ELEVATOR, POOL, LANDSCAPING, PEST_CONTROL, CLEANING,
FIRE_SAFETY, SECURITY_SYSTEM, INTERNET_TELECOM, GENERAL, OTHER) - no
uncontrolled category strings anywhere. `MaintenancePriority` is LOW /
NORMAL / HIGH / URGENT / EMERGENCY, deliberately independent of category:
priority is set by whoever reports/triages the issue based on actual
operational urgency, never derived from category alone (a plumbing issue
can be LOW or EMERGENCY depending on the real situation).

## 8. SLA policy

`SLA_POLICY` (`src/lib/operations/maintenance-rules.ts`) centralizes
default response/resolution targets by priority, in minutes - the exact
values given by the brief:

| Priority | Response | Resolution |
|---|---|---|
| EMERGENCY | 15 min | 4 hr |
| URGENT | 1 hr | 8 hr |
| HIGH | 4 hr | 24 hr |
| NORMAL | 8 hr | 72 hr |
| LOW | 24 hr | 120 hr |

These are defaults, not universal legal/business truths, kept in exactly
one place so nothing scatters hardcoded SLA minutes elsewhere.
`computeSlaDueDates()` computes `responseDueAt`/`resolutionDueAt` **once**,
at Request creation, from `reportedAt` + the policy for the Request's
priority at that instant - and these stored timestamps are **never
recalculated** even if priority later changes or the policy itself is
edited in a future release ("freeze original SLA targets once Request is
created", per the brief). `firstResponseAt` is set once, on the Request's
first successful triage, and never overwritten afterward - a page view is
never counted as a response. SLA status (`ON_TRACK`/`AT_RISK`/`BREACHED`/
`MET`) is a **derived, not persisted**, pure computation
(`computeResponseSlaStatus()`/`computeResolutionSlaStatus()`): response is
breached when `now > responseDueAt` and no `firstResponseAt` exists yet;
resolution is breached when `now > resolutionDueAt` and the Request is
not yet resolved/cancelled. A `CANCELLED` Request's resolution SLA
resolves to `null` (not `MET`, not `BREACHED`) - it was never resolved,
so it must never count as "met" in a report's denominator, but it also
wasn't left to overrun a deadline, so it's simply excluded from the
metric. `AT_RISK` (75% of the window elapsed with no response/resolution
yet) is this codebase's own reasonable default, not specified by the
brief, kept in one named constant (`AT_RISK_THRESHOLD`). **SLA clock
continues while a Work Order is ON_HOLD in V1** - no pause/resume clock
logic is implemented (documented brief instruction, not an oversight).

## 9. Assignment

Work Order responsibility is **one internal User OR one Vendor, never
both** (Step 22 of the brief). Enforced twice: in the service layer
(`assignWorkOrder()` rejects a request that supplies both), and as
defense-in-depth by a Postgres `CHECK` constraint on
`maintenance_work_orders` (`CHECK ("assignedToUserId" IS NULL OR
"vendorId" IS NULL)`, added by hand in the migration's raw SQL, mirroring
`property_ownerships_at_least_one_asset`'s own precedent from the
ownership-accounting migration). No new technician-login architecture was
built - internal technicians are existing `User` rows, assigned via
`assignedToUserId`, always re-verified same-organization. No new
`UserRole` value was introduced for this.

## 10. Vendor architecture

`MaintenanceVendor` is intentionally lightweight: `vendorNumber`
(Counter-generated, "VEN-000001"), `name`/`nameAr`, `contactPerson`/
`phone`/`email`, `active`, `notes`. Belongs to exactly one Organization -
cross-org vendor assignment fails at the same `resolveMaintenanceLocation()`-
style org-scoped lookup every other id in this module goes through. An
**inactive Vendor cannot receive new Work Order assignments**
(`assignWorkOrder()` checks `vendor.active`), but existing historical Work
Order relations are preserved (no cascading unassignment). Vendors are
**never hard-deleted** - only deactivated (`setVendorActive()`), matching
the no-hard-delete policy this codebase applies everywhere else with
history. Specialties are a **relational join table**
(`MaintenanceVendorSpecialty`, `vendorId` + `MaintenanceCategory`, unique
pair) rather than an uncontrolled comma-separated string, per the brief's
own "prefer relational if simple" instruction - "find every vendor who
does PLUMBING" is a normal indexed query, not a string `LIKE`.

## 11. Scheduling / conflict behavior

`scheduledStart`/`scheduledEnd` must satisfy `end > start`
(`isValidWorkOrderSchedule()`). Scheduling is purely operational - no
calendar sync was built. For an internally-assigned Work Order,
`scheduleWorkOrder()` detects overlapping active assignments for the same
technician (`hasScheduleOverlap()`, the same "two ranges overlap iff each
starts before the other ends" formula `hasTimeOverlap()` already
established for Viewings) among Work Orders in a schedule-blocking status
(`ASSIGNED`/`SCHEDULED`/`IN_PROGRESS`/`ON_HOLD` - `COMPLETED`/`VERIFIED`/
`CLOSED`/`CANCELLED` never block) and **rejects an exact overlapping
assignment outright** - the V1 rule the brief explicitly permits ("blocking
exact overlapping assignments is acceptable for V1... do not overbuild
workforce scheduling").

## 12. Diagnosis

`diagnosis` (free text) + `diagnosedAt` (set once, on first save) live on
the Work Order and can be recorded before or during active work.
Meaningful diagnosis changes are audited via `auditUpdate()`'s own
before/after diff (§25) - never silently.

## 13. Work Logs

`MaintenanceWorkLog` is the **user-facing operational history** a
technician/staff member reads (`NOTE`/`STATUS_UPDATE`/`DIAGNOSIS`/
`WORK_PERFORMED`/`CUSTOMER_UPDATE`/`INTERNAL_NOTE`/`OTHER`), append-only by
convention (no update/delete action exists). This is deliberately
**distinct from `AuditLog`** (§25) - routine Work Log notes are never
audited, to avoid the same "per-keystroke audit noise" this codebase
already avoids elsewhere; going on/resuming from hold does write a Work
Log entry recording the reason, since that's genuinely useful operational
history, but that write is itself not an audit event.

## 14. Labor

`MaintenanceLaborEntry`: `description`, `hours`, optional `hourlyRate`,
`cost` (`Prisma.Decimal` throughout, never floating-point), `workDate`,
optional `userId`/`vendorId` (whichever party actually performed the
work - not required to match the Work Order's own single
`assignedToUserId`/`vendorId`, since a vendor's own internal labor
breakdown may name a specific technician). `cost` is always
server-computed: `hours × hourlyRate` when a rate is given
(`computeLaborCost()`), otherwise the caller's explicit flat cost - never
trusted blindly either way; `hours >= 0`/rate/cost are all validated
non-negative.

## 15. Parts

`MaintenancePartEntry`: `itemName`, `quantity` (integer, must be > 0),
`unitCost`, `totalCost` - **always `quantity × unitCost`, computed
server-side** (`computePartTotalCost()`), never trusted from the client,
plus optional `supplierName`/`reference`.

## 16. Operational costs

`MaintenanceCostEntry` is the catch-all for transport/external
service/equipment rental/miscellaneous costs that don't fit Labor or
Parts (`costType`, `description`, `amount`, `reference`, `date`) - kept
separate rather than overloading either of the other two tables. The
single authoritative aggregation, **Labor + Parts + Other = Actual
Maintenance Cost**, is `computeMaintenanceCostSummary()`
(`src/lib/operations/maintenance-rules.ts`), Decimal-safe throughout, and
is re-run and cached onto `MaintenanceWorkOrder.actualCost` on every
Labor/Parts/Cost entry mutation (`recomputeActualCost()` in
`src/lib/actions/maintenance.ts`). `estimatedCost` is a plain field set at
Work Order creation; `computeCostVariance()` returns `actualCost -
estimatedCost` (or `null` with no estimate) - labeled "Variance"
everywhere in the UI, never "profit/loss", since this is operational, not
accounting. **No cost entry, at any point, creates an Invoice, Payment,
PaymentSchedule, or OwnerLedgerEntry** (verified by the real-DB financial
isolation regression test, §29).

## 17. Cost responsibility design

`MaintenanceCostResponsibility` (UNDETERMINED / OWNER / TENANT /
PROPERTY_MANAGEMENT / WARRANTY / VENDOR / OTHER) on the Work Order is a
**preliminary operational classification only** - it answers "who do we
currently think should ultimately bear this cost?" for reporting purposes,
and is explicitly documented, in the schema comment and the UI notice
text next to it, as never creating an accounting entry, chargeback, or
security-deposit deduction. A future financial-allocation module
consumes this field; this module only ever reads/writes it.

## 18. Attachments / photo strategy

`MaintenanceAttachment` mirrors `MoveInAttachment` exactly (see
`docs/STORAGE-ARCHITECTURE.md`): metadata-only (`fileName`/`mimeType`/
`fileSize`/`caption`/`attachmentType`/`stage`), a nullable `storageKey`
placeholder for a future real object-storage integration, no binary
column, no upload UI wired to a real storage backend yet.
`attachmentType` is PHOTO/VIDEO/DOCUMENT/INVOICE_COPY/QUOTE/OTHER -
**`INVOICE_COPY` means a vendor/source document photographed for the
record (e.g. a vendor's paper invoice), never a system accounting
Invoice**, and never creates one. `stage` is BEFORE/DURING/AFTER/GENERAL,
laying groundwork for a future Tenant Portal/quality-verification feature
without a schema change. Exactly one of `requestId`/`workOrderId`/
`workLogId` is normally set per row (all three nullable, so one model
covers every attachment point named by the brief without three
near-identical tables). No AI image analysis was built.

## 19. Move-In integration

Move-In already records `requiresAttention` on inspection items; this
module does **not** automatically create a Maintenance Request for every
flagged defect. Instead, `createMaintenanceRequestFromMoveIn()`
(`src/lib/actions/maintenance.ts`) is an explicit, authorized action -
pre-filling Unit/location, `source = MOVE_IN_INSPECTION`, and a
description from the inspection item - that a staff member triggers
deliberately from a completed inspection item. Traceability is
reference-only: `MaintenanceRequest.moveInId`/`moveInInspectionItemId`
(both `onDelete: SetNull`, since these are pure references, safe to lose
if the Move-In record itself is ever removed - never `onDelete: Cascade`,
since a Maintenance Request's own history must survive independently).
**Creating a Request from a Move-In defect never mutates the Move-In or
inspection item baseline** - verified byte-for-byte (`toEqual()` on the
full row, before vs. after) in the real-DB regression test (§29).

## 20. Completion

`completeWorkOrder()` moves `IN_PROGRESS → COMPLETED`, setting
`completedAt` once, and requires `workPerformed`/`completionNotes`
(validated by the centralized `validateWorkOrderCompletion()`) -
deliberately **does not** require any cost entries or a minimum cost,
since "some maintenance is internal/no-cost" (per the brief's explicit
instruction). `requiresFollowUp` is a plain boolean flag for a future
Request, never an automatic action.

## 21. Verification

**Completion (technician says the work is finished) and Verification
(authorized staff confirms the resolution) are deliberately distinct
statuses** (`COMPLETED` then `VERIFIED`), per the brief's own explicit
emphasis on this separation. `verifyWorkOrder()` sets `verifiedAt`
(once)/`verifiedByUserId`/`verificationNotes`.

## 22. Closure

`closeWorkOrder()` moves `VERIFIED → CLOSED` and, in the same Serializable
transaction, resolves the parent Request (`WORK_ORDER_CREATED →
RESOLVED`, `resolvedAt` set) - both writes commit or roll back together
(§26). This is the only path that ever sets a Request to `RESOLVED`;
merely creating a Work Order never does (§3).

## 23. Immutability behavior

`CLOSED` is terminal - **no reopen in V1**. `isMaintenanceWorkOrderLocked()`
gates every subsequent mutation attempt (diagnosis, Work Log, Labor,
Parts, Cost entries, assignment, schedule) on a `CLOSED` Work Order,
throwing a translated `maintenanceWorkOrderLocked` error - the row itself
is preserved forever as read-only operational history. If an issue
recurs, the correct action is a **new** Maintenance Request that
references the previous one later (not implemented as an explicit
"related request" link in V1, but nothing prevents a future one) - never
mutating the closed record. Amendments to closed history are an explicit
future-scope item, not built here.

## 24. RBAC

See `docs/PERMISSIONS.md` §2-3 for the full `maintenance.*` permission
list and role matrix. Summary: OWNER/ADMIN hold every permission;
MANAGER holds every operational `maintenance.*` permission (the same tier
as its Move-In/Contract access); ACCOUNTANT gets `maintenance.view` +
`maintenance.cost.view` + `maintenance.vendor.view` only (visibility into
cost and vendors, no operational mutation); VIEWER gets `maintenance.view`
only. No new `UserRole` was introduced. Every mutating server action is
gated server-side via `requirePermission()`/`requirePermissionAudited()` -
UI hiding (disabled buttons, hidden forms) is supplementary only, never
the actual security boundary.

## 25. Audit

Meaningful mutations are recorded via the existing `AuditLog`
infrastructure unchanged (`auditCreate()`/`auditUpdate()`/`auditAction()`,
`src/lib/audit.ts`) - no new `AuditAction` value was needed, the existing
union (`CREATE`/`UPDATE`/`CANCEL`/`ACTIVATE`/`DEACTIVATE`, etc.) already
covers everything this module does. Audited: Request created/triaged/
priority changed/assignment changed/cancelled; Work Order created/
scheduled/started/held/resumed/diagnosis changed/completed/verified/
closed/cancelled; Labor/Parts/Cost entry added; Vendor created/updated/
activated/deactivated. **Not** audited (deliberately, to avoid noise):
routine Work Log notes (§13) - see that section for the Work Log vs.
Audit Log distinction, which this module preserves exactly as designed.

## 26. Transactions

Every multi-write operation runs inside `prisma.$transaction(...)`:
Request creation (location resolution + numbering + row create + audit),
Triage (status/timestamp/audit together), Work Order creation from a
Request (numbering + row create + Request status update + audit,
`{ isolationLevel: "Serializable" }` - the genuine "check no active Work
Order exists, then create one" race), Work Order close (Work Order status
+ Request resolution + audit, also `Serializable`), Work Order cancel
(status + possible Request reversion to `TRIAGED` + audit, also
`Serializable`), and every cost-entry mutation (entry create +
`actualCost` recompute together). Transactions are kept short - no
external network call happens inside any of them, matching this
codebase's own standing discipline.

## 27. Concurrency / idempotency

`Serializable` isolation - not used indiscriminately, only for the
genuine "check-conflicts-then-write" races - protects: duplicate Work
Order creation for the same Request (two simultaneous
`createWorkOrderFromRequest()` calls resolve to exactly one Work Order;
the loser sees a real Postgres serialization failure or the app-level
`blocksNewWorkOrderForRequest()` check, never a silent double-create), and
double-close (two simultaneous `closeWorkOrder()` calls resolve to
exactly one `CLOSED` transition and exactly one Request resolution -
verified by counting `to: "RESOLVED"` audit rows, not just the final
status). Counter-based numbering (`nextCounterValue()`, shared
infrastructure, no new numbering scheme) is safe under concurrency by the
same atomic-`upsert`-inside-a-transaction mechanism every other numbered
entity in this codebase already relies on. All of this is verified by
real, non-sleep-based `Promise.allSettled()` concurrency tests (§29) -
never a fixed `setTimeout` race simulation. Idempotency for repeated
clicks/retries on Start/Complete/Verify/Close/Create is enforced by the
same centralized transition tables (§3): a second call from an already-
advanced state is rejected by `isValidMaintenance*Transition()`, exactly
mirroring how Move-In already handles double-submission.

## 28. Multi-tenant security

Every read and write in `src/lib/actions/maintenance.ts` scopes its
Prisma query by the caller's own `organizationId` (from
`requirePermission()`'s returned session, never client input). Every
relation id accepted from a client (`compoundId`, `buildingId`, `unitId`,
`contractId`, `renterId`, `moveInId`, `moveInInspectionItemId`,
`assignedToUserId`, `vendorId`) is re-verified same-organization before
use - either inside `resolveMaintenanceLocation()` (creation-time
location/tenancy ids) or via the org-scoped `findFirst`/
`findFirstOrThrow` lookup each mutating action performs on the entity it's
about to update (assignment, scheduling, cost entries, vendor operations).
See §29 for the real-DB evidence.

## 29. Multi-tenant / IDOR security results

Real, database-backed tests (`src/lib/actions/__dbtests__/
maintenance-cross-org-security.db.test.ts`, 17 tests, all passing)
confirm: Org A cannot create a Request against Org B's Unit; cannot
read/triage/cancel Org B's Request; cannot create a Work Order from Org
B's Request; cannot read/assign/schedule/start/complete/verify/close Org
B's Work Order; cannot assign a cross-org internal user or vendor to
either side's Work Order; cannot add Labor/Parts/Cost entries or Work
Logs to Org B's Work Order; cannot read/manage Org B's Vendor. Relation-
injection tests confirm: a same-org but mismatched Unit+Contract pairing
is rejected; an unrelated Renter on a valid Unit+Contract pairing is
rejected; `BUILDING_COMMON_AREA` with a `unitId` is rejected;
`COMPOUND_COMMON_AREA` with a `buildingId` is rejected; a cross-org
`buildingId`/`compoundId`/`unitId`/`moveInId`/`moveInInspectionItemId` is
rejected. Every id type named in the brief's own IDOR checklist is
covered.

## 30. Financial isolation results

`src/lib/actions/__dbtests__/maintenance-lifecycle.db.test.ts` includes a
dedicated regression test that seeds a real Contract/Invoice/
PaymentSchedule/Payment/OwnerLedgerEntry, then drives a full Maintenance
Request → Work Order → Labor → Complete → Verify → Close lifecycle
against the same organization, and asserts the seeded Invoice/
PaymentSchedule rows are byte-for-byte unchanged (`toEqual()`) and the
Payment/OwnerLedgerEntry counts are unchanged. The full happy-path
lifecycle test additionally asserts zero rows exist in Invoice/Payment/
PaymentSchedule/OwnerLedgerEntry for the test organization after the
entire flow. Both pass.

## 31. Dashboard

`getMaintenanceDashboardKpis()` extends the existing `/operations`
dashboard (never replacing the Move-In KPIs already there) with: Open
Requests, Emergency Requests, SLA Breached, Work Orders In Progress, Work
Orders On Hold, Completed Awaiting Verification, Closed This Month, and
Operational Maintenance Cost This Month (explicitly labeled as such in
the UI, never mixed with accounting expense figures). Every query is a
bounded `count()`/`aggregate()` - the one query that needs SLA-breach
logic (which can't be expressed as a single SQL predicate against the
pure formula) is scoped to only the bounded "not yet resolved/cancelled"
set before the pure-function filter runs in-process, never the whole
table - matching Step 63's explicit "do not reintroduce unbounded reads"
caution, directly following the hardening pass that fixed exactly this
class of bug for the Invoice dashboard.

## 32. Reports

Nine reports under `/operations/maintenance/reports`
(`src/lib/actions/maintenance-reports.ts`): Maintenance Request Report
(status/priority breakdown), Work Order Status Report, SLA Performance
Report (response/resolution met/breached counts with explicit
denominators - a `CANCELLED` Request is excluded from the resolution
denominator entirely, per §8; average response/resolution time computed
only over Requests that actually have both a start and an end timestamp
for that metric), Maintenance by Category, Maintenance by Compound,
Maintenance by Unit (top 25 by request count), Maintenance Cost Report
(operational cost by category, with the same "not an accounting entry"
notice repeated in the UI), Vendor Performance Report and Technician
Performance Report (assigned/completed/verified/closed counts + average
completion time - **facts only, no subjective scoring/ranking**, per the
brief's explicit instruction), and a Recurring Issue Report foundation
(same Unit + same Category, count ≥ 3 within the last 90 days, no AI).

## 33. Future extension points (explicitly not built now)

- **Tenant Portal.** `MaintenanceRequestSource.TENANT` and
  `MaintenanceReportedByType.TENANT` already exist so a tenant-submitted
  request is representable today (recorded on the tenant's behalf by
  staff) without a schema change once a real portal exists.
- **Owner Portal / Vendor Portal.** Not built; `MaintenanceVendor` has no
  login/auth of any kind by design (§10).
- **Preventive Maintenance / recurring scheduled maintenance.** The
  Recurring Issue Report (§32) is the only foundation laid - it reports
  on what already happened, never schedules future work automatically.
  A real preventive-maintenance module would add its own scheduling
  model and a "spawn a Request on schedule" job, neither of which exists
  here.
- **Accounting integration / chargebacks.** `costResponsibility` (§17) is
  the only preparation - a future module would read it (and the
  `actualCost` figure) to decide how to post an Invoice/OwnerLedgerEntry/
  security-deposit deduction, none of which this module ever does itself
  (§16/§30 confirm this by test, not just by design intent).
- **Asset Management / Spare Parts Inventory / Purchase Orders.** Parts
  are recorded per-Work-Order as a cost line (§15) only - there is no
  inventory/stock-level concept, no reorder logic, and no PO workflow.
