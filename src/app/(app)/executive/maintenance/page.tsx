import Link from "next/link";
import { getExecutiveMaintenanceDetail } from "@/lib/actions/executive";
import { getLocale, getDictionary, currencyFormatter } from "@/lib/i18n";
import { StatCard } from "@/components/stat-card";

export default async function ExecutiveMaintenancePage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string; compoundId?: string; buildingId?: string }>;
}) {
  const params = await searchParams;
  const [detail, locale] = await Promise.all([getExecutiveMaintenanceDetail(params), getLocale()]);
  const t = getDictionary(locale);
  const sar = currencyFormatter(locale);

  return (
    <div className="space-y-6">
      <div>
        <Link href="/executive" className="text-sm text-slate-500 hover:text-slate-800">
          ← {t.executive.backToOverview}
        </Link>
        <h1 className="text-2xl font-bold text-slate-900 mt-1">{t.executive.maintenancePageTitle}</h1>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label={t.executive.kpiInfo.openMaintenanceRequests.title} value={String(detail.openRequests)} />
        <StatCard label={t.executive.attentionItemLabel.maintenanceEmergency} value={String(detail.emergencyRequests)} />
        <StatCard label={t.executive.kpiInfo.overdueMaintenanceSla.title} value={String(detail.slaBreached)} tone={detail.slaBreached > 0 ? "danger" : "positive"} />
        <StatCard label={t.operations.kpiWorkOrdersInProgress} value={String(detail.workOrdersInProgress)} />
      </div>

      {detail.maintenanceCostThisPeriod !== null ? (
        <StatCard label={t.executive.kpiInfo.maintenanceCostThisPeriod.title} value={sar.format(Number(detail.maintenanceCostThisPeriod))} />
      ) : (
        <StatCard label={t.executive.kpiInfo.maintenanceCostThisPeriod.title} value="—" hint={t.executive.costRedactedNotice} />
      )}
    </div>
  );
}
