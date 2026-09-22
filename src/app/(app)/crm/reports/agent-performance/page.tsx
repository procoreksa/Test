import { getAgentPerformanceReport } from "@/lib/actions/crm";
import { getLocale, getDictionary } from "@/lib/i18n";
import { PrintButton } from "@/components/print-button";

export default async function AgentPerformanceReportPage() {
  const [rows, locale] = await Promise.all([getAgentPerformanceReport(), getLocale()]);
  const t = getDictionary(locale);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between no-print">
        <h1 className="text-2xl font-bold text-slate-900">{t.crm.reportAgentPerformance}</h1>
        <PrintButton label={t.printButton} />
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-500 text-right">
            <tr>
              <th className="px-5 py-3 font-medium">{t.crm.colAgent}</th>
              <th className="px-5 py-3 font-medium">{t.crm.colAssigned}</th>
              <th className="px-5 py-3 font-medium">{t.crm.colWon}</th>
              <th className="px-5 py-3 font-medium">{t.crm.colLost}</th>
              <th className="px-5 py-3 font-medium">{t.crm.colConversionRate}</th>
              <th className="px-5 py-3 font-medium">{t.crm.colFollowUpsCompleted}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((r) => (
              <tr key={r.userId}>
                <td className="px-5 py-3 text-slate-700">{r.name}</td>
                <td className="px-5 py-3">{r.assigned}</td>
                <td className="px-5 py-3 text-emerald-700">{r.won}</td>
                <td className="px-5 py-3 text-red-600">{r.lost}</td>
                <td className="px-5 py-3 font-semibold">{r.conversionRate}%</td>
                <td className="px-5 py-3">{r.followUpsCompleted}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={6} className="px-5 py-8 text-center text-slate-400">
                  {t.crm.empty}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
