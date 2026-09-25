import { getMostViewedCompoundsReport } from "@/lib/actions/viewing-reports";
import { getLocale, getDictionary, pickLocalized } from "@/lib/i18n";
import { PrintButton } from "@/components/print-button";

export default async function MostViewedCompoundsReportPage() {
  const [rows, locale] = await Promise.all([getMostViewedCompoundsReport(), getLocale()]);
  const t = getDictionary(locale);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between no-print">
        <h1 className="text-2xl font-bold text-slate-900">{t.viewing.reportMostViewedCompounds}</h1>
        <PrintButton label={t.printButton} />
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-500 text-right">
            <tr>
              <th className="px-5 py-3 font-medium">{t.viewing.colCompound}</th>
              <th className="px-5 py-3 font-medium">{t.viewing.colViewCount}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((r) => (
              <tr key={r.compoundId}>
                <td className="px-5 py-3 font-medium text-slate-800">{pickLocalized(locale, r.arabicName, r.name)}</td>
                <td className="px-5 py-3 font-semibold text-slate-800">{r.count}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={2} className="px-5 py-8 text-center text-slate-400">
                  {t.viewing.empty}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
