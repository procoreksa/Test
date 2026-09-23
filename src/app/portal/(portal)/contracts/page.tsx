import Link from "next/link";
import { getTenantContracts } from "@/lib/actions/portal/tenancy";
import { getLocale, getDictionary, currencyFormatter, shortDateFormatter } from "@/lib/i18n";
import { unitLocationLabel } from "@/lib/unit-location";

export default async function TenantContractsPage() {
  const [{ current, historical }, locale] = await Promise.all([getTenantContracts(), getLocale()]);
  const t = getDictionary(locale);
  const moneyFmt = currencyFormatter(locale);
  const dateFmt = shortDateFormatter(locale);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">{t.tenantPortal.contractsTitle}</h1>
      </div>

      <section className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
        <h2 className="font-semibold text-slate-800 mb-3">{t.tenantPortal.currentTenancyTitle}</h2>
        {current ? <ContractCard contract={current} t={t} locale={locale} moneyFmt={moneyFmt} dateFmt={dateFmt} /> : <p className="text-sm text-slate-400">{t.tenantPortal.noCurrentTenancy}</p>}
      </section>

      <section className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
        <h2 className="font-semibold text-slate-800 mb-3">{t.tenantPortal.pastContractsTitle}</h2>
        {historical.length > 0 ? (
          <div className="space-y-4">
            {historical.map((c) => (
              <ContractCard key={c.id} contract={c} t={t} locale={locale} moneyFmt={moneyFmt} dateFmt={dateFmt} compact />
            ))}
          </div>
        ) : (
          <p className="text-sm text-slate-400">{t.tenantPortal.noPastContracts}</p>
        )}
      </section>

      <p className="text-xs text-slate-400">{t.tenantPortal.contractDocumentNotice}</p>
    </div>
  );
}

function ContractCard({
  contract,
  t,
  locale,
  moneyFmt,
  dateFmt,
  compact,
}: {
  contract: Awaited<ReturnType<typeof getTenantContracts>>["current"];
  t: ReturnType<typeof getDictionary>;
  locale: "ar" | "en";
  moneyFmt: Intl.NumberFormat;
  dateFmt: Intl.DateTimeFormat;
  compact?: boolean;
}) {
  if (!contract) return null;
  return (
    <div className={compact ? "border-t border-slate-100 pt-4 first:border-t-0 first:pt-0" : ""}>
      <div className="flex items-center justify-between mb-2">
        <Link href={`/portal/contracts/${contract.id}`} className="font-semibold text-brand-gold-dark hover:underline">
          {contract.contractNumber}
        </Link>
        <span className="px-2 py-1 rounded-full text-xs font-medium bg-slate-100 text-slate-600">{t.contractStatus[contract.status]}</span>
      </div>
      <dl className="grid grid-cols-2 sm:grid-cols-3 gap-y-2 text-sm">
        <dt className="text-slate-500">{t.tenantPortal.fieldUnit}</dt>
        <dd className="text-slate-800 font-medium sm:col-span-2">
          {contract.unit.unitNumber} — {unitLocationLabel(locale, contract.unit)}
        </dd>
        <dt className="text-slate-500">{t.tenantPortal.fieldStartDate}</dt>
        <dd className="text-slate-800 font-medium">{dateFmt.format(contract.startDate)}</dd>
        <dt className="text-slate-500">{t.tenantPortal.fieldEndDate}</dt>
        <dd className="text-slate-800 font-medium">{dateFmt.format(contract.endDate)}</dd>
        <dt className="text-slate-500">{t.tenantPortal.fieldRent}</dt>
        <dd className="text-slate-800 font-medium">{moneyFmt.format(Number(contract.rentAmount))}</dd>
      </dl>
    </div>
  );
}
