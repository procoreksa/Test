# CRM: Leads

This document describes the internal Leasing CRM foundation: Lead capture,
qualification, and the pipeline up to WON (converted to `Renter`) or LOST.
It is purely additive on top of the existing modules - no VAT, ZATCA,
invoice, payment-schedule, ownership-accounting, or audit-architecture
logic was touched. See `docs/PERMISSIONS.md` for the RBAC system this
builds on and `docs/AUDIT-AND-FINANCIAL-CONTROLS.md` for the audit
infrastructure this reuses without modification.

Scope of this task, per the brief: **Lead + Qualification + pipeline only.**
Viewings, Offers, Reservations, and automatic Contract creation are a
future task (see §16 below) and are explicitly not implemented here.

## 1. Lead model

`Lead` (`prisma/schema.prisma`) is a prospective tenant or corporate
housing enquiry - deliberately **not** an extension of `Renter`. Key
fields (grouped, not the full column list):

- Identity: `leadNumber` (sequential, `LEAD-000001`), `leadType`, `status`,
  `firstName`/`lastName`/`fullName` (individuals) or `companyName`
  (corporate - see §6).
- Contact: `mobile` (raw, user-entered) + `normalizedMobile` (canonical
  form used for duplicate detection - see §12), `alternateMobile`,
  `email`, `nationality`, `employer`, `jobTitle`.
- Requirements: `familySize`, `budgetMin`/`budgetMax`,
  `preferredBedrooms`, `preferredUnitType` (reuses the existing `UnitType`
  enum - see §17), `preferredCompoundId`, `moveInDate`,
  `leaseDurationMonths`, `furnishedPreference`.
- Pipeline: `source`, `assignedToUserId`, `createdByUserId`,
  `lastContactAt`, `nextFollowUpAt`.
- Outcome: `convertedRenterId`, `convertedContractId` (reserved, unused -
  see §16), `lostReason`, `lostReasonNote`.
- Corporate-only: see §6.

**Design decisions, differing slightly from the brief's suggested field
list:**

- No `deletedAt` column was added. The brief's Step 28 itself walks the
  design back to "prefer archive behavior" (`status: ARCHIVED`), and a
  second, separate soft-delete mechanism alongside that would be pure
  duplication with no action in this task ever needing it - so it was
  left out rather than added as dead schema weight. If a genuine
  hard-delete need appears later (e.g. purging a spam submission), add it
  then.
- `assignedToUserId` is a real Prisma relation to `User` (`onDelete:
  SetNull`), unlike `createdByUserId` (a plain string, mirroring
  `Owner.createdBy`). This is deliberate: assignment is live operational
  data the UI joins and displays constantly and must verify against the
  caller's organization on every write, whereas `createdByUserId` is a
  historical attribution field that must survive a `User` being removed.

## 2. Lead statuses

```
NEW -> CONTACTED -> QUALIFIED -> VIEWING_PENDING -> VIEWING_COMPLETED ->
OFFER_PENDING -> NEGOTIATION -> RESERVATION_PENDING -> WON
                                                      -> LOST (from any active stage)
                                                      -> ARCHIVED (from any stage)
```

Per the brief, **only NEW, CONTACTED, QUALIFIED, WON, and LOST are fully
wired to real actions in this task.** The five stages in between
(`VIEWING_PENDING` through `RESERVATION_PENDING`) exist in the enum and
render correctly everywhere (pipeline columns, status dropdowns, reports)
so the future Viewing/Offer/Reservation modules can start posting leads
into them without a schema change, but no action in this codebase sets a
lead to one of those stages today - they're reachable only via the
generic `changeLeadStatus()` pipeline-move action, exactly like NEW/
CONTACTED/QUALIFIED.

`WON`, `LOST`, and `ARCHIVED` are **never** set by `changeLeadStatus()` -
each has its own dedicated action (`convertLeadToRenter()`,
`markLeadLost()`, `archiveLead()`) so the state transition, its required
side effects (renter linkage, lost reason, audit entry), and its
authorization can't be bypassed by a generic status dropdown.

## 3. Lead lifecycle

1. **Create** (`createLead()`, `lead.create`) - a non-blocking duplicate
   check runs first (§12), but never blocks creation.
2. **Qualify** - move through NEW → CONTACTED → QUALIFIED via
   `changeLeadStatus()` (`lead.update`), logging `LeadActivity` rows along
   the way (calls, WhatsApp, meetings - §8).
3. **Assign** an agent (`assignLead()`, `lead.assign`) - see §9.
4. **Close**, one of:
   - `convertLeadToRenter()` (`lead.convert`) → `status: WON` (§5).
   - `markLeadLost()` (`lead.update`) → `status: LOST`, reason required (§13).
   - `archiveLead()` (`lead.archive`) → `status: ARCHIVED`, for leads that
     are neither won nor lost (spam, duplicate, no longer relevant) - see
     §14.

Every state transition writes both a `LeadActivity` (type
`STATUS_CHANGE`, for the human-facing timeline) and an `AuditLog` entry
(for the security/system record) - see §11.

## 4. Lead vs. Renter

| | Lead | Renter |
|---|---|---|
| Represents | A prospective tenant or enquiry | A contracted tenancy party |
| Created by | CRM (`createLead`) | Directly, or via Lead conversion |
| Has a Contract? | Never directly | Yes, via `Contract.renterId` |
| Deleted? | Never (archived instead) | Has its own `deleteRenter()` |
| Financial history | None - Leads carry no Invoice/Payment | Full invoicing/payment history |

They are intentionally separate models. A `Renter` is deeply wired into
invoicing, payments, and statements; a `Lead` is not and must never be
- collapsing them would force every pre-contract enquiry into the
financial data model, and would make `Renter` queries (used throughout
reports and ZATCA invoicing) have to filter out never-converted leads
everywhere.

## 5. Conversion workflow

`convertLeadToRenter(formData)` (`src/lib/actions/leads.ts`,
`lead.convert`), all in one transaction:

1. Rejects if the lead is already converted (`convertedRenterId` set or
   `status: WON`) - a lead can be converted at most once.
2. **Link mode** (`mode: "link"`): attaches an existing `Renter` (verified
   to belong to the caller's own organization) via
   `Lead.convertedRenterId`. No new `Renter` row is created.
3. **New mode** (`mode: "new"`): before creating a `Renter`, checks for an
   existing one whose phone (normalized - §12) or email matches the
   lead's. If a match exists and the caller hasn't set `forceNewRenter`,
   the action **throws** rather than silently duplicating - stricter than
   the Lead-creation duplicate check (§12), because creating a real
   `Renter` has downstream financial implications a duplicate Lead does
   not. The UI (`/crm/leads/[id]`) calls `findPossibleRenterMatches()`
   first and offers "link instead" before the user ever reaches this
   guard.
4. Sets `Lead.status = WON`, `Lead.convertedRenterId`, writes an
   `AuditLog` entry (`action: APPROVE` - see §11) and a `LeadActivity`
   (`STATUS_CHANGE`, "Converted to Renter").
5. **The Lead row is never deleted or hidden.** Its full activity/audit
   history remains exactly where it was; only `status` and
   `convertedRenterId` change.

## 6. Corporate leads

`LeadType: CORPORATE` leads (Sinopec, SLB, an Aramco contractor, an
engineering firm's housing desk, ...) use the same `Lead` model with
these additional fields populated: `companyName` (the primary display
name for a corporate lead - see `buildLeadFullName()` in
`src/lib/crm/lead-rules.ts`), `contactPersonName`/
`contactPersonMobile`/`contactPersonEmail` (the individual handling the
enquiry), `employeeCount`, `requiredUnits`, `requestedCity`,
`projectName`, `housingStartDate`, `housingEndDate`.

This is **not** a separate Corporate Client module - per the brief, this
data is the foundation a future Corporate Housing feature would build on,
not that feature itself. The new-lead form (`/crm/leads/new`) shows these
fields only when Lead Type is set to Corporate (a client-side visibility
toggle, `src/components/lead-type-toggle.tsx` - all fields stay optional
at the schema/validation level, so nothing breaks if they're submitted
empty).

## 7. Activities

`LeadActivity` (`src/lib/actions/lead-activities.ts`) records business
interactions: `CALL`, `WHATSAPP`, `EMAIL`, `MEETING`, `NOTE`,
`FOLLOW_UP`, `STATUS_CHANGE`, `OTHER`. Append-only by convention - there
is no update/delete action for it anywhere in the codebase, matching the
same pattern already established for `OwnerLedgerEntry` and `AuditLog`.
`createdByUserId` is always the session user, never accepted from the
client (see §15).

## 8. Follow-up logic

`Lead.nextFollowUpAt` drives three worklist buckets, computed by
`followUpBucket()` (`src/lib/crm/lead-rules.ts`, pure and unit-tested):

- **Overdue**: `nextFollowUpAt` is in the past, and the lead is still
  active (not WON/LOST/ARCHIVED).
- **Today**: `nextFollowUpAt` falls within today's calendar day.
- **Upcoming**: `nextFollowUpAt` is in the future.

A closed lead (WON/LOST/ARCHIVED) never appears in any follow-up bucket,
even if it happens to have a stale `nextFollowUpAt` from before it
closed. This is dashboard/worklist logic only (`/crm` KPIs, `/crm/leads?
followUp=overdue` filter) - no notification/reminder sending exists or is
planned by this task.

## 9. Assignment

`assignLead(leadId, assignedToUserId)` (`lead.assign`):

- Verifies the target user belongs to the caller's own organization
  (`prisma.user.findUniqueOrThrow({ where: { id, organizationId } })`) -
  a cross-org user id throws before anything is written.
- Writes an `AuditLog` entry (`action: UPDATE`,
  `previousValues`/`newValues: { assignedToUserId }`) and a
  `LeadActivity` (`STATUS_CHANGE`, "Assigned to X" / "Unassigned").
- OWNER/ADMIN/MANAGER can assign/reassign (`lead.assign` - see
  `docs/PERMISSIONS.md`). There is no separate "Leasing Agent" role yet;
  per the brief, existing roles are used for now, and any active user in
  the organization (regardless of role) can be selected as the assignee -
  `listAssignableUsers()` deliberately does not filter by role.

## 10. RBAC

See `docs/PERMISSIONS.md` §2 (permission list) and its role matrix for
the authoritative table. Summary: OWNER/ADMIN get everything; MANAGER
gets every CRM permission; ACCOUNTANT gets none; VIEWER gets `lead.view`
only (not `leadActivity.view` - a Viewer sees a lead's profile but not
its interaction history, the same view/activity-history split already
used for `owner.view`/`ownerLedger.view`).

## 11. Audit integration

**No new `AuditAction` values were added** - the audit architecture
itself was explicitly off-limits for this task. Lead lifecycle events map
onto the existing enum:

| Lead event | `AuditAction` used |
|---|---|
| Created | `CREATE` |
| Field edit / status move / reassignment | `UPDATE` |
| Marked lost | `REJECT` |
| Converted (WON) | `APPROVE` |
| Archived | `DEACTIVATE` |

This mirrors how `DEACTIVATE` already means "hidden but not deleted" for
`Owner`, and `APPROVE`/`REJECT` were defined in the original audit enum
but unused until now - exactly the kind of forward-compatible slot the
brief's own audit design anticipated.

### LeadActivity vs. AuditLog

These are deliberately separate and never duplicate each other:

- **`LeadActivity`** answers "what did leasing staff do with this
  prospect?" - calls, meetings, notes, status changes. It's what the
  `/crm/leads/[id]` Activities tab shows. It is business/interaction
  history, visible to anyone with `leadActivity.view`.
- **`AuditLog`** answers "what changed in the system, and who has
  access?" - the security/compliance record shown by `<AuditTimeline
  entityType="Lead" .../>` at the bottom of the Lead profile page,
  gated by `audit.view` (a different, narrower permission).

A status change writes **both** (a `LeadActivity` for the human-facing
timeline, an `AuditLog` row for the security trail) but with different
content: the `LeadActivity` has a human-readable subject ("Status changed
from NEW to QUALIFIED"); the `AuditLog` row has structured
`previousValues`/`newValues` for programmatic/security review. Neither
one is a replacement for the other.

`createLeadActivity()` itself is **not** audited - logging that a call
happened is not a security-relevant event, matching the audit system's
existing policy of not auditing routine reads/low-value writes.

## 12. Duplicate detection

**Lead creation** (`findPossibleDuplicateLeads()`, called by the
new-lead form's `LeadDuplicateCheck` client component on blur - see
`src/components/lead-duplicate-check.tsx`): matches on exact normalized
mobile or case-insensitive email, within the caller's own organization.
**Never blocks submission** - it renders a warning banner
("Possible duplicate lead found: LEAD-000045 — John Doe — 0501234567 —
QUALIFIED — assigned to X") and lets the user continue regardless, per
the brief's explicit "do not silently block legitimate duplicates."

**Renter creation during conversion** (§5) is stricter: it *does* block
(unless explicitly overridden), because creating a `Renter` has real
downstream financial consequences a duplicate `Lead` does not.

## 13. Lost Lead handling

`markLeadLost(formData)` (`lead.update`) requires `lostReason` (one of
`PRICE`, `NO_AVAILABILITY`, `LOCATION`, `COMPETITOR`, `NO_RESPONSE`,
`BUDGET`, `TIMING`, `CUSTOMER_CANCELLED`, `OTHER`); when the reason is
`OTHER`, `lostReasonNote` is required (`validateLostReason()` in
`src/lib/crm/lead-rules.ts`, unit-tested). Lost leads are never deleted -
they remain fully searchable/reportable (`/crm/reports/lost-analysis`,
`/crm/leads?status=LOST`).

## 14. Archiving

`archiveLead()` (`lead.archive`) sets `status: ARCHIVED`. Archived leads
are excluded from `/crm/pipeline` and from the default `/crm/leads` view
whenever a `status` filter narrower than "all" is in effect, but remain
visible when explicitly filtered to `status=ARCHIVED` and are never
deleted. There is no "unarchive" action in this task (mirroring the
codebase's existing pattern of not inventing an action beyond what's
needed - see `docs/PERMISSIONS.md` §2 on `property.update`/`unit.update`/
`renter.update`); if that need arises, it's a small additive action to
add later (flip `status` back to `NEW` or its prior value, audited the
same way).

## 15. Multi-tenant security

Every Lead/LeadActivity action follows the exact same pattern as the rest
of the codebase: `requirePermission()`/`requirePermissionAudited()`
returns `organizationId` from the **signed session** (never client
input), and every Prisma query/mutation filters or verifies by it -
including verifying that `preferredCompoundId`, `assignedToUserId`, and
(during conversion) `renterId` all belong to the caller's own
organization before being persisted or read. `createLeadActivity()`
additionally verifies the target `Lead` belongs to the caller's
organization before writing, and always uses the session user for
`createdByUserId` - never a client-supplied value.

This is covered by real, database-backed tests (not mocked
organizationId checks) in
`src/lib/actions/__dbtests__/crm-cross-org-security.db.test.ts`, run via
`npm run test:db` against the same guarded, disposable test database
described in `docs/AUDIT-AND-FINANCIAL-CONTROLS.md` §10. It exercises:
reading/updating/reassigning/archiving/converting another organization's
lead, creating an activity against another organization's lead, linking
another organization's Compound or Renter to your own lead (IDOR), and
assigning another organization's User as an agent (IDOR) - all rejected,
verified against the real Prisma "record not found" error, not a mock.

One real gap was found and fixed while building `postManualLedgerEntry`'s
tests during the prior audit-and-financial-controls task, unrelated to
CRM; no equivalent gap was found in the CRM action set itself; every
cross-org/IDOR case listed above already had the correct
`organizationId`-scoped guard on the first implementation pass, verified
by the tests above.

## 16. Future Viewing/Offer/Reservation architecture

Explicitly out of scope for this task, per the brief. What this
foundation already has ready for that future work:

- `LeadStatus` already defines `VIEWING_PENDING`, `VIEWING_COMPLETED`,
  `OFFER_PENDING`, `NEGOTIATION`, `RESERVATION_PENDING` - a future
  Viewing/Offer/Reservation module can move a lead through these via the
  existing `changeLeadStatus()` action (or its own dedicated actions,
  following the same pattern as `convertLeadToRenter`/`markLeadLost`) with
  no schema change needed for the status values themselves.
- `Lead.convertedContractId` (nullable, unique, FK to `Contract`) exists
  now, unused, so a future "convert Lead directly to Contract" workflow
  (skipping or alongside the Renter step) has its linkage column ready
  without another migration.
- `LeadActivity.activityType` already includes `FOLLOW_UP` as a distinct
  type from `STATUS_CHANGE`, anticipating that a future Viewing/Offer
  module will want its own activity entries (e.g. "Viewing scheduled",
  "Offer sent") without redefining the activity type enum.

None of this is wired to any actual Viewing/Offer/Reservation logic in
this task - the columns and enum values exist purely so the next task can
build additively on top of this one, the same way this task built
additively on top of the existing Renter/Contract/Owner models.

## 17. Reused, not duplicated

- `preferredUnitType` reuses the existing `UnitType` enum (`APARTMENT`,
  `VILLA`, `OFFICE`, `SHOP`, `WAREHOUSE`, `OTHER`) - a lead's unit-type
  preference and a real unit's type are the same concept, so no new enum
  was created for it.
- Lead numbering reuses the existing per-organization `Counter`
  infrastructure (`nextCounterValue(tx, organizationId, "lead")`,
  `formatLeadNumber()` in `src/lib/numbering.ts`) - no separate numbering
  scheme. Per the brief's own example, lead numbers have no year
  component (`LEAD-000001`, unlike invoice/contract/receipt numbers,
  since a lead number isn't a legal/tax document series).
- Pagination (`/crm/leads`) follows the exact `skip`/`take` +
  separate `count()` pattern already used by `/audit-logs` - the full
  leads table is never loaded into memory.
- The CRM dashboard (`/crm`) is its own page, not folded into the
  existing financial `/dashboard`, per the brief's explicit instruction
  not to clutter it.

## 18. Phone normalization

`src/lib/crm/phone.ts` (`normalizeSaudiMobile()`, `isSameMobile()`) -
narrow and CRM-scoped on purpose, not a general international phone
library:

- Strips spaces/dashes.
- Recognizes local (`0501234567`), international-plus
  (`+966501234567`), and bare-international (`966501234567`) Saudi
  mobile formats as the same canonical `966501234567` form.
- Recognizes a bare 9-digit subscriber number starting with `5`
  (`501234567`) as the same number too.
- Falls back to a digits-only strip (no country-code guessing) for
  anything that doesn't look Saudi-shaped - still usable for exact-match
  duplicate detection, just not cross-format-normalized.

This utility is used **only** for CRM lead/renter duplicate matching. It
does not touch `Renter.phone`, `Owner.mobile`, or any other existing
phone field or behavior anywhere else in the app.
