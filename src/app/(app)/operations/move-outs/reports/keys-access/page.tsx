import { getMoveOutKeysReport } from "@/lib/actions/move-out-reports";
import { getLocale, getDictionary, pickLocalized } from "@/lib/i18n";
import { PrintButton } from "@/components/print-button";
import type { KeyType } from "@prisma/client";

export default async function MoveOutKeysAccessReportPage() {
  const [rows, locale] = await Promise.all([getMoveOutKeysReport(), getLocale()]);
  const t = getDictionary(locale);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between no-print">
        <h1 className="text-2xl font-bold text-slate-900">{t.operations.reportMoveOutKeysAccess}</h1>
        <PrintButton label={t.printButton} />
      </div>
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-500 text-right">
            <tr>
              <th className="px-4 py-3 font-medium">{t.moveOut.colMoveOutNumber}</th>
              <th className="px-4 py-3 font-medium">{t.moveOut.colUnit}</th>
              <th className="px-4 py-3 font-medium">{t.moveOut.colRenter}</th>
              <th className="px-4 py-3 font-medium">{t.moveOut.keyTypeLabel}</th>
              <th className="px-4 py-3 font-medium">{t.moveOut.keyDescriptionLabel}</th>
              <th className="px-4 py-3 font-medium">{t.moveOut.keyIssuedLabel}</th>
              <th className="px-4 py-3 font-medium">{t.moveOut.keyReturnedLabel}</th>
              <th className="px-4 py-3 font-medium">{t.moveOut.keyDifferenceLabel}</th>
              <th className="px-4 py-3 font-medium">{t.moveOut.keyFullyReturnedLabel}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((r, i) => (
              <tr key={i}>
                <td className="px-4 py-3 font-medium text-slate-800">{r.moveOutNumber}</td>
                <td className="px-4 py-3 text-slate-500">{r.unitNumber}</td>
                <td className="px-4 py-3 text-slate-700">{pickLocalized(locale, r.renterNameAr, r.renterName)}</td>
                <td className="px-4 py-3 text-slate-500">{t.keyType[r.keyType as KeyType]}</td>
                <td className="px-4 py-3 text-slate-700">{r.description}</td>
                <td className="px-4 py-3 text-slate-500">{r.issuedQuantity}</td>
                <td className="px-4 py-3 text-slate-500">{r.returnedQuantity}</td>
                <td className="px-4 py-3 text-slate-500">{r.difference}</td>
                <td className="px-4 py-3 text-slate-500">{r.fullyReturned ? t.common.yes : t.common.no}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={9} className="px-5 py-8 text-center text-slate-400">
                  {t.moveOut.keyEmpty}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
