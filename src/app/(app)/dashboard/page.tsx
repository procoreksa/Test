import Link from "next/link";
import { getDashboardStats } from "@/lib/actions/dashboard";
import { StatCard } from "@/components/stat-card";
import { CollectionsChart } from "@/components/charts/collections-chart";
import { getLocale, getDictionary, currencyFormatter, monthDateFormatter, pickLocalized } from "@/lib/i18n";
import { unitLocationLabel } from "@/lib/unit-location";

export default async function DashboardPage() {
  const [stats, locale] = await Promise.all([getDashboardStats(), getLocale()]);
  const t = getDictionary(locale);
  const sar = currencyFormatter(locale);
  const dateFmt = monthDateFormatter(locale);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">{t.dashboard.title}</h1>
        <p className="text-slate-500 text-sm mt-1">{t.dashboard.subtitle}</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label={t.dashboard.occupancyRate}
          value={`${stats.occupancyRate}%`}
          hint={t.dashboard.occupancyHint(stats.unitsOccupied, stats.unitsTotal)}
        />
        <StatCard label={t.dashboard.activeContracts} value={String(stats.contractsActive)} />
        <StatCard
          label={t.dashboard.totalCollected}
          value={sar.format(stats.totalCollected)}
          tone="positive"
          hint={t.dashboard.totalCollectedHint(sar.format(stats.totalInvoiced))}
        />
        <StatCard
          label={t.dashboard.overdueAmount}
          value={sar.format(stats.totalOutstanding)}
          tone={stats.totalOutstanding > 0 ? "danger" : "positive"}
          hint={t.dashboard.overdueHint(stats.overdueCount)}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
          <h2 className="font-semibold text-slate-800 mb-4">{t.dashboard.chartTitle}</h2>
          <CollectionsChart
            data={stats.monthlySeries}
            labels={{ invoiced: t.dashboard.chartInvoiced, collected: t.dashboard.chartCollected }}
            locale={locale}
          />
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-slate-800">{t.dashboard.overduePanelTitle}</h2>
            <Link href="/collections" className="text-sm text-brand-gold-dark hover:underline">
              {t.dashboard.viewAll}
            </Link>
          </div>
          {stats.overdueSchedules.length === 0 ? (
            <p className="text-sm text-slate-400">{t.dashboard.noOverdue}</p>
          ) : (
            <ul className="space-y-3">
              {stats.overdueSchedules.map((s) => (
                <li key={s.id} className="flex items-center justify-between text-sm border-b border-slate-100 pb-2 last:border-0">
                  <div>
                    <p className="font-medium text-slate-800">
                      {pickLocalized(locale, s.contract.renter.fullNameAr, s.contract.renter.fullName)}
                    </p>
                    <p className="text-slate-400 text-xs">
                      {s.contract.unit.unitNumber} · {t.dashboard.dueOn(dateFmt.format(s.dueDate))}
                    </p>
                  </div>
                  <span className="text-red-600 font-semibold">{sar.format(Number(s.amount))}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
          <div className="flex items-center justify-between mb-1">
            <h2 className="font-semibold text-slate-800">{t.dashboard.expiringPanelTitle}</h2>
            <Link href="/contracts" className="text-sm text-brand-gold-dark hover:underline">
              {t.dashboard.viewContracts}
            </Link>
          </div>
          <p className="text-xs text-slate-400 mb-4">{t.dashboard.expiringHint(90)}</p>
          {stats.expiringContracts.length === 0 ? (
            <p className="text-sm text-slate-400">{t.dashboard.noExpiring}</p>
          ) : (
            <ul className="space-y-3">
              {stats.expiringContracts.map((c) => (
                <li key={c.id} className="flex items-center justify-between text-sm border-b border-slate-100 pb-2 last:border-0">
                  <div>
                    <p className="font-medium text-slate-800">
                      {pickLocalized(locale, c.renter.fullNameAr, c.renter.fullName)}
                    </p>
                    <p className="text-slate-400 text-xs">
                      {unitLocationLabel(locale, c.unit)} / {c.unit.unitNumber}
                    </p>
                  </div>
                  <span className="text-amber-600 font-semibold text-xs">{t.dashboard.expiresOn(dateFmt.format(c.endDate))}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
          <div className="flex items-center justify-between mb-1">
            <h2 className="font-semibold text-slate-800">{t.dashboard.unclosedPanelTitle}</h2>
            <Link href="/contracts" className="text-sm text-brand-gold-dark hover:underline">
              {t.dashboard.viewContracts}
            </Link>
          </div>
          <p className="text-xs text-slate-400 mb-4">{t.dashboard.unclosedHint}</p>
          {stats.unclosedContracts.length === 0 ? (
            <p className="text-sm text-slate-400">{t.dashboard.noUnclosed}</p>
          ) : (
            <ul className="space-y-3">
              {stats.unclosedContracts.map((c) => (
                <li key={c.id} className="flex items-center justify-between text-sm border-b border-slate-100 pb-2 last:border-0">
                  <div>
                    <p className="font-medium text-slate-800">
                      {pickLocalized(locale, c.renter.fullNameAr, c.renter.fullName)}
                    </p>
                    <p className="text-slate-400 text-xs">
                      {unitLocationLabel(locale, c.unit)} / {c.unit.unitNumber}
                    </p>
                  </div>
                  <span className="text-red-600 font-semibold text-xs">{t.dashboard.endedOn(dateFmt.format(c.endDate))}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
        <h2 className="font-semibold text-slate-800 mb-1">{t.dashboard.vatTitle}</h2>
        <p className="text-3xl font-bold text-brand-gold-dark">{sar.format(stats.totalVat)}</p>
        <p className="text-xs text-slate-400 mt-1">{t.dashboard.vatHint}</p>
      </div>

      <div>
        <h2 className="font-semibold text-slate-800 mb-4">{t.dashboard.hierarchyPanelTitle}</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard label={t.dashboard.totalCompounds} value={String(stats.totalCompounds)} />
          <StatCard label={t.dashboard.totalBuildings} value={String(stats.totalBuildings)} />
          <StatCard label={t.dashboard.totalFloors} value={String(stats.totalFloors)} />
          <StatCard label={t.dashboard.totalUnitsCount} value={String(stats.unitsTotal)} />
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
        <h2 className="font-semibold text-slate-800 mb-4">{t.dashboard.occupancyByCompoundTitle}</h2>
        {stats.occupancyByCompound.length === 0 ? (
          <p className="text-sm text-slate-400">{t.dashboard.occupancyByCompoundEmpty}</p>
        ) : (
          <ul className="space-y-3">
            {stats.occupancyByCompound.map((c) => (
              <li key={c.compoundId} className="flex items-center justify-between text-sm border-b border-slate-100 pb-2 last:border-0">
                <span className="font-medium text-slate-800">{pickLocalized(locale, c.arabicName, c.name)}</span>
                <span className="text-slate-500 text-xs">
                  {t.dashboard.occupancyHint(c.occupied, c.total)} · {c.occupancyRate}%
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
