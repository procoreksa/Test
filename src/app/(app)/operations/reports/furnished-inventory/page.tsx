import { getFurnishedInventoryReport } from "@/lib/actions/move-in-reports";
import { getLocale, getDictionary, pickLocalized } from "@/lib/i18n";
import { PrintButton } from "@/components/print-button";

export default async function FurnishedInventoryReportPage() {
  const [rows, locale] = await Promise.all([getFurnishedInventoryReport(), getLocale()]);
  const t = getDictionary(locale);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between no-print">
        <h1 className="text-2xl font-bold text-slate-900">{t.operations.reportFurnishedInventory}</h1>
        <PrintButton label={t.printButton} />
      </div>
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-500 text-right">
            <tr>
              <th className="px-4 py-3 font-medium">{t.moveIn.colMoveInNumber}</th>
              <th className="px-4 py-3 font-medium">{t.moveIn.colUnit}</th>
              <th className="px-4 py-3 font-medium">{t.moveIn.colRenter}</th>
              <th className="px-4 py-3 font-medium">{t.moveIn.inventoryCategoryLabel}</th>
              <th className="px-4 py-3 font-medium">{t.moveIn.inventoryItemNameLabel}</th>
              <th className="px-4 py-3 font-medium">{t.moveIn.inventoryQuantityLabel}</th>
              <th className="px-4 py-3 font-medium">{t.moveIn.inventoryConditionLabel}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((inv) => (
              <tr key={inv.id}>
                <td className="px-4 py-3 font-medium text-slate-800">{inv.moveIn.moveInNumber}</td>
                <td className="px-4 py-3 text-slate-500">{inv.moveIn.unit.unitNumber}</td>
                <td className="px-4 py-3 text-slate-700">{pickLocalized(locale, inv.moveIn.renter.fullNameAr, inv.moveIn.renter.fullName)}</td>
                <td className="px-4 py-3 text-slate-500">{t.inspectionCategory[inv.category]}</td>
                <td className="px-4 py-3 text-slate-500">{inv.itemName}</td>
                <td className="px-4 py-3 text-slate-500">{inv.quantity}</td>
                <td className="px-4 py-3 text-slate-500">{inv.condition ? t.conditionRating[inv.condition] : "—"}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={7} className="px-5 py-8 text-center text-slate-400">
                  {t.moveIn.inventoryEmpty}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
