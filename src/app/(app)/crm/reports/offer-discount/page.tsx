import { getOfferDiscountReport } from "@/lib/actions/offer-reports";
import { getLocale, getDictionary, currencyFormatter, shortDateFormatter } from "@/lib/i18n";
import { PrintButton } from "@/components/print-button";
import { StatCard } from "@/components/stat-card";

export default async function OfferDiscountReportPage() {
  const [{ rows, averageDiscountPercentage, escalatedCount }, locale] = await Promise.all([getOfferDiscountReport(), getLocale()]);
  const t = getDictionary(locale);
  const sar = currencyFormatter(locale);
  const dateFmt = shortDateFormatter(locale);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between no-print">
        <h1 className="text-2xl font-bold text-slate-900">{t.offer.reportDiscount}</h1>
        <PrintButton label={t.printButton} />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <StatCard label={t.offer.colAverageDiscount} value={`${averageDiscountPercentage}%`} />
        <StatCard label={t.offer.colEscalatedCount} value={String(escalatedCount)} tone="warning" />
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-500 text-right">
            <tr>
              <th className="px-5 py-3 font-medium">{t.offer.colOfferNumber}</th>
              <th className="px-5 py-3 font-medium">{t.offer.colVersionShort}</th>
              <th className="px-5 py-3 font-medium">{t.offer.colDiscount}</th>
              <th className="px-5 py-3 font-medium">{t.offer.colStatus}</th>
              <th className="px-5 py-3 font-medium">{t.offer.colCreatedDate}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((r) => (
              <tr key={r.id}>
                <td className="px-5 py-3 text-slate-800 font-medium">{r.offerNumber}</td>
                <td className="px-5 py-3 text-slate-500">{r.versionNumber}</td>
                <td className="px-5 py-3 text-slate-700">
                  {sar.format(r.discountAmount)} ({r.discountPercentage}%)
                  {r.requiresEscalatedApproval && <span className="ms-2 text-xs text-amber-600">{t.offer.approvalRequiredBadge}</span>}
                </td>
                <td className="px-5 py-3 text-slate-500">{t.offerStatus[r.status]}</td>
                <td className="px-5 py-3 text-slate-500">{dateFmt.format(r.createdAt)}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={5} className="px-5 py-8 text-center text-slate-400">
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
