import Link from "next/link";
import { getTechnicianPerformanceReport } from "@/lib/actions/maintenance-reports";
import { getLocale, getDictionary } from "@/lib/i18n";

export default async function TechnicianPerformanceReportPage() {
  const [rows, locale] = await Promise.all([getTechnicianPerformanceReport(), getLocale()]);
  const t = getDictionary(locale);

  return (
    <div className="space-y-6">
      <div>
        <Link href="/operations/maintenance/reports" className="text-brand-gold-dark hover:underline text-sm">
          ← {t.maintenance.reportsTitle}
        </Link>
        <h1 className="text-2xl font-bold text-slate-900 mt-2">{t.maintenance.reportTechnicianPerformance}</h1>
      </div>
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-500 text-right">
            <tr>
              <th className="px-4 py-3 font-medium">{t.maintenance.fieldAssignedUser}</th>
              <th className="px-4 py-3 font-medium">{t.maintenance.colAssignedCount}</th>
              <th className="px-4 py-3 font-medium">{t.maintenance.colCompletedCount}</th>
              <th className="px-4 py-3 font-medium">{t.maintenance.colVerifiedCount}</th>
              <th className="px-4 py-3 font-medium">{t.maintenance.colClosedCount}</th>
              <th className="px-4 py-3 font-medium">{t.maintenance.averageResolutionTimeLabel}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((u) => (
              <tr key={u.userId}>
                <td className="px-4 py-3 font-medium text-slate-800">{u.name}</td>
                <td className="px-4 py-3 text-slate-500">{u.assigned}</td>
                <td className="px-4 py-3 text-slate-500">{u.completed}</td>
                <td className="px-4 py-3 text-slate-500">{u.verified}</td>
                <td className="px-4 py-3 text-slate-500">{u.closed}</td>
                <td className="px-4 py-3 text-slate-500">{u.averageCompletionMinutes !== null ? t.maintenance.hoursUnit(Math.round(u.averageCompletionMinutes / 60)) : "—"}</td>
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
