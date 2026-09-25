import { getKeysHandoverReport } from "@/lib/actions/move-in-reports";
import { getLocale, getDictionary, pickLocalized } from "@/lib/i18n";
import { PrintButton } from "@/components/print-button";

export default async function KeysHandoverReportPage() {
  const [rows, locale] = await Promise.all([getKeysHandoverReport(), getLocale()]);
  const t = getDictionary(locale);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between no-print">
        <h1 className="text-2xl font-bold text-slate-900">{t.operations.reportKeysHandover}</h1>
        <PrintButton label={t.printButton} />
      </div>
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-500 text-right">
            <tr>
              <th className="px-4 py-3 font-medium">{t.moveIn.colMoveInNumber}</th>
              <th className="px-4 py-3 font-medium">{t.moveIn.colUnit}</th>
              <th className="px-4 py-3 font-medium">{t.moveIn.colRenter}</th>
              <th className="px-4 py-3 font-medium">{t.moveIn.keyTypeLabel}</th>
              <th className="px-4 py-3 font-medium">{t.moveIn.keyDescriptionLabel}</th>
              <th className="px-4 py-3 font-medium">{t.moveIn.keyQuantityLabel}</th>
              <th className="px-4 py-3 font-medium">{t.moveIn.keyReturnedExpectedLabel}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((k) => (
              <tr key={k.id}>
                <td className="px-4 py-3 font-medium text-slate-800">{k.moveIn.moveInNumber}</td>
                <td className="px-4 py-3 text-slate-500">{k.moveIn.unit.unitNumber}</td>
                <td className="px-4 py-3 text-slate-700">{pickLocalized(locale, k.moveIn.renter.fullNameAr, k.moveIn.renter.fullName)}</td>
                <td className="px-4 py-3 text-slate-500">{t.keyType[k.keyType]}</td>
                <td className="px-4 py-3 text-slate-500">{k.description}</td>
                <td className="px-4 py-3 text-slate-500">{k.quantity}</td>
                <td className="px-4 py-3 text-slate-500">{k.returnedExpected ? t.common.yes : t.common.no}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={7} className="px-5 py-8 text-center text-slate-400">
                  {t.moveIn.keyEmpty}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
