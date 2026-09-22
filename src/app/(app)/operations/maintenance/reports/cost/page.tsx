import Link from "next/link";
import { getMaintenanceCostReport } from "@/lib/actions/maintenance-reports";
import { getLocale, getDictionary, currencyFormatter } from "@/lib/i18n";
import type { MaintenanceCategory } from "@prisma/client";

export default async function MaintenanceCostReportPage() {
  const [report, locale] = await Promise.all([getMaintenanceCostReport(), getLocale()]);
  const t = getDictionary(locale);
  const moneyFmt = currencyFormatter(locale);

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <Link href="/operations/maintenance/reports" className="text-brand-gold-dark hover:underline text-sm">
          ← {t.maintenance.reportsTitle}
        </Link>
        <h1 className="text-2xl font-bold text-slate-900 mt-2">{t.maintenance.reportCost}</h1>
        <p className="text-xs text-slate-400 mt-1">{t.maintenance.costOperationalNotice}</p>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 grid grid-cols-2 gap-4">
        <div>
          <p className="text-xs text-slate-500">{t.maintenance.costActualTotal}</p>
          <p className="text-2xl font-bold text-slate-900">{moneyFmt.format(Number(report.totalActualCost))}</p>
        </div>
        <div>
          <p className="text-xs text-slate-500">{t.maintenance.costEstimatedLabel}</p>
          <p className="text-2xl font-bold text-slate-900">{moneyFmt.format(Number(report.totalEstimatedCost))}</p>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
        <h2 className="font-semibold text-slate-800 mb-3">{t.maintenance.filterCategory}</h2>
        <table className="w-full text-sm">
          <tbody>
            {report.byCategory
              .sort((a, b) => Number(b.actualCost) - Number(a.actualCost))
              .map((row) => (
                <tr key={row.category} className="border-b border-slate-100">
                  <td className="py-2 text-slate-600">{t.maintenanceCategory[row.category as MaintenanceCategory]}</td>
                  <td className="py-2 text-slate-400">{row.count}</td>
                  <td className="py-2 text-end font-medium">{moneyFmt.format(Number(row.actualCost))}</td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
