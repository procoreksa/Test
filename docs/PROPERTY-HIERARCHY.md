# Property Hierarchy Migration: Property → Compound → Building → Floor → Unit

This document describes the migration that introduces a full residential/
commercial compound hierarchy above `Unit`, replacing the previous flat
`Property → Unit` model as the primary way units are organized.

**Scope note:** this migration only covers the data model, CRUD, screens,
dashboard, reports, navigation, and tests for Compound/Building/Floor/Unit.
It deliberately does **not** touch RBAC (`src/lib/permissions.ts`,
`src/lib/session.ts`), financial logic, invoicing, payments, VAT, or ZATCA
integration. It does not implement Owners, CRM, Maintenance, or a Tenant
Portal - those are out of scope and left for future work (see Roadmap).

## 1. Why this migration, and why it's additive

Before this change, every `Unit` belonged directly to a `Property` (a single
flat level: `Organization → Property → Unit`). That's too coarse for
residential compound management, where a compound has multiple buildings,
each with multiple floors, each with multiple units.

The new hierarchy is:

```
Organization
  └── Compound
        └── Building
              └── Floor
                    └── Unit
```

`Property` is **not deleted**. It is kept, marked `@deprecated` in the
Prisma schema, and `Unit.propertyId` was relaxed from required to optional
(`String?`). Existing Properties, Units, and Contracts continue to work
exactly as before - nothing that referenced `unit.propertyId` was removed,
and no Contract, Invoice, Payment, or Schedule record was touched by the
migration's SQL beyond the two column changes on `units` described below.

## 2. Schema changes

### New models (`prisma/schema.prisma`)

- **`Compound`** — `id`, `organizationId`, `name`, `arabicName`,
  `description`, `address`, `city`, `location`, `latitude`, `longitude`
  (`Decimal(10,7)`), `ownerName`, `managerName`, `totalBuildings`,
  `totalUnits` (both `Int @default(0)`, **informational only** - see
  §5), `amenities`, `status` (`CompoundStatus` enum: `PLANNING`,
  `UNDER_CONSTRUCTION`, `ACTIVE`, `INACTIVE`), timestamps.
- **`Building`** — `id`, `organizationId`, `compoundId` (cascade delete),
  `code`, `name`, `nameAr` (see §4 deviation), `description`,
  `numberOfFloors`, timestamps.
- **`Floor`** — `id`, `organizationId`, `buildingId` (cascade delete),
  `floorNumber`, `name`, `nameAr` (see §4), timestamps. `@@unique([buildingId,
  floorNumber])` so two floors in the same building can't share a number.

Every new model carries a denormalized `organizationId` (not explicitly
listed in the original spec for Building/Floor, but consistent with every
other model in this codebase - it's this project's standing multi-tenant
isolation pattern, so every query and permission check can filter/verify
by `organizationId` directly without an extra join).

### Changed model: `Unit`

- `propertyId`: `String` → `String?` (now optional).
- `property`: `Property` → `Property?` relation (now optional).
- **New required field** `floorId: String` + `floor: Floor @relation(...)`.
- The **old** free-text `floor: String?` column was **renamed** to
  `floorLabel: String?` (its data was copied over during the migration, not
  dropped) - this frees the name `floor` for the new relation to the `Floor`
  model. `floorLabel` still exists purely as an optional free-text label
  (e.g. "Ground Floor, unit near the elevator") independent of the
  structural `floorId`.

## 3. Migration strategy (non-destructive, no data loss)

Prisma's own `migrate dev` refuses to run this kind of change non-
interactively (a new required column with no default, on a non-empty
table, plus a column drop). So the migration SQL in
`prisma/migrations/20260921135000_property_hierarchy_compound_building_floor/`
was **hand-written** following this repo's existing safe-migration
convention (see the earlier `20260920225043_partial_invoicing_deposit_renewal`
migration for precedent):

1. Create the `CompoundStatus` enum and the three new tables (empty).
2. Add `Unit.floorId` and `Unit.floorLabel` as **nullable** columns; relax
   `Unit.propertyId` to nullable.
3. Copy `units.floor` → `units.floorLabel` (preserves the old free-text data).
4. For every existing `Property`, insert one **shim** `Compound`, one shim
   `Building`, and one shim `Floor`, with deterministic IDs derived from the
   property's own ID (`shim-compound-<propertyId>`, etc. - safe to re-derive,
   collision-free without needing `gen_random_uuid()` in raw SQL). The shim
   Compound copies the property's `name`/`nameAr`/`city`/`street`; the shim
   Building is named "Main Building" with `numberOfFloors = 1`; the shim
   Floor is "Ground Floor" (`floorNumber = 1`).
5. Point every existing Unit's new `floorId` at the shim floor generated for
   its `propertyId`.
6. A defensive fallback (for any unit that somehow had no `propertyId`,
   which shouldn't happen since it was `NOT NULL` before this migration)
   generates a per-unit standalone shim Compound/Building/Floor instead.
7. Only once every row is guaranteed to have a `floorId`: drop the old
   `units.floor` column and set `units.floorId` to `NOT NULL`.
8. Add indexes and foreign keys last.

This was applied with `prisma migrate deploy` (which applies the SQL file
as-is, unlike `migrate dev` which tries to regenerate/validate a fresh
diff) and verified directly against the local dev database: the single
seeded property ("Al Yasmin Tower") correctly produced one shim Compound →
one shim Building → one shim Floor, and all of its units were correctly
re-pointed with their old floor text preserved under `floorLabel`.

**Result:** every Property that existed before this migration now has a
corresponding (shim) Compound/Building/Floor, and every Unit that existed
before this migration now has a valid `floorId`. No Contract, Invoice,
Payment, or Schedule row was touched.

## 4. Deliberate deviations from the literal spec

- **`arabicName` (Compound) vs. `nameAr` (Building, Floor).** The spec
  listed the Compound field as `arabicName` literally, so that name was
  kept as given. But this codebase's standing convention for every other
  bilingual data field is `nameAr` (see `Property.nameAr`, `Renter.fullNameAr`,
  etc.) - and the spec's Building/Floor field lists didn't mention an Arabic
  name field at all. Per this project's own repeatedly-stated rule that all
  user-facing bilingual data needs an Arabic counterpart, `nameAr` was added
  to both `Building` and `Floor` (not explicitly requested, but required by
  the project's bilingual-data standard). The inconsistent field name
  between `Compound.arabicName` and `Building.nameAr`/`Floor.nameAr` is a
  known, intentional wart - flagged here rather than silently "fixed" by
  renaming the spec's literal field.
- **Live-computed vs. stored `totalBuildings`/`totalUnits`.** `Compound`
  has stored `totalBuildings`/`totalUnits` columns (as the spec asked for),
  but every screen that displays them (`listCompounds()` in
  `src/lib/actions/compounds.ts`, the dashboard KPIs, and the
  Units-by-Compound report) **ignores the stored values and computes them
  live** from the actual Building/Floor/Unit rows. The stored columns exist
  for the field list the spec asked for, but a stored counter that isn't
  kept in sync on every Building/Unit create/delete would silently drift -
  computing live is simpler and always correct at this data scale.
- **Reusing existing RBAC permission keys instead of adding new ones.**
  Per the explicit instruction "Do NOT modify RBAC," no new `Permission`
  keys were added to `src/lib/permissions.ts`. Compound and Building CRUD
  is gated by the existing `property.create`/`property.delete`/
  `property.view` keys; Floor CRUD (and the Unit-facing parts of the
  cascading picker) is gated by the existing `unit.create`/`unit.delete`/
  `unit.view` keys. This gives every new mutation the same protection this
  project's standing rule requires ("every mutation must call
  `requirePermission()`"), without touching a single line of
  `permissions.ts` or `session.ts`. `docs/PERMISSIONS.md` itself was not
  edited, since its role matrix is unchanged - the reuse decision is
  recorded only here.

## 5. CRUD, screens, and navigation

- `src/lib/actions/compounds.ts`, `buildings.ts`, `floors.ts` — plain
  create/delete/list actions following this codebase's existing
  `properties.ts`/`units.ts` conventions exactly (zod schema per action,
  `requirePermission()` first, `revalidatePath()` after mutating).
  `floors.ts` also exports `getLocationTree()`, which returns the full
  nested Compound → Building → Floor tree used to drive the cascading
  picker.
- `src/components/cascading-location-picker.tsx` — a client component with
  three dependent `<select>`s (Compound → Building → Floor). Changing the
  Compound resets Building/Floor to the first available option; changing
  the Building resets Floor. It submits only the leaf Floor's id (the
  `fieldName` prop, default `"floorId"`), since a Unit only needs to store
  `floorId` - its Building and Compound are implied by the relation chain.
  It's used both on the Units page's create form and on the Contracts
  page's inline "create a new unit" toggle (`newUnitFloorId`).
- `src/lib/unit-location.ts` — `unitLocationLabel(locale, unit)`, a small
  shared helper that replaced the ~14 call sites across the app that used
  to do `pickLocalized(locale, unit.property.nameAr, unit.property.name)`
  (which broke once `property` became optional). It renders
  `"<Compound> / <Building>"` using each unit's `floor.building.compound`
  relation instead.
- New pages: `/compounds`, `/buildings`, `/floors` (list + create + delete,
  following the same `<details>`-based inline create form pattern as
  `/properties`). `/units` was updated to use the cascading picker instead
  of a flat Property dropdown, and its "Property" column was relabeled
  "Location" (`units.colProperty` in the dictionary, value changed, key
  kept) to show `unitLocationLabel`.
- Navigation (`src/app/(app)/layout.tsx`): added **Compounds**, **Buildings**,
  **Floors** nav items (Units already existed), filtered by the same
  `can()`-based visibility check as every other nav item.

## 6. Dashboard and Reports

- **Dashboard** (`getDashboardStats()` in `src/lib/actions/dashboard.ts`):
  added `totalCompounds`, `totalBuildings`, `totalFloors` (simple counts)
  and `occupancyByCompound` (an array of `{ compoundId, name, arabicName,
  occupied, total, occupancyRate }`, computed by grouping every unit by its
  `floor.building.compoundId` in application code). Rendered as a new "Total
  Compounds / Total Buildings / Total Floors / Total Units" KPI row plus an
  "Occupancy by Compound" panel.
- **Reports** (`src/lib/actions/reports.ts`, gated by the existing
  `report.view` permission): three new reports -
  `getUnitsByCompoundReport()` (buildings/floors/units per compound),
  `getBuildingsByCompoundReport()` (every building under its compound with
  floor/unit counts), and `getVacancyByCompoundReport()` (vacant unit count
  and vacancy rate per compound) - each with its own page under
  `/reports/units-by-compound`, `/reports/buildings-by-compound`,
  `/reports/vacancy-by-compound`, linked from the reports index.

## 7. Tests (Step 11)

Following this codebase's existing vitest setup (`vitest.config.mts`,
introduced for the RBAC task), two new test files were added:

- `src/lib/unit-location.test.ts` — pure unit tests of `unitLocationLabel`:
  correct locale selection, and the Arabic-locale fallback to the English
  name when a Building/Compound has no Arabic name (exactly what the
  migration's shim data looks like, since shim Compounds/Buildings only
  copy whatever bilingual data the source Property already had).
- `src/lib/actions/property-hierarchy.integration.test.ts` — integration
  tests in the same style as `rbac.integration.test.ts`: calling the real
  `createCompound`/`deleteCompound`/`createBuilding`/`deleteBuilding`/
  `createFloor`/`deleteFloor`/`createUnit` actions with a mocked session,
  asserting that unauthorized roles are rejected **before** any database
  access (proving the reused `property.*`/`unit.*` permission checks are
  actually wired up), and that the inline "create a new unit" branch of
  `createContract` still enforces `unit.create` after being updated from
  `propertyId` to `floorId`.

These tests don't hit a real database (same limitation as the existing
RBAC integration tests - there's no test database configured), so
"existing units migrate correctly" and "old contracts continue working"
were verified directly against the local dev Postgres database instead:
after applying the migration, every pre-existing Unit was confirmed (via
direct Prisma queries) to have a valid `floorId` pointing at the correct
shim Compound/Building/Floor, its `floorLabel` correctly carrying over the
old free-text floor value, and its Contracts/Schedules/Invoices completely
untouched. Cross-org isolation for the new models follows automatically
from the same mechanism used everywhere else in this codebase: every
Compound/Building/Floor query filters by the `organizationId` returned
from `requirePermission()`, which is read from the signed session JWT -
never from client input - exactly like every other model.

## 8. Entity-relationship diagram (textual)

```
Organization 1───* Compound 1───* Building 1───* Floor 1───* Unit
                                                              │
                                              (optional, legacy)
                                                              │
Organization 1───* Property (deprecated) 1───────────────────┘
                                          (Unit.propertyId, now optional)

Unit *───1 Floor          (new, required)
Unit *───0..1 Property    (legacy, optional - kept for backward compatibility)
```

## 9. Backward compatibility / deprecation plan

- `Property` remains a fully functional model - the `/properties` page,
  `listProperties()`, `createProperty()`, `deleteProperty()` are all
  unchanged and still work.
- `Unit.propertyId`/`Unit.property` remain readable and writable at the
  schema level, but the **Units page's create form and the Contracts
  page's inline unit-creation flow no longer offer a Property picker** -
  new units are always created via Compound → Building → Floor. This means
  `propertyId` will simply stay `null` on every unit created from now on;
  existing units keep whatever `propertyId` they already had.
- **Future removal path** (not part of this migration, out of scope per
  the brief): once every remaining direct consumer of `Unit.property` is
  confirmed unused in production (there are currently none left in the
  app - every display site was migrated to `unitLocationLabel` /
  `floor.building.compound`), a follow-up migration could drop
  `Property`/`Unit.propertyId` entirely. Until then they're inert legacy
  data, not a maintenance burden, and required no code changes beyond
  making the relation optional.

## 10. Explicitly out of scope

Per the brief's own "STOP" list, this migration does **not** touch:
Owners, CRM, Maintenance, or a Tenant Portal. It also does not modify RBAC,
financial logic, invoicing, payments, VAT, or ZATCA - the only invoicing-
adjacent change is a null-safe fallback in
`src/lib/actions/invoices.ts` (`invoiceLinePropertyNames()`) so that an
invoice line's human-readable *description text* ("Rent - X / Unit Y")
still renders correctly for a unit that has no legacy `Property` - this
touches no amount, VAT rate, or tax calculation.
