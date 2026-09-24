import Link from "next/link";
import { getExecutiveOverview, getCompoundBuildingOptions } from "@/lib/actions/executive";
import { getLocale, getDictionary, currencyFormatter, pickLocalized } from "@/lib/i18n";
import { StatCard } from "@/components/stat-card";
import { DATE_RANGE_PRESETS } from "@/lib/executive/date-range";

export default async function ExecutiveDashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string; from?: string; to?: string; compoundId?: string; buildingId?: string }>;
}) {
  const params = await searchParams;
  const [overview, options, locale] = await Promise.all([getExecutiveOverview(params), getCompoundBuildingOptions(), getLocale()]);
  const t = getDictionary(locale);
  const sar = currencyFormatter(locale);
  const period = overview.filters.preset;

  const buildingsForCompound = overview.filters.compoundId
    ? options.buildings.filter((b) => b.compoundId === overview.filters.compoundId)
    : options.buildings;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">{t.executive.title}</h1>
        <p className="text-slate-500 text-sm mt-1">{t.executive.subtitle}</p>
        <p className="text-xs text-slate-400 mt-1">{t.executive.readOnlyNotice}</p>
      </div>

      <form method="get" className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 flex flex-wrap items-end gap-4">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">{t.executive.filterPeriod}</label>
          <select name="period" defaultValue={period} className="rounded-lg border border-slate-300 px-3 py-2">
            {DATE_RANGE_PRESETS.filter((p) => p !== "CUSTOM").map((p) => (
              <option key={p} value={p}>
                {t.executive.periodLabel[p]}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">{t.executive.filterCompound}</label>
          <select name="compoundId" defaultValue={overview.filters.compoundId ?? ""} className="rounded-lg border border-slate-300 px-3 py-2">
            <option value="">{t.executive.filterAllCompounds}</option>
            {options.compounds.map((c) => (
              <option key={c.id} value={c.id}>
                {pickLocalized(locale, c.arabicName, c.name)}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">{t.executive.filterBuilding}</label>
          <select name="buildingId" defaultValue={overview.filters.buildingId ?? ""} className="rounded-lg border border-slate-300 px-3 py-2">
            <option value="">{t.executive.filterAllBuildings}</option>
            {buildingsForCompound.map((b) => (
              <option key={b.id} value={b.id}>
                {pickLocalized(locale, b.nameAr, b.name)}
              </option>
            ))}
          </select>
        </div>
        <button className="bg-brand-gold hover:bg-brand-gold-dark text-brand-black rounded-lg px-5 py-2.5 font-semibold">{t.executive.filterApply}</button>
      </form>

      {overview.attention.length > 0 && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
          <h2 className="font-semibold text-slate-800 mb-3">{t.executive.sectionAttention}</h2>
          <ul className="space-y-2">
            {overview.attention.map((item) => (
              <li key={item.key} className="flex items-center justify-between text-sm border-b border-slate-100 pb-2 last:border-0">
                <div className="flex items-center gap-2">
                  <span
                    className={`inline-block w-2 h-2 rounded-full ${item.severity === "CRITICAL" ? "bg-red-500" : item.severity === "WARNING" ? "bg-amber-500" : "bg-slate-400"}`}
                  />
                  <span className="text-slate-700">{t.executive.attentionItemLabel[item.key] ?? item.key}</span>
                  <span className="text-slate-400">({item.count})</span>
                </div>
                <Link href={item.drillDownRoute} className="text-brand-gold-dark hover:underline">
                  {t.executive.viewDetails}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Row 1: Portfolio */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold text-slate-800">{t.executive.sectionPortfolio}</h2>
          <Link href="/executive/properties" className="text-sm text-brand-gold-dark hover:underline">
            {t.executive.viewDetails}
          </Link>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard label={t.executive.kpiInfo.totalUnits.title} value={String(overview.portfolio.totalUnits)} />
          <StatCard label={t.executive.kpiInfo.occupiedUnits.title} value={String(overview.portfolio.occupiedUnits)} tone="positive" />
          <StatCard label={t.executive.kpiInfo.vacantUnits.title} value={String(overview.portfolio.vacantUnits)} />
          <StatCard label={t.executive.kpiInfo.occupancyRate.title} value={`${overview.portfolio.occupancyRate}%`} />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mt-4">
          <StatCard label={t.executive.kpiInfo.activeContracts.title} value={String(overview.contracts.activeContracts)} />
          <StatCard label={t.executive.kpiInfo.contractsExpiring30.title} value={String(overview.contracts.contractsExpiring30)} />
          <StatCard label={t.executive.kpiInfo.contractsExpiring90.title} value={String(overview.contracts.contractsExpiring90)} />
          <StatCard
            label={t.executive.kpiInfo.contractsPastEndDate.title}
            value={String(overview.contracts.contractsPastEndDate)}
            tone={overview.contracts.contractsPastEndDate > 0 ? "warning" : "default"}
          />
        </div>
      </section>

      {/* Row 2: Collections */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold text-slate-800">{t.executive.sectionCollections}</h2>
          <Link href="/executive/collections" className="text-sm text-brand-gold-dark hover:underline">
            {t.executive.viewDetails}
          </Link>
        </div>
        {overview.collections ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard label={t.executive.kpiInfo.invoicedThisPeriod.title} value={sar.format(Number(overview.collections.invoicedThisPeriod))} />
            <StatCard label={t.executive.kpiInfo.collectedThisPeriod.title} value={sar.format(Number(overview.collections.collectedThisPeriod))} tone="positive" />
            <StatCard label={t.executive.kpiInfo.outstandingReceivables.title} value={sar.format(Number(overview.collections.outstandingReceivables))} />
            <StatCard
              label={t.executive.kpiInfo.overdueReceivables.title}
              value={sar.format(Number(overview.collections.overdueReceivablesAmount))}
              tone={overview.collections.overdueReceivablesCount > 0 ? "danger" : "positive"}
              hint={String(overview.collections.overdueReceivablesCount)}
            />
          </div>
        ) : (
          <p className="text-sm text-slate-400">{t.executive.restrictedNotice}</p>
        )}
      </section>

      {/* Row 3: Leasing / Operations */}
      <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div>
          <h2 className="font-semibold text-slate-800 mb-3">{t.executive.sectionLeasingFunnel}</h2>
          <div className="grid grid-cols-2 gap-4">
            <StatCard label={t.executive.kpiInfo.leadsNew.title} value={String(overview.leasingFunnel.leadsNew)} />
            <StatCard label={t.executive.kpiInfo.leadConversionRate.title} value={`${overview.leasingFunnel.leadConversionRate}%`} />
            <StatCard label={t.executive.kpiInfo.offersAccepted.title} value={String(overview.leasingFunnel.offersAccepted)} />
            <StatCard label={t.executive.kpiInfo.contractsSigned.title} value={String(overview.leasingFunnel.contractsSigned)} />
          </div>
        </div>
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold text-slate-800">{t.executive.sectionOperations}</h2>
            <Link href="/executive/operations" className="text-sm text-brand-gold-dark hover:underline">
              {t.executive.viewDetails}
            </Link>
          </div>
          {overview.operations ? (
            <div className="grid grid-cols-2 gap-4">
              <StatCard label={t.executive.kpiInfo.moveInsUpcoming.title} value={String(overview.operations.moveInsUpcomingWeek)} />
              <StatCard label={t.executive.kpiInfo.moveOutsUpcoming.title} value={String(overview.operations.moveOutsUpcomingWeek)} />
              <StatCard label={t.executive.kpiInfo.pendingSettlements.title} value={String(overview.operations.pendingSettlements)} />
              <StatCard label={t.executive.refundsDueAmount} value={sar.format(Number(overview.operations.refundAmountOutstanding))} hint={String(overview.operations.refundsDueCount)} />
            </div>
          ) : (
            <p className="text-sm text-slate-400">{t.executive.restrictedNotice}</p>
          )}
        </div>
      </section>

      {/* Row 4: Maintenance / Corporate Housing */}
      <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold text-slate-800">{t.executive.sectionMaintenance}</h2>
            <Link href="/executive/maintenance" className="text-sm text-brand-gold-dark hover:underline">
              {t.executive.viewDetails}
            </Link>
          </div>
          {overview.maintenance ? (
            <div className="grid grid-cols-2 gap-4">
              <StatCard label={t.executive.kpiInfo.openMaintenanceRequests.title} value={String(overview.maintenance.openRequests)} />
              <StatCard label={t.executive.kpiInfo.overdueMaintenanceSla.title} value={String(overview.maintenance.slaBreached)} tone={overview.maintenance.slaBreached > 0 ? "danger" : "positive"} />
              {overview.maintenance.maintenanceCostThisPeriod !== null ? (
                <StatCard label={t.executive.kpiInfo.maintenanceCostThisPeriod.title} value={sar.format(Number(overview.maintenance.maintenanceCostThisPeriod))} />
              ) : (
                <StatCard label={t.executive.kpiInfo.maintenanceCostThisPeriod.title} value="—" hint={t.executive.costRedactedNotice} />
              )}
              <StatCard label={t.executive.attentionItemLabel.maintenanceEmergency} value={String(overview.maintenance.emergencyRequests)} />
            </div>
          ) : (
            <p className="text-sm text-slate-400">{t.executive.restrictedNotice}</p>
          )}
        </div>
        <div>
          <h2 className="font-semibold text-slate-800 mb-3">{t.executive.sectionCorporateHousing}</h2>
          {overview.corporateHousing ? (
            <div className="grid grid-cols-2 gap-4">
              <StatCard label={t.executive.kpiInfo.corporateLeasedUnits.title} value={String(overview.corporateHousing.corporateLeasedUnits)} />
              <StatCard label={t.executive.kpiInfo.activeCorporateOccupants.title} value={String(overview.corporateHousing.activeCorporateOccupants)} />
              <StatCard label={t.executive.kpiInfo.corporateAllocationRate.title} value={`${overview.corporateHousing.allocationRate}%`} />
              <StatCard label={t.executive.attentionItemLabel.corporateUnallocated} value={String(overview.corporateHousing.unallocatedCorporateUnits)} />
            </div>
          ) : (
            <p className="text-sm text-slate-400">{t.executive.restrictedNotice}</p>
          )}
        </div>
      </section>

      {/* Row 5: Owner Financials / Communications / Documents */}
      <section className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold text-slate-800">{t.executive.sectionOwnerFinancials}</h2>
            <Link href="/reports/owner-statement" className="text-sm text-brand-gold-dark hover:underline">
              {t.executive.viewDetails}
            </Link>
          </div>
          {overview.ownerFinancials ? (
            <div className="space-y-2">
              <StatCard label={t.executive.ownerTotalIncome} value={sar.format(Number(overview.ownerFinancials.totalIncome))} tone="positive" />
              <StatCard label={t.executive.ownerTotalExpenses} value={sar.format(Number(overview.ownerFinancials.totalExpenses))} />
            </div>
          ) : (
            <p className="text-sm text-slate-400">{t.executive.restrictedNotice}</p>
          )}
        </div>
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold text-slate-800">{t.executive.sectionCommunications}</h2>
            <Link href="/communications" className="text-sm text-brand-gold-dark hover:underline">
              {t.executive.viewDetails}
            </Link>
          </div>
          {overview.communications ? (
            <div className="space-y-2">
              <StatCard label={t.executive.kpiInfo.communicationDeliveryRate.title} value={`${overview.communications.deliveryRate}%`} />
              <StatCard label={t.executive.kpiInfo.communicationFailures.title} value={String(overview.communications.failed)} tone={overview.communications.failed > 0 ? "danger" : "positive"} />
            </div>
          ) : (
            <p className="text-sm text-slate-400">{t.executive.restrictedNotice}</p>
          )}
        </div>
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold text-slate-800">{t.executive.sectionDocuments}</h2>
            <Link href="/documents" className="text-sm text-brand-gold-dark hover:underline">
              {t.executive.viewDetails}
            </Link>
          </div>
          <StatCard label={t.executive.kpiInfo.activeDocuments.title} value={String(overview.documents.activeDocuments)} />
        </div>
      </section>
    </div>
  );
}
