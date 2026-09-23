import Link from "next/link";
import { getLocale, getDictionary } from "@/lib/i18n";

export default async function SettlementReportsIndexPage() {
  const t = getDictionary(await getLocale());

  const cards = [
    { href: "/operations/settlements/reports/settlement", icon: "📊", title: t.securityDeposit.reportSettlement },
    { href: "/operations/settlements/reports/deposit-balance", icon: "💰", title: t.securityDeposit.reportDepositBalance },
    { href: "/operations/settlements/reports/refund", icon: "💸", title: t.securityDeposit.reportRefund },
    { href: "/operations/settlements/reports/deductions", icon: "🧾", title: t.securityDeposit.reportDeductions },
    { href: "/operations/settlements/reports/outstanding-additional", icon: "📌", title: t.securityDeposit.reportOutstandingAdditional },
    { href: "/operations/settlements/reports/disputed", icon: "⚠️", title: t.securityDeposit.reportDisputed },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">
          {t.securityDeposit.listTitle} — {t.securityDeposit.reportsTitle}
        </h1>
        <p className="text-slate-500 text-sm mt-1">{t.securityDeposit.reportsSubtitle}</p>
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
