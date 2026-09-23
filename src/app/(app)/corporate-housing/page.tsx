import Link from "next/link";
import { getCorporateHousingDashboard } from "@/lib/actions/corporate-housing-dashboard";
import { getLocale, getDictionary } from "@/lib/i18n";

export default async function CorporateHousingDashboardPage() {
  const [kpis, locale] = await Promise.all([getCorporateHousingDashboard(), getLocale()]);
  const t = getDictionary(locale);

  const cards: Array<{ label: string; value: string | number; tone: string }> = [
    { label: t.corporateHousing.cardActiveAccounts, value: kpis.activeAccountsCount, tone: "text-slate-900" },
    { label: t.corporateHousing.cardCorporateContracts, value: kpis.corporateContractCount, tone: "text-slate-900" },
    { label: t.corporateHousing.cardCorporateLeasedUnits, value: kpis.corporateLeasedUnitCount, tone: "text-slate-900" },
    { label: t.corporateHousing.cardActiveOccupants, value: kpis.activeOccupantsCount, tone: "text-slate-900" },
    { label: t.corporateHousing.cardActiveAllocations, value: kpis.activeAllocationsCount, tone: "text-brand-gold-dark" },
    { label: t.corporateHousing.cardUnallocatedUnits, value: kpis.unallocatedCorporateUnits, tone: "text-amber-600" },
    { label: t.corporateHousing.cardAllocationRate, value: `${kpis.allocationRate}%`, tone: "text-emerald-600" },
    { label: t.corporateHousing.cardOpenMaintenance, value: kpis.openMaintenanceCount, tone: "text-red-600" },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{t.corporateHousing.dashboardTitle}</h1>
          <p className="text-slate-500 text-sm mt-1">{t.corporateHousing.dashboardSubtitle}</p>
        </div>
        <Link href="/corporate-housing/accounts" className="bg-brand-gold hover:bg-brand-gold-dark text-brand-black rounded-lg px-5 py-2.5 font-semibold text-sm">
          {t.corporateHousing.navAccounts}
        </Link>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {cards.map((c) => (
          <div key={c.label} className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
            <p className="text-slate-500 text-sm">{c.label}</p>
            <p className={`text-3xl font-bold mt-2 ${c.tone}`}>{c.value}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
          <p className="text-slate-500 text-sm">{t.corporateHousing.cardPlannedArrivals} (7d / 30d)</p>
          <p className="text-2xl font-bold mt-2 text-slate-900">
            {kpis.plannedArrivals7d} / {kpis.plannedArrivals30d}
          </p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
          <p className="text-slate-500 text-sm">{t.corporateHousing.cardPlannedDepartures} (7d / 30d)</p>
          <p className="text-2xl font-bold mt-2 text-slate-900">
            {kpis.plannedDepartures7d} / {kpis.plannedDepartures30d}
          </p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
          <p className="text-slate-500 text-sm">{t.corporateHousing.cardContractsExpiringSoon} (30 / 60 / 90)</p>
          <p className="text-2xl font-bold mt-2 text-slate-900">
            {kpis.contractsExpiringSoon30} / {kpis.contractsExpiringSoon60} / {kpis.contractsExpiringSoon90}
          </p>
        </div>
      </div>

      <div className="flex flex-wrap gap-4">
        <Link href="/corporate-housing/accounts" className="text-sm text-brand-gold-dark hover:underline font-medium">
          {t.corporateHousing.navAccounts} →
        </Link>
        <Link href="/corporate-housing/occupants" className="text-sm text-brand-gold-dark hover:underline font-medium">
          {t.corporateHousing.navOccupants} →
        </Link>
        <Link href="/corporate-housing/allocations" className="text-sm text-brand-gold-dark hover:underline font-medium">
          {t.corporateHousing.navAllocations} →
        </Link>
        <Link href="/corporate-housing/reports" className="text-sm text-brand-gold-dark hover:underline font-medium">
          {t.corporateHousing.navReports} →
        </Link>
      </div>
    </div>
  );
}
