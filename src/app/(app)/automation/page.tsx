import Link from "next/link";
import { getAutomationDashboard } from "@/lib/actions/automation";
import { getLocale, getDictionary } from "@/lib/i18n";

export default async function AutomationDashboardPage() {
  const [dashboard, locale] = await Promise.all([getAutomationDashboard(), getLocale()]);
  const t = getDictionary(locale);

  const cards: Array<{ label: string; value: number; tone: string }> = [
    { label: t.automation.cardPendingJobs, value: dashboard.pendingJobs, tone: "text-amber-600" },
    { label: t.automation.cardRunningJobs, value: dashboard.runningJobs, tone: "text-sky-600" },
    { label: t.automation.cardFailedJobs, value: dashboard.failedJobs, tone: "text-red-600" },
    { label: t.automation.cardCompletedToday, value: dashboard.completedToday, tone: "text-emerald-600" },
    { label: t.automation.cardOutboxPending, value: dashboard.outboxPending, tone: "text-amber-600" },
    { label: t.automation.cardOutboxFailed, value: dashboard.outboxFailed, tone: "text-red-600" },
    { label: t.automation.cardCommunicationQueue, value: dashboard.communicationQueue, tone: "text-slate-900" },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{t.automation.dashboardTitle}</h1>
          <p className="text-slate-500 text-sm mt-1">{t.automation.dashboardSubtitle}</p>
        </div>
        <div className="flex gap-2">
          <Link href="/automation/jobs" className="bg-brand-gold hover:bg-brand-gold-dark text-brand-black rounded-lg px-5 py-2.5 font-semibold text-sm">
            {t.automation.navJobs}
          </Link>
          <Link href="/automation/outbox" className="bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 rounded-lg px-5 py-2.5 font-semibold text-sm">
            {t.automation.navOutbox}
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
        {cards.map((c) => (
          <div key={c.label} className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
            <p className="text-slate-500 text-sm">{c.label}</p>
            <p className={`text-3xl font-bold mt-2 ${c.tone}`}>{c.value}</p>
          </div>
        ))}
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
        <p className="text-slate-500 text-sm">{t.automation.sectionLastSchedulerRun}</p>
        <p className="text-lg font-semibold text-slate-900 mt-2">
          {dashboard.lastSchedulerRunAt ? new Date(dashboard.lastSchedulerRunAt).toLocaleString(locale) : t.automation.lastSchedulerRunNever}
        </p>
      </div>
    </div>
  );
}
