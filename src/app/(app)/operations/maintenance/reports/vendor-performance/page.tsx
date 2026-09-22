import Link from "next/link";
import { getVendorPerformanceReport } from "@/lib/actions/maintenance-reports";
import { getLocale, getDictionary, currencyFormatter } from "@/lib/i18n";

export default async function VendorPerformanceReportPage() {
  const [rows, locale] = await Promise.all([getVendorPerformanceReport(), getLocale()]);
  const t = getDictionary(locale);
  const moneyFmt = currencyFormatter(locale);

  return (
    <div className="space-y-6">
      <div>
        <Link href="/operations/maintenance/reports" className="text-brand-gold-dark hover:underline text-sm">
          ← {t.maintenance.reportsTitle}
        </Link>
        <h1 className="text-2xl font-bold text-slate-900 mt-2">{t.maintenance.reportVendorPerformance}</h1>
      </div>
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-500 text-right">
            <tr>
              <th className="px-4 py-3 font-medium">{t.maintenance.colVendorName}</th>
              <th className="px-4 py-3 font-medium">{t.maintenance.colAssignedCount}</th>
              <th className="px-4 py-3 font-medium">{t.maintenance.colCompletedCount}</th>
              <th className="px-4 py-3 font-medium">{t.maintenance.colClosedCount}</th>
              <th className="px-4 py-3 font-medium">{t.maintenance.averageResolutionTimeLabel}</th>
              <th className="px-4 py-3 font-medium">{t.maintenance.costActualTotal}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((v) => (
              <tr key={v.vendorId}>
                <td className="px-4 py-3 font-medium text-slate-800">{v.name}</td>
                <td className="px-4 py-3 text-slate-500">{v.assigned}</td>
                <td className="px-4 py-3 text-slate-500">{v.completed}</td>
                <td className="px-4 py-3 text-slate-500">{v.closed}</td>
                <td className="px-4 py-3 text-slate-500">{v.averageCompletionMinutes !== null ? t.maintenance.hoursUnit(Math.round(v.averageCompletionMinutes / 60)) : "—"}</td>
                <td className="px-4 py-3 text-slate-500">{moneyFmt.format(Number(v.operationalCost))}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={6} className="px-5 py-8 text-center text-slate-400">
                  {t.maintenance.empty}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
