import { listUnits, createUnit, deleteUnit } from "@/lib/actions/units";
import { listProperties } from "@/lib/actions/properties";
import { getCurrentUserRole } from "@/lib/session";
import { can } from "@/lib/permissions";
import { getLocale, getDictionary, currencyFormatter, pickLocalized } from "@/lib/i18n";

const statusTone: Record<string, string> = {
  VACANT: "bg-slate-100 text-slate-600",
  OCCUPIED: "bg-emerald-100 text-emerald-700",
  MAINTENANCE: "bg-amber-100 text-amber-700",
};

export default async function UnitsPage() {
  const [units, properties, locale, role] = await Promise.all([listUnits(), listProperties(), getLocale(), getCurrentUserRole()]);
  const t = getDictionary(locale);
  const sar = currencyFormatter(locale);
  const canCreate = can("unit.create", role);
  const canDelete = can("unit.delete", role);

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
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">{t.units.fieldProperty}</label>
              <select name="propertyId" required className="w-full rounded-lg border border-slate-300 px-3 py-2">
                {properties.map((p) => (
                  <option key={p.id} value={p.id}>
                    {pickLocalized(locale, p.nameAr, p.name)}
                  </option>
                ))}
              </select>
            </div>
            <Field label={t.units.fieldUnitNumber} name="unitNumber" required />
            <Field label={t.units.fieldFloor} name="floor" />
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

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
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
                <td className="px-5 py-3 text-slate-500">{pickLocalized(locale, u.property.nameAr, u.property.name)}</td>
                <td className="px-5 py-3">{t.unitType[u.unitType]}</td>
                <td className="px-5 py-3">{sar.format(Number(u.baseRentAmount))}</td>
                <td className="px-5 py-3">
                  <span className={`px-2 py-1 rounded-full text-xs font-medium ${statusTone[u.status]}`}>
                    {t.unitStatus[u.status]}
                  </span>
                </td>
                <td className="px-5 py-3 text-slate-500">
                  {u.contracts[0] ? pickLocalized(locale, u.contracts[0].renter.fullNameAr, u.contracts[0].renter.fullName) : t.common.none}
                </td>
                <td className="px-5 py-3 text-left">
                  {canDelete && (
                    <form
                      action={async () => {
                        "use server";
                        await deleteUnit(u.id);
                      }}
                    >
                      <button className="text-red-500 hover:underline text-xs">{t.units.delete}</button>
                    </form>
                  )}
                </td>
              </tr>
            ))}
            {units.length === 0 && (
              <tr>
                <td colSpan={7} className="px-5 py-8 text-center text-slate-400">
                  {t.units.empty}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
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
