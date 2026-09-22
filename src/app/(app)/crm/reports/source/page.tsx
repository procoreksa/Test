import { getLeadSourceReport } from "@/lib/actions/crm";
import { getLocale, getDictionary } from "@/lib/i18n";
import { PrintButton } from "@/components/print-button";
import type { LeadSource } from "@prisma/client";

export default async function LeadSourceReportPage() {
  const [rows, locale] = await Promise.all([getLeadSourceReport(), getLocale()]);
  const t = getDictionary(locale);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between no-print">
        <h1 className="text-2xl font-bold text-slate-900">{t.crm.reportSource}</h1>
        <PrintButton label={t.printButton} />
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-500 text-right">
            <tr>
              <th className="px-5 py-3 font-medium">{t.crm.colSource}</th>
              <th className="px-5 py-3 font-medium">{t.crm.colCount}</th>
              <th className="px-5 py-3 font-medium">{t.crm.colWon}</th>
              <th className="px-5 py-3 font-medium">{t.crm.colLost}</th>
              <th className="px-5 py-3 font-medium">{t.crm.colConversionRate}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((r) => (
              <tr key={r.source}>
                <td className="px-5 py-3 text-slate-700">{t.leadSource[r.source as LeadSource]}</td>
                <td className="px-5 py-3">{r.total}</td>
                <td className="px-5 py-3 text-emerald-700">{r.won}</td>
                <td className="px-5 py-3 text-red-600">{r.lost}</td>
                <td className="px-5 py-3 font-semibold">{r.conversionRate}%</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={5} className="px-5 py-8 text-center text-slate-400">
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
