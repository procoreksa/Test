import Link from "next/link";
import { getLocale, getDictionary } from "@/lib/i18n";

export default async function CorporateHousingReportsIndexPage() {
  const t = getDictionary(await getLocale());

  const cards = [
    { href: "/corporate-housing/reports/account-summary", icon: "🏢", title: t.corporateHousing.reportAccountSummary },
    { href: "/corporate-housing/reports/occupancy", icon: "📊", title: t.corporateHousing.reportOccupancy },
    { href: "/corporate-housing/reports/occupant-allocation", icon: "👤", title: t.corporateHousing.reportOccupantAllocation },
    { href: "/corporate-housing/reports/planned-arrivals", icon: "🛬", title: t.corporateHousing.reportPlannedArrivals },
    { href: "/corporate-housing/reports/planned-departures", icon: "🛫", title: t.corporateHousing.reportPlannedDepartures },
    { href: "/corporate-housing/reports/contract-expiry", icon: "📄", title: t.corporateHousing.reportContractExpiry },
    { href: "/corporate-housing/reports/unallocated-units", icon: "🚪", title: t.corporateHousing.reportUnallocatedUnits },
    { href: "/corporate-housing/reports/maintenance", icon: "🛠️", title: t.corporateHousing.reportMaintenance },
    { href: "/corporate-housing/reports/financial-snapshot", icon: "💰", title: t.corporateHousing.reportFinancialSnapshot },
    { href: "/corporate-housing/roster", icon: "🖨️", title: t.corporateHousing.rosterTitle },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">{t.corporateHousing.reportsTitle}</h1>
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
