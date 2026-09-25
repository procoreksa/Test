import { getInventoryVarianceReport } from "@/lib/actions/move-out-reports";
import { getLocale, getDictionary, pickLocalized } from "@/lib/i18n";
import { PrintButton } from "@/components/print-button";
import type { InspectionCategory, ConditionRating } from "@prisma/client";

export default async function InventoryVarianceReportPage() {
  const [rows, locale] = await Promise.all([getInventoryVarianceReport(), getLocale()]);
  const t = getDictionary(locale);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between no-print">
        <h1 className="text-2xl font-bold text-slate-900">{t.operations.reportInventoryVariance}</h1>
        <PrintButton label={t.printButton} />
      </div>
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-500 text-right">
            <tr>
              <th className="px-4 py-3 font-medium">{t.moveOut.colMoveOutNumber}</th>
              <th className="px-4 py-3 font-medium">{t.moveOut.colUnit}</th>
              <th className="px-4 py-3 font-medium">{t.moveOut.colRenter}</th>
              <th className="px-4 py-3 font-medium">{t.moveOut.inventoryCategoryLabel}</th>
              <th className="px-4 py-3 font-medium">{t.moveOut.inventoryItemNameLabel}</th>
              <th className="px-4 py-3 font-medium">{t.moveOut.inventoryMoveInQtyLabel}</th>
              <th className="px-4 py-3 font-medium">{t.moveOut.inventoryMoveOutQtyLabel}</th>
              <th className="px-4 py-3 font-medium">{t.moveOut.moveInConditionLabel}</th>
              <th className="px-4 py-3 font-medium">{t.moveOut.moveOutConditionLabel}</th>
              <th className="px-4 py-3 font-medium">{t.moveOut.conditionChangeLabel}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((r, i) => (
              <tr key={i}>
                <td className="px-4 py-3 font-medium text-slate-800">{r.moveOutNumber}</td>
                <td className="px-4 py-3 text-slate-500">{r.unitNumber}</td>
                <td className="px-4 py-3 text-slate-700">{pickLocalized(locale, r.renterNameAr, r.renterName)}</td>
                <td className="px-4 py-3 text-slate-500">{t.inspectionCategory[r.category as InspectionCategory]}</td>
                <td className="px-4 py-3 text-slate-700">{r.itemName}</td>
                <td className="px-4 py-3 text-slate-500">{r.moveInQuantity ?? "—"}</td>
                <td className="px-4 py-3 text-slate-500">{r.moveOutQuantity ?? "—"}</td>
                <td className="px-4 py-3 text-slate-500">{r.moveInCondition ? t.conditionRating[r.moveInCondition as ConditionRating] : "—"}</td>
                <td className="px-4 py-3 text-slate-500">{r.moveOutCondition ? t.conditionRating[r.moveOutCondition as ConditionRating] : "—"}</td>
                <td className="px-4 py-3 text-slate-500">{t.inventoryDiffStatus[r.status as keyof typeof t.inventoryDiffStatus]}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={10} className="px-5 py-8 text-center text-slate-400">
                  {t.moveOut.inventoryEmpty}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
