import Link from "next/link";
import { getMaintenanceByCategoryReport } from "@/lib/actions/maintenance-reports";
import { getLocale, getDictionary } from "@/lib/i18n";
import type { MaintenanceCategory } from "@prisma/client";

export default async function MaintenanceByCategoryReportPage() {
  const [rows, locale] = await Promise.all([getMaintenanceByCategoryReport(), getLocale()]);
  const t = getDictionary(locale);

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <Link href="/operations/maintenance/reports" className="text-brand-gold-dark hover:underline text-sm">
          ← {t.maintenance.reportsTitle}
        </Link>
        <h1 className="text-2xl font-bold text-slate-900 mt-2">{t.maintenance.reportByCategory}</h1>
      </div>
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
        <table className="w-full text-sm">
          <tbody>
            {rows
              .sort((a, b) => b._count._all - a._count._all)
              .map((row) => (
                <tr key={row.category} className="border-b border-slate-100">
                  <td className="py-2 text-slate-600">{t.maintenanceCategory[row.category as MaintenanceCategory]}</td>
                  <td className="py-2 text-end font-medium">{row._count._all}</td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
