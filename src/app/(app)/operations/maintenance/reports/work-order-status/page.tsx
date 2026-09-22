import Link from "next/link";
import { getWorkOrderStatusReport } from "@/lib/actions/maintenance-reports";
import { getLocale, getDictionary } from "@/lib/i18n";
import type { MaintenanceWorkOrderStatus } from "@prisma/client";

export default async function WorkOrderStatusReportPage() {
  const [report, locale] = await Promise.all([getWorkOrderStatusReport(), getLocale()]);
  const t = getDictionary(locale);

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <Link href="/operations/maintenance/reports" className="text-brand-gold-dark hover:underline text-sm">
          ← {t.maintenance.reportsTitle}
        </Link>
        <h1 className="text-2xl font-bold text-slate-900 mt-2">{t.maintenance.reportWorkOrderStatus}</h1>
        <p className="text-slate-500 text-sm mt-1">{t.maintenance.workOrdersListTitle}: {report.total}</p>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
        <table className="w-full text-sm">
          <tbody>
            {report.byStatus.map((row) => (
              <tr key={row.status} className="border-b border-slate-100">
                <td className="py-2 text-slate-600">{t.maintenanceWorkOrderStatus[row.status as MaintenanceWorkOrderStatus]}</td>
                <td className="py-2 text-end font-medium">{row._count._all}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
