import Link from "next/link";
import { getLocale, getDictionary } from "@/lib/i18n";

export default async function ReportsIndexPage() {
  const locale = await getLocale();
  const t = getDictionary(locale);

  const cards = [
    { href: "/reports/renter-statement", icon: "🧑‍💼", ...t.reports.cards.renterStatement },
    { href: "/reports/unit-statement", icon: "🚪", ...t.reports.cards.unitStatement },
    { href: "/reports/overdue", icon: "⏰", ...t.reports.cards.overdue },
    { href: "/reports/active-contracts", icon: "📄", ...t.reports.cards.activeContracts },
    { href: "/reports/expiring-contracts", icon: "📆", ...t.reports.cards.expiringContracts },
    { href: "/reports/collections", icon: "💰", ...t.reports.cards.collections },
    { href: "/reports/vat", icon: "🧾", ...t.reports.cards.vat },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">{t.reports.title}</h1>
        <p className="text-slate-500 text-sm mt-1">{t.reports.subtitle}</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {cards.map((card) => (
          <Link
            key={card.href}
            href={card.href}
            className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 hover:border-brand-gold hover:shadow-md transition-all"
          >
            <div className="text-2xl mb-2">{card.icon}</div>
            <h2 className="font-semibold text-slate-800">{card.title}</h2>
            <p className="text-slate-500 text-sm mt-1">{card.description}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
