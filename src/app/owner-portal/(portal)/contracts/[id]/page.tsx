import { getOwnerPortalContractDetail } from "@/lib/actions/owner-portal/contracts";
import { getLocale, getDictionary, pickLocalized, currencyFormatter, shortDateFormatter } from "@/lib/i18n";

export default async function OwnerPortalContractDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [contract, locale] = await Promise.all([getOwnerPortalContractDetail(id), getLocale()]);
  const t = getDictionary(locale);
  const moneyFmt = currencyFormatter(locale);
  const dateFmt = shortDateFormatter(locale);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-slate-900">{contract.contractNumber}</h1>

      <section className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-y-3 text-sm">
          <div>
            <dt className="text-slate-500">{t.ownerPortal.colUnit}</dt>
            <dd className="text-slate-800 font-medium">{contract.unit.unitNumber}</dd>
          </div>
          <div>
            <dt className="text-slate-500">{t.ownerPortal.colTenant}</dt>
            <dd className="text-slate-800 font-medium">{pickLocalized(locale, contract.renter.fullNameAr, contract.renter.fullName)}</dd>
          </div>
          <div>
            <dt className="text-slate-500">{t.ownerPortal.colStartDate}</dt>
            <dd className="text-slate-800 font-medium">{dateFmt.format(contract.startDate)}</dd>
          </div>
          <div>
            <dt className="text-slate-500">{t.ownerPortal.colEndDate}</dt>
            <dd className="text-slate-800 font-medium">{dateFmt.format(contract.endDate)}</dd>
          </div>
          <div>
            <dt className="text-slate-500">{t.ownerPortal.colRent}</dt>
            <dd className="text-slate-800 font-medium">{moneyFmt.format(Number(contract.rentAmount))}</dd>
          </div>
          <div>
            <dt className="text-slate-500">{t.ownerPortal.colPaymentFrequency}</dt>
            <dd className="text-slate-800 font-medium">{t.paymentFrequency[contract.paymentFrequency as keyof typeof t.paymentFrequency]}</dd>
          </div>
          <div>
            <dt className="text-slate-500">{t.ownerPortal.colStatus}</dt>
            <dd className="text-slate-800 font-medium">{t.contractStatus[contract.status as keyof typeof t.contractStatus]}</dd>
          </div>
        </dl>
      </section>
    </div>
  );
}
