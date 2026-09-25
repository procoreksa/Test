import { getOfferPipelineReport } from "@/lib/actions/offer-reports";
import { getLocale, getDictionary } from "@/lib/i18n";
import { PrintButton } from "@/components/print-button";
import type { OfferStatus } from "@prisma/client";

export default async function OfferPipelineReportPage() {
  const [rows, locale] = await Promise.all([getOfferPipelineReport(), getLocale()]);
  const t = getDictionary(locale);
  const total = rows.reduce((sum, r) => sum + r.count, 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between no-print">
        <h1 className="text-2xl font-bold text-slate-900">{t.offer.reportPipeline}</h1>
        <PrintButton label={t.printButton} />
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-500 text-right">
            <tr>
              <th className="px-5 py-3 font-medium">{t.offer.colStatus}</th>
              <th className="px-5 py-3 font-medium">{t.offer.colCount}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((r) => (
              <tr key={r.status}>
                <td className="px-5 py-3 text-slate-700">{t.offerStatus[r.status as OfferStatus]}</td>
                <td className="px-5 py-3 font-semibold text-slate-800">{r.count}</td>
              </tr>
            ))}
            <tr className="font-semibold bg-slate-50">
              <td className="px-5 py-3">{t.crm.colTotal}</td>
              <td className="px-5 py-3">{total}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
