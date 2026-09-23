import Link from "next/link";
import { getOwnerPortalDashboard } from "@/lib/actions/owner-portal/dashboard";
import { getLocale, getDictionary, currencyFormatter } from "@/lib/i18n";

export default async function OwnerPortalDashboardPage() {
  const [data, locale] = await Promise.all([getOwnerPortalDashboard(), getLocale()]);
  const t = getDictionary(locale);
  const moneyFmt = currencyFormatter(locale);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">{t.ownerPortal.dashboardTitle}</h1>
        <p className="text-slate-500 text-sm mt-1">{t.ownerPortal.dashboardSubtitle}</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
          <p className="text-slate-500 text-sm">{t.ownerPortal.cardProperties}</p>
          <p className="text-lg font-bold mt-2 text-slate-900">
            <Link href="/owner-portal/properties" className="hover:underline">
              {data.propertyCount}
            </Link>
          </p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
          <p className="text-slate-500 text-sm">{t.ownerPortal.cardUnits}</p>
          <p className="text-lg font-bold mt-2 text-slate-900">
            <Link href="/owner-portal/units" className="hover:underline">
              {data.unitCount}
            </Link>
          </p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
          <p className="text-slate-500 text-sm">{t.ownerPortal.cardOccupied}</p>
          <p className="text-lg font-bold mt-2 text-slate-900">{data.occupied}</p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
          <p className="text-slate-500 text-sm">{t.ownerPortal.cardVacant}</p>
          <p className="text-lg font-bold mt-2 text-slate-900">{data.vacant}</p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
          <p className="text-slate-500 text-sm">{t.ownerPortal.cardOccupancyRate}</p>
          <p className="text-lg font-bold mt-2 text-slate-900">{data.occupancyRate}%</p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
          <p className="text-slate-500 text-sm">{t.ownerPortal.cardActiveContracts}</p>
          <p className="text-lg font-bold mt-2 text-slate-900">
            <Link href="/owner-portal/contracts" className="hover:underline">
              {data.activeContracts}
            </Link>
          </p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
          <p className="text-slate-500 text-sm">{t.ownerPortal.cardMonthlyIncome}</p>
          <p className="text-lg font-bold mt-2 text-emerald-700">{moneyFmt.format(Number(data.monthlyIncome))}</p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
          <p className="text-slate-500 text-sm">{t.ownerPortal.cardMonthlyExpenses}</p>
          <p className="text-lg font-bold mt-2 text-red-700">{moneyFmt.format(Number(data.monthlyExpenses))}</p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
          <p className="text-slate-500 text-sm">{t.ownerPortal.cardNetPosition}</p>
          <p className="text-lg font-bold mt-2 text-slate-900">{moneyFmt.format(Number(data.netPosition))}</p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
          <p className="text-slate-500 text-sm">{t.ownerPortal.cardOutstandingBalance}</p>
          <p className="text-lg font-bold mt-2 text-slate-900">
            <Link href="/owner-portal/ledger" className="hover:underline">
              {moneyFmt.format(Number(data.outstandingBalance))}
            </Link>
          </p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
          <p className="text-slate-500 text-sm">{t.ownerPortal.cardOpenMaintenance}</p>
          <p className="text-lg font-bold mt-2 text-brand-gold-dark">
            <Link href="/owner-portal/maintenance" className="hover:underline">
              {data.openMaintenanceCount}
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
