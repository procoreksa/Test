import Link from "next/link";
import { getOwnerPortalUnits } from "@/lib/actions/owner-portal/portfolio";
import { getLocale, getDictionary, pickLocalized } from "@/lib/i18n";

export default async function OwnerPortalUnitsPage() {
  const [units, locale] = await Promise.all([getOwnerPortalUnits(), getLocale()]);
  const t = getDictionary(locale);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-slate-900">{t.ownerPortal.unitsTitle}</h1>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-500 text-right">
            <tr>
              <th className="px-4 py-3 font-medium">{t.ownerPortal.colUnit}</th>
              <th className="px-4 py-3 font-medium">{t.ownerPortal.colCompound}</th>
              <th className="px-4 py-3 font-medium">{t.ownerPortal.colBuilding}</th>
              <th className="px-4 py-3 font-medium">{t.ownerPortal.colOccupancyStatus}</th>
              <th className="px-4 py-3 font-medium">{t.ownerPortal.colOwnershipPercentage}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {units.map((u) => (
              <tr key={u.unitId}>
                <td className="px-4 py-3 font-medium text-slate-800 whitespace-nowrap">
                  <Link href={`/owner-portal/units/${u.unitId}`} className="hover:underline">
                    {u.unitNumber}
                  </Link>
                </td>
                <td className="px-4 py-3 text-slate-500">{pickLocalized(locale, u.compoundArabicName, u.compoundName)}</td>
                <td className="px-4 py-3 text-slate-500">{pickLocalized(locale, u.buildingNameAr, u.buildingName)}</td>
                <td className="px-4 py-3 text-slate-500">{t.unitStatus[u.status as keyof typeof t.unitStatus]}</td>
                <td className="px-4 py-3 text-slate-500">{Number(u.ownershipPercentage).toFixed(2)}%</td>
              </tr>
            ))}
            {units.length === 0 && (
              <tr>
                <td colSpan={5} className="px-5 py-8 text-center text-slate-400">
                  {t.ownerPortal.emptyUnits}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
