import Link from "next/link";
import { getMaintenanceByUnitReport } from "@/lib/actions/maintenance-reports";
import { getLocale, getDictionary } from "@/lib/i18n";

export default async function MaintenanceByUnitReportPage() {
  const [rows, locale] = await Promise.all([getMaintenanceByUnitReport(), getLocale()]);
  const t = getDictionary(locale);

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <Link href="/operations/maintenance/reports" className="text-brand-gold-dark hover:underline text-sm">
          ← {t.maintenance.reportsTitle}
        </Link>
        <h1 className="text-2xl font-bold text-slate-900 mt-2">{t.maintenance.reportByUnit}</h1>
      </div>
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
        <table className="w-full text-sm">
          <tbody>
            {rows.map((row) => (
              <tr key={row.unitId} className="border-b border-slate-100">
                <td className="py-2 text-slate-600">{row.unit?.unitNumber ?? "—"}</td>
                <td className="py-2 text-end font-medium">{row.count}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={2} className="py-6 text-center text-slate-400">
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
