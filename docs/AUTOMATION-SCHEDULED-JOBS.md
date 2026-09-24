# Automation & Scheduled Jobs

## 1. Overview & scope

The durable automation and scheduled-job foundation for V1: time-based
tenant-facing reminders (rent due, contract expiry, Move-In, Move-Out), a
detection-only Maintenance SLA check, and - critically - the fix for the
one durability gap Prompt 19 (Notifications & Communications) knowingly left
open. This phase never introduces a generic workflow engine, never invents a
second source of business truth, and never sends anything a human hasn't
explicitly turned on for that reminder type.

Two distinct problems are solved, and kept structurally separate everywhere
in this codebase even though they share execution infrastructure:

1. **Time-based automation** - "a scheduled instant arrived" (a rent due
   date, a contract's end date, a Move-In/Move-Out appointment, a daily SLA
   sweep). Modeled as `AutomationJob`.
2. **Reliable asynchronous follow-up after a committed business event** -
   "an Invoice was issued, a Payment was received" - which must never be
   lost even if the process crashes the instant after the business
   transaction commits. Modeled as `CommunicationOutboxEvent`.

## 2. Architecture audit (Step 1 findings)

Confirmed before writing any code:
- Prompt 19 already built `CommunicationMessage`/`CommunicationDeliveryAttempt`,
  `enqueueCommunicationEvent()` (fire-and-forget, called AFTER each business
  transaction commits, never inside it), and a protected delivery worker
  (`src/app/api/communications/process/route.ts`) - all of which are
  **preserved unchanged** and reused, never replaced.
- The exact gap: `enqueueCommunicationEvent()` runs strictly after commit.
  If the process crashes between commit and that call, the business mutation
  is durable but **no `CommunicationMessage` row, and no record of the
  missed intent, ever exists** - a silent, permanent loss with no
  reconciliation path. This is the single most important problem this phase
  solves.
- No scheduler, no cron, no job/queue library existed anywhere in this
  codebase before this phase - `src/lib/automation/` is entirely new.
- No `Organization.timezone` and no pinned server timezone existed; every
  existing date computation implicitly assumes server-local time (§24 below
  resolves this for the new module only, deliberately not retrofitted
  everywhere else - see docs/TECHNICAL-DEBT.md).
- `ContractStatus` has no `EXPIRED` value ever set by any existing code path
  (§31) and no dedicated overdue-status-sync job exists (§30) - both
  pre-existing gaps this phase deliberately leaves as-is (see those
  sections for the reasoning).

## 3. Target architecture

```
Authoritative Business Data
   -> Automation Definition/Scheduler        (time-based path)
   -> Durable Job / Outbox                   (both paths converge here)
   -> Atomic Claim
   -> Job Handler
   -> Domain Action or Communication Intent
   -> Retry / Failure / Recovery
   -> Execution History / Audit / Monitoring
```

Concretely, two chains, sharing the last four stages' *infrastructure*
(atomic claim, bounded retry, stuck recovery, append-only history) but never
their *semantics* (§6):

- **9 existing business events** (unchanged from Prompt 19):
  `Business Tx -> CommunicationOutboxEvent (same tx) -> Outbox Processor ->
  CommunicationMessage -> Delivery Worker -> Provider`
- **New scheduled reminders**:
  `Scheduler -> AutomationJob -> Worker -> Handler -> CommunicationOutboxEvent
  -> Outbox Processor -> CommunicationMessage -> Delivery Worker -> Provider`

## 4. Critical Principle 1 - Durable intent before async work

`emitCommunicationEventTx(tx, input)` (`src/lib/automation/outbox-emit.ts`)
inserts one `CommunicationOutboxEvent` row using the **same** `Prisma.TransactionClient`
the caller's business mutation already used. If the transaction commits, the
row is durable before the caller's function returns - closing the exact
crash window described in §2. If the transaction rolls back, the row never
existed either (§17 proves both directions with a real DB). Unlike the
legacy `enqueueCommunicationEvent()`, it deliberately does **not** swallow
errors: a genuine insert failure propagates so the whole business
transaction fails, per the rule "a business transaction should fail if a
required outbox intent cannot be durably inserted."

## 5. Critical Principle 2 - Scheduled Job ≠ Outbox Event

`AutomationJob` ("time arrived") and `CommunicationOutboxEvent` ("something
already happened") are deliberately two separate Prisma models, never one
polymorphic table, even though both use an identical atomic-claim/
retry-backoff/stuck-recovery idiom. Conflating them would blur "was this
ever scheduled" with "did this business fact ever occur" - two different
questions with different audit/compliance implications.

## 6. Critical Principle 3 - At-least-once, never exactly-once

Every claim is a single conditional `updateMany({ where: { status: <expected> } })`.
A crash between claim and outcome is recovered (not lost) via bounded,
threshold-based stuck-recovery (§25), which means every handler/processor
must be idempotent **by construction** (DB-unique keys), never by a false
single-delivery guarantee. This is documented, not silently assumed, and
proven with real-DB crash-simulation tests (§40).

## 7. Critical Principle 4 - Concurrency-safe atomic claim

Both the outbox processor and the AutomationJob worker use the exact same
idiom the pre-existing Communications delivery worker already established:
`updateMany({ where: { id, organizationId, status: "PENDING" }, data: { status: "PROCESSING"/"RUNNING", ... } })`,
checking `count === 1` to know if this invocation won the race. Never a raw
`SELECT ... FOR UPDATE`. Proven safe under real concurrent invocations
(§40).

## 8. Critical Principle 5 - Business actions remain authoritative

Automation infrastructure never creates a second Invoice/Payment/Contract-
status/Maintenance-SLA/Communications engine. Every handler either (a)
re-reads the existing authoritative table and re-emits an existing,
already-wired `CommunicationEventType` through the existing outbox/rule/
template pipeline, or (b) - for Maintenance SLA - purely detects and records
that it ran, touching nothing (§30).

## 9. Critical Principle 6 - Failure isolation

A failed reminder or job attempt can never corrupt Invoice/Payment/Contract/
Maintenance/MoveIn/MoveOut/SecurityDeposit state: every handler's own domain
mutation (when it has one at all) is limited to inserting a
`CommunicationOutboxEvent` row inside its own fresh transaction - it never
touches the business tables that fed it. A failed job/outbox event has
visible `FAILED` state, `lastErrorCode`/`lastErrorMessage`, and a bounded
retry policy (§25) - never a silent drop.

## 10. Critical Principle 7 - No silent automation

Every layer answers "what, when, did it run, was it retried, why did it
fail" from the database alone:
- `AutomationJobAttempt` - append-only, one row per attempt, never mutated.
- `AutomationSchedulerRun` - one row per scheduler invocation (§15).
- `/automation` admin dashboard surfaces Pending/Running/Failed/Completed-
  Today jobs, Outbox Pending/Failed, the Communication queue depth, and Last
  Scheduler Run (§34).
- `AuditLog` records automation-setting changes, manual job retry/cancel,
  and manual outbox retry only (§35) - never one row per routine scheduler
  tick or job attempt, to avoid noise (execution history above is its own
  operational record).

## 11. Schema: `CommunicationOutboxEvent`

`id, organizationId, eventType, eventKey, payloadVersion, payloadJson,
status (PENDING/PROCESSING/PROCESSED/FAILED), availableAt, attemptCount,
maxAttempts, lockedAt, lockedBy, processedAt, failedAt, lastErrorCode,
lastErrorMessage, createdAt, updatedAt`. `@@unique([organizationId, eventType, eventKey])`
is the actual idempotency guarantee (§13/§20). `payloadJson` holds a
versioned `OutboxPayloadV1` snapshot (`businessEntityType`,
`businessEntityId`, `language`, `variables`, `recipients`) - IDs and
already-resolved safe values only, never a full Prisma object, never a
secret.

## 12. Schema: `AutomationJob` / `AutomationJobAttempt`

`AutomationJob`: `id, organizationId (required), jobType, jobKey, status
(PENDING/RUNNING/COMPLETED/FAILED/CANCELLED), scheduledFor, availableAt,
attemptCount, maxAttempts, lockedAt, lockedBy, startedAt, completedAt,
failedAt, lastErrorCode, lastErrorMessage, payloadVersion, payloadJson,
createdAt, updatedAt`. `organizationId` is deliberately non-nullable: every
one of the 6 job types in V1 (`RENT_DUE_REMINDER`, `CONTRACT_EXPIRY_REMINDER`,
`MOVE_IN_REMINDER`, `MOVE_OUT_REMINDER`, `MAINTENANCE_SLA_CHECK`,
`COMMUNICATION_RECONCILIATION`) is inherently org-scoped or, for
reconciliation, executed directly rather than as a per-org job row (§20) -
no system-level/cross-tenant AutomationJob exists in V1, so every query gets
a hard multi-tenancy boundary for free.

`AutomationJobAttempt`: `id, jobId, attemptNumber, workerId, startedAt,
finishedAt, outcome (COMPLETED/SKIPPED/RETRYABLE_FAILURE/PERMANENT_FAILURE),
errorCode, errorMessage, createdAt`. Append-only - written once per attempt,
never mutated (§10).

## 13. Schema: `AutomationSettings`

Per-organization typed switches, never a generic rule-builder:
`rentReminderEnabled, contractExpiryReminderEnabled, moveInReminderEnabled,
moveOutReminderEnabled, maintenanceSlaAutomationEnabled` - all
`Boolean @default(false)`. An organization that has never visited
`/automation/settings` has no row at all, and `getAutomationSettings()`
(`src/lib/actions/automation.ts`) returns every flag as `false` in that
case - "no row" and "everything off" are the same state, never ambiguous.
System-reliability jobs (outbox processing, delivery, reconciliation) are
**not** gated by this table at all - they are operational infrastructure,
not tenant-facing, and run whenever their route is invoked.

## 14. Schema: `AutomationSchedulerRun`

A durable, append-only record of every `runAutomationScheduler()`
invocation (`id, ranAt, resultJson`) - added specifically for §10's "no
silent automation" requirement, so `/automation`'s "Last Scheduler Run"
card is a real database fact, not an inferred timestamp. System-level (no
`organizationId`): one invocation discovers work across every organization
in a single pass. Never read by any handler.

## 15. Schema: `Organization.timezone`

`String @default("Asia/Riyadh")`. See §24 for the decision rationale.

## 16. The Prompt-19 durability gap and how it's closed

Solved via §4 + §11 + at-least-once processing (§6), never claimed as
exactly-once. Reconciliation (§18/19) is explicitly defense-in-depth on top
of this, never the primary mechanism. Proven end to end with a real
database in `src/lib/actions/__dbtests__/automation-outbox-durability.db.test.ts`:
for `INVOICE_ISSUED`, `PAYMENT_RECEIVED`, `MAINTENANCE_REQUEST_CREATED`,
`MOVE_IN_SCHEDULED`, `MOVE_OUT_SCHEDULED`, `SECURITY_DEPOSIT_SETTLEMENT_POSTED`,
and `SECURITY_DEPOSIT_REFUND_RECORDED`, a durable outbox row exists in the
database the instant the business action returns - before any worker has
ever run - and a forced rollback after `emitCommunicationEventTx()` leaves
neither the business mutation nor the outbox row behind.

## 17. Migrating the 9 existing hook points

`src/lib/actions/invoices.ts`, `payments.ts`, `maintenance.ts` (request
creation, work-order scheduling, work-order completion), `move-ins.ts`,
`move-outs.ts`, `security-deposits.ts` (settlement posting, refund
recording) all moved their notification call from a post-commit
`enqueueCommunicationEvent()` to an in-transaction `emitCommunicationEventTx()`,
using per-event-type key builders in `src/lib/automation/outbox-keys.ts`.
The old `enqueueCommunicationEvent()` wrapper still exists (now a thin
fire-and-forget shim over the renamed, shared
`createCommunicationMessagesForEvent()` in `src/lib/communications/enqueue.ts`)
but is no longer called from any of the 9 original hook points.

## 18. The outbox processor

`processCommunicationOutbox()` (`src/lib/automation/outbox-processor.ts`):
recovers stuck `PROCESSING` rows (reusing the existing Communications
`STUCK_PROCESSING_THRESHOLD_MS`), claims due `PENDING` rows via the atomic
idiom (§7), and for each one delegates to
`createCommunicationMessagesForEvent()` - the **same** rule-resolution/
template-render/idempotent-create implementation the legacy
`enqueueCommunicationEvent()` wrapper uses, never a second competing
implementation. It never calls a provider or touches the network; that
remains the existing, unchanged Communications delivery worker's job. An
unrecognized `payloadVersion` (`isSupportedPayload()`) fails the row
permanently and immediately - never guessed at, never retried.

## 19. Reconciliation - defense in depth only

`runCommunicationReconciliation()` (`src/lib/automation/reconciliation.ts`)
re-derives the expected `CommunicationOutboxEvent` for each of the 9
originally-wired events directly from its own authoritative source table
(re-fetching the same fields the original call site used) and inserts, via
`createMany({ skipDuplicates: true })`, only what is durably missing.
Explicitly **never** the primary durability mechanism (§4/§6 already are)
and **never** claimed as exactly-once - it is a bounded, periodic safety net
against a rare bug or infra failure in the same-transaction path. Not gated
by `AutomationSettings` (§13's opt-in applies only to tenant-facing
reminders) - always on, the same operational tier as the outbox processor.
Runs across every organization in one bounded invocation (no per-org
`AutomationJob` row - see `src/lib/automation/handlers/index.ts`'s own
comment on why `COMMUNICATION_RECONCILIATION` has no handler-registry
entry). Multi-tenancy is preserved because every inserted row's
`organizationId` is read directly off its own source record.

## 20. Reconciliation - historical safety

`RECONCILIATION_LAUNCH_AT` (`2026-09-24T00:00:00.000Z`, the date this
feature shipped) is a hard floor: reconciliation never examines a business
record created before it, no matter how long it lacks an outbox event - such
a record predates the durability guarantee entirely and was never expected
to have one. `RECONCILIATION_LOOKBACK_DAYS = 7` bounds each run's window
above that floor, generously overlapping run-over-run so a missed run can
never open a permanent gap. Proven with a real DB
(`automation-reconciliation.db.test.ts`): a backdated, pre-cutoff invoice
missing its outbox event is never given one.

## 21. AutomationJob key idempotency

`@@unique([organizationId, jobType, jobKey])`. Every `jobKey` builder
(`src/lib/automation/job-keys.ts`) embeds the mutable business date/instant
wherever the underlying fact can legitimately change - a due-date change, a
Move-In/Move-Out reschedule - so a genuine change produces a *new* logical
job instead of colliding with (and silently discarding) a stale one.
`createJobIdempotent()` (`src/lib/automation/scheduler.ts`) treats the
resulting P2002 as a silent no-op, exactly like `emitCommunicationEventTx()`'s
own handling. Proven idempotent under both sequential duplicate scheduler
runs and true concurrent worker claims with a real database (§40).

## 22. Scheduler architecture, windows, and historical-safety grace

`runAutomationScheduler(now)` (`src/lib/automation/scheduler.ts`) only
**discovers** eligible records and idempotently **inserts** missing
`AutomationJob` rows - it never claims or executes anything (that is the
worker's job, §23). `SCHEDULER_LOOKAHEAD_DAYS = 45` bounds how far into the
future a job can ever be materialized (never years). `PAST_GRACE_DAYS = 14`
bounds how far into the past a *newly created* job can fire - an
organization that just enabled a reminder does not suddenly blast reminders
for months-old due dates it never saw before (already-created jobs are
unaffected; this only governs new inserts). `withinSchedulingWindow()` and
`PAST_GRACE_DAYS` are pure, unit-tested functions
(`src/lib/automation/scheduler.test.ts`).

## 23. Timezone decision

No `Organization.timezone` and no pinned timezone existed anywhere in this
codebase before this phase (§2). Resolved by adding `Organization.timezone`
(`String @default("Asia/Riyadh")`, validated at point-of-use via
`isValidIanaTimeZone()`, never a DB `CHECK` constraint) - justified because
every organization in this codebase is already Saudi-scoped
(`Organization.country` defaults `"SA"`, currency is fixed SAR, ZATCA is
Saudi-only). `src/lib/automation/timezone.ts` implements a from-scratch,
two-pass `Intl`-based UTC-offset resolver (no new npm dependency) for
`zonedStartOfDay()`/`zonedStartOfDayOffset()`/`zonedDateKey()`, unit-tested
against both a fixed-offset zone (Riyadh, +03:00, no DST) and a
DST-observing zone (`America/New_York`) including its exact 2026-03-08
spring-forward transition, proving the algorithm is genuinely DST-correct
even though Riyadh itself never needs that. This is scoped to the new
automation module only - the rest of the codebase's server-local-time
assumption is a pre-existing, already-documented item
(docs/TECHNICAL-DEBT.md) and is deliberately not retrofitted here.

## 24. Worker architecture: atomic claim, retry/backoff, stuck recovery

`runAutomationWorker(batchSize)` (`src/lib/automation/worker.ts`): recovers
stuck `RUNNING` jobs (`STUCK_RUNNING_THRESHOLD_MS = 10 minutes` - more
generous than the Communications delivery worker's 5 minutes, since a job
handler runs real domain-logic DB reads/writes, not just one provider
call), claims due `PENDING` jobs via the atomic idiom (§7), and executes
each through the handler registry (§25). Reuses the existing, generic
`computeNextAttemptAt()` exponential-backoff helper from
`src/lib/communications/retry.ts` for `RETRYABLE_FAILURE` rescheduling -
never a duplicated backoff formula. Bounded batch size
(`DEFAULT_BATCH_SIZE = 20`, `MAX_BATCH_SIZE = 100`) keeps one invocation
suitable for a serverless route's execution-time budget - never an endless
loop. Proven with a real database: concurrent duplicate invocations produce
exactly one attempt per job; a job stuck `RUNNING` past the threshold is
recovered, reclaimed, and completes exactly once; a job still legitimately
within the threshold is never recovered out from under itself
(`automation-scheduler-worker.db.test.ts`).

## 25. Handler registry and payload contract

`AUTOMATION_HANDLERS` (`src/lib/automation/handlers/index.ts`) is a plain,
statically-imported object literal mapping `jobType -> handler` - never a
dynamic `eval`/`require`/DB-stored module path. A job type with no registry
entry (a future rollback, or a type added to the enum before its handler
ships) is looked up as `undefined` and fails safely and permanently.
`COMMUNICATION_RECONCILIATION` deliberately has no entry - it runs directly
via its own route (§19), never through this per-record contract. Every
handler receives a structured `AutomationHandlerContext`
(`organizationId, jobId, jobKey, scheduledFor, payloadVersion, payloadJson`)
and returns one of four outcomes: `COMPLETED | SKIPPED{reason} |
RETRYABLE_FAILURE{errorCode,errorMessage} | PERMANENT_FAILURE{errorCode,errorMessage}`.
An uncaught handler exception is always treated as `RETRYABLE_FAILURE`
(never assumed permanent unless the handler itself says so). `SKIPPED` is a
normal terminal `COMPLETED` job status, never a failure - the reason lives
only on the append-only `AutomationJobAttempt` row.

**Handler idempotency, explicitly documented per type**: every reminder
handler re-fetches its target record fresh, verifies it still exists and is
not already resolved, and compares the record's CURRENT mutable date/time
field against the value snapshotted in the job's own payload - a mismatch
(paid off, renewed, rescheduled) means SKIP, never a stale notification. A
second execution of an already-`COMPLETED` job never happens (the worker
only claims `PENDING` jobs); a re-delivered `RETRYABLE_FAILURE` retry is
naturally idempotent because the handler's own outbox-emission uses the
exact same `eventKey` every attempt.

## 26. Rent-due reminders

Authoritative source: `PaymentSchedule` (`src/lib/automation/handlers/rent-due-reminder.ts`),
matching the existing receivable architecture - never a second "is this
paid" calculation, and never double-counting against `Invoice`. Default V1
offsets (`src/lib/automation/reminder-offsets.ts`, easy-to-change, not
claimed as approved business policy): `[-7, -3, 0, 3]` days relative to
`dueDate`. Eligibility rechecked at execution time: schedule must still
exist, not be `PAID`/`CANCELLED`, its `dueDate` must be unchanged from the
job's own snapshot, and its parent `Contract` must still be `ACTIVE`.

## 27. Contract-expiry reminders

Authoritative source: `Contract.endDate`. Default V1 offsets: `[90, 60, 30, 7]`
days before `endDate`. Never auto-renews, auto-terminates, or auto-expires a
Contract - purely a reminder. Eligibility rechecked at execution time
(`endDate` unchanged, status still `ACTIVE`, not already renewed into
another contract). See §31 for the deliberate decision not to mutate
`ContractStatus` to `EXPIRED`.

## 28. Move-In / Move-Out reminders

Authoritative source: `MoveIn.scheduledAt` / `MoveOut.scheduledAt`. Default
V1 offset: 1 day before the scheduled instant. No lifecycle mutation of any
kind. Eligibility rechecked at execution time: status still `SCHEDULED`, and
`scheduledAt` unchanged from the job's own snapshot (a reschedule
invalidates the stale job, which SKIPs; the reschedule action itself already
durably emitted its own `MOVE_IN_SCHEDULED`/`MOVE_OUT_SCHEDULED` outbox
event for the new instant - see §17).

## 29. Maintenance SLA automation (V1 scope decision)

No `MAINTENANCE_SLA_BREACHED` `CommunicationEventType` exists yet (adding
one requires another enum/migration/template/rule cycle). Rather than defer
the entire feature, `maintenanceSlaCheckHandler`
(`src/lib/automation/handlers/maintenance-sla-check.ts`) is **detection-only**
in V1: it reuses the exact existing SLA formulas
(`computeResponseSlaStatus()`/`computeResolutionSlaStatus()`/
`computeOverallSlaStatus()`, `src/lib/operations/maintenance-rules.ts`) and
exercises the full `AutomationJob` mechanics (idempotent one-job-per-request-
per-day dedupe via `maintenanceSlaCheckKey(requestId, dateKey)`,
stale-completion skip) without emitting any notification - a documented
foundation for a future staff-facing alert, not an oversight. Never
auto-completes a Work Order.

## 30. Overdue-status-sync decision

The pre-existing lazy `syncOverdueStatuses()` (recomputed on read, not by a
background job) is left entirely unchanged in this phase. No dedicated
`AutomationJob` type was introduced to run it proactively. Rationale: it is
outside the two problems this phase set out to solve (§1), it works
correctly today for every existing read path, and introducing a background
job for it would be exactly the kind of unscoped addition the brief's own
no-feature-creep list warns against. Carried forward as a known, pre-existing
item (docs/TECHNICAL-DEBT.md).

## 31. Past-end-date Contract decision

`ContractStatus` has no `EXPIRED` value ever set by any existing code path
(confirmed in the Step-1 audit, §2) - a Contract past its `endDate` simply
stays `ACTIVE` until a human renews or terminates it. This phase does
**not** change that: the contract-expiry-reminder handler only ever reads
`Contract.status`, never writes to it. Introducing automatic `EXPIRED`
status mutation would be a lifecycle change well beyond "send a reminder,"
and risks silently breaking any existing code that assumes `ACTIVE` means
"has an end date in the past is still fine." Left conservatively deferred,
per the brief's own explicit instruction to prefer correctness over feature
completeness here.

## 32. Automation settings & communication wiring

`getAutomationSettings()`/`updateAutomationSettings()`
(`src/lib/actions/automation.ts`) are the only way an organization's
tenant-facing reminders turn on - gated by `automation.settings.view`/
`automation.settings.update` (§35), every change audited via `auditUpdate()`
(diffs before/after, writes nothing on a no-op). The 4 new reminder event
types (`RENT_DUE_REMINDER`, `CONTRACT_EXPIRY_REMINDER`, `MOVE_IN_REMINDER`,
`MOVE_OUT_REMINDER`) are registered in `COMMUNICATION_EVENT_REGISTRY`
(`src/lib/communications/events.ts`) as `wired: true` - being "wired" only
means a Rule *can* fire once an organization's `AutomationSettings` flag is
separately turned on; it never itself enables sending. No seeded default
Rule/Template exists for these 4 events (deliberately - unlike Prompt 19's 9
events, which shipped with defaults, these stay fully opt-in end to end: an
organization must both enable the setting AND configure/activate a
Rule+Template via the existing Communication Center before anything sends).

## 33. Admin UI

- `/automation` - dashboard: Pending/Running/Failed/Completed-Today jobs,
  Outbox Pending/Failed, Communication Queue depth, Last Scheduler Run.
- `/automation/settings` - the 5 reminder toggles; read-only for anyone
  without `automation.settings.update`, mutation restricted to OWNER/ADMIN.
- `/automation/jobs` - paginated, filterable (status, job type) job list
  with retry/cancel actions gated per-row by current status.
- `/automation/jobs/[id]` - job detail: full field set, sanitized
  `lastErrorMessage` (never a raw payload dump), and the complete append-only
  attempt history.
- `/automation/outbox` - paginated, filterable (status) outbox event list
  with a retry action for `FAILED` rows only (never a cancel - §37).

All five pages are wired into the sidebar as their own navigation group
(`src/app/(app)/layout.tsx`), gated per-item by RBAC permission, and fully
localized (English/Arabic) via `t.automation.*`
(`src/lib/i18n/dictionary.ts`), reusing the mandated Arabic glossary terms
verbatim (§36).

## 34. RBAC permissions

`automation.view`, `automation.settings.view`, `automation.settings.update`,
`automation.job.view`, `automation.job.retry`, `automation.job.cancel`,
`automation.outbox.view`, `automation.outbox.retry`
(`src/lib/permissions.ts`). OWNER/ADMIN hold all 8. MANAGER holds 7 (every
one except `automation.settings.update` - organization-level configuration
stays OWNER/ADMIN-only, the same tier as every other `*.settings.update` in
this codebase). ACCOUNTANT holds 4, view-only
(`automation.view`/`automation.settings.view`/`automation.job.view`/
`automation.outbox.view`) - no retry/cancel, no settings mutation. VIEWER
holds 3 (`automation.view`/`automation.job.view`/`automation.outbox.view`) -
deliberately excluding `automation.settings.view`, since VIEWER has no
visibility into organization Settings anywhere else in this codebase either.
Every mutating action re-verifies its own permission server-side
(`requirePermission()`) - the UI's own conditional rendering is a
convenience, never the enforcement boundary. Proven with a real database
(`automation-settings-and-outbox-processor.db.test.ts`).

## 35. Audit

`AuditLog` entries are written only for: an `AutomationSettings` change
(`UPDATE`, diffed), a manual job retry (`UPDATE`, `manualRetry: true`), a
job cancel (`CANCEL`), and a manual outbox retry (`UPDATE`, `manualRetry: true`) -
never for a routine scheduler tick, a routine worker claim, or a routine
outbox-processor pass (§10's noise-avoidance rule; execution history in
`AutomationJobAttempt`/`AutomationSchedulerRun` is the operational record
for those).

## 36. Multi-tenancy & cross-org security

Every `AutomationJob`/`CommunicationOutboxEvent` row carries a required
`organizationId`; every list/read/retry/cancel action filters by the
caller's own `organizationId` (from `requirePermission()`'s session, never
client input). Proven with a real database
(`automation-cross-org-security.db.test.ts`): Org A can never list, read,
retry, or cancel Org B's rows.

**Cross-org payload injection**: no handler ever trusts a payload's own
relation id as already belonging to the job's organization. Every handler's
own DB lookup filters by `(id, organizationId: ctx.organizationId)` -
proven directly: a job scoped to Org A whose payload is forged to reference
Org B's `PaymentSchedule` id resolves as "not found" (SKIPPED) from Org A's
perspective, never leaking or acting on Org B's data.

## 37. Financial isolation & absolute prohibitions

No automation code in this phase ever creates an `Invoice`, `Payment`,
`OwnerLedgerEntry`, `SecurityDepositLedgerEntry`, or
`SecurityDepositRefund` directly - every financial side effect, when one
exists at all, happens only inside an already-authoritative business action
this phase merely re-triggers a notification for. Absolute prohibitions,
none of which this phase implements: no auto-payment/mark-paid/reverse-
payment, no auto-renewal, no auto-Move-In/Move-Out completion, no
auto-settlement-approval/post/refund. Cancellation is restricted to
semantically-safe `PENDING` `AutomationJob` rows only - a durable
`CommunicationOutboxEvent` (representing something that already happened)
can be retried but never cancelled.

## 38. Provider-failure isolation

The outbox processor never calls a provider; a processing failure there
(malformed payload, DB error) leaves the underlying Invoice/Payment/etc. row
completely untouched (proven with a real database) and retries
independently, bounded by `maxAttempts`. Downstream, an actual provider
failure stays entirely inside the pre-existing, unchanged Communications
delivery worker/`CommunicationMessage` retry loop - it was never in scope
for this phase to change that behavior, and it doesn't.

## 39. Protected worker routes & production operation

Four routes, each POST-only and gated by `AUTOMATION_WORKER_SECRET`
(`src/lib/automation/route-auth.ts`, timing-safe compare, deliberately a
**separate** secret from `COMMUNICATIONS_WORKER_SECRET` so each stage's
exposure is independently rotatable):

| Route | Function | Suggested cadence |
|---|---|---|
| `POST /api/automation/scheduler` | `runAutomationScheduler()` - discover only | every 15-60 min |
| `POST /api/automation/worker` | `runAutomationWorker()` - claim + execute | every 5-15 min |
| `POST /api/automation/outbox` | `processCommunicationOutbox()` | every 1-5 min |
| `POST /api/automation/reconciliation` | `runCommunicationReconciliation()` | daily or hourly |

The pre-existing `POST /api/communications/process` (delivery worker) is
unchanged and still runs on its own 1-5 minute cadence. None of these imply
sub-minute real-time delivery; that was never the goal. Rotate
`AUTOMATION_WORKER_SECRET` by generating a new random value, updating the
external cron caller's configuration, and redeploying - the old value stops
working the instant the new one is deployed (no overlap window is needed
since the cron caller is the only holder of the secret). A stuck backlog is
diagnosed via `/automation`'s dashboard counts and `oldestPending*` figures;
a suspected duplicate is investigated by tracing one `eventKey`/`jobKey`
across `CommunicationOutboxEvent`/`AutomationJob` and its
`AutomationJobAttempt` history. Pausing one organization's reminders is a
single `updateAutomationSettings()` call (or a direct, audited DB update in
an emergency) - it never requires touching the worker/scheduler routes
themselves.

## 40. Testing & no-feature-creep summary

**Pure unit tests** (`src/lib/automation/**/*.test.ts`, `vitest`, no DB): job-key
and outbox-key generation/idempotency, reminder-offset sanity, scheduler
window boundaries (`withinSchedulingWindow`, `PAST_GRACE_DAYS`), outbox
payload-version validation, reconciliation's historical-safety `windowStart()`,
stuck-threshold comparison against the Communications module's own
threshold, timezone/DST correctness (§23), and every reminder handler's
payload type guard.

**Real-DB tests** (`src/lib/actions/__dbtests__/automation-*.db.test.ts`):
business-commit durability for all 7 directly-testable migrated events plus
a forced-rollback proof (§16); scheduler duplicate-run idempotency and
`AutomationSchedulerRun` recording; execution-time eligibility recheck/skip
for rent-due (pay-off) and Move-In (reschedule) reminders, and
Maintenance-SLA's detection-only no-notification behavior; concurrent
duplicate worker claims (exactly one attempt); stuck-RUNNING recovery
(recovered, reclaimed, completes exactly once) and its inverse (a
still-legitimately-running job is never recovered); full org-isolation IDOR
coverage for jobs and outbox rows, plus a direct cross-org payload-injection
proof; reconciliation creating exactly one missing event and zero
duplicates on a second run, plus historical-safety; `AutomationSettings`
RBAC across every role; outbox-processor duplicate-processing idempotency,
unsupported-payload-version permanent failure, and processing-failure
business-row isolation.

**No-feature-creep** (explicitly NOT built): no generic workflow
builder/scripting surface, no arbitrary cron-expression UI, no Zapier/Make/
n8n-style integration, no AI-generated messages, no marketing/campaign/lead-
nurturing automation, no two-way WhatsApp/inbound email/SMS/push, no
payment-gateway or automatic-payment integration, no automatic Contract
renewal/Move-In completion/Move-Out completion/Settlement approval/owner
payout, no generic approval-workflow engine, no Document-expiry workflow, no
OCR, no e-signature, no Corporate/Vendor Portal work, no accounting-close/
GL/budgeting/forecasting jobs, no real S3 implementation, no external
monitoring-vendor integration.

**Carried-forward technical debt** (see docs/TECHNICAL-DEBT.md for the
full, cross-module list): the rest of the codebase's server-local-time
assumption is not retrofitted to `Organization.timezone` (§23); the
pre-existing lazy `syncOverdueStatuses()` and the pre-existing
`ContractStatus.EXPIRED`-never-set gap are both left as-is by deliberate
decision (§30/§31); V1 reminder offsets are a documented default, not
approved business policy (§26/§27); Maintenance SLA automation is
detection-only pending a future `MAINTENANCE_SLA_BREACHED` event type
(§29).
