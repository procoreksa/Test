import Link from "next/link";
import { getCrmDashboardStats } from "@/lib/actions/crm";
import { StatCard } from "@/components/stat-card";
import { getLocale, getDictionary } from "@/lib/i18n";

export default async function CrmDashboardPage() {
  const [stats, locale] = await Promise.all([getCrmDashboardStats(), getLocale()]);
  const t = getDictionary(locale);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">{t.crm.dashboardTitle}</h1>
        <p className="text-slate-500 text-sm mt-1">{t.crm.dashboardSubtitle}</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label={t.crm.kpiActiveLeads} value={String(stats.totalActive)} />
        <StatCard label={t.crm.kpiNewLeads} value={String(stats.newCount)} />
        <StatCard label={t.crm.kpiQualifiedLeads} value={String(stats.qualifiedCount)} />
        <StatCard label={t.crm.kpiConversionRate} value={`${stats.conversionRate}%`} tone="positive" />
        <StatCard label={t.crm.kpiWonLeads} value={String(stats.wonCount)} tone="positive" />
        <StatCard label={t.crm.kpiLostLeads} value={String(stats.lostCount)} tone="danger" />
        <StatCard label={t.crm.kpiFollowUpsToday} value={String(stats.followUpsToday)} tone="warning" />
        <StatCard label={t.crm.kpiFollowUpsOverdue} value={String(stats.followUpsOverdue)} tone={stats.followUpsOverdue > 0 ? "danger" : "default"} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
          <h2 className="font-semibold text-slate-800 mb-4">{t.crm.pipelineCountsTitle}</h2>
          <table className="w-full text-sm">
            <tbody className="divide-y divide-slate-100">
              {stats.byStatus.map((s) => (
                <tr key={s.status}>
                  <td className="py-2 text-slate-600">{t.leadStatus[s.status as keyof typeof t.leadStatus] ?? s.status}</td>
                  <td className="py-2 text-end font-semibold text-slate-800">{s.count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
          <h2 className="font-semibold text-slate-800 mb-4">{t.crm.bySourceTitle}</h2>
          <table className="w-full text-sm">
            <tbody className="divide-y divide-slate-100">
              {stats.bySource.map((s) => (
                <tr key={s.source}>
                  <td className="py-2 text-slate-600">{t.leadSource[s.source as keyof typeof t.leadSource] ?? s.source}</td>
                  <td className="py-2 text-end font-semibold text-slate-800">{s.count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
          <h2 className="font-semibold text-slate-800 mb-4">{t.crm.byAgentTitle}</h2>
          {stats.byAgent.length === 0 ? (
            <p className="text-sm text-slate-400">{t.crm.empty}</p>
          ) : (
            <table className="w-full text-sm">
              <tbody className="divide-y divide-slate-100">
                {stats.byAgent.map((a) => (
                  <tr key={a.userId}>
                    <td className="py-2 text-slate-600">{a.name}</td>
                    <td className="py-2 text-end font-semibold text-slate-800">
                      {a.total} ({a.conversionRate}%)
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <div className="flex gap-3">
        <Link href="/crm/leads" className="text-brand-gold-dark hover:underline text-sm font-medium">
          {t.nav.crmLeads} →
        </Link>
        <Link href="/crm/pipeline" className="text-brand-gold-dark hover:underline text-sm font-medium">
          {t.nav.crmPipeline} →
        </Link>
        <Link href="/crm/reports" className="text-brand-gold-dark hover:underline text-sm font-medium">
          {t.nav.crmReports} →
        </Link>
      </div>
    </div>
  );
}
