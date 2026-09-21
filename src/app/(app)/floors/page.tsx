import { listFloors, createFloor, deleteFloor } from "@/lib/actions/floors";
import { listBuildings } from "@/lib/actions/buildings";
import { getCurrentUserRole } from "@/lib/session";
import { can } from "@/lib/permissions";
import { getLocale, getDictionary, pickLocalized } from "@/lib/i18n";

export default async function FloorsPage() {
  const [floors, buildings, locale, role] = await Promise.all([
    listFloors(),
    listBuildings(),
    getLocale(),
    getCurrentUserRole(),
  ]);
  const t = getDictionary(locale);
  const canCreate = can("unit.create", role);
  const canDelete = can("unit.delete", role);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">{t.floors.title}</h1>
        <p className="text-slate-500 text-sm mt-1">{t.floors.subtitle}</p>
      </div>

      {canCreate && (
        <details className="bg-white rounded-xl border border-slate-200 shadow-sm group">
          <summary className="cursor-pointer list-none px-5 py-4 font-semibold text-slate-800 flex items-center justify-between">
            {t.floors.addNew}
            <span className="text-brand-gold-dark group-open:rotate-45 transition-transform text-xl">+</span>
          </summary>
          <form action={createFloor} className="px-5 pb-5 grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">{t.floors.fieldBuilding}</label>
              <select name="buildingId" required className="w-full rounded-lg border border-slate-300 px-3 py-2">
                {buildings.map((b) => (
                  <option key={b.id} value={b.id}>
                    {pickLocalized(locale, b.nameAr, b.name)} ({pickLocalized(locale, b.compound.arabicName, b.compound.name)})
                  </option>
                ))}
              </select>
            </div>
            <Field label={t.floors.fieldFloorNumber} name="floorNumber" type="number" required />
            <Field label={t.floors.fieldName} name="name" />
            <Field label={t.floors.fieldNameAr} name="nameAr" />
            <div className="md:col-span-3">
              <button className="bg-brand-gold hover:bg-brand-gold-dark text-brand-black rounded-lg px-5 py-2.5 font-semibold">
                {t.floors.save}
              </button>
            </div>
          </form>
        </details>
      )}

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-500 text-right">
            <tr>
              <th className="px-5 py-3 font-medium">{t.floors.colName}</th>
              <th className="px-5 py-3 font-medium">{t.floors.colBuilding}</th>
              <th className="px-5 py-3 font-medium">{t.floors.colCompound}</th>
              <th className="px-5 py-3 font-medium">{t.floors.colUnits}</th>
              <th className="px-5 py-3 font-medium"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {floors.map((f) => (
              <tr key={f.id}>
                <td className="px-5 py-3 font-medium text-slate-800">
                  {pickLocalized(locale, f.nameAr, f.name ?? String(f.floorNumber))}
                </td>
                <td className="px-5 py-3 text-slate-500">{pickLocalized(locale, f.building.nameAr, f.building.name)}</td>
                <td className="px-5 py-3 text-slate-500">
                  {pickLocalized(locale, f.building.compound.arabicName, f.building.compound.name)}
                </td>
                <td className="px-5 py-3">{f._count.units}</td>
                <td className="px-5 py-3 text-left">
                  {canDelete && (
                    <form
                      action={async () => {
                        "use server";
                        await deleteFloor(f.id);
                      }}
                    >
                      <button className="text-red-500 hover:underline text-xs">{t.floors.delete}</button>
                    </form>
                  )}
                </td>
              </tr>
            ))}
            {floors.length === 0 && (
              <tr>
                <td colSpan={5} className="px-5 py-8 text-center text-slate-400">
                  {t.floors.empty}
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
}: {
  label: string;
  name: string;
  required?: boolean;
  type?: string;
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-slate-700 mb-1">{label}</label>
      <input
        name={name}
        type={type}
        required={required}
        className="w-full rounded-lg border border-slate-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-gold"
      />
    </div>
  );
}
