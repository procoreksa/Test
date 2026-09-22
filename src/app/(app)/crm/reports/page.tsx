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
