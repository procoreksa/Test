import { getOfferValueByCompoundReport } from "@/lib/actions/offer-reports";
import { getLocale, getDictionary, currencyFormatter, pickLocalized } from "@/lib/i18n";
import { PrintButton } from "@/components/print-button";

export default async function OfferValueByCompoundReportPage() {
  const [rows, locale] = await Promise.all([getOfferValueByCompoundReport(), getLocale()]);
  const t = getDictionary(locale);
  const sar = currencyFormatter(locale);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between no-print">
        <h1 className="text-2xl font-bold text-slate-900">{t.offer.reportValueByCompound}</h1>
        <PrintButton label={t.printButton} />
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-500 text-right">
            <tr>
              <th className="px-5 py-3 font-medium">{t.offer.colCompound}</th>
              <th className="px-5 py-3 font-medium">{t.offer.colOfferCount}</th>
              <th className="px-5 py-3 font-medium">{t.offer.colAcceptedCount}</th>
              <th className="px-5 py-3 font-medium">{t.offer.colTotalValue}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((r) => (
              <tr key={r.compoundId}>
                <td className="px-5 py-3 text-slate-800 font-medium">{pickLocalized(locale, r.nameAr, r.name)}</td>
                <td className="px-5 py-3 text-slate-700">{r.offerCount}</td>
                <td className="px-5 py-3 text-slate-700">{r.acceptedCount}</td>
                <td className="px-5 py-3 text-slate-800 font-semibold">{sar.format(r.totalNetAnnualRent)}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={4} className="px-5 py-8 text-center text-slate-400">
                  {t.offer.empty}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
