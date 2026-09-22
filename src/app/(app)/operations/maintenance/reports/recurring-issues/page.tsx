import Link from "next/link";
import { getRecurringIssueReport } from "@/lib/actions/maintenance-reports";
import { getLocale, getDictionary } from "@/lib/i18n";
import type { MaintenanceCategory } from "@prisma/client";

export default async function RecurringIssueReportPage() {
  const [rows, locale] = await Promise.all([getRecurringIssueReport(), getLocale()]);
  const t = getDictionary(locale);

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <Link href="/operations/maintenance/reports" className="text-brand-gold-dark hover:underline text-sm">
          ← {t.maintenance.reportsTitle}
        </Link>
        <h1 className="text-2xl font-bold text-slate-900 mt-2">{t.maintenance.reportRecurringIssue}</h1>
        <p className="text-slate-500 text-sm mt-1">
          {t.maintenance.filterUnit} + {t.maintenance.filterCategory}, {t.maintenance.recurringIssueWindowLabel(90)}
        </p>
      </div>
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
        <table className="w-full text-sm">
          <tbody>
            {rows.map((row) => (
              <tr key={`${row.unitId}:${row.category}`} className="border-b border-slate-100">
                <td className="py-2 text-slate-600">
                  {row.unitNumber} — {t.maintenanceCategory[row.category as MaintenanceCategory]}
                </td>
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
