import Link from "next/link";
import { getExecutivePropertiesReport } from "@/lib/actions/executive";
import { getLocale, getDictionary, pickLocalized } from "@/lib/i18n";

export default async function ExecutivePropertiesPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string; compoundId?: string; buildingId?: string }>;
}) {
  const params = await searchParams;
  const [portfolio, locale] = await Promise.all([getExecutivePropertiesReport(params), getLocale()]);
  const t = getDictionary(locale);

  return (
    <div className="space-y-6">
      <div>
        <Link href="/executive" className="text-sm text-slate-500 hover:text-slate-800">
          ← {t.executive.backToOverview}
        </Link>
        <h1 className="text-2xl font-bold text-slate-900 mt-1">{t.executive.propertiesPageTitle}</h1>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-500 text-xs uppercase">
            <tr>
              <th className="px-4 py-3 text-start">{t.executive.colCompound}</th>
              <th className="px-4 py-3 text-start">{t.executive.colTotal}</th>
              <th className="px-4 py-3 text-start">{t.executive.colOccupied}</th>
              <th className="px-4 py-3 text-start">{t.executive.colVacant}</th>
              <th className="px-4 py-3 text-start">{t.executive.colOccupancyRate}</th>
            </tr>
          </thead>
          <tbody>
            {portfolio.byCompound.map((c) => (
              <tr key={c.compoundId} className="border-t border-slate-100">
                <td className="px-4 py-3 font-medium text-slate-800">{pickLocalized(locale, c.arabicName, c.name)}</td>
                <td className="px-4 py-3">{c.total}</td>
                <td className="px-4 py-3">{c.occupied}</td>
                <td className="px-4 py-3">{c.vacant}</td>
                <td className="px-4 py-3">{c.occupancyRate}%</td>
              </tr>
            ))}
            {portfolio.byCompound.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-slate-400">
                  {t.dashboard.occupancyByCompoundEmpty}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-500 text-xs uppercase">
            <tr>
              <th className="px-4 py-3 text-start">{t.executive.colBuilding}</th>
              <th className="px-4 py-3 text-start">{t.executive.colTotal}</th>
              <th className="px-4 py-3 text-start">{t.executive.colOccupied}</th>
              <th className="px-4 py-3 text-start">{t.executive.colVacant}</th>
              <th className="px-4 py-3 text-start">{t.executive.colOccupancyRate}</th>
            </tr>
          </thead>
          <tbody>
            {portfolio.byBuilding.map((b) => (
              <tr key={b.buildingId} className="border-t border-slate-100">
                <td className="px-4 py-3 font-medium text-slate-800">{pickLocalized(locale, b.nameAr, b.name)}</td>
                <td className="px-4 py-3">{b.total}</td>
                <td className="px-4 py-3">{b.occupied}</td>
                <td className="px-4 py-3">{b.vacant}</td>
                <td className="px-4 py-3">{b.occupancyRate}%</td>
              </tr>
            ))}
            {portfolio.byBuilding.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-slate-400">
                  {t.dashboard.occupancyByCompoundEmpty}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
