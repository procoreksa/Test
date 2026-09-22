# Ownership & Owner Accounting Foundation

This document describes the internal ownership and owner-accounting layer
introduced in this task: `Owner`, `PropertyOwnership`, and
`OwnerLedgerEntry` (plus their CRUD, ownership-management screens, and two
reports). **This is not an Owner Portal.** There is no owner login, no
owner self-service, and no automated posting of real financial data yet -
see §11 for what a future portal would still need to add.

Nothing in RBAC's existing policy, VAT/ZATCA logic, invoicing, payments, or
payment schedules was modified. The only new permission keys are additive
(§9), and the only invoicing-adjacent touch anywhere in this codebase
remains the one made in the prior property-hierarchy migration (a
null-safe fallback for invoice line description text) - this task adds no
further changes there.

## 1. Owner model

`Owner` (`prisma/schema.prisma`) represents an individual, company,
investment fund, or government entity that owns (all or part of) a
Compound/Building/Unit. It is **not** a `User` - owners never log in.

- `ownerType`: `INDIVIDUAL | COMPANY | FUND | GOVERNMENT_ENTITY | OTHER`.
- Identity fields (`nationalId`, `iqamaNumber`, `passportNumber`,
  `companyRegistrationNumber`, `vatNumber`) are all optional at the schema
  level, since which one applies depends on `ownerType` - the UI doesn't
  force filling in fields that don't make sense for the chosen type.
- Banking fields (`bankName`, `bankAccountName`, `iban`) are sensitive.
  They appear only on the owner profile/edit screen (`/owners/[id]`), never
  in the `/owners` list table or in any report - the list and reports only
  ever show name/type/mobile/status and financial ledger amounts.
- `status` (`ACTIVE | INACTIVE`) is a reversible "deactivated" flag,
  separate from `deletedAt` (soft delete). `deleteOwner()` only succeeds
  when the owner has **zero** `PropertyOwnership` and **zero**
  `OwnerLedgerEntry` rows; otherwise it throws and the caller should
  deactivate instead. There is no hard delete anywhere in the codebase for
  this model.
- `createdBy`/`updatedBy` store the acting user's id, but are **not**
  foreign keys to `User` - an audit trail needs to survive a user being
  removed in the future (this codebase has no user-delete flow today, but
  the field shouldn't assume that never changes).

## 2. Ownership model

`PropertyOwnership` assigns one `Owner` a percentage of exactly one asset -
a `Compound`, a `Building`, or a `Unit` (`compoundId`/`buildingId`/`unitId`
are all nullable; the service layer only ever sets one of them per row, a
DB-level `CHECK (num_nonnulls(...) >= 1)` constraint added by the migration
enforces "at least one" as defense in depth per the brief).

There is **no single `ownerId` column on `Unit`.** A unit's owner is
resolved at read time - see §3.

- `ownershipPercentage`: `Decimal(5,2)`, 0.01-100.00.
- `effectiveFrom`/`effectiveTo` + `status` (`ACTIVE | ENDED`) together model
  history: ending an ownership record (`endOwnership()`) sets both
  `status = ENDED` and `effectiveTo = now`, and never deletes the row -
  "Historical ownership must remain preserved" is satisfied by simply never
  exposing a delete action for this model either.
- **Percentage cap**: before inserting a new `ACTIVE` ownership row,
  `createOwnership()` sums the existing `ACTIVE` percentages for the exact
  same asset (same compound/building/unit id) and rejects if the new total
  would exceed 100 (`activeOwnershipTotalForAsset()` in
  `src/lib/ownership.ts`). This is enforced only in the application layer -
  Postgres `CHECK` constraints can't see other rows, and a trigger was
  judged out of scope for this task. The UI also shows a plain warning
  (not a hard error) when the active total for an asset is under 100%,
  since a partially-assigned asset is a valid, if incomplete, state.
- `createdBy`/`updatedBy` follow the same non-FK convention as `Owner`.

## 3. Ownership inheritance

`getEffectiveOwners()` (`src/lib/ownership.ts`) resolves the actual
owner(s) of a Compound, Building, or Unit by walking the priority chain

```
Unit -> Building -> Compound
```

and returning the **first level that has any `ACTIVE` ownership record**,
without ever copying a compound-wide assignment onto every one of its
units. Concretely: querying a Unit's owners first checks for ownership
rows on that exact unit; if none exist, it looks up the unit's building and
recurses; if the building has none either, it recurses to the compound. An
asset with nothing configured anywhere in the chain returns an empty array
- "no ownership information configured" is an expected, valid state for
every asset that existed before this migration (§10).

The decision logic itself is split out as a pure, DB-free function,
`pickEffectiveOwnershipLevel()`, given each level's already-fetched
candidate rows in priority order - this is what's unit-tested directly in
`src/lib/ownership.test.ts` without needing a database. The Owner
Portfolio report (§13) reuses this same pure function against a single
bulk-fetched set of ownership rows (one query for the whole organization)
rather than calling the DB-touching resolver once per unit, to keep it
from doing N+1 queries.

## 4. Ownership percentage rules

- An ownership record must reference at least one asset level (DB `CHECK`
  + validated by the create form only ever submitting one level).
- The sum of `ACTIVE` percentages for the **same specific asset** (not
  aggregated across the hierarchy) must never exceed 100.
- 100% total is the expected end state once ownership is finalized, but
  under-100% is tolerated (with a UI warning) for assets that are only
  partially configured.
- All percentage arithmetic uses `Prisma.Decimal`, never a JS `number`
  comparison beyond what's needed to render it.

## 5. Owner ledger

`OwnerLedgerEntry` is an **immutable, append-only** ledger: there is no
update or delete server action for this model anywhere in the codebase.
Every row has both a `debit` and a `credit` column (only one is ever
non-zero per row) plus `entryType`, `entryDate`, an optional
`compoundId`/`unitId` for reporting, and a free-text
`referenceType`/`referenceId` pair (not a Prisma relation - deliberately,
so the ledger can be posted from any future source without risking a
cascade-delete of financial history).

Corrections are made by **posting a new entry**, never by editing or
deleting the original - see §8.

## 6. Debit/credit convention

Balance is `sum(credit) - sum(debit)`; a **positive balance means the
company owes the owner money** (like a vendor sub-ledger). Each entry type
has a fixed default side (`defaultLedgerSide()` in
`src/lib/owner-allocation.ts`):

| Side | Entry types |
|---|---|
| **Credit** (increases balance owed to owner) | `RENT_INCOME`, `OTHER_INCOME`, `OWNER_CONTRIBUTION` |
| **Debit** (decreases balance owed to owner) | `MANAGEMENT_FEE`, `MAINTENANCE_EXPENSE`, `UTILITY_EXPENSE`, `SERVICE_EXPENSE`, `GOVERNMENT_FEE`, `OTHER_EXPENSE`, `OWNER_DISTRIBUTION` |

`ADJUSTMENT` has no default side - the person posting it picks debit or
credit explicitly, since a correction can go either way. `REVERSAL` is
never posted manually; it's always generated by `reverseLedgerEntry()`
with the original entry's debit/credit swapped (§8).

An `OWNER_CONTRIBUTION` (owner injects funds to cover a shortfall) is
treated the same direction as income: it increases what the company owes
back to the owner, exactly like rent collected on their behalf would.

## 7. Financial allocation

`src/lib/owner-allocation.ts` exports `allocateAmountToOwners()`, a pure
function that splits an amount across owner shares using **only
`Prisma.Decimal`** (never a JS floating-point division) and the
**largest-remainder method**: each owner's exact share is computed at full
precision, floored to 2 decimal places, and then the leftover cent(s) -
the difference between the input total and the sum of the floored shares -
are handed out one cent at a time to whichever owner(s) had the largest
fractional remainder, breaking ties deterministically by `ownerId` so the
result is reproducible. This guarantees the allocated amounts always sum
**exactly** to the input, with no floating-point drift.

`allocateIncomeToOwners()`/`allocateExpenseToOwners()` wrap this: they call
`getEffectiveOwners()` for the given asset, split the amount across
whatever owners that resolves to, and post one `OwnerLedgerEntry` per
owner inside the caller's transaction. If the asset has no ownership
configured, they return `{ allocations: [], createdEntryIds: [] }` rather
than throwing - an unconfigured asset is not an error state (§10).

**These are manual/service-triggered postings only.** Nothing in the
existing invoicing/payment pipeline calls them automatically - issuing an
invoice or recording a payment does not touch the owner ledger. Per the
brief: *"Do NOT automatically post every existing historical payment yet
unless explicitly migrated."* A staff member (or a future scheduled job)
triggers an allocation explicitly via `/owners/[id]`'s manual-entry form or
`allocateToOwnersAction()`.

### Worked examples

- **60/40 split of SAR 100,000 rent** → Owner A: 60,000.00, Owner B:
  40,000.00 (exact, no remainder).
- **50/50 split of SAR 100.01** → one owner gets 50.01, the other 50.00 -
  the extra cent from the 0.005/0.005 tie goes to whichever `ownerId`
  sorts first.
- **100% single owner** → the owner receives the full amount unchanged.

All three are covered by `src/lib/owner-allocation.test.ts`.

## 8. Reversal logic

`reverseLedgerEntry(entryId)`:
1. Loads the original entry.
2. Refuses if it has already been reversed (`reversalOfEntryId` is a
   unique column on the ledger table - at most one reversal per entry).
3. Creates a new entry with `entryType = REVERSAL`, `debit`/`credit`
   swapped from the original, `reversalOfEntryId` pointing back at the
   original, and a generated description ("Reversal of: ...").
4. The original entry is never touched - it stays exactly as posted, and
   its effect is cancelled out by the new reversal entry's opposite
   posting, not by editing history.

## 9. RBAC

Additive permission keys only (`src/lib/permissions.ts`, documented in
`docs/PERMISSIONS.md` per its own stated rule for new keys):

```
owner.view / owner.create / owner.update
ownership.view / ownership.manage
ownerLedger.view / ownerLedger.create / ownerLedger.reverse
```

| Permission | OWNER | ADMIN | MANAGER | ACCOUNTANT | VIEWER |
|---|:---:|:---:|:---:|:---:|:---:|
| owner.view | ✅ | ✅ | ✅ | ✅ | ✅ |
| owner.create / owner.update | ✅ | ✅ | ✅ | ❌ | ❌ |
| ownership.view | ✅ | ✅ | ✅ | ✅ | ✅ |
| ownership.manage | ✅ | ✅ | ✅ | ❌ | ❌ |
| ownerLedger.view | ✅ | ✅ | ✅ | ✅ | ✅ |
| ownerLedger.create / .reverse | ✅ | ✅ | ❌ | ✅ | ❌ |

No `owner.delete` key exists - the brief didn't ask for one, so soft-delete
and deactivate are both gated by `owner.update` (deleting is additionally
blocked in code whenever the owner has any history, §1). There is
similarly no per-field ownership permission: `ownership.manage` covers both
creating and ending an assignment, mirroring how `settings.update` already
covers every settings field rather than one permission per field.

## 10. Multi-tenant protections

Every new query filters by the `organizationId` returned from
`requirePermission()` (read from the signed session JWT, never client
input) - identical to every other model in this codebase. Specifically:

- `createOwnership()` verifies the referenced `Owner` **and** the
  referenced Compound/Building/Unit both belong to the caller's
  organization (`assertAssetInOrg()` in `src/lib/actions/ownership.ts`)
  before creating the row - an org can't attach its ownership to another
  org's asset, or attach another org's owner to its own asset.
- `postManualLedgerEntry()` verifies the target `Owner` belongs to the
  caller's org before posting.
- `getOwnerStatement()`/`getOwnerPortfolio()` scope every query by
  `organizationId`.

**Test-infrastructure note** (same limitation as the two prior integration
test files in this repo, `rbac.integration.test.ts` and
`property-hierarchy.integration.test.ts`): there is no test database
configured in this environment, so the automated tests verify the
permission *gate* (every mutating action rejects the wrong role before
touching Prisma) rather than a live two-organization data fetch. Cross-org
rejection for the new models rests on the same `organizationId`-filtered
query pattern used everywhere else in the codebase, which is code-reviewable
but not exercised by an end-to-end automated test here. This is flagged as
a residual risk in the final report, not hidden.

Existing assets may legitimately have **no** ownership, owner, or ledger
data at all - this is not an error state anywhere in this layer.

## 11. Future Owner Portal design considerations

Deliberately not built in this task, but the schema was shaped to make
these additions non-breaking later:

- **Owner login / self-service.** `Owner` has no password/auth fields on
  purpose - a portal would likely add a separate `OwnerUser` (or extend
  `User` with an `ownerId` and a new role) rather than turning `Owner`
  itself into a login-capable entity, so today's owners keep working
  unchanged either way.
- **Scoped visibility.** An owner logging in should only ever see their
  own `PropertyOwnership`/`OwnerLedgerEntry` rows - both models already
  carry `ownerId`, so the query shape barely changes; only the permission
  check does (a new, distinct role/permission set, not `owner.*`, which
  stays internal-staff-only per this task's explicit scope).
- **Bank payments / reconciliation.** `OwnerLedgerEntry.referenceType`/
  `referenceId` are free-text on purpose specifically so a future
  `BankTransaction` (or similar) model can post entries here without a
  schema change to this table.
- **Management fee engine.** Today, a management fee is just another
  manually- or service-posted `MANAGEMENT_FEE` ledger entry. A future
  engine that computes it automatically (e.g. a % of collected rent) would
  plug into the same `allocateExpenseToOwners()` function used here -
  no ledger schema change needed, only a new caller.
- **Documents.** The owner profile page has a placeholder section only;
  attaching real files would need whatever object-storage pattern the
  org-logo upload already uses in this codebase, extended with an
  `ownerId` foreign key.
