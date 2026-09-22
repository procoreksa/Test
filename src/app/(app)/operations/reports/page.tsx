import Link from "next/link";
import { getLocale, getDictionary } from "@/lib/i18n";

export default async function OperationsReportsIndexPage() {
  const t = getDictionary(await getLocale());

  const cards = [
    { href: "/operations/reports/schedule", icon: "🗓️", title: t.operations.reportSchedule },
    { href: "/operations/reports/completion", icon: "✅", title: t.operations.reportCompletion },
    { href: "/operations/reports/unit-condition", icon: "🏠", title: t.operations.reportUnitCondition },
    { href: "/operations/reports/handover-defects", icon: "⚠️", title: t.operations.reportHandoverDefects },
    { href: "/operations/reports/meter-reading", icon: "🔌", title: t.operations.reportMeterReading },
    { href: "/operations/reports/keys-handover", icon: "🔑", title: t.operations.reportKeysHandover },
    { href: "/operations/reports/furnished-inventory", icon: "🛋️", title: t.operations.reportFurnishedInventory },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">{t.operations.reportsTitle}</h1>
        <p className="text-slate-500 text-sm mt-1">{t.operations.reportsSubtitle}</p>
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
