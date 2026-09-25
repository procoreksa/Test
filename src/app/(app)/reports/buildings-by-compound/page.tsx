import { getBuildingsByCompoundReport } from "@/lib/actions/reports";
import { getLocale, getDictionary, pickLocalized } from "@/lib/i18n";
import { ReportHeader } from "@/components/report-header";

export default async function BuildingsByCompoundReportPage() {
  const [rows, locale] = await Promise.all([getBuildingsByCompoundReport(), getLocale()]);
  const t = getDictionary(locale);

  return (
    <div className="space-y-6">
      <ReportHeader backLabel={t.reports.backToReports} printLabel={t.printButton} />

      <div>
        <h1 className="text-2xl font-bold text-slate-900">{t.reports.buildingsByCompound.title}</h1>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-500 text-right">
            <tr>
              <th className="px-5 py-3 font-medium">{t.reports.buildingsByCompound.colCompound}</th>
              <th className="px-5 py-3 font-medium">{t.reports.buildingsByCompound.colBuilding}</th>
              <th className="px-5 py-3 font-medium">{t.reports.buildingsByCompound.colFloors}</th>
              <th className="px-5 py-3 font-medium">{t.reports.buildingsByCompound.colUnits}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((r) => (
              <tr key={r.id}>
                <td className="px-5 py-3 text-slate-500">{pickLocalized(locale, r.compoundArabicName, r.compoundName)}</td>
                <td className="px-5 py-3 font-medium text-slate-800">{pickLocalized(locale, r.nameAr, r.name)}</td>
                <td className="px-5 py-3">{r.totalFloors}</td>
                <td className="px-5 py-3">{r.totalUnits}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={4} className="px-5 py-8 text-center text-slate-400">
                  {t.reports.buildingsByCompound.empty}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
