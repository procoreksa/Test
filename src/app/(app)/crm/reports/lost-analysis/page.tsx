import { getLostLeadAnalysis } from "@/lib/actions/crm";
import { getLocale, getDictionary, shortDateFormatter } from "@/lib/i18n";
import { PrintButton } from "@/components/print-button";
import type { LeadLostReason } from "@prisma/client";

export default async function LostLeadAnalysisPage() {
  const [report, locale] = await Promise.all([getLostLeadAnalysis(), getLocale()]);
  const t = getDictionary(locale);
  const dateFmt = shortDateFormatter(locale);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between no-print">
        <h1 className="text-2xl font-bold text-slate-900">{t.crm.reportLostAnalysis}</h1>
        <PrintButton label={t.printButton} />
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-500 text-right">
            <tr>
              <th className="px-5 py-3 font-medium">{t.crm.colReason}</th>
              <th className="px-5 py-3 font-medium">{t.crm.colCount}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {report.byReason.map((r) => (
              <tr key={r.reason}>
                <td className="px-5 py-3 text-slate-700">{t.leadLostReason[r.reason as LeadLostReason]}</td>
                <td className="px-5 py-3 font-semibold">{r.count}</td>
              </tr>
            ))}
            <tr className="font-semibold bg-slate-50">
              <td className="px-5 py-3">{t.crm.colTotal}</td>
              <td className="px-5 py-3">{report.total}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-500 text-right">
            <tr>
              <th className="px-5 py-3 font-medium">{t.crm.colLeadNumber}</th>
              <th className="px-5 py-3 font-medium">{t.crm.colNameCompany}</th>
              <th className="px-5 py-3 font-medium">{t.crm.colReason}</th>
              <th className="px-5 py-3 font-medium">{t.crm.fieldLostReasonNote}</th>
              <th className="px-5 py-3 font-medium">{t.crm.colAgent}</th>
              <th className="px-5 py-3 font-medium">{t.crm.colCreated}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {report.leads.map((l) => (
              <tr key={l.id}>
                <td className="px-5 py-3 text-slate-700">{l.leadNumber}</td>
                <td className="px-5 py-3">{l.fullName}</td>
                <td className="px-5 py-3">{l.lostReason ? t.leadLostReason[l.lostReason] : "—"}</td>
                <td className="px-5 py-3 text-slate-500 max-w-xs truncate" title={l.lostReasonNote ?? ""}>
                  {l.lostReasonNote ?? "—"}
                </td>
                <td className="px-5 py-3 text-slate-500">{l.assignedToUser?.name ?? t.crm.unassigned}</td>
                <td className="px-5 py-3 text-slate-400 whitespace-nowrap">{dateFmt.format(l.updatedAt)}</td>
              </tr>
            ))}
            {report.leads.length === 0 && (
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
