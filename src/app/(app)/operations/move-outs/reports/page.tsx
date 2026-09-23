import Link from "next/link";
import { getLocale, getDictionary } from "@/lib/i18n";

export default async function MoveOutReportsIndexPage() {
  const t = getDictionary(await getLocale());

  const cards = [
    { href: "/operations/move-outs/reports/schedule", icon: "🗓️", title: t.operations.reportMoveOutSchedule },
    { href: "/operations/move-outs/reports/completion", icon: "✅", title: t.operations.reportMoveOutCompletion },
    { href: "/operations/move-outs/reports/unit-condition", icon: "🏠", title: t.operations.reportMoveOutUnitCondition },
    { href: "/operations/move-outs/reports/findings", icon: "⚠️", title: t.operations.reportMoveOutFindings },
    { href: "/operations/move-outs/reports/inventory-variance", icon: "🛋️", title: t.operations.reportInventoryVariance },
    { href: "/operations/move-outs/reports/meter-reading", icon: "🔌", title: t.operations.reportMoveOutMeterReading },
    { href: "/operations/move-outs/reports/keys-access", icon: "🔑", title: t.operations.reportMoveOutKeysAccess },
    { href: "/operations/move-outs/reports/maintenance-findings", icon: "🛠️", title: t.operations.reportMoveOutMaintenanceFindings },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">{t.moveOut.listTitle} — {t.operations.reportsTitle}</h1>
        <p className="text-slate-500 text-sm mt-1">{t.operations.reportsMoveOutSubtitle}</p>
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
