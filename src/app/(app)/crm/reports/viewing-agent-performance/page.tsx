import { getAgentViewingPerformanceReport } from "@/lib/actions/viewing-reports";
import { getLocale, getDictionary } from "@/lib/i18n";
import { PrintButton } from "@/components/print-button";

export default async function ViewingAgentPerformanceReportPage() {
  const [rows, locale] = await Promise.all([getAgentViewingPerformanceReport(), getLocale()]);
  const t = getDictionary(locale);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between no-print">
        <h1 className="text-2xl font-bold text-slate-900">{t.viewing.reportAgentPerformance}</h1>
        <PrintButton label={t.printButton} />
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-500 text-right">
            <tr>
              <th className="px-5 py-3 font-medium">{t.crm.colAgent}</th>
              <th className="px-5 py-3 font-medium">{t.viewing.colScheduled}</th>
              <th className="px-5 py-3 font-medium">{t.viewing.colCompleted}</th>
              <th className="px-5 py-3 font-medium">{t.viewing.colCancelledCount}</th>
              <th className="px-5 py-3 font-medium">{t.viewing.colNoShowCount}</th>
              <th className="px-5 py-3 font-medium">{t.viewing.colInterested}</th>
              <th className="px-5 py-3 font-medium">{t.viewing.colOfferRequested}</th>
              <th className="px-5 py-3 font-medium">{t.viewing.colCompletionPercent}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((r) => (
              <tr key={r.userId}>
                <td className="px-5 py-3 text-slate-700">{r.name}</td>
                <td className="px-5 py-3">{r.scheduled}</td>
                <td className="px-5 py-3 text-emerald-700">{r.completed}</td>
                <td className="px-5 py-3 text-red-600">{r.cancelled}</td>
                <td className="px-5 py-3 text-red-600">{r.noShow}</td>
                <td className="px-5 py-3">{r.interested}</td>
                <td className="px-5 py-3">{r.offerRequested}</td>
                <td className="px-5 py-3 font-semibold">{r.completionPercent}%</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={8} className="px-5 py-8 text-center text-slate-400">
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
