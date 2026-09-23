import Link from "next/link";
import { getMoveOutMaintenanceFindingsReport } from "@/lib/actions/move-out-reports";
import { getLocale, getDictionary, pickLocalized } from "@/lib/i18n";
import { PrintButton } from "@/components/print-button";

export default async function MoveOutMaintenanceFindingsReportPage() {
  const [rows, locale] = await Promise.all([getMoveOutMaintenanceFindingsReport(), getLocale()]);
  const t = getDictionary(locale);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between no-print">
        <h1 className="text-2xl font-bold text-slate-900">{t.operations.reportMoveOutMaintenanceFindings}</h1>
        <PrintButton label={t.printButton} />
      </div>
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-500 text-right">
            <tr>
              <th className="px-4 py-3 font-medium">{t.moveOut.colMoveOutNumber}</th>
              <th className="px-4 py-3 font-medium">{t.moveOut.colUnit}</th>
              <th className="px-4 py-3 font-medium">{t.moveOut.inventoryItemNameLabel}</th>
              <th className="px-4 py-3 font-medium">{t.moveOut.sectionMaintenanceRequests}</th>
              <th className="px-4 py-3 font-medium">{t.moveOut.maintenanceColStatus}</th>
              <th className="px-4 py-3 font-medium">{t.moveOut.maintenanceColPriority}</th>
              <th className="px-4 py-3 font-medium">{t.moveOut.maintenanceColCategory}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.flatMap((item) =>
              item.maintenanceRequests.map((r) => (
                <tr key={r.id}>
                  <td className="px-4 py-3 font-medium text-slate-800">{item.moveOut.moveOutNumber}</td>
                  <td className="px-4 py-3 text-slate-500">{item.moveOut.unit.unitNumber}</td>
                  <td className="px-4 py-3 text-slate-700">{pickLocalized(locale, item.itemNameAr, item.itemName)}</td>
                  <td className="px-4 py-3 text-slate-500">
                    <Link href={`/operations/maintenance/requests/${r.id}`} className="text-brand-gold-dark hover:underline">
                      {r.requestNumber}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-slate-500">{t.maintenanceRequestStatus[r.status]}</td>
                  <td className="px-4 py-3 text-slate-500">{t.maintenancePriority[r.priority]}</td>
                  <td className="px-4 py-3 text-slate-500">{t.maintenanceCategory[r.category]}</td>
                </tr>
              ))
            )}
            {rows.length === 0 && (
              <tr>
                <td colSpan={7} className="px-5 py-8 text-center text-slate-400">
                  {t.moveOut.maintenanceEmpty}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
