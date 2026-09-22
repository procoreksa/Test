import Link from "next/link";
import { getLocale, getDictionary } from "@/lib/i18n";

export default async function CrmReportsIndexPage() {
  const t = getDictionary(await getLocale());

  const cards = [
    { href: "/crm/reports/pipeline", icon: "📊", title: t.crm.reportPipeline },
    { href: "/crm/reports/source", icon: "📣", title: t.crm.reportSource },
    { href: "/crm/reports/conversion", icon: "📈", title: t.crm.reportConversion },
    { href: "/crm/reports/agent-performance", icon: "🧑‍💼", title: t.crm.reportAgentPerformance },
    { href: "/crm/reports/lost-analysis", icon: "📉", title: t.crm.reportLostAnalysis },
    { href: "/crm/reports/viewing-schedule", icon: "🗓️", title: t.viewing.reportSchedule },
    { href: "/crm/reports/viewing-outcome", icon: "🎯", title: t.viewing.reportOutcome },
    { href: "/crm/reports/viewing-agent-performance", icon: "🧑‍💼", title: t.viewing.reportAgentPerformance },
    { href: "/crm/reports/most-viewed-units", icon: "🏠", title: t.viewing.reportMostViewedUnits },
    { href: "/crm/reports/most-viewed-compounds", icon: "🏘️", title: t.viewing.reportMostViewedCompounds },
    { href: "/crm/reports/no-show-analysis", icon: "🚫", title: t.viewing.reportNoShowAnalysis },
    { href: "/crm/reports/offer-pipeline", icon: "📋", title: t.offer.reportPipeline },
    { href: "/crm/reports/offer-acceptance", icon: "✅", title: t.offer.reportAcceptance },
    { href: "/crm/reports/offer-discount", icon: "💸", title: t.offer.reportDiscount },
    { href: "/crm/reports/offer-value-by-compound", icon: "🏘️", title: t.offer.reportValueByCompound },
    { href: "/crm/reports/offer-agent-performance", icon: "🧑‍💼", title: t.offer.reportAgentPerformance },
    { href: "/crm/reports/rejected-offer-analysis", icon: "📉", title: t.offer.reportRejectedAnalysis },
    { href: "/crm/reports/reservations-active", icon: "🔑", title: t.reservation.reportActive },
    { href: "/crm/reports/reservation-expiry", icon: "⏳", title: t.reservation.reportExpiry },
    { href: "/crm/reports/reservation-cancellation-analysis", icon: "📉", title: t.reservation.reportCancellationAnalysis },
    { href: "/crm/reports/reservation-amount-status", icon: "💰", title: t.reservation.reportAmountStatus },
    { href: "/crm/reports/reservations-by-compound", icon: "🏘️", title: t.reservation.reportByCompound },
    { href: "/crm/reports/reservation-agent-performance", icon: "🧑‍💼", title: t.reservation.reportAgentPerformance },
    { href: "/crm/reports/funnel", icon: "🧭", title: t.reservationContract.funnelReportTitle },
    { href: "/crm/reports/contract-origination", icon: "🗂️", title: t.reservationContract.originationReportTitle },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">{t.crm.reportsTitle}</h1>
        <p className="text-slate-500 text-sm mt-1">{t.crm.reportsSubtitle}</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {cards.map((card) => (
          <Link key={card.href} href={card.href} className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 hover:border-brand-gold hover:shadow-md transition-all">
            <div className="text-2xl mb-2">{card.icon}</div>
            <h2 className="font-semibold text-slate-800">{card.title}</h2>
          </Link>
        ))}
      </div>
    </div>
  );
}
