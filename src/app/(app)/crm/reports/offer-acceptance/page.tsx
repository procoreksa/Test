import { getOfferAcceptanceReport } from "@/lib/actions/offer-reports";
import { getLocale, getDictionary } from "@/lib/i18n";
import { PrintButton } from "@/components/print-button";
import { StatCard } from "@/components/stat-card";

export default async function OfferAcceptanceReportPage() {
  const [stats, locale] = await Promise.all([getOfferAcceptanceReport(), getLocale()]);
  const t = getDictionary(locale);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between no-print">
        <h1 className="text-2xl font-bold text-slate-900">{t.offer.reportAcceptance}</h1>
        <PrintButton label={t.printButton} />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard label={t.offerStatus.ACCEPTED} value={String(stats.accepted)} tone="positive" />
        <StatCard label={t.offerStatus.REJECTED} value={String(stats.rejected)} tone="danger" />
        <StatCard label={t.offer.kpiAcceptanceRate} value={`${stats.acceptanceRate}%`} tone="positive" />
      </div>
    </div>
  );
}
