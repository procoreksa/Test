import Link from "next/link";
import { getExecutiveCollectionsDetail } from "@/lib/actions/executive";
import { getLocale, getDictionary, currencyFormatter } from "@/lib/i18n";
import { StatCard } from "@/components/stat-card";
import { AGING_BUCKET_KEYS } from "@/lib/executive/kpi-rules";

export default async function ExecutiveCollectionsPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string; compoundId?: string; buildingId?: string }>;
}) {
  const params = await searchParams;
  const [detail, locale] = await Promise.all([getExecutiveCollectionsDetail(params), getLocale()]);
  const t = getDictionary(locale);
  const sar = currencyFormatter(locale);

  return (
    <div className="space-y-6">
      <div>
        <Link href="/executive" className="text-sm text-slate-500 hover:text-slate-800">
          ← {t.executive.backToOverview}
        </Link>
        <h1 className="text-2xl font-bold text-slate-900 mt-1">{t.executive.collectionsPageTitle}</h1>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label={t.executive.kpiInfo.invoicedThisPeriod.title} value={sar.format(Number(detail.invoicedThisPeriod))} />
        <StatCard label={t.executive.kpiInfo.collectedThisPeriod.title} value={sar.format(Number(detail.collectedThisPeriod))} tone="positive" />
        <StatCard label={t.executive.kpiInfo.collectionRate.title} value={`${detail.collectionRate}%`} />
        <StatCard label={t.executive.kpiInfo.outstandingReceivables.title} value={sar.format(Number(detail.outstandingReceivables))} />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard
          label={t.executive.kpiInfo.overdueReceivables.title}
          value={sar.format(Number(detail.overdueReceivablesAmount))}
          hint={String(detail.overdueReceivablesCount)}
          tone={detail.overdueReceivablesCount > 0 ? "danger" : "positive"}
        />
        <StatCard label={t.executive.kpiInfo.dueNext7Days.title} value={sar.format(Number(detail.dueNext7Days))} />
        <StatCard label={t.executive.kpiInfo.dueNext30Days.title} value={sar.format(Number(detail.dueNext30Days))} />
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-x-auto">
        <h2 className="font-semibold text-slate-800 p-4 pb-0">{t.executive.agingTitle}</h2>
        <table className="w-full text-sm mt-2">
          <thead className="bg-slate-50 text-slate-500 text-xs uppercase">
            <tr>
              {AGING_BUCKET_KEYS.map((k) => (
                <th key={k} className="px-4 py-3 text-start">
                  {t.executive.agingBucketLabel[k]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr className="border-t border-slate-100">
              {AGING_BUCKET_KEYS.map((k) => (
                <td key={k} className="px-4 py-3">
                  <div className="font-semibold text-slate-800">{sar.format(Number(detail.aging.buckets[k]))}</div>
                  <div className="text-xs text-slate-400">{detail.aging.bucketCounts[k]}</div>
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
