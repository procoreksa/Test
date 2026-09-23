import Link from "next/link";
import { getOwnerPortalUnitDetail } from "@/lib/actions/owner-portal/portfolio";
import { getLocale, getDictionary, pickLocalized, currencyFormatter, shortDateFormatter } from "@/lib/i18n";

export default async function OwnerPortalUnitDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [detail, locale] = await Promise.all([getOwnerPortalUnitDetail(id), getLocale()]);
  const t = getDictionary(locale);
  const moneyFmt = currencyFormatter(locale);
  const dateFmt = shortDateFormatter(locale);
  const { unit, activeContract, moveInStatus, moveOutStatus } = detail;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">{unit.unitNumber}</h1>
        <p className="text-slate-500 text-sm mt-1">
          {pickLocalized(locale, unit.compoundArabicName, unit.compoundName)} — {pickLocalized(locale, unit.buildingNameAr, unit.buildingName)}
        </p>
      </div>

      <section className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-y-3 text-sm">
          <div>
            <dt className="text-slate-500">{t.ownerPortal.colOccupancyStatus}</dt>
            <dd className="text-slate-800 font-medium">{t.unitStatus[unit.status as keyof typeof t.unitStatus]}</dd>
          </div>
          <div>
            <dt className="text-slate-500">{t.ownerPortal.fieldOwnershipPercentage}</dt>
            <dd className="text-slate-800 font-medium">{Number(unit.ownershipPercentage).toFixed(2)}%</dd>
          </div>
          {unit.floorName && (
            <div>
              <dt className="text-slate-500">{t.ownerPortal.colFloor}</dt>
              <dd className="text-slate-800 font-medium">{unit.floorName}</dd>
            </div>
          )}
          {moveInStatus && (
            <div>
              <dt className="text-slate-500">{t.ownerPortal.moveInStatusLabel}</dt>
              <dd className="text-slate-800 font-medium">{t.moveInStatus[moveInStatus as keyof typeof t.moveInStatus]}</dd>
            </div>
          )}
          {moveOutStatus && (
            <div>
              <dt className="text-slate-500">{t.ownerPortal.moveOutStatusLabel}</dt>
              <dd className="text-slate-800 font-medium">{t.moveOutStatus[moveOutStatus as keyof typeof t.moveOutStatus]}</dd>
            </div>
          )}
        </dl>
      </section>

      {activeContract && (
        <section className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
          <h2 className="font-semibold text-slate-800 mb-3">{t.ownerPortal.contractsTitle}</h2>
          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-y-3 text-sm">
            <div>
              <dt className="text-slate-500">{t.ownerPortal.colContractNumber}</dt>
              <dd className="text-slate-800 font-medium">
                <Link href={`/owner-portal/contracts/${activeContract.id}`} className="hover:underline">
                  {activeContract.contractNumber}
                </Link>
              </dd>
            </div>
            <div>
              <dt className="text-slate-500">{t.ownerPortal.colTenant}</dt>
              <dd className="text-slate-800 font-medium">{pickLocalized(locale, activeContract.renter.fullNameAr, activeContract.renter.fullName)}</dd>
            </div>
            <div>
              <dt className="text-slate-500">{t.ownerPortal.colRent}</dt>
              <dd className="text-slate-800 font-medium">{moneyFmt.format(Number(activeContract.rentAmount))}</dd>
            </div>
            <div>
              <dt className="text-slate-500">{t.ownerPortal.colEndDate}</dt>
              <dd className="text-slate-800 font-medium">{dateFmt.format(activeContract.endDate)}</dd>
            </div>
          </dl>
        </section>
      )}
    </div>
  );
}
