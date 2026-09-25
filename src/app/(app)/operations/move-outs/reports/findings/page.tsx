import { getMoveOutFindingsReport } from "@/lib/actions/move-out-reports";
import { getLocale, getDictionary, pickLocalized } from "@/lib/i18n";
import { PrintButton } from "@/components/print-button";

export default async function MoveOutFindingsReportPage() {
  const [rows, locale] = await Promise.all([getMoveOutFindingsReport(), getLocale()]);
  const t = getDictionary(locale);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between no-print">
        <h1 className="text-2xl font-bold text-slate-900">{t.operations.reportMoveOutFindings}</h1>
        <PrintButton label={t.printButton} />
      </div>
      <p className="text-xs text-slate-400 no-print">{t.moveOut.findingsNoticeNotLiability}</p>
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-500 text-right">
            <tr>
              <th className="px-4 py-3 font-medium">{t.moveOut.colMoveOutNumber}</th>
              <th className="px-4 py-3 font-medium">{t.moveOut.colUnit}</th>
              <th className="px-4 py-3 font-medium">{t.moveOut.colRenter}</th>
              <th className="px-4 py-3 font-medium">{t.moveOut.inventoryItemNameLabel}</th>
              <th className="px-4 py-3 font-medium">{t.moveOut.moveOutConditionLabel}</th>
              <th className="px-4 py-3 font-medium">{t.moveOut.conditionChangeLabel}</th>
              <th className="px-4 py-3 font-medium">{t.moveOut.requiresAttentionLabel}</th>
              <th className="px-4 py-3 font-medium">{t.moveOut.sectionMaintenanceRequests}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((item) => (
              <tr key={item.id}>
                <td className="px-4 py-3 font-medium text-slate-800">{item.moveOut.moveOutNumber}</td>
                <td className="px-4 py-3 text-slate-500">{item.moveOut.unit.unitNumber}</td>
                <td className="px-4 py-3 text-slate-700">{pickLocalized(locale, item.moveOut.renter.fullNameAr, item.moveOut.renter.fullName)}</td>
                <td className="px-4 py-3 text-slate-700">{pickLocalized(locale, item.itemNameAr, item.itemName)}</td>
                <td className="px-4 py-3 text-slate-500">{item.condition ? t.conditionRating[item.condition] : "—"}</td>
                <td className="px-4 py-3 text-slate-500">{t.conditionComparison[item.comparison]}</td>
                <td className="px-4 py-3 text-slate-500">{item.requiresAttention ? t.common.yes : t.common.no}</td>
                <td className="px-4 py-3 text-slate-500">{item.maintenanceRequests.length > 0 ? item.maintenanceRequests.map((r) => r.requestNumber).join(", ") : "—"}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={8} className="px-5 py-8 text-center text-slate-400">
                  {t.moveOut.reportNoFindings}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
