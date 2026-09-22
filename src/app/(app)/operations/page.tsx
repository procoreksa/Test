import Link from "next/link";
import { getOperationsDashboard } from "@/lib/actions/move-ins";
import { getMaintenanceDashboardKpis } from "@/lib/actions/maintenance";
import { getCurrentUserRole } from "@/lib/session";
import { can } from "@/lib/permissions";
import { getLocale, getDictionary, currencyFormatter } from "@/lib/i18n";

export default async function OperationsDashboardPage() {
  const [role, locale] = await Promise.all([getCurrentUserRole(), getLocale()]);
  const t = getDictionary(locale);
  const canViewMaintenance = can("maintenance.view", role);

  const [kpis, maintenanceKpis] = await Promise.all([getOperationsDashboard(), canViewMaintenance ? getMaintenanceDashboardKpis() : null]);
  const moneyFmt = currencyFormatter(locale);

  const cards: Array<{ label: string; value: number; tone: string }> = [
    { label: t.operations.kpiToday, value: kpis.moveInsToday, tone: "text-slate-900" },
    { label: t.operations.kpiUpcoming, value: kpis.upcomingThisWeek, tone: "text-slate-900" },
    { label: t.operations.kpiInProgress, value: kpis.inspectionsInProgress, tone: "text-brand-gold-dark" },
    { label: t.operations.kpiReadyForHandover, value: kpis.readyForHandover, tone: "text-emerald-600" },
    { label: t.operations.kpiCompletedThisMonth, value: kpis.completedThisMonth, tone: "text-emerald-600" },
    { label: t.operations.kpiUnitsWithDefects, value: kpis.unitsWithHandoverDefects, tone: "text-amber-600" },
    { label: t.operations.kpiOverdue, value: kpis.overdueScheduledMoveIns, tone: "text-red-600" },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{t.operations.dashboardTitle}</h1>
          <p className="text-slate-500 text-sm mt-1">{t.operations.dashboardSubtitle}</p>
        </div>
        <Link href="/operations/move-ins" className="bg-brand-gold hover:bg-brand-gold-dark text-brand-black rounded-lg px-5 py-2.5 font-semibold text-sm">
          {t.operations.goToMoveIns}
        </Link>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {cards.map((c) => (
          <div key={c.label} className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
            <p className="text-slate-500 text-sm">{c.label}</p>
            <p className={`text-3xl font-bold mt-2 ${c.tone}`}>{c.value}</p>
          </div>
        ))}
      </div>

      {maintenanceKpis && (
        <>
          <div className="flex items-center justify-between pt-2">
            <h2 className="text-lg font-bold text-slate-900">{t.nav.operationsMaintenanceRequests}</h2>
            <Link href="/operations/maintenance/requests" className="text-sm text-brand-gold-dark hover:underline font-medium">
              {t.nav.operationsMaintenanceRequests} →
            </Link>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
              <p className="text-slate-500 text-sm">{t.operations.kpiOpenRequests}</p>
              <p className="text-3xl font-bold mt-2 text-slate-900">{maintenanceKpis.openRequests}</p>
            </div>
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
              <p className="text-slate-500 text-sm">{t.operations.kpiEmergencyRequests}</p>
              <p className="text-3xl font-bold mt-2 text-red-600">{maintenanceKpis.emergencyRequests}</p>
            </div>
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
              <p className="text-slate-500 text-sm">{t.operations.kpiSlaBreached}</p>
              <p className="text-3xl font-bold mt-2 text-red-600">{maintenanceKpis.slaBreached}</p>
            </div>
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
              <p className="text-slate-500 text-sm">{t.operations.kpiWorkOrdersInProgress}</p>
              <p className="text-3xl font-bold mt-2 text-brand-gold-dark">{maintenanceKpis.workOrdersInProgress}</p>
            </div>
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
              <p className="text-slate-500 text-sm">{t.operations.kpiWorkOrdersOnHold}</p>
              <p className="text-3xl font-bold mt-2 text-amber-600">{maintenanceKpis.workOrdersOnHold}</p>
            </div>
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
              <p className="text-slate-500 text-sm">{t.operations.kpiCompletedAwaitingVerification}</p>
              <p className="text-3xl font-bold mt-2 text-slate-900">{maintenanceKpis.completedAwaitingVerification}</p>
            </div>
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
              <p className="text-slate-500 text-sm">{t.operations.kpiClosedThisMonth}</p>
              <p className="text-3xl font-bold mt-2 text-emerald-600">{maintenanceKpis.closedThisMonth}</p>
            </div>
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
              <p className="text-slate-500 text-sm">{t.operations.kpiMaintenanceCostThisMonth}</p>
              <p className="text-2xl font-bold mt-2 text-slate-900">{moneyFmt.format(Number(maintenanceKpis.maintenanceCostThisMonth))}</p>
            </div>
          </div>
        </>
      )}

      <div className="flex flex-wrap gap-4">
        <Link href="/operations/reports" className="text-sm text-brand-gold-dark hover:underline font-medium">
          {t.operations.reportsTitle} →
        </Link>
        {canViewMaintenance && (
          <Link href="/operations/maintenance/reports" className="text-sm text-brand-gold-dark hover:underline font-medium">
            {t.maintenance.reportsTitle} →
          </Link>
        )}
      </div>
    </div>
  );
}
