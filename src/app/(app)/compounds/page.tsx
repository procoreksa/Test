import { listCompounds, createCompound, deleteCompound } from "@/lib/actions/compounds";
import { getCurrentUserRole } from "@/lib/session";
import { can } from "@/lib/permissions";
import { getLocale, getDictionary, pickLocalized } from "@/lib/i18n";

export default async function CompoundsPage() {
  const [compounds, locale, role] = await Promise.all([listCompounds(), getLocale(), getCurrentUserRole()]);
  const t = getDictionary(locale);
  const canCreate = can("property.create", role);
  const canDelete = can("property.delete", role);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">{t.compounds.title}</h1>
        <p className="text-slate-500 text-sm mt-1">{t.compounds.subtitle}</p>
      </div>

      {canCreate && (
        <details className="bg-white rounded-xl border border-slate-200 shadow-sm group">
          <summary className="cursor-pointer list-none px-5 py-4 font-semibold text-slate-800 flex items-center justify-between">
            {t.compounds.addNew}
            <span className="text-brand-gold-dark group-open:rotate-45 transition-transform text-xl">+</span>
          </summary>
          <form action={createCompound} className="px-5 pb-5 grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field label={t.compounds.fieldName} name="name" required />
            <Field label={t.compounds.fieldArabicName} name="arabicName" />
            <Field label={t.compounds.fieldCity} name="city" />
            <Field label={t.compounds.fieldAddress} name="address" />
            <Field label={t.compounds.fieldLocation} name="location" />
            <Field label={t.compounds.fieldLatitude} name="latitude" type="number" step="0.0000001" />
            <Field label={t.compounds.fieldLongitude} name="longitude" type="number" step="0.0000001" />
            <Field label={t.compounds.fieldOwnerName} name="ownerName" />
            <Field label={t.compounds.fieldManagerName} name="managerName" />
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">{t.compounds.fieldStatus}</label>
              <select name="status" className="w-full rounded-lg border border-slate-300 px-3 py-2">
                <option value="PLANNING">{t.compoundStatus.PLANNING}</option>
                <option value="UNDER_CONSTRUCTION">{t.compoundStatus.UNDER_CONSTRUCTION}</option>
                <option value="ACTIVE">{t.compoundStatus.ACTIVE}</option>
                <option value="INACTIVE">{t.compoundStatus.INACTIVE}</option>
              </select>
            </div>
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-slate-700 mb-1">{t.compounds.fieldDescription}</label>
              <textarea name="description" rows={2} className="w-full rounded-lg border border-slate-300 px-3 py-2" />
            </div>
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-slate-700 mb-1">{t.compounds.fieldAmenities}</label>
              <textarea name="amenities" rows={2} className="w-full rounded-lg border border-slate-300 px-3 py-2" />
            </div>
            <div className="md:col-span-2">
              <button className="bg-brand-gold hover:bg-brand-gold-dark text-brand-black rounded-lg px-5 py-2.5 font-semibold">
                {t.compounds.save}
              </button>
            </div>
          </form>
        </details>
      )}

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-500 text-right">
            <tr>
              <th className="px-5 py-3 font-medium">{t.compounds.colName}</th>
              <th className="px-5 py-3 font-medium">{t.compounds.colCity}</th>
              <th className="px-5 py-3 font-medium">{t.compounds.colBuildings}</th>
              <th className="px-5 py-3 font-medium">{t.compounds.colFloors}</th>
              <th className="px-5 py-3 font-medium">{t.compounds.colUnits}</th>
              <th className="px-5 py-3 font-medium">{t.compounds.colStatus}</th>
              <th className="px-5 py-3 font-medium"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {compounds.map((c) => (
              <tr key={c.id}>
                <td className="px-5 py-3 font-medium text-slate-800">{pickLocalized(locale, c.arabicName, c.name)}</td>
                <td className="px-5 py-3 text-slate-500">{c.city ?? t.common.none}</td>
                <td className="px-5 py-3">{c.liveTotalBuildings}</td>
                <td className="px-5 py-3">{c.liveTotalFloors}</td>
                <td className="px-5 py-3">{c.liveTotalUnits}</td>
                <td className="px-5 py-3">
                  <span className="px-2 py-1 rounded-full text-xs font-medium bg-emerald-100 text-emerald-700">
                    {t.compoundStatus[c.status]}
                  </span>
                </td>
                <td className="px-5 py-3 text-left">
                  {canDelete && (
                    <form
                      action={async () => {
                        "use server";
                        await deleteCompound(c.id);
                      }}
                    >
                      <button className="text-red-500 hover:underline text-xs">{t.compounds.delete}</button>
                    </form>
                  )}
                </td>
              </tr>
            ))}
            {compounds.length === 0 && (
              <tr>
                <td colSpan={7} className="px-5 py-8 text-center text-slate-400">
                  {t.compounds.empty}
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
