# Notifications & Communications

## 1. Overview & scope

A centralized, provider-agnostic outbound-communications foundation for the
whole SaaS: business modules never call an email/WhatsApp provider directly,
never format their own message content, and never decide delivery status
themselves. Every notification flows through one pipeline:

```
Business Event → Communication Rule → Recipient Resolution → Template →
Render → Communication Message → Delivery Attempt → Provider Adapter →
Provider Result → Delivery Status / Retry / Audit
```

This phase (Prompt 19) delivers the full architecture end to end - schema,
pure-logic rules, RBAC, provider abstraction (mock only), enqueue/processor
services, a protected worker route, an admin UI (Communication Center), 9
wired business events, default EN/AR templates for those 9 events, and a
real-DB test suite - while explicitly deferring scheduling (rent-due/
contract-expiry reminders), any real provider credential, and every
marketing/campaign/chat/inbox feature (§40).

## 2. Architecture audit (Step 1 findings)

Confirmed before any code was written: zero pre-existing notification code,
zero provider SDKs, zero job/queue library, zero cron/scheduler anywhere in
this codebase - this is the first outbound-communications code in the app.
The only "background-like" precedent is a lazy on-read recompute
(`syncOverdueStatuses()`), not a model for this module. The established
`prisma.$transaction(...)` → `revalidatePath(...)` post-commit pattern
already used by every mutating server action is exactly where
`enqueueCommunicationEvent()` calls were inserted - deliberately outside the
business transaction, never inside it, and wrapped so it can never throw
upward. `normalizeSaudiMobile()` (`src/lib/crm/phone.ts`) exists but is
scoped to CRM duplicate-matching (digits-only, no `+`) and is not directly
reusable for provider-facing E.164 formatting - `toE164()` (§30) reuses its
detection logic instead of duplicating it. No per-recipient or
per-organization stored language preference exists anywhere in the schema
(§21). No scheduler exists, so contract-expiry/rent-due reminders are
explicitly out of scope (§40, deferred to a future "Prompt 22"). No real
provider credentials exist in this environment, so only a webhook *shape*
could be documented, never a working implementation (§40).

## 3. Critical Principle 1 - Provider-agnostic

Business code and the schema itself only ever reference `channel = EMAIL |
WHATSAPP` (`CommunicationChannel`) - never a vendor name. The one place a
vendor name appears at all is `CommunicationDeliveryAttempt.providerName`,
a plain string tag (`"mock-email"`, `"mock-whatsapp"`, and in the future
`"resend"`/`"whatchimp"`/etc.), purely for audit/debugging. Swapping or
adding a real provider means implementing `CommunicationProvider`
(`src/lib/communications/providers/types.ts`) and returning it from
`getProviderForChannel()` (`src/lib/communications/providers/factory.ts`) -
no other file changes.

## 4. Critical Principle 2 - Communication ≠ Audit

`CommunicationMessage`/`CommunicationDeliveryAttempt` are their own models,
never folded into `AuditLog`. `AuditLog` stays a pure compliance record of
business-state changes; `CommunicationDeliveryAttempt` is delivery
mechanics (which provider, which error, when) - a completely different
concern with a completely different volume profile (many attempts per
message is normal and expected, and would be noise in the audit trail).
The only place the two modules meet is the admin server actions layer
(`src/lib/actions/communications.ts`), which does call `auditCreate()`/
`auditAction()` for **configuration** changes (creating/activating a
template, creating/toggling a rule, manual retry/cancel) - the same
audit-everything-mutating convention every other module in this codebase
already follows. It never audits an individual `CommunicationDeliveryAttempt`.

## 5. Critical Principle 3 - Queue-first (the post-commit hook pattern)

Every one of the 9 wired call sites (§35) calls `enqueueCommunicationEvent()`
strictly **after** its own `prisma.$transaction(...)` has resolved, in the
same gap where `revalidatePath()` calls already ran before this module
existed - e.g. `src/lib/actions/invoices.ts`'s `issueInvoiceForSchedule()`
between its transaction's closing `});` and its `revalidatePath()` calls.
`enqueueCommunicationEvent()` itself only ever writes a `CommunicationMessage`
row with `status: "QUEUED"` - it never calls a provider, never awaits a
network request, and is wrapped in a try/catch that swallows every error
(logging only) so a notification failure can never affect a business
transaction that already committed. The actual send happens later, out of
band, in `processQueuedCommunications()` (§25), called only from the
protected worker route (§34).

## 6. Critical Principle 4 - Delivery status is authoritative

A message is never marked `SENT` merely because it was queued. The full
status vocabulary (`QUEUED → PROCESSING → SENT → DELIVERED → READ`, with
`FAILED`/`CANCELLED` as the other terminal-adjacent states) is enforced by
`isValidStatusTransition()`/`assertValidStatusTransition()`
(`src/lib/communications/status.ts`), and every status-changing write in
the processor/actions layer goes through it. `SENT` means the provider
adapter itself returned success; `DELIVERED`/`READ` are reserved for a
future webhook-reported update and are never fabricated (§40).

## 7. Critical Principle 5 - Idempotency

`CommunicationMessage.idempotencyKey` (unique per `organizationId`) is
built purely from business identifiers - `eventType`, `businessEntityType`,
`businessEntityId`, `channel`, `recipientType`, `recipientId`
(`buildIdempotencyKey()`, `src/lib/communications/idempotency.ts`) - never a
timestamp or random value. The same business event, resolved to the same
channel and recipient, always produces the same key, so a retried enqueue
attempt collides on the DB-level unique constraint instead of creating a
duplicate message; `enqueueCommunicationEvent()` catches that specific
Prisma `P2002` error and treats it as a safe no-op (§24). Proven directly
by `communications-lifecycle.db.test.ts` (calling the same enqueue three
times) and `communications-integrity.db.test.ts` (the same scenario against
a real `Payment` row).

## 8. Critical Principle 6 - No real provider required

`MockEmailProvider`/`MockWhatsAppProvider` (`src/lib/communications/providers/mock.ts`)
are fully deterministic: a destination containing the substring
`mockpermfail` always returns a permanent failure (`INVALID_RECIPIENT`), one
containing `mockretryfail` always returns a retryable failure
(`PROVIDER_TIMEOUT`), and anything else succeeds. `getProviderForChannel()`
always resolves to these mocks today - no `RESEND_API_KEY`/WhatsApp
credential env var exists or is read anywhere in this codebase. The entire
architecture (queueing, claiming, retry, failure classification, status
transitions, the Communication Center UI) is exercised end to end against
these mocks, both in the real-DB test suite (§39) and in live browser
verification, with zero dependency on any real vendor account.

## 9. Core architecture pipeline (reference)

| Stage | File |
|---|---|
| Business Event | the 9 call sites, §35 |
| Communication Rule | `CommunicationRule` model, §12 |
| Recipient Resolution | `src/lib/communications/recipients.ts`, §20 |
| Template | `CommunicationTemplate` model, §11 |
| Render | `src/lib/communications/render.ts`, §19 |
| Communication Message | `CommunicationMessage` model, §13 |
| Delivery Attempt | `CommunicationDeliveryAttempt` model, §14 |
| Provider Adapter | `src/lib/communications/providers/*`, §29 |
| Delivery Status / Retry / Audit | `src/lib/communications/status.ts` + `retry.ts`, §27-28 |

## 10. Schema: enums

`CommunicationChannel` (`EMAIL`, `WHATSAPP`), `CommunicationEventType` (16
values, §18), `CommunicationRecipientStrategy` (6 values, §20),
`CommunicationRecipientType` (5 values, the resolved concrete party type),
`CommunicationTemplateStatus` (`DRAFT`/`ACTIVE`/`ARCHIVED`),
`CommunicationMessageStatus` (7 values, §28), and
`CommunicationDeliveryAttemptStatus` (`SENT`/`FAILED` only - retryable-vs-
permanent classification is a pure function, not a DB enum, §27). All
defined in `prisma/schema.prisma`.

## 11. Schema: `CommunicationTemplate`

One row per specific, versioned rendering of an event+channel+language.
`variables: String[]` is the exhaustive allow-list this version's
`subject`/`bodyText`/`bodyHtml` may reference (frozen from the event
registry at creation time, §18). Versioned via the existing `Counter`
infrastructure keyed
`` `communicationTemplate:${eventType}:${channel}:${language}` `` - never a
racy "read max version, add one" pattern. `@@unique([organizationId,
eventType, channel, language, version])` plus a hand-written partial unique
index (§17) enforcing at most one `ACTIVE` version per key.

## 12. Schema: `CommunicationRule`

Whether/how one `(eventType, channel)` fires, and via which
`CommunicationRecipientStrategy`. Multiple rules may exist for the same
`(eventType, channel)` with different strategies (e.g. notify both the
Renter and Assigned Staff); `@@unique([organizationId, eventType, channel,
recipientStrategy])` prevents a literal duplicate. `isEnabled: false` means
the rule never enqueues even if the event fires - nothing sends without an
explicit, visible Rule row.

## 13. Schema: `CommunicationMessage`

The durable outbox row itself (§16). Typed relations
(`renterId`/`ownerId`/`corporateContactId`/`corporateOccupantId`/
`internalUserId`, exactly one set per `recipientType`) rather than a
polymorphic id, mirroring `MoveOutLiabilityAssessment`'s own typed-source-
relations precedent. `destinationRaw` is a snapshot at enqueue time (never
re-read live from the recipient record at send time); `destinationMasked`
is the precomputed, privacy-safe display form (§22). `renderedSubject`/
`renderedBody` are frozen at enqueue time, independent of any later
template edit. `idempotencyKey` (§7), `attemptCount`/`maxAttempts`/
`nextAttemptAt` (§27), and `claimedAt`/`claimedBy` (§25-26) drive the
processor.

## 14. Schema: `CommunicationDeliveryAttempt`

Append-only send-attempt history - never updated or deleted once created,
same convention as `AuditLog`. One row per actual provider call attempt,
holding the provider's own tag, its (possibly null) external message id,
and a sanitized normalized error code/message. `communications-retry-
failure.db.test.ts` explicitly proves the append-only property (every
prior attempt's own record survives unchanged as later ones are appended).

## 15. Schema: `CommunicationPreference`

Per-`(recipientType, recipientId, channel)` opt-out flag, deliberately
keyed by a plain id pair rather than typed relations (unlike
`CommunicationMessage`) - this table is a low-stakes boolean toggle where a
stale row surviving a deleted Renter/Contact is harmless, and a typed-FK
composite unique constraint would be unenforceable anyway (Postgres treats
NULLs in the other nullable FK columns as distinct, so duplicate rows could
slip past a unique index built that way). Built for the `OPTIONAL`
classification path (§18); all 9 seeded V1 events are `TRANSACTIONAL` and
never consult this table, so it is real but currently inert.

## 16. Outbox Consistency Audit (Step 54) - the "no separate outbox model" decision

**Decision: no `CommunicationOutboxEvent` model was added.** Reasoning: no
message broker exists in this stack, so `CommunicationMessage` itself
already serves as the durable outbox. The only residual gap is the narrow
window between a business transaction committing and the (never-throwing)
`enqueueCommunicationEvent()` call actually running - a crash in that exact
window means the notification is silently never created. This is
explicitly **not** claimed as exactly-once delivery: it is at-least-once
*processing* once a message exists (the processor can retry, and a stuck-
PROCESSING row is recovered, §26) plus idempotent *message creation*
(§7) plus best-effort provider-side dedup (out of this phase's scope). A
missed enqueue fails safe - as "notification never created," not as a
duplicate - which is consistent with `revalidatePath()` itself already
being an unguarded best-effort post-commit call elsewhere in this codebase.
No stronger guarantee is claimed anywhere in code or in this document.

## 17. Template versioning & the partial-unique-index migration

Prisma's schema DSL cannot express a partial/filtered unique index, so "at
most one ACTIVE version per `(organizationId, eventType, channel,
language)`" is enforced by hand-written raw SQL added to the migration
(`prisma/migrations/20261210090000_notifications_communications/migration.sql`):

```sql
CREATE UNIQUE INDEX "communication_templates_one_active_per_key"
ON "communication_templates" ("organizationId", "eventType", "channel", "language")
WHERE "status" = 'ACTIVE';
```

`activateCommunicationTemplate()` (`src/lib/actions/communications.ts`)
archives the previously-`ACTIVE` version for the same key in the same
transaction as the new activation, so this index is a genuine backstop
against two concurrent activations, not the only thing preventing it.

## 18. Event registry & vocabulary

`src/lib/communications/events.ts` defines a static
`COMMUNICATION_EVENT_REGISTRY` covering all 16 `CommunicationEventType`
values, each with a `classification` (`TRANSACTIONAL`/`OPTIONAL`), a
`wired: boolean`, a `defaultRecipientStrategy`, and its exhaustive allow-
listed `variables`. Adding an entry here only extends the vocabulary - it
never auto-enables sending (Critical Principle 6). Only the 9 events with
`wired: true` have an actual call-site integration and a seeded default
Rule (§35); the other 7 (`CONTRACT_CREATED`, `CONTRACT_RENEWED`,
`CONTRACT_TERMINATED`, `RESERVATION_CONFIRMED`,
`TENANT_PORTAL_ACCOUNT_INVITED`, `OWNER_PORTAL_ACCOUNT_INVITED`,
`CORPORATE_ALLOCATION_ACTIVATED`) exist for a genuinely centralized
vocabulary but produce nothing - `enqueueCommunicationEventInner()` returns
immediately for any non-wired event, proven by
`communications-lifecycle.db.test.ts`'s attempt to use `CONTRACT_CREATED`.

## 19. Template variable allow-listing, validation, escaping, rendering

`src/lib/communications/render.ts`: `extractTemplateVariables()` finds
every `{{name}}` placeholder; `assertTemplateVariablesAllowed()` throws if
any placeholder isn't in the event's allow-list (checked both at template
save time in `createCommunicationTemplateVersion()` and again, defensively,
at render time); `renderTemplate()` substitutes values, HTML-escaping only
`bodyHtml` substitutions (a genuine HTML document) while `bodyText`/
`subject` are substituted verbatim as plain text. Rendering throws if a
required variable's value is missing - there is no silent blank
substitution.

## 20. Recipient strategies & resolution architecture

Six `CommunicationRecipientStrategy` values are fully implemented in
`src/lib/communications/recipients.ts` (`buildRenterRecipient`,
`buildOwnerRecipient`, `buildCorporatePrimaryContactRecipient`,
`buildCorporateHousingContactRecipient`, `buildAssignedStaffRecipient`,
`buildSpecificInternalUserRecipient`) and unit-tested
(`recipients.test.ts`), even though only `RENTER` is used by the 9 seeded
default Rules. Deliberately, resolution happens at the **call site**: the
business action already has the relevant Renter/Owner/CorporateContact/
CorporateOccupant/User row loaded from its own query, so it builds a
`CandidateRecipient[]` array directly rather than `enqueueCommunicationEvent()`
re-resolving generically from a bare `(businessEntityType, businessEntityId)`
pair - the caller is the only place that genuinely knows, per event
occurrence, who the assigned staff or the specific internal user even is.
`findCandidateForStrategy()` then matches each enabled Rule's strategy
against the supplied candidates; a Rule with no matching candidate simply
produces nothing for that occurrence (proven by
`communications-lifecycle.db.test.ts`).

## 21. Language resolution

No per-recipient, per-organization, or per-portal-account stored language
preference exists anywhere in this schema - locale is a request-scoped
cookie only (`src/lib/i18n/get-locale.ts`). All 9 wired events fire from
inside an authenticated internal server action, which has a current locale
available; `enqueueCommunicationEvent()` callers capture
`resolveNotificationLanguage(await getLocale())`
(`src/lib/communications/language.ts`) at enqueue time and use it as the
message's language. This is a proxy - the acting staff member's own UI
language - not a true recipient preference, documented as such rather than
silently assumed. English is the fallback for any future non-request-
context trigger (e.g. a scheduled job in a later prompt) where no locale
cookie exists at all.

## 22. Destination masking & privacy

`src/lib/communications/masking.ts`: `maskEmail()` keeps the first local-
part character and the domain (`j***@example.com`); `maskPhone()` keeps a
`+`-country-code (or 3-char) prefix and the last 3 digits, masking the
middle. `getCommunicationMessageById()` (`src/lib/actions/communications.ts`)
uses an explicit Prisma `select` that omits `destinationRaw` entirely -
rather than fetching and stripping it - so the raw destination can never
leave that function and reach the UI layer even by accident. Proven by
`communications-cross-org-security.db.test.ts`.

## 23. Idempotency key design

See §7 for the guarantee; concretely, `buildIdempotencyKey()`
(`src/lib/communications/idempotency.ts`) joins `eventType`,
`businessEntityType`, `businessEntityId`, `channel`, `recipientType`,
`recipientId` with `:`. This means one business event can fan out to
multiple channels and multiple recipients (each gets its own key, §35's
multi-channel test) while a retry of the exact same
`(event, business record, channel, recipient)` combination is always
recognized as the same message.

## 24. Enqueue service (`enqueueCommunicationEvent`)

`src/lib/communications/enqueue.ts`. For each enabled `CommunicationRule`
matching the event: finds a matching recipient candidate (§20); resolves
`destinationRaw` (`candidate.email` for `EMAIL`, `toE164(candidate.phone)`
for `WHATSAPP`; if there's no email/phone on file, that particular
channel+recipient combination is skipped, not an error); looks up an
`ACTIVE` template for `(eventType, channel, language)` - if none exists yet,
this combination is skipped, not an error, since "a Rule enabled with no
template yet" is a legitimate transient admin state; renders it (§19);
builds the idempotency key (§23); and creates the `CommunicationMessage`
row, treating a unique-constraint violation as a no-op (§7). The exported
function itself never throws (§5).

## 25. Queue processor & concurrency-safe claiming

`src/lib/communications/processor.ts`'s `processQueuedCommunications(batchSize)`:
recovers stuck rows first (§26), then reads up to `batchSize` (default 20,
capped at 100) `QUEUED` messages whose `nextAttemptAt` is null or due, and
for each one attempts a **conditional** `updateMany({ where: { id,
organizationId, status: "QUEUED" }, data: { status: "PROCESSING", ... } })`.
Postgres evaluates that `WHERE` clause atomically against the row's current
state, so if two concurrent processor runs both read the same row as
`QUEUED` in their initial query, only one's subsequent claim can affect the
row (`count === 1`); the other's claim matches zero rows and it moves on.
No raw `SELECT ... FOR UPDATE SKIP LOCKED` is needed for this to be
correct. `communications-concurrency.db.test.ts` proves this directly with
two genuinely concurrent `processQueuedCommunications()` calls
(`Promise.all`) against one message: exactly one claim, exactly one
`CommunicationDeliveryAttempt` row, exactly one provider call.

## 26. Stuck-processing recovery

A row claimed (`status: "PROCESSING"`, `claimedAt` set) for longer than
`STUCK_PROCESSING_THRESHOLD_MS` (5 minutes, `src/lib/communications/retry.ts`)
means the worker that claimed it crashed or was killed before recording an
outcome - never that a legitimate provider call is still in flight (a mock
or real provider call is expected to resolve in well under 5 minutes).
`recoverStuckProcessingMessages()` runs at the start of every processor
invocation and moves such rows back to `QUEUED` (`claimedAt`/`claimedBy`
cleared) without incrementing `attemptCount` - no `CommunicationDeliveryAttempt`
was ever recorded for the crashed run, so recovering it isn't double-
counting. Proven by `communications-retry-failure.db.test.ts`.

## 27. Retry policy: classification, backoff, max attempts

`src/lib/communications/retry.ts`. `classifyProviderError(code)` maps a
normalized, provider-agnostic error code to `RETRYABLE` or `PERMANENT`
(`INVALID_RECIPIENT`/`TEMPLATE_REJECTED`/`RECIPIENT_OPTED_OUT`/
`PROVIDER_AUTH_FAILED`/`MESSAGE_TOO_LARGE` are permanent; anything else,
including a real vendor's transient errors once one exists, is retryable
by default). `computeBackoffDelayMs(attemptNumber)` doubles from 1 minute,
capped at 1 hour. A permanent classification, or `attemptCount >=
maxAttempts` (default 5), moves the message straight to `FAILED`;
otherwise it returns to `QUEUED` with `nextAttemptAt` set. Manual retry
(`communications.retry`, `retryCommunicationMessage()`) moves `FAILED` back
to `QUEUED` **without** resetting `attemptCount` - the existing max-
attempts check applies unchanged to the next attempt. All of this is
proven end to end by `communications-retry-failure.db.test.ts` (retryable
requeue, max-attempts exhaustion, immediate permanent failure, provider-
failure isolation between two messages in one batch, manual retry, manual
cancel, and the not-FAILED/not-QUEUED rejection cases).

## 28. Status state machine

`src/lib/communications/status.ts`'s `VALID_TRANSITIONS`: `QUEUED →
PROCESSING | CANCELLED`; `PROCESSING → SENT | FAILED | QUEUED` (the last
being stuck-recovery, §26); `SENT → DELIVERED`; `DELIVERED → READ`; `FAILED
→ QUEUED` (manual retry only); `READ`/`CANCELLED` are terminal. Notably,
`QUEUED → CANCELLED` is the only way to cancel - once `PROCESSING`, a
message can no longer be cancelled (the claim already committed the
processor to attempting a send), enforced by `cancelCommunicationMessage()`
using the same conditional-`updateMany`-on-`QUEUED` pattern as claiming.

## 29. Provider abstraction & mock providers

`src/lib/communications/providers/types.ts` defines `CommunicationProvider`/
`ProviderSendInput`/`ProviderSendResult` - the one seam a real adapter is
added behind. `mock.ts`'s `MockEmailProvider`/`MockWhatsAppProvider` are
deterministic (§8); `factory.ts`'s `getProviderForChannel()` is the single
selection point. No provider ever receives a business-module call directly
- only `processQueuedCommunications()` and the manual test-send action
(§31) call a provider, and both go through this factory.

## 30. E.164 phone formatting

`src/lib/communications/phone.ts`'s `toE164()` reuses
`normalizeSaudiMobile()`'s own Saudi-detection logic (`src/lib/crm/phone.ts`)
rather than building a second, conflicting normalization scheme, but
returns a `+`-prefixed E.164 string - `normalizeSaudiMobile()`'s own
digits-only output is intentionally scoped to CRM duplicate-matching, not
provider-facing dialing.

## 31. Manual test-send (restricted)

`sendCommunicationTestMessage()` (`src/lib/actions/communications.ts`,
gated by `communicationTest.send`, OWNER/ADMIN only) renders the current
`ACTIVE` template for a chosen event/channel/language against sample
`[variableName]` placeholder values, calls the provider directly
(bypassing the queue - this is explicitly a synchronous verification tool,
not a queued business notification), and persists the outcome as a
`CommunicationMessage` with `businessEntityType: "ManualTest"` so it is
visible and auditable in the Communication Center's message list like any
other message, never silently discarded.

## 32. RBAC

12 permissions (`communications.view`, `communications.message.view`,
`communications.retry`, `communications.cancel`,
`communicationTemplate.view/.create/.version/.activate`,
`communicationRule.view/.create/.update`, `communicationTest.send`) added
to `src/lib/permissions.ts`. OWNER/ADMIN hold all 12; MANAGER gets the
operational surface (dashboard, message list/detail, retry/cancel,
template/rule read-only) but no configuration mutation; ACCOUNTANT/VIEWER
get `communications.view`/`communications.message.view` only. Full role
rationale and the matrix live in `docs/PERMISSIONS.md`.

## 33. Server actions layer (admin CRUD)

`src/lib/actions/communications.ts`: `getCommunicationsDashboard()`
(status counts + recent messages), `listCommunicationMessages()`/
`getCommunicationMessageById()`/`retryCommunicationMessage()`/
`cancelCommunicationMessage()`, `listCommunicationTemplates()`/
`getCommunicationTemplateById()`/`createCommunicationTemplateVersion()`/
`activateCommunicationTemplate()`/`archiveCommunicationTemplate()`,
`listCommunicationRules()`/`createCommunicationRule()`/
`setCommunicationRuleEnabled()`, `listAssignableInternalUsers()`,
`listCommunicationEventDefinitions()`, and `sendCommunicationTestMessage()`
(§31). Every action is `organizationId`-scoped and permission-gated;
mutations are audited (§4).

## 34. Protected worker route

`POST /api/communications/process` (`src/app/api/communications/process/route.ts`)
is the only caller of `processQueuedCommunications()`. Gated by a dedicated
shared secret, `COMMUNICATIONS_WORKER_SECRET` (never `AUTH_SECRET` - a
worker run triggers real provider sends once a real provider exists, a
materially different blast radius than the demo-seed route it otherwise
mirrors), checked with the same `timingSafeEqual` idiom
`src/app/api/admin/seed/route.ts` already established. Accepts an optional
`?batchSize=` query param. No scheduler in this codebase calls this route
on its own (§40) - an external cron/scheduled-task caller is expected to
hit it periodically.

## 35. The 9 wired business events

| Event | Hook (post-commit) | Variables |
|---|---|---|
| `INVOICE_ISSUED` | `issueInvoiceForSchedule()`, `src/lib/actions/invoices.ts` | invoiceNumber, totalAmount, currency, dueDate, contractNumber, unitNumber, renterName |
| `PAYMENT_RECEIVED` | `recordPayment()`, `src/lib/actions/payments.ts` | receiptNumber, amount, currency, paymentDate, invoiceNumber, renterName |
| `MAINTENANCE_REQUEST_CREATED` | `createMaintenanceRequest()`, `src/lib/actions/maintenance.ts` | requestNumber, title, category, priority, unitNumber |
| `MAINTENANCE_SCHEDULED` | `scheduleWorkOrder()`, `src/lib/actions/maintenance.ts` | requestNumber, workOrderNumber, scheduledDate, unitNumber |
| `MAINTENANCE_COMPLETED` | `completeWorkOrder()`, `src/lib/actions/maintenance.ts` | requestNumber, workOrderNumber, completedDate, unitNumber |
| `MOVE_IN_SCHEDULED` | `scheduleMoveIn()`, `src/lib/actions/move-ins.ts` | moveInNumber, scheduledAt, unitNumber, contractNumber |
| `MOVE_OUT_SCHEDULED` | `scheduleMoveOut()`, `src/lib/actions/move-outs.ts` | moveOutNumber, scheduledAt, unitNumber, contractNumber |
| `SECURITY_DEPOSIT_SETTLEMENT_POSTED` | `postSecurityDepositSettlement()`, `src/lib/actions/security-deposits.ts` | settlementNumber, refundDue, additionalDue, currency, unitNumber |
| `SECURITY_DEPOSIT_REFUND_RECORDED` | `recordSecurityDepositRefund()`, `src/lib/actions/security-deposits.ts` | settlementNumber, refundAmount, currency, method, unitNumber |

Each hook is a plain post-commit call - never inside the business
transaction. `postSecurityDepositSettlement()`'s own idempotent early-
return path (already-`POSTED`) deliberately does **not** re-enqueue, since
no actual state transition happened on that call.

## 36. Default EN/AR seed templates

`src/lib/communications/seed-defaults.ts`'s
`seedCommunicationDefaultsForOrganization()` creates one `ACTIVE` EMAIL
template per event per language (18 templates total) plus one enabled
`RENTER`-strategy EMAIL Rule per event (9 rules), idempotently (safe to
call repeatedly - it skips any `(event, channel, language)`/`(event,
channel, strategy)` combination that already exists). Called from
`src/lib/seed-demo-data.ts` for the demo organization. WhatsApp templates
are deliberately **not** seeded - a real WhatsApp Business template
requires Meta approval before it can ever be used, outside this phase's
scope; the schema/rule/UI support for a `WHATSAPP` template is complete,
it simply has no pre-approved default content.

## 37. Communication Center UI

Pages under `src/app/(app)/communications/`: `/` (dashboard - status-count
cards + recent messages), `/messages` (filterable list) + `/messages/[id]`
(detail - message info, rendered content, full append-only delivery
history, retry/cancel actions), `/templates` (list) + `/templates/new` +
`/templates/[id]` (detail, version history, activate/archive, "new
version" shortcut), `/rules` (list, enable/disable) + `/rules/new`. Its own
labeled nav group (`t.communications.dashboardTitle`), gated per item by
the matching permission, mirroring the Corporate Housing nav group's own
precedent in `src/app/(app)/layout.tsx`. Full EN/AR dictionary support
(`t.communications.*`, plus `communicationChannel`/
`communicationMessageStatus`/`communicationTemplateStatus`/
`communicationRecipientStrategy` enum-label records).

## 38. Multi-tenancy & cross-org isolation

Every `CommunicationTemplate`/`CommunicationRule`/`CommunicationMessage`/
`CommunicationDeliveryAttempt`/`CommunicationPreference` row carries
`organizationId`, and every admin action's query is scoped by it (`where:
{ id, organizationId }` or `findMany({ where: { organizationId } })`) -
never a client-supplied id alone. The queue processor itself is
intentionally the one exception: it operates across all organizations
(a genuine system-level background worker, like `syncOverdueStatuses()`'s
own cross-request nature, but batch-driven rather than per-request), since
each row it touches already carries its own `organizationId` and the claim/
send logic never leaks one organization's data into another's message.
Proven directly by `communications-cross-org-security.db.test.ts`
(templates, rules, messages, and destination-masking all verified against
two real seeded organizations).

## 39. Real-DB test suite

Five files under `src/lib/actions/__dbtests__/`:
`communications-lifecycle.db.test.ts` (template versioning/activation,
allow-list rejection, rule creation/duplicate rejection/toggling, enqueue
rendering, idempotent duplicate enqueue, multi-channel fan-out, recipient-
strategy matching including a no-candidate case and an OWNER-strategy
case on a wired event), `communications-concurrency.db.test.ts` (the
mandatory two-concurrent-workers-exactly-one-send test, and a sequential
already-`SENT` re-claim rejection), `communications-retry-failure.db.test.ts`
(retryable requeue, max-attempts exhaustion, immediate permanent failure,
provider-failure isolation between messages in one batch, manual retry
and its not-`FAILED` rejection, manual cancel and its not-`QUEUED`
rejection plus proof the processor never touches a cancelled message,
and stuck-processing recovery), `communications-cross-org-security.db.test.ts`
(IDOR/cross-org on templates, rules, and messages, plus destination-
masking even for the owning organization), and
`communications-integrity.db.test.ts` (payment-idempotency against a real
`Payment` row, a business-transaction-rollback proof using the real
`recordPayment()` action, and a Tenant/Owner Portal privacy regression
proving every Communications action rejects with no internal session and
that no low-trust role is ever granted a mutation permission). All 31
tests pass; the full pre-existing 429-test real-DB suite (60 files, 442
tests total after this addition) remains green.

## 40. Explicitly not implemented (strict no-feature-creep boundary)

Per this module's own explicit scope: no marketing campaigns, no bulk
promotional WhatsApp, no CRM campaigns, no newsletters, no lead nurturing,
no AI chatbot or AI-generated message content, no SMS, no push
notifications, no Corporate Portal, no tenant/owner chat, no two-way
WhatsApp inbox or shared inbox, no WhatsApp chatbot, no email inbox, no
inbound email/WhatsApp processing, no rent-reminder or contract-expiry
scheduler (no scheduler exists at all - deferred to a future prompt), no
daily automation engine, no payment gateway, no Document Management, no
e-signature, no provider billing/subscription management, no Meta Business
onboarding UI, no WhatsApp template approval UI, no full webhook provider
implementation (no real provider credentials or spec exist in this
environment to implement one against), and no general background-job
platform beyond this module's own communication needs. None of these were
implemented, stubbed, or partially started.
