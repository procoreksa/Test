import Link from "next/link";
import { getCommunicationsDashboard } from "@/lib/actions/communications";
import { getLocale, getDictionary } from "@/lib/i18n";
import { StatusBadge } from "./status-badge";

export default async function CommunicationsDashboardPage() {
  const [dashboard, locale] = await Promise.all([getCommunicationsDashboard(), getLocale()]);
  const t = getDictionary(locale);

  const cards: Array<{ label: string; value: number; tone: string }> = [
    { label: t.communications.cardQueued, value: dashboard.countsByStatus.QUEUED, tone: "text-slate-900" },
    { label: t.communications.cardProcessing, value: dashboard.countsByStatus.PROCESSING, tone: "text-sky-600" },
    { label: t.communications.cardSent, value: dashboard.countsByStatus.SENT, tone: "text-emerald-600" },
    { label: t.communications.cardDelivered, value: dashboard.countsByStatus.DELIVERED, tone: "text-emerald-700" },
    { label: t.communications.cardFailed, value: dashboard.countsByStatus.FAILED, tone: "text-red-600" },
    { label: t.communications.cardCancelled, value: dashboard.countsByStatus.CANCELLED, tone: "text-slate-400" },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{t.communications.dashboardTitle}</h1>
          <p className="text-slate-500 text-sm mt-1">{t.communications.dashboardSubtitle}</p>
        </div>
        <Link href="/communications/messages" className="bg-brand-gold hover:bg-brand-gold-dark text-brand-black rounded-lg px-5 py-2.5 font-semibold text-sm">
          {t.communications.navMessages}
        </Link>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
        {cards.map((c) => (
          <div key={c.label} className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
            <p className="text-slate-500 text-sm">{c.label}</p>
            <p className={`text-3xl font-bold mt-2 ${c.tone}`}>{c.value}</p>
          </div>
        ))}
      </div>

      <div>
        <h2 className="text-lg font-semibold text-slate-900 mb-3">{t.communications.sectionRecentMessages}</h2>
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-500 text-right">
              <tr>
                <th className="px-4 py-3 font-medium">{t.communications.colEvent}</th>
                <th className="px-4 py-3 font-medium">{t.communications.colChannel}</th>
                <th className="px-4 py-3 font-medium">{t.communications.colDestination}</th>
                <th className="px-4 py-3 font-medium">{t.communications.colStatus}</th>
                <th className="px-4 py-3 font-medium">{t.communications.colCreatedAt}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {dashboard.recentMessages.map((m) => (
                <tr key={m.id}>
                  <td className="px-4 py-3 font-medium text-slate-800 whitespace-nowrap">
                    <Link href={`/communications/messages/${m.id}`} className="hover:underline">
                      {m.eventType}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-slate-700">{t.communicationChannel[m.channel]}</td>
                  <td className="px-4 py-3 text-slate-500">{m.destinationMasked}</td>
                  <td className="px-4 py-3">
                    <StatusBadge status={m.status} label={t.communicationMessageStatus[m.status]} />
                  </td>
                  <td className="px-4 py-3 text-slate-500 whitespace-nowrap">{new Date(m.createdAt).toLocaleString(locale)}</td>
                </tr>
              ))}
              {dashboard.recentMessages.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-5 py-8 text-center text-slate-400">
                    {t.communications.emptyMessages}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="flex flex-wrap gap-4">
        <Link href="/communications/templates" className="text-sm text-brand-gold-dark hover:underline font-medium">
          {t.communications.navTemplates} →
        </Link>
        <Link href="/communications/rules" className="text-sm text-brand-gold-dark hover:underline font-medium">
          {t.communications.navRules} →
        </Link>
      </div>
    </div>
  );
}
