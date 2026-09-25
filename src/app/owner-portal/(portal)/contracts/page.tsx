import Link from "next/link";
import { getOwnerPortalContracts } from "@/lib/actions/owner-portal/contracts";
import { getLocale, getDictionary, pickLocalized, currencyFormatter, shortDateFormatter } from "@/lib/i18n";

export default async function OwnerPortalContractsPage() {
  const [contracts, locale] = await Promise.all([getOwnerPortalContracts(), getLocale()]);
  const t = getDictionary(locale);
  const moneyFmt = currencyFormatter(locale);
  const dateFmt = shortDateFormatter(locale);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-slate-900">{t.ownerPortal.contractsTitle}</h1>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-500 text-right">
            <tr>
              <th className="px-4 py-3 font-medium">{t.ownerPortal.colContractNumber}</th>
              <th className="px-4 py-3 font-medium">{t.ownerPortal.colUnit}</th>
              <th className="px-4 py-3 font-medium">{t.ownerPortal.colTenant}</th>
              <th className="px-4 py-3 font-medium">{t.ownerPortal.colRent}</th>
              <th className="px-4 py-3 font-medium">{t.ownerPortal.colEndDate}</th>
              <th className="px-4 py-3 font-medium">{t.ownerPortal.colStatus}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {contracts.map((c) => (
              <tr key={c.id}>
                <td className="px-4 py-3 font-medium text-slate-800 whitespace-nowrap">
                  <Link href={`/owner-portal/contracts/${c.id}`} className="hover:underline">
                    {c.contractNumber}
                  </Link>
                </td>
                <td className="px-4 py-3 text-slate-500">{c.unit.unitNumber}</td>
                <td className="px-4 py-3 text-slate-500">{pickLocalized(locale, c.renter.fullNameAr, c.renter.fullName)}</td>
                <td className="px-4 py-3 text-slate-500">{moneyFmt.format(Number(c.rentAmount))}</td>
                <td className="px-4 py-3 text-slate-500 whitespace-nowrap">{dateFmt.format(c.endDate)}</td>
                <td className="px-4 py-3 text-slate-500">{t.contractStatus[c.status as keyof typeof t.contractStatus]}</td>
              </tr>
            ))}
            {contracts.length === 0 && (
              <tr>
                <td colSpan={6} className="px-5 py-8 text-center text-slate-400">
                  {t.ownerPortal.emptyContracts}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
