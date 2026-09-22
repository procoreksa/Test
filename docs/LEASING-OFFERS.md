# CRM: Leasing Offer Management

This document describes the Leasing Offer module: the commercial
pre-contract proposal that sits between a qualified Lead / completed
Viewing and a future Reservation/Contract. It is purely additive - no
VAT/ZATCA/invoicing/payment/owner-ledger/ownership-allocation logic,
Viewing double-booking logic, CRM conversion logic, property hierarchy, or
audit architecture was changed. See `docs/CRM-LEADS.md` and
`docs/VIEWING-MANAGEMENT.md` for the foundations this builds on, and
`docs/PERMISSIONS.md` for the RBAC system.

Scope of this task, per the brief: **Leasing Offer creation, pricing,
approval, versioning, and lifecycle only.** Reservations, Contract
generation from an Offer, electronic signature, and message delivery
(WhatsApp/email) are a future task and are explicitly not implemented
here (see §17).

Flow: **Lead → (optional) Viewing → Leasing Offer → Negotiation → future
Reservation → future Contract.**

## 1. Model

`LeasingOffer` (`prisma/schema.prisma`): `offerNumber` (stable across a
whole revision chain, e.g. `OFFER-000001`) + `versionNumber` (increments
per revision), `leadId` (required), `viewingId` (optional), `unitId`
(single primary unit, required), `status`/`approvalStatus` (two separate
fields - see §6), pricing fields (§3), `paymentFrequency` (reuses the
existing `PaymentFrequency` enum), `leaseStartDate`/`leaseDurationMonths`,
`furnishedStatus` (reuses the existing `FurnishingPreference` enum),
`specialTerms`/`internalNotes`, lifecycle timestamps
(`sentAt`/`acceptedAt`/`rejectedAt`/`expiredAt`), `rejectReason` (customer
rejection only - see §6), `createdByUserId` (plain string, mirrors
`Lead`/`Viewing`'s own), `assignedToUserId` (real relation, same pattern
as `Lead`/`Viewing`), and `parentOfferId` (unique - see §5).

No `deletedAt` column, same reasoning as `Viewing` (`docs/
VIEWING-MANAGEMENT.md` §1): `CANCELLED`/`SUPERSEDED` already serve as
terminal "this proposal didn't proceed" states, so a second soft-delete
mechanism would be pure schema weight.

**Unit(s):** each Offer targets exactly one primary `unitId` (Step 3 of
the brief - corporate multi-unit proposals are explicitly out of scope).
The FK is a plain scalar column rather than a join table, so adding an
`OfferUnit` join table later for corporate proposals is additive, not a
redesign.

## 2. Relation to Lead / Viewing / Unit

- `leadId` - required, `onDelete: Cascade` (matches `Viewing.leadId`).
  Every Offer traces to exactly one Lead.
- `viewingId` - **optional**, `onDelete: SetNull`. Step 10 of the brief
  requires a direct Offer from a qualified Lead to remain possible without
  ever having gone through a Viewing - `createOffer()` never requires one.
  When supplied, the viewing must belong to the same organization *and*
  the same Lead (`t.validation.offerViewingMismatch` otherwise).
- `unitId` - required, `onDelete: Restrict` (matches `Contract.unitId` - a
  Unit with live commercial offers against it cannot be deleted out from
  under them). Eligibility mirrors Viewing's: only `VACANT` units are
  offerable (`t.validation.offerUnitNotEligible` otherwise), checked only
  when the unit is actually changing (editing a Draft offer without
  touching its unit never re-checks VACANT, since nothing in this task
  ever changes `Unit.status`).

## 3. Pricing calculations

Pure, DB-free module: `src/lib/crm/offer-pricing.ts`
(`computeOfferPricing()`), unit-tested in `offer-pricing.test.ts`. Reuses
existing conventions rather than inventing new financial logic:
`round2()`/`STANDARD_VAT_RATE` from `src/lib/zatca/vat.ts` (the exact same
rounding and default VAT rate every invoice line already uses).

Inputs: `annualRent`, `discountAmount` **or** `discountPercentage` (if
both are supplied, `discountAmount` wins), `commissionAmount` **or**
`commissionRate` (percentage of the **net** annual rent), `commissionVatRate`
(default 15), `securityDeposit`, `contractFee`, `paymentFrequency`.

Outputs: `grossAnnualRent`, `discountAmount`, `discountPercentage`
(always computed, regardless of which discount input mode was used - this
is the one authoritative number the approval threshold in §7 checks),
`netAnnualRent`, `leasingCommissionAmount`, `commissionVatAmount`,
`totalCommissionWithVat`, `installmentCount`/`installmentAmount`
(indicative, presentation-only - see §4), `initialPaymentTotal` (first
installment + `securityDeposit` + `contractFee` + `totalCommissionWithVat`
- the amount indicatively due at signing).

The identical pure function drives both the server-persisted calculation
(`src/lib/actions/offers.ts`) **and** the client-side live preview on the
New/Edit Offer form (`src/components/offer-pricing-form.tsx`), so the
preview can never drift from what actually gets saved.

## 4. VAT behavior

**Rent itself carries no VAT at Offer stage** - there is no
`vatApplicable`/`vatRate` pair on `LeasingOffer` for rent at all,
matching `Contract.vatApplicable` defaulting to `false` for residential
leasing and the brief's explicit instruction ("do NOT apply VAT to rent
unless the existing system already does").

**Only the leasing commission is taxed** - `leasingCommissionAmount *
commissionVatRate / 100` (default 15%), mirroring `EXTRA_CHARGE_VAT_RATE`
in `src/lib/actions/invoices.ts` ("commission/cleaning are
always-taxable services, independent of the rent's VAT treatment").

`securityDeposit`/`contractFee` carry no VAT, matching
`InvoiceLineKind.SECURITY_DEPOSIT` always being written with `vatRate: 0`.

Payment frequency installments (§8 of the brief) are purely presentational
- `installmentCount`/`installmentAmount` in `computeOfferPricing()` - no
`PaymentSchedule` row is ever created from an Offer (see §16).

## 5. Discounts

`discountAmount`/`discountPercentage` are two input *modes* for the same
underlying discount (§3) - the stored row always has both fields
populated (one derived from the other), so every downstream reader
(reports, approval checks) has one authoritative `discountPercentage` to
work from regardless of which mode the creator used.

## 6. Approval rules

Two deliberately **separate** fields - `OfferStatus` (the customer-facing
commercial lifecycle) and `ApprovalStatus` (`NOT_REQUIRED | PENDING |
APPROVED | REJECTED`, the internal discount sign-off) - per Step 12 of
the brief: "Do not confuse customer rejection with internal approval
rejection... prefer a clean design over forcing everything into one
enum."

**Status flow (`status`, canonical, uniform regardless of discount
size):**

```
DRAFT -> PENDING_APPROVAL -> APPROVED -> SENT -> {UNDER_NEGOTIATION, ACCEPTED, REJECTED, CANCELLED, EXPIRED}
PENDING_APPROVAL -> DRAFT   (internal approval declined - see below)
UNDER_NEGOTIATION -> {ACCEPTED, REJECTED, CANCELLED, EXPIRED}
DRAFT -> CANCELLED
APPROVED -> CANCELLED
```

`ACCEPTED`/`REJECTED`/`EXPIRED`/`CANCELLED`/`SUPERSEDED` are terminal for
`status` - a fresh commercial round after any of them requires
`reviseOffer()` to create a brand-new row (§5/§10), never a transition on
the same row. Enforced by `isValidOfferTransition()` in
`src/lib/crm/offer-rules.ts`, checked server-side before every mutating
action writes anything - the single source of truth (`offer-rules.test.ts`
covers every legal and illegal move).

**Internal approval decline is not a customer rejection:**
`declineOfferApproval()` moves `status` back to `DRAFT` (so the creator
can edit and resubmit) and sets `approvalStatus = REJECTED` - it never
touches `OfferStatus.REJECTED`, which is reserved exclusively for the
customer's own decision (§9).

**Discount threshold (Step 13):** `canApproveDiscount(role,
discountPercentage)` in `offer-rules.ts` - OWNER/ADMIN may always
approve; MANAGER may self-approve only at or below 10%; ACCOUNTANT/VIEWER
never (they hold no `offer.approve` permission at all - see §11). This is
a second, business-data-aware gate `approveOffer()` checks *in addition
to* the flat `offer.approve` RBAC permission, deliberately kept as one
small pure function rather than a general Approval Engine, so it can
later migrate into a centralized engine without an RBAC change.

## 7. Versioning / revision chain

The brief's **preferred** approach (Step 11): the same `offerNumber`
persists across an entire negotiation chain (`OFFER-000001`); only
`versionNumber` increments per revision (`1`, `2`, `3`...), displayed as
"Version 1 / Version 2" in the UI. `parentOfferId` links each revision to
its immediate predecessor.

- **`DRAFT` is edited in place** (`updateOfferDraft()`) - no new row.
- **Any other non-terminal-for-revision status** (`PENDING_APPROVAL`,
  `APPROVED`, `SENT`, `UNDER_NEGOTIATION`, and even `REJECTED`/`EXPIRED`/
  `CANCELLED`, so a rejected or expired proposal can still be re-proposed)
  is revised via `reviseOffer()`: it copies every commercial field into a
  brand-new `DRAFT` row (`versionNumber + 1`, same `offerNumber`,
  `parentOfferId` = the old row's id) and flips the old row to
  `SUPERSEDED` in the same transaction. `ACCEPTED` and `SUPERSEDED` rows
  can never be revised (`canReviseOffer()` in `offer-rules.ts`).
- **Linearity safeguard (Step 32):** `parentOfferId` is `@unique` at the
  schema level (mirrors `Contract.renewedFromContractId`) - at most one
  child can ever point at a given parent. `reviseOffer()` additionally
  checks for an existing child before creating a new one, so a row that
  already has a successor can never branch a second time. Only one
  active, non-terminal version normally exists per chain at any moment.
- `getOfferVersionChain(offerNumber)` returns every version of a chain,
  oldest first, shown on the Offer profile's "Version History" section.

## 8. Payment terms

Reuses the existing `PaymentFrequency` enum verbatim (`MONTHLY |
QUARTERLY | SEMI_ANNUAL | ANNUAL | ONE_TIME`) - no new enum. Indicative
installments (`installmentCount` × `installmentAmount`) are computed by
`installmentCountForFrequency()` in `offer-pricing.ts` and are **display
only** - see §16 for why no `PaymentSchedule` row is ever created.

## 9. Lead integration

Reuses `LeadStatus` values that were already reserved by the schema for
this future task (`OFFER_PENDING`, `NEGOTIATION`, `RESERVATION_PENDING` -
see `docs/VIEWING-MANAGEMENT.md`/`docs/CRM-LEADS.md`). All Lead status
moves guard against regressing an already-`WON` lead, matching the
Viewing module's own convention.

| Offer event | Lead status move |
|---|---|
| Created (`createOffer`) | `QUALIFIED` or `VIEWING_COMPLETED` → `OFFER_PENDING` (a Lead already further along, e.g. already `NEGOTIATION` from a prior offer, is left alone) |
| Sent (`sendOffer`) or moved to negotiation (`moveOfferToNegotiation`) | → `NEGOTIATION` |
| Accepted (`acceptOffer`) | → `RESERVATION_PENDING` (Step 17: the Reservation module itself is **not** implemented - the UI shows a disabled "Reservation module not yet implemented" placeholder) |
| Rejected by customer (`rejectOffer`) | **Never** → `LOST`. Deterministically reverts via `leadStatusAfterOfferRejection(hasCompletedViewing)` in `offer-rules.ts`: → `VIEWING_COMPLETED` if the Lead has at least one `COMPLETED` Viewing, otherwise → `QUALIFIED` (there is no stored Lead-status-history table, so this is the one observable fact the reversion is derived from - documented and tested explicitly) |
| Cancelled (`cancelOffer`) | **No Lead status change** - this is the agency's own internal withdrawal, not a customer signal |
| Creating a Lead ineligible (`LOST`/`ARCHIVED`) | Rejected outright (`t.validation.offerLeadNotEligible`) |

## 10. Viewing integration

The Viewing profile page (`/crm/viewings/[id]`) shows a real **"Create
Offer"** button whenever the viewing is `COMPLETED` (Step 19 - this
replaces the disabled "coming soon" placeholder the Viewing Management
task left as the designed hook point), linking to
`/crm/offers/new?leadId=...&viewingId=...&unitId=...` (pre-filling the
first viewed unit). It also lists **"Offers generated from this
viewing"** - offer number, version, status, net rent, date - deliberately
thin, never duplicating the full Offer profile
(`getOffersForViewing()`).

## 11. LeadActivity integration

Every Offer lifecycle event reuses the existing `STATUS_CHANGE`
`LeadActivityType` - no new value. Unlike Viewing (which distinguishes
customer-facing `MEETING` moments from administrative `STATUS_CHANGE`
ones), every Offer event is itself an administrative commercial-stage
change, so one type covers all six required events uniformly: created,
sent, revised, accepted, rejected, cancelled
(`t.offer.activityCreated`/`activitySent`/`activityRevised`/
`activityAccepted`/`activityRejected`/`activityCancelled`).

## 12. Audit integration

Reuses only existing `AuditAction` values (never a new one, per the
brief's audit-architecture restriction):

| Offer event | `AuditAction` | Notes |
|---|---|---|
| Created | `CREATE` | |
| Draft edited | `UPDATE` | via `auditUpdate()`'s automatic field-diff |
| Submitted for approval | `UPDATE` | status → `PENDING_APPROVAL` |
| Approved internally | `APPROVE` | exact semantic match |
| Approval declined internally | `REJECT` | `metadata.rejectionType = "internal_approval"` |
| Sent | `ISSUE` | closest existing reuse - "formally issued/delivered to the customer" |
| Revised | `CREATE` (new version) + `UPDATE` (old version → `SUPERSEDED`) | two rows, one transaction |
| Accepted by customer | `UPDATE` | status → `ACCEPTED` |
| Rejected by customer | `REJECT` | `metadata.rejectionType = "customer"` - same action string as internal decline, disambiguated by `metadata`, exactly the reuse pattern `docs/VIEWING-MANAGEMENT.md` established for `REJECT` (viewing no-show vs. this) |
| Cancelled | `CANCEL` | exact semantic match |

`entityType` is always `"LeasingOffer"`. No change to `AuditAction`,
`writeAuditLog()`, or any redaction/categorization rule in `src/lib/
audit.ts`.

## 13. RBAC

New permissions added to `src/lib/permissions.ts`: `offer.view`,
`offer.create`, `offer.update`, `offer.submit`, `offer.approve`,
`offer.send`, `offer.revise`, `offer.accept`, `offer.reject`,
`offer.cancel`.

| Role | Access |
|---|---|
| OWNER / ADMIN | All ten |
| MANAGER | All ten, **including** `offer.approve`, restricted separately at the business-data layer for discounts over 10% (§6) - not by omitting the permission itself |
| ACCOUNTANT | **None** - deliberately mirrors ACCOUNTANT already holding no `lead.*`/`viewing.*` permissions either. Offers are pre-contract commercial/negotiation data; ACCOUNTANT's financial visibility begins at Contract/Invoice stage, same policy as Leads and Viewings |
| VIEWER | `offer.view` only |

Every mutating action is server-side gated via `requirePermission()`/
`requirePermissionAudited()` - never a client-only check.

## 14. Expiry

Derived, not stored-by-default (Step 26 - "avoid requiring a cron job for
correctness"): `isEffectivelyExpired(status, validUntil, now)` in
`offer-rules.ts` is true only for `SENT`/`UNDER_NEGOTIATION`/`APPROVED`
whose `validUntil` has passed. `ACCEPTED`/`REJECTED`/`CANCELLED`/
`SUPERSEDED` never expire, regardless of `validUntil`.

`syncExpiredOffers(organizationId)` in `src/lib/actions/offers.ts`
persists this lazily and idempotently (`updateMany ... WHERE status IN
(...) AND validUntil < now`) at the top of every read path
(`listOffers`/`getOfferById`/`getOffersForLead`/`getOffersForViewing`/
every dashboard and report query) - self-healing on every page load, no
cron job. It is a plain time-based `UPDATE`, not an individually audited
user action.

## 15. Metrics

Defined in `src/lib/crm/offer-rules.ts`/`src/lib/actions/
offer-reports.ts`, matching the brief's exact formulas:

- **Offer Acceptance Rate** = `ACCEPTED / (ACCEPTED + REJECTED)` (Draft/
  Pending/open offers deliberately excluded from both sides) -
  `computeOfferAcceptanceRate()`.
- **Value of Open Offers** = sum of `netAnnualRent` where status ∈
  `{APPROVED, SENT, UNDER_NEGOTIATION}`.
- **Value of Accepted Offers** = sum of `netAnnualRent` where status =
  `ACCEPTED`.
- Dashboard snapshot counts (`Draft`/`Pending Approval`/`Sent`/
  `Negotiations`) are live pipeline state, matching the CRM Lead
  dashboard's own "Active Leads" convention; `Accepted This Month`/
  `Rejected This Month`/`Expired This Month` are calendar-month bounded,
  matching the Viewing dashboard's "Completed This Month" convention.
  Acceptance Rate and both Value totals are all-time.

## 16. Multi-tenant security

Every Offer query filters by `organizationId` directly in the Prisma
`where` clause - never inferred from a joined relation alone. Verified by
real, database-backed tests (`src/lib/actions/__dbtests__/
offer-cross-org-security.db.test.ts`): Org A cannot read, edit, submit,
approve, decline, send, accept, reject, cancel, or revise Org B's offer,
and cannot create an offer that attaches `leadId`/`unitId`/
`assignedToUserId`/`viewingId` belonging to Org B (every field
individually verified). Org A's `listOffers()` never returns an Org B
row.

## 17. Financial safety

Offer calculations are **pre-contract, commercial-presentation data
only**. No action in `src/lib/actions/offers.ts` ever creates an
`Invoice`, `PaymentSchedule`, `Payment`, or `OwnerLedgerEntry` row - not
even on `acceptOffer()`. Verified by a real-DB test that runs a full
`DRAFT → PENDING_APPROVAL → APPROVED → SENT → ACCEPTED` lifecycle and
asserts all four financial table counts stay at zero
(`offer-lead-integration.db.test.ts`, "Financial safety" describe block).

## 18. Future Reservation / Contract integration

Not implemented in this task, by explicit instruction. The designed hook
points:

- `acceptOffer()` moves the Lead to `RESERVATION_PENDING` (already a
  reserved `LeadStatus` value) and the Offer profile shows a disabled
  "Reservation module not yet implemented" button - the same pattern the
  Viewing Management task used for its own future-Offer placeholder,
  which this task has now made real.
- `LeasingOffer` carries no `convertedReservationId`/
  `convertedContractId` yet (unlike `Lead.convertedContractId`, which was
  added additively ahead of time in the CRM Leads task) - adding one when
  the Reservation module is built is a purely additive migration, exactly
  like every other step in this schema's history.
- Corporate multi-unit proposals: `unitId` is a plain scalar rather than
  embedded in a value object specifically so a future `OfferUnit` join
  table (mirroring `ViewingUnit`) can be added without touching this
  task's model.

## Reused, not duplicated

- `round2()`/`STANDARD_VAT_RATE` (`src/lib/zatca/vat.ts`) - not
  reimplemented.
- `PaymentFrequency`, `FurnishingPreference` enums - not redefined.
- `nextCounterValue()`/the Counter model - `formatOfferNumber()` in
  `src/lib/numbering.ts` follows the exact `formatViewingNumber()`
  pattern (no year component, since an offer number is not a legal/tax
  document series).
- `AuditTimeline` component, `auditCreate`/`auditUpdate`/`auditAction`/
  `requirePermissionAudited()` helpers - used exactly as every other
  module uses them.
- `PrintButton` + `no-print`/`print:` Tailwind class convention
  (`src/app/(app)/invoices/[id]/page.tsx`) - the Offer profile page
  itself doubles as the printable view (Step 25), not a separate print
  route.
- `unitLocationLabel()` (`src/lib/unit-location.ts`).
- `OfferUnitPicker` (`src/components/offer-unit-picker.tsx`) is a new,
  separate component rather than a modification of `ViewingUnitPicker` or
  `CascadingLocationPicker` - neither has the right contract (Viewing's
  accumulates multiple selections as chips; this task needs exactly one
  resolved unit).
