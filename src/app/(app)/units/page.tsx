import Link from "next/link";
import { listUnits, createUnit, deleteUnit } from "@/lib/actions/units";
import { getLocationTree } from "@/lib/actions/floors";
import { getUnitViewingCounts } from "@/lib/actions/viewings";
import { getActiveReservationsForUnits } from "@/lib/actions/reservations";
import { getMoveInStatusForUnits } from "@/lib/actions/move-ins";
import { getMoveOutStatusForUnits } from "@/lib/actions/move-outs";
import { getCorporateAllocationStatusForUnits } from "@/lib/actions/corporate-allocations";
import { getCurrentUserRole } from "@/lib/session";
import { can } from "@/lib/permissions";
import { getLocale, getDictionary, currencyFormatter, shortDateFormatter, pickLocalized } from "@/lib/i18n";
import { unitLocationLabel } from "@/lib/unit-location";
import { CascadingLocationPicker } from "@/components/cascading-location-picker";
import { DeleteEntityButton } from "@/components/delete-entity-button";

const statusTone: Record<string, string> = {
  VACANT: "bg-slate-100 text-slate-600",
  OCCUPIED: "bg-emerald-100 text-emerald-700",
  MAINTENANCE: "bg-amber-100 text-amber-700",
  RESERVED: "bg-brand-gold/20 text-brand-gold-dark",
};

export default async function UnitsPage() {
  const [units, locationTree, locale, role] = await Promise.all([listUnits(), getLocationTree(), getLocale(), getCurrentUserRole()]);
  const t = getDictionary(locale);
  const sar = currencyFormatter(locale);
  const dateFmt = shortDateFormatter(locale);
  const canCreate = can("unit.create", role);
  const canDelete = can("unit.delete", role);
  const canViewViewings = can("viewing.view", role);
  const canViewReservations = can("reservation.view", role);
  const canViewMoveIns = can("moveIn.view", role);
  const canViewMoveOuts = can("moveOut.view", role);
  const canViewCorporateHousing = can("corporateHousing.view", role);
  const viewingCounts = canViewViewings ? await getUnitViewingCounts(units.map((u) => u.id)) : new Map<string, number>();
  const reservationsByUnit = canViewReservations ? await getActiveReservationsForUnits(units.map((u) => u.id)) : new Map();
  const moveInByUnit: Awaited<ReturnType<typeof getMoveInStatusForUnits>> = canViewMoveIns ? await getMoveInStatusForUnits(units.map((u) => u.id)) : new Map();
  const moveOutByUnit: Awaited<ReturnType<typeof getMoveOutStatusForUnits>> = canViewMoveOuts ? await getMoveOutStatusForUnits(units.map((u) => u.id)) : new Map();
  const corporateAllocationByUnit: Awaited<ReturnType<typeof getCorporateAllocationStatusForUnits>> = canViewCorporateHousing
    ? await getCorporateAllocationStatusForUnits(units.map((u) => u.id))
    : new Map();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">{t.units.title}</h1>
        <p className="text-slate-500 text-sm mt-1">{t.units.subtitle}</p>
      </div>

      {canCreate && (
        <details className="bg-white rounded-xl border border-slate-200 shadow-sm group">
          <summary className="cursor-pointer list-none px-5 py-4 font-semibold text-slate-800 flex items-center justify-between">
            {t.units.addNew}
            <span className="text-brand-gold-dark group-open:rotate-45 transition-transform text-xl">+</span>
          </summary>
          <form action={createUnit} className="px-5 pb-5 grid grid-cols-1 md:grid-cols-3 gap-4">
            <CascadingLocationPicker
              compounds={locationTree}
              locale={locale}
              fieldName="floorId"
              labels={{
                compound: t.locationPicker.compound,
                building: t.locationPicker.building,
                floor: t.locationPicker.floor,
              }}
            />
            <Field label={t.units.fieldUnitNumber} name="unitNumber" required />
            <Field label={t.units.fieldFloor} name="floorLabel" />
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">{t.units.fieldUnitType}</label>
              <select name="unitType" className="w-full rounded-lg border border-slate-300 px-3 py-2">
                {(Object.keys(t.unitType) as Array<keyof typeof t.unitType>).map((value) => (
                  <option key={value} value={value}>
                    {t.unitType[value]}
                  </option>
                ))}
              </select>
            </div>
            <Field label={t.units.fieldArea} name="areaSqm" type="number" step="0.01" />
            <Field label={t.units.fieldBedrooms} name="bedrooms" type="number" />
            <Field label={t.units.fieldBathrooms} name="bathrooms" type="number" />
            <Field label={t.units.fieldBaseRent} name="baseRentAmount" type="number" step="0.01" required />
            <label className="flex items-center gap-2 mt-6 text-sm text-slate-600">
              <input type="checkbox" name="vatApplicable" className="rounded border-slate-300" />
              {t.units.fieldVatApplicable}
            </label>
            <div className="md:col-span-3">
              <button className="bg-brand-gold hover:bg-brand-gold-dark text-brand-black rounded-lg px-5 py-2.5 font-semibold">
                {t.units.save}
              </button>
            </div>
          </form>
        </details>
      )}

      {units.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-8 text-center text-slate-400">
          {t.units.empty}
        </div>
      ) : (
        <>
          {/* Desktop/tablet: full table. Hidden below md - a 6+ column row
              cannot be shrunk to fit a phone screen without becoming
              unreadable, so mobile gets its own card layout below instead
              of a squeezed version of this table. */}
          <div className="hidden md:block bg-white rounded-xl border border-slate-200 shadow-sm overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-slate-500 text-right">
                <tr>
                  <th className="px-5 py-3 font-medium">{t.units.colUnit}</th>
                  <th className="px-5 py-3 font-medium">{t.units.colProperty}</th>
                  <th className="px-5 py-3 font-medium">{t.units.colType}</th>
                  <th className="px-5 py-3 font-medium">{t.units.colBaseRent}</th>
                  <th className="px-5 py-3 font-medium">{t.units.colStatus}</th>
                  <th className="px-5 py-3 font-medium">{t.units.colCurrentRenter}</th>
                  <th className="px-5 py-3 font-medium"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {units.map((u) => (
                  <tr key={u.id}>
                    <td className="px-5 py-3 font-medium text-slate-800">{u.unitNumber}</td>
                    <td className="px-5 py-3 text-slate-500">{unitLocationLabel(locale, u)}</td>
                    <td className="px-5 py-3">{t.unitType[u.unitType]}</td>
                    <td className="px-5 py-3">{sar.format(Number(u.baseRentAmount))}</td>
                    <td className="px-5 py-3">
                      <UnitStatusInfo
                        unit={u}
                        t={t}
                        dateFmt={dateFmt}
                        reservationsByUnit={reservationsByUnit}
                        canViewCorporateHousing={canViewCorporateHousing}
                        corporateAllocationByUnit={corporateAllocationByUnit}
                      />
                    </td>
                    <td className="px-5 py-3 text-slate-500">
                      <UnitRenterInfo
                        unit={u}
                        t={t}
                        locale={locale}
                        canViewMoveIns={canViewMoveIns}
                        moveInByUnit={moveInByUnit}
                        canViewMoveOuts={canViewMoveOuts}
                        moveOutByUnit={moveOutByUnit}
                      />
                    </td>
                    <td className="px-5 py-3 text-left space-x-2 rtl:space-x-reverse">
                      <UnitRowActions
                        unit={u}
                        t={t}
                        canViewViewings={canViewViewings}
                        viewingCounts={viewingCounts}
                        canDelete={canDelete}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile: one card per unit, most important information first
              (unit number + status, then location/type/rent, then
              renter/operational sub-status, then actions). Every value
              wraps/truncates intentionally so the whole card always fits
              the viewport - see docs/MOBILE-RESPONSIVE.md. */}
          <div className="md:hidden space-y-3">
            {units.map((u) => (
              <div key={u.id} className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold text-slate-900 truncate">{u.unitNumber}</p>
                    <p className="text-xs text-slate-500 mt-0.5 break-words">{unitLocationLabel(locale, u)}</p>
                  </div>
                  <span className={`shrink-0 px-2 py-1 rounded-full text-xs font-medium whitespace-nowrap ${statusTone[u.status]}`}>
                    {t.unitStatus[u.status]}
                  </span>
                </div>

                <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 text-sm">
                  <div className="min-w-0">
                    <dt className="text-xs text-slate-400">{t.units.colType}</dt>
                    <dd className="text-slate-700 truncate">{t.unitType[u.unitType]}</dd>
                  </div>
                  <div className="min-w-0">
                    <dt className="text-xs text-slate-400">{t.units.colBaseRent}</dt>
                    <dd className="text-slate-700 font-medium truncate">{sar.format(Number(u.baseRentAmount))}</dd>
                  </div>
                </dl>

                <div className="mt-2 text-xs">
                  <UnitStatusInfo
                    unit={u}
                    t={t}
                    dateFmt={dateFmt}
                    reservationsByUnit={reservationsByUnit}
                    canViewCorporateHousing={canViewCorporateHousing}
                    corporateAllocationByUnit={corporateAllocationByUnit}
                    statusPillAlreadyShown
                  />
                </div>

                <div className="mt-2 text-xs text-slate-500 break-words">
                  <span className="text-slate-400">{t.units.colCurrentRenter}: </span>
                  <UnitRenterInfo
                    unit={u}
                    t={t}
                    locale={locale}
                    canViewMoveIns={canViewMoveIns}
                    moveInByUnit={moveInByUnit}
                    canViewMoveOuts={canViewMoveOuts}
                    moveOutByUnit={moveOutByUnit}
                  />
                </div>

                <div className="mt-3 pt-3 border-t border-slate-100 flex flex-wrap items-center gap-x-4 gap-y-2">
                  <UnitRowActions
                    unit={u}
                    t={t}
                    canViewViewings={canViewViewings}
                    viewingCounts={viewingCounts}
                    canDelete={canDelete}
                  />
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

type UnitRow = Awaited<ReturnType<typeof listUnits>>[number];

/** Status pill + reservation/corporate-housing sub-info - shared between
 * the desktop table cell and the mobile card so the two presentations can
 * never drift out of sync with each other. */
function UnitStatusInfo({
  unit,
  t,
  dateFmt,
  reservationsByUnit,
  canViewCorporateHousing,
  corporateAllocationByUnit,
  statusPillAlreadyShown,
}: {
  unit: UnitRow;
  t: ReturnType<typeof getDictionary>;
  dateFmt: Intl.DateTimeFormat;
  reservationsByUnit: Awaited<ReturnType<typeof getActiveReservationsForUnits>>;
  canViewCorporateHousing: boolean;
  corporateAllocationByUnit: Awaited<ReturnType<typeof getCorporateAllocationStatusForUnits>>;
  statusPillAlreadyShown?: boolean;
}) {
  const reservation = reservationsByUnit.get(unit.id);
  const allocation = corporateAllocationByUnit.get(unit.id);
  return (
    <>
      {!statusPillAlreadyShown && (
        <span className={`px-2 py-1 rounded-full text-xs font-medium ${statusTone[unit.status]}`}>{t.unitStatus[unit.status]}</span>
      )}
      {unit.status === "RESERVED" && reservation && (
        <p className="text-slate-400 mt-1 break-words">
          {reservation.reservationNumber} · {t.reservation.unitHoldUntilLabel} {dateFmt.format(reservation.holdUntil)}
        </p>
      )}
      {canViewCorporateHousing && allocation && (
        <div className="mt-1">
          <Link href={`/corporate-housing/allocations/${allocation.allocationId}`} className="text-brand-gold-dark hover:underline break-words">
            {t.corporateHousing.unitIntegrationTitle}: {allocation.allocationNumber}
          </Link>
        </div>
      )}
    </>
  );
}

/** Current renter name + move-in/move-out sub-status - shared between the
 * desktop table cell and the mobile card. */
function UnitRenterInfo({
  unit,
  t,
  locale,
  canViewMoveIns,
  moveInByUnit,
  canViewMoveOuts,
  moveOutByUnit,
}: {
  unit: UnitRow;
  t: ReturnType<typeof getDictionary>;
  locale: Awaited<ReturnType<typeof getLocale>>;
  canViewMoveIns: boolean;
  moveInByUnit: Awaited<ReturnType<typeof getMoveInStatusForUnits>>;
  canViewMoveOuts: boolean;
  moveOutByUnit: Awaited<ReturnType<typeof getMoveOutStatusForUnits>>;
}) {
  const moveIn = moveInByUnit.get(unit.id);
  const moveOut = moveOutByUnit.get(unit.id);
  return (
    <>
      {unit.contracts[0] ? pickLocalized(locale, unit.contracts[0].renter.fullNameAr, unit.contracts[0].renter.fullName) : t.common.none}
      {canViewMoveIns && unit.status === "OCCUPIED" && (
        <div className="mt-1">
          {moveIn ? (
            <Link href={`/operations/move-ins/${moveIn.moveInId}`} className="text-brand-gold-dark hover:underline break-words">
              {t.moveIn.contractStatusLabel}: {t.moveInStatus[moveIn.status]}
            </Link>
          ) : (
            <span className="text-slate-400">{t.moveIn.noMoveInYet}</span>
          )}
        </div>
      )}
      {canViewMoveOuts && unit.status === "OCCUPIED" && moveOut && (
        <div className="mt-1">
          <Link href={`/operations/move-outs/${moveOut.moveOutId}`} className="text-brand-gold-dark hover:underline break-words">
            {t.moveOut.contractStatusLabel}: {t.moveOutStatus[moveOut.status]}
          </Link>
        </div>
      )}
    </>
  );
}

/** Row/card actions (ownership, viewings, delete) - shared between the
 * desktop table cell and the mobile card. */
function UnitRowActions({
  unit,
  t,
  canViewViewings,
  viewingCounts,
  canDelete,
}: {
  unit: UnitRow;
  t: ReturnType<typeof getDictionary>;
  canViewViewings: boolean;
  viewingCounts: Map<string, number>;
  canDelete: boolean;
}) {
  return (
    <>
      <Link href={`/units/${unit.id}/ownership`} className="text-brand-gold-dark hover:underline text-xs font-medium">
        {t.ownership.title}
      </Link>
      {canViewViewings && (
        <Link href={`/crm/viewings?unitId=${unit.id}`} className="text-brand-gold-dark hover:underline text-xs font-medium">
          {t.viewing.unitViewingsLink} ({viewingCounts.get(unit.id) ?? 0})
        </Link>
      )}
      {canDelete && <DeleteEntityButton id={unit.id} action={deleteUnit} label={t.units.delete} />}
    </>
  );
}

function Field({
  label,
  name,
  required,
  type = "text",
  step,
}: {
  label: string;
  name: string;
  required?: boolean;
  type?: string;
  step?: string;
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-slate-700 mb-1">{label}</label>
      <input
        name={name}
        type={type}
        step={step}
        required={required}
        className="w-full rounded-lg border border-slate-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-gold"
      />
    </div>
  );
}
