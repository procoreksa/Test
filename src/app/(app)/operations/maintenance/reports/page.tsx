import Link from "next/link";
import { getLocale, getDictionary } from "@/lib/i18n";

export default async function MaintenanceReportsIndexPage() {
  const t = getDictionary(await getLocale());

  const cards = [
    { href: "/operations/maintenance/reports/requests", icon: "🧾", title: t.maintenance.reportRequestSummary },
    { href: "/operations/maintenance/reports/work-order-status", icon: "🛠️", title: t.maintenance.reportWorkOrderStatus },
    { href: "/operations/maintenance/reports/sla", icon: "⏱️", title: t.maintenance.reportSlaPerformance },
    { href: "/operations/maintenance/reports/by-category", icon: "🗂️", title: t.maintenance.reportByCategory },
    { href: "/operations/maintenance/reports/by-compound", icon: "🏘️", title: t.maintenance.reportByCompound },
    { href: "/operations/maintenance/reports/by-unit", icon: "🚪", title: t.maintenance.reportByUnit },
    { href: "/operations/maintenance/reports/cost", icon: "💰", title: t.maintenance.reportCost },
    { href: "/operations/maintenance/reports/vendor-performance", icon: "🧰", title: t.maintenance.reportVendorPerformance },
    { href: "/operations/maintenance/reports/technician-performance", icon: "👷", title: t.maintenance.reportTechnicianPerformance },
    { href: "/operations/maintenance/reports/recurring-issues", icon: "🔁", title: t.maintenance.reportRecurringIssue },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">{t.maintenance.reportsTitle}</h1>
        <p className="text-slate-500 text-sm mt-1">{t.maintenance.reportsSubtitle}</p>
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
