import { getUnitConditionReport } from "@/lib/actions/move-in-reports";
import { getLocale, getDictionary, pickLocalized } from "@/lib/i18n";
import { PrintButton } from "@/components/print-button";

export default async function UnitConditionReportPage() {
  const [rows, locale] = await Promise.all([getUnitConditionReport(), getLocale()]);
  const t = getDictionary(locale);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between no-print">
        <h1 className="text-2xl font-bold text-slate-900">{t.operations.reportUnitCondition}</h1>
        <PrintButton label={t.printButton} />
      </div>
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-500 text-right">
            <tr>
              <th className="px-4 py-3 font-medium">{t.moveIn.colMoveInNumber}</th>
              <th className="px-4 py-3 font-medium">{t.moveIn.colUnit}</th>
              <th className="px-4 py-3 font-medium">{t.moveIn.sectionChecklist}</th>
              <th className="px-4 py-3 font-medium">{t.moveIn.inventoryConditionLabel}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((item) => (
              <tr key={item.id}>
                <td className="px-4 py-3 font-medium text-slate-800">{item.moveIn.moveInNumber}</td>
                <td className="px-4 py-3 text-slate-500">{item.moveIn.unit.unitNumber}</td>
                <td className="px-4 py-3 text-slate-700">
                  {t.inspectionCategory[item.category]} — {pickLocalized(locale, item.itemNameAr, item.itemName)}
                </td>
                <td className="px-4 py-3 text-slate-500">{item.condition ? t.conditionRating[item.condition] : "—"}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={4} className="px-5 py-8 text-center text-slate-400">
                  {t.moveIn.empty}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
