import Link from "next/link";
import { getOwnerPortalPropertyDetail } from "@/lib/actions/owner-portal/portfolio";
import { getLocale, getDictionary, pickLocalized } from "@/lib/i18n";

export default async function OwnerPortalPropertyDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [detail, locale] = await Promise.all([getOwnerPortalPropertyDetail(id), getLocale()]);
  const t = getDictionary(locale);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">{pickLocalized(locale, detail.compoundArabicName, detail.compoundName)}</h1>
        <p className="text-slate-500 text-sm mt-1">{t.ownerPortal.propertyDetailTitle}</p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
          <p className="text-slate-500 text-xs">{t.ownerPortal.colUnits}</p>
          <p className="text-lg font-bold mt-1 text-slate-900">{detail.occupancy.total}</p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
          <p className="text-slate-500 text-xs">{t.ownerPortal.cardOccupied}</p>
          <p className="text-lg font-bold mt-1 text-slate-900">{detail.occupancy.occupied}</p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
          <p className="text-slate-500 text-xs">{t.ownerPortal.cardVacant}</p>
          <p className="text-lg font-bold mt-1 text-slate-900">{detail.occupancy.vacant}</p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
          <p className="text-slate-500 text-xs">{t.ownerPortal.cardOccupancyRate}</p>
          <p className="text-lg font-bold mt-1 text-slate-900">{detail.occupancy.occupancyRate}%</p>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-500 text-right">
            <tr>
              <th className="px-4 py-3 font-medium">{t.ownerPortal.colUnit}</th>
              <th className="px-4 py-3 font-medium">{t.ownerPortal.colBuilding}</th>
              <th className="px-4 py-3 font-medium">{t.ownerPortal.colFloor}</th>
              <th className="px-4 py-3 font-medium">{t.ownerPortal.colOccupancyStatus}</th>
              <th className="px-4 py-3 font-medium">{t.ownerPortal.colOwnershipPercentage}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {detail.units.map((u) => (
              <tr key={u.unitId}>
                <td className="px-4 py-3 font-medium text-slate-800 whitespace-nowrap">
                  <Link href={`/owner-portal/units/${u.unitId}`} className="hover:underline">
                    {u.unitNumber}
                  </Link>
                </td>
                <td className="px-4 py-3 text-slate-500">{pickLocalized(locale, u.buildingNameAr, u.buildingName)}</td>
                <td className="px-4 py-3 text-slate-500">{u.floorName ?? "-"}</td>
                <td className="px-4 py-3 text-slate-500">{t.unitStatus[u.status as keyof typeof t.unitStatus]}</td>
                <td className="px-4 py-3 text-slate-500">{Number(u.ownershipPercentage).toFixed(2)}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-slate-400">{t.ownerPortal.ownershipPercentageNotice}</p>
    </div>
  );
}
