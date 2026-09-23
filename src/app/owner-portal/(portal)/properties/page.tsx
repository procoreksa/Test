import Link from "next/link";
import { getOwnerPortalProperties } from "@/lib/actions/owner-portal/portfolio";
import { getLocale, getDictionary, pickLocalized } from "@/lib/i18n";

export default async function OwnerPortalPropertiesPage() {
  const [properties, locale] = await Promise.all([getOwnerPortalProperties(), getLocale()]);
  const t = getDictionary(locale);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">{t.ownerPortal.propertiesTitle}</h1>
        <p className="text-slate-500 text-sm mt-1">{t.ownerPortal.propertiesSubtitle}</p>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-500 text-right">
            <tr>
              <th className="px-4 py-3 font-medium">{t.ownerPortal.colCompound}</th>
              <th className="px-4 py-3 font-medium">{t.ownerPortal.colBuilding}</th>
              <th className="px-4 py-3 font-medium">{t.ownerPortal.colUnits}</th>
              <th className="px-4 py-3 font-medium">{t.ownerPortal.cardOccupied}</th>
              <th className="px-4 py-3 font-medium">{t.ownerPortal.cardVacant}</th>
              <th className="px-4 py-3 font-medium">{t.ownerPortal.cardOccupancyRate}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {properties.map((p) => (
              <tr key={p.compoundId}>
                <td className="px-4 py-3 font-medium text-slate-800 whitespace-nowrap">
                  <Link href={`/owner-portal/properties/${p.compoundId}`} className="hover:underline">
                    {pickLocalized(locale, p.compoundArabicName, p.compoundName)}
                  </Link>
                </td>
                <td className="px-4 py-3 text-slate-500">{p.buildingCount}</td>
                <td className="px-4 py-3 text-slate-500">{p.unitCount}</td>
                <td className="px-4 py-3 text-slate-500">{p.occupied}</td>
                <td className="px-4 py-3 text-slate-500">{p.vacant}</td>
                <td className="px-4 py-3 text-slate-500">{p.occupancyRate}%</td>
              </tr>
            ))}
            {properties.length === 0 && (
              <tr>
                <td colSpan={6} className="px-5 py-8 text-center text-slate-400">
                  {t.ownerPortal.emptyProperties}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
