import Link from "next/link";
import { getMaintenanceRequestReport } from "@/lib/actions/maintenance-reports";
import { getLocale, getDictionary } from "@/lib/i18n";
import type { MaintenanceRequestStatus, MaintenancePriority } from "@prisma/client";

export default async function MaintenanceRequestReportPage() {
  const [report, locale] = await Promise.all([getMaintenanceRequestReport(), getLocale()]);
  const t = getDictionary(locale);

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <Link href="/operations/maintenance/reports" className="text-brand-gold-dark hover:underline text-sm">
          ← {t.maintenance.reportsTitle}
        </Link>
        <h1 className="text-2xl font-bold text-slate-900 mt-2">{t.maintenance.reportRequestSummary}</h1>
        <p className="text-slate-500 text-sm mt-1">{t.maintenance.requestsListTitle}: {report.total}</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
          <h2 className="font-semibold text-slate-800 mb-3">{t.maintenance.colStatus}</h2>
          <table className="w-full text-sm">
            <tbody>
              {report.byStatus.map((row) => (
                <tr key={row.status} className="border-b border-slate-100">
                  <td className="py-2 text-slate-600">{t.maintenanceRequestStatus[row.status as MaintenanceRequestStatus]}</td>
                  <td className="py-2 text-end font-medium">{row._count._all}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
          <h2 className="font-semibold text-slate-800 mb-3">{t.maintenance.colPriority}</h2>
          <table className="w-full text-sm">
            <tbody>
              {report.byPriority.map((row) => (
                <tr key={row.priority} className="border-b border-slate-100">
                  <td className="py-2 text-slate-600">{t.maintenancePriority[row.priority as MaintenancePriority]}</td>
                  <td className="py-2 text-end font-medium">{row._count._all}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
