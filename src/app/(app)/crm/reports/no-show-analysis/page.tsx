import { getNoShowAnalysisReport } from "@/lib/actions/viewing-reports";
import { getLocale, getDictionary, longDateTimeFormatter } from "@/lib/i18n";
import { PrintButton } from "@/components/print-button";

export default async function NoShowAnalysisReportPage() {
  const [report, locale] = await Promise.all([getNoShowAnalysisReport(), getLocale()]);
  const t = getDictionary(locale);
  const dateTimeFmt = longDateTimeFormatter(locale);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between no-print">
        <h1 className="text-2xl font-bold text-slate-900">{t.viewing.reportNoShowAnalysis}</h1>
        <PrintButton label={t.printButton} />
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-500 text-right">
            <tr>
              <th className="px-5 py-3 font-medium">{t.viewing.colViewingNumber}</th>
              <th className="px-5 py-3 font-medium">{t.viewing.colLead}</th>
              <th className="px-5 py-3 font-medium">{t.viewing.colAgent}</th>
              <th className="px-5 py-3 font-medium">{t.viewing.fieldScheduledStart}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {report.viewings.map((v) => (
              <tr key={v.id}>
                <td className="px-5 py-3 font-medium text-slate-800">{v.viewingNumber}</td>
                <td className="px-5 py-3 text-slate-700">{v.lead.fullName}</td>
                <td className="px-5 py-3 text-slate-500">{v.assignedToUser?.name ?? "—"}</td>
                <td className="px-5 py-3 text-slate-400 whitespace-nowrap">{dateTimeFmt.format(v.scheduledStart)}</td>
              </tr>
            ))}
            <tr className="font-semibold bg-slate-50">
              <td className="px-5 py-3" colSpan={3}>
                {t.crm.colTotal}
              </td>
              <td className="px-5 py-3">{report.total}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
