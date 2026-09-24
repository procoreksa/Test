import Link from "next/link";
import { getExecutiveOperationsDetail } from "@/lib/actions/executive";
import { getLocale, getDictionary, currencyFormatter } from "@/lib/i18n";
import { StatCard } from "@/components/stat-card";

export default async function ExecutiveOperationsPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string; compoundId?: string; buildingId?: string }>;
}) {
  const params = await searchParams;
  const [detail, locale] = await Promise.all([getExecutiveOperationsDetail(params), getLocale()]);
  const t = getDictionary(locale);
  const sar = currencyFormatter(locale);

  return (
    <div className="space-y-6">
      <div>
        <Link href="/executive" className="text-sm text-slate-500 hover:text-slate-800">
          ← {t.executive.backToOverview}
        </Link>
        <h1 className="text-2xl font-bold text-slate-900 mt-1">{t.executive.operationsPageTitle}</h1>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label={t.moveIn.filterToday} value={String(detail.moveInsToday)} />
        <StatCard label={t.executive.kpiInfo.moveInsUpcoming.title} value={String(detail.moveInsUpcomingWeek)} />
        <StatCard label={t.moveIn.filterOverdue} value={String(detail.overdueMoveIns)} tone={detail.overdueMoveIns > 0 ? "danger" : "positive"} />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label={t.executive.kpiInfo.moveOutsUpcoming.title} value={String(detail.moveOutsToday)} />
        <StatCard label={t.executive.kpiInfo.moveOutsUpcoming.title} value={String(detail.moveOutsUpcomingWeek)} />
        <StatCard label={t.moveIn.filterOverdue} value={String(detail.overdueMoveOuts)} tone={detail.overdueMoveOuts > 0 ? "danger" : "positive"} />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard label={t.executive.kpiInfo.pendingSettlements.title} value={String(detail.pendingSettlements)} />
        <StatCard label={t.executive.refundsDueAmount} value={sar.format(Number(detail.refundAmountOutstanding))} hint={String(detail.refundsDueCount)} />
      </div>
    </div>
  );
}
