import Link from "next/link";
import { getTenantContractDetail } from "@/lib/actions/portal/tenancy";
import { getLocale, getDictionary, currencyFormatter, shortDateFormatter } from "@/lib/i18n";
import { unitLocationLabel } from "@/lib/unit-location";

export default async function TenantContractDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [contract, locale] = await Promise.all([getTenantContractDetail(id), getLocale()]);
  const t = getDictionary(locale);
  const moneyFmt = currencyFormatter(locale);
  const dateFmt = shortDateFormatter(locale);

  return (
    <div className="space-y-6">
      <div>
        <Link href="/portal/contracts" className="text-brand-gold-dark hover:underline text-sm">
          ← {t.tenantPortal.contractsTitle}
        </Link>
        <h1 className="text-2xl font-bold text-slate-900 mt-2">{contract.contractNumber}</h1>
      </div>

      <section className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-y-3 text-sm">
          <dt className="text-slate-500">{t.tenantPortal.fieldStatus}</dt>
          <dd className="text-slate-800 font-medium">{t.contractStatus[contract.status]}</dd>
          <dt className="text-slate-500">{t.tenantPortal.fieldUnit}</dt>
          <dd className="text-slate-800 font-medium">
            {contract.unit.unitNumber} — {unitLocationLabel(locale, contract.unit)}
          </dd>
          <dt className="text-slate-500">{t.tenantPortal.fieldStartDate}</dt>
          <dd className="text-slate-800 font-medium">{dateFmt.format(contract.startDate)}</dd>
          <dt className="text-slate-500">{t.tenantPortal.fieldEndDate}</dt>
          <dd className="text-slate-800 font-medium">{dateFmt.format(contract.endDate)}</dd>
          <dt className="text-slate-500">{t.tenantPortal.fieldRent}</dt>
          <dd className="text-slate-800 font-medium">{moneyFmt.format(Number(contract.rentAmount))}</dd>
          <dt className="text-slate-500">{t.tenantPortal.fieldPaymentFrequency}</dt>
          <dd className="text-slate-800 font-medium">{t.paymentFrequency[contract.paymentFrequency]}</dd>
          <dt className="text-slate-500">{t.tenantPortal.fieldSecurityDepositRequired}</dt>
          <dd className="text-slate-800 font-medium">{contract.securityDeposit ? moneyFmt.format(Number(contract.securityDeposit)) : "—"}</dd>
          {contract.renewedIntoContract && (
            <>
              <dt className="text-slate-500">{t.tenantPortal.renewedInto}</dt>
              <dd className="text-slate-800 font-medium">
                <Link href={`/portal/contracts/${contract.renewedIntoContract.id}`} className="text-brand-gold-dark hover:underline">
                  {contract.renewedIntoContract.contractNumber}
                </Link>
              </dd>
            </>
          )}
        </dl>
      </section>

      <p className="text-xs text-slate-400">{t.tenantPortal.contractDocumentNotice}</p>
    </div>
  );
}
