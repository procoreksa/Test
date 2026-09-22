import Link from "next/link";
import { getSlaPerformanceReport } from "@/lib/actions/maintenance-reports";
import { getLocale, getDictionary } from "@/lib/i18n";

export default async function SlaPerformanceReportPage() {
  const [report, locale] = await Promise.all([getSlaPerformanceReport(), getLocale()]);
  const t = getDictionary(locale);

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <Link href="/operations/maintenance/reports" className="text-brand-gold-dark hover:underline text-sm">
          ← {t.maintenance.reportsTitle}
        </Link>
        <h1 className="text-2xl font-bold text-slate-900 mt-2">{t.maintenance.reportSlaPerformance}</h1>
        <p className="text-slate-500 text-sm mt-1">{t.maintenance.requestsListTitle}: {report.totalRequests}</p>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
        <table className="w-full text-sm">
          <tbody>
            <tr className="border-b border-slate-100">
              <td className="py-2 text-slate-600">{t.maintenanceSlaStatus.MET} ({t.maintenance.slaResponseDue})</td>
              <td className="py-2 text-end font-medium text-emerald-600">{report.responseMet}</td>
            </tr>
            <tr className="border-b border-slate-100">
              <td className="py-2 text-slate-600">{t.maintenanceSlaStatus.BREACHED} ({t.maintenance.slaResponseDue})</td>
              <td className="py-2 text-end font-medium text-red-600">{report.responseBreached}</td>
            </tr>
            <tr className="border-b border-slate-100">
              <td className="py-2 text-slate-600">{t.maintenanceSlaStatus.MET} ({t.maintenance.slaResolutionDue})</td>
              <td className="py-2 text-end font-medium text-emerald-600">{report.resolutionMet}</td>
            </tr>
            <tr className="border-b border-slate-100">
              <td className="py-2 text-slate-600">{t.maintenanceSlaStatus.BREACHED} ({t.maintenance.slaResolutionDue})</td>
              <td className="py-2 text-end font-medium text-red-600">{report.resolutionBreached}</td>
            </tr>
            <tr className="border-b border-slate-100">
              <td className="py-2 text-slate-600">{t.maintenance.averageResponseTimeLabel}</td>
              <td className="py-2 text-end font-medium">{report.averageResponseMinutes !== null ? t.maintenance.minutesUnit(Math.round(report.averageResponseMinutes)) : "—"}</td>
            </tr>
            <tr>
              <td className="py-2 text-slate-600">{t.maintenance.averageResolutionTimeLabel}</td>
              <td className="py-2 text-end font-medium">{report.averageResolutionMinutes !== null ? t.maintenance.hoursUnit(Math.round(report.averageResolutionMinutes / 60)) : "—"}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
