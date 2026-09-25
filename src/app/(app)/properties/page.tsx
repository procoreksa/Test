import { listProperties, createProperty, deleteProperty } from "@/lib/actions/properties";
import { getCurrentUserRole } from "@/lib/session";
import { can } from "@/lib/permissions";
import { getLocale, getDictionary, pickLocalized } from "@/lib/i18n";

export default async function PropertiesPage() {
  const [properties, locale, role] = await Promise.all([listProperties(), getLocale(), getCurrentUserRole()]);
  const t = getDictionary(locale);
  const canCreate = can("property.create", role);
  const canDelete = can("property.delete", role);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{t.properties.title}</h1>
          <p className="text-slate-500 text-sm mt-1">{t.properties.subtitle}</p>
        </div>
      </div>

      {canCreate && (
        <details className="bg-white rounded-xl border border-slate-200 shadow-sm group">
          <summary className="cursor-pointer list-none px-5 py-4 font-semibold text-slate-800 flex items-center justify-between">
            {t.properties.addNew}
            <span className="text-brand-gold-dark group-open:rotate-45 transition-transform text-xl">+</span>
          </summary>
          <form action={createProperty} className="px-5 pb-5 grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field label={t.properties.fieldNameEn} name="name" required />
            <Field label={t.properties.fieldNameAr} name="nameAr" />
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">{t.properties.fieldType}</label>
              <select name="propertyType" className="w-full rounded-lg border border-slate-300 px-3 py-2">
                <option value="RESIDENTIAL">{t.propertyType.RESIDENTIAL}</option>
                <option value="COMMERCIAL">{t.propertyType.COMMERCIAL}</option>
                <option value="MIXED">{t.propertyType.MIXED}</option>
              </select>
            </div>
            <Field label={t.properties.fieldCity} name="city" />
            <Field label={t.properties.fieldDistrict} name="district" />
            <Field label={t.properties.fieldStreet} name="street" />
            <div className="md:col-span-2">
              <button className="bg-brand-gold hover:bg-brand-gold-dark text-brand-black rounded-lg px-5 py-2.5 font-semibold">
                {t.properties.save}
              </button>
            </div>
          </form>
        </details>
      )}

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-500 text-right">
            <tr>
              <th className="px-5 py-3 font-medium">{t.properties.colProperty}</th>
              <th className="px-5 py-3 font-medium">{t.properties.colType}</th>
              <th className="px-5 py-3 font-medium">{t.properties.colLocation}</th>
              <th className="px-5 py-3 font-medium">{t.properties.colUnitsCount}</th>
              <th className="px-5 py-3 font-medium"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {properties.map((p) => (
              <tr key={p.id}>
                <td className="px-5 py-3">
                  <p className="font-medium text-slate-800">{pickLocalized(locale, p.nameAr, p.name)}</p>
                  {locale === "ar" ? (
                    <p className="text-slate-400 text-xs">{p.name}</p>
                  ) : (
                    p.nameAr && <p className="text-slate-400 text-xs">{p.nameAr}</p>
                  )}
                </td>
                <td className="px-5 py-3">{t.propertyType[p.propertyType]}</td>
                <td className="px-5 py-3 text-slate-500">
                  {[p.district, p.city].filter(Boolean).join(locale === "ar" ? "، " : ", ") || t.common.none}
                </td>
                <td className="px-5 py-3">{p.units.length}</td>
                <td className="px-5 py-3 text-left">
                  {canDelete && (
                    <form
                      action={async () => {
                        "use server";
                        await deleteProperty(p.id);
                      }}
                    >
                      <button className="text-red-500 hover:underline text-xs">{t.properties.delete}</button>
                    </form>
                  )}
                </td>
              </tr>
            ))}
            {properties.length === 0 && (
              <tr>
                <td colSpan={5} className="px-5 py-8 text-center text-slate-400">
                  {t.properties.empty}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Field({ label, name, required }: { label: string; name: string; required?: boolean }) {
  return (
    <div>
      <label className="block text-sm font-medium text-slate-700 mb-1">{label}</label>
      <input
        name={name}
        required={required}
        className="w-full rounded-lg border border-slate-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-gold"
      />
    </div>
  );
}
