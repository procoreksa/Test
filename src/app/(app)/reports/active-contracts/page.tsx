import { getActiveContractsReport } from "@/lib/actions/reports";
import { getLocale, getDictionary, currencyFormatter, shortDateFormatter, pickLocalized } from "@/lib/i18n";
import { ReportHeader } from "@/components/report-header";

export default async function ActiveContractsReportPage() {
  const [contracts, locale] = await Promise.all([getActiveContractsReport(), getLocale()]);
  const t = getDictionary(locale);
  const sar = currencyFormatter(locale);
  const dateFmt = shortDateFormatter(locale);

  return (
    <div className="space-y-6">
      <ReportHeader backLabel={t.reports.backToReports} printLabel={t.printButton} />

      <div>
        <h1 className="text-2xl font-bold text-slate-900">{t.reports.activeContracts.title}</h1>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-500 text-right">
            <tr>
              <th className="px-5 py-3 font-medium">{t.reports.activeContracts.colContractNumber}</th>
              <th className="px-5 py-3 font-medium">{t.reports.activeContracts.colRenter}</th>
              <th className="px-5 py-3 font-medium">{t.reports.activeContracts.colUnit}</th>
              <th className="px-5 py-3 font-medium">{t.reports.activeContracts.colStart}</th>
              <th className="px-5 py-3 font-medium">{t.reports.activeContracts.colEnd}</th>
              <th className="px-5 py-3 font-medium">{t.reports.activeContracts.colRentAmount}</th>
              <th className="px-5 py-3 font-medium">{t.reports.activeContracts.colFrequency}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {contracts.map((c) => (
              <tr key={c.id}>
                <td className="px-5 py-3 font-medium text-slate-800">{c.contractNumber}</td>
                <td className="px-5 py-3">{pickLocalized(locale, c.renter.fullNameAr, c.renter.fullName)}</td>
                <td className="px-5 py-3 text-slate-500">
                  {pickLocalized(locale, c.unit.property.nameAr, c.unit.property.name)} / {c.unit.unitNumber}
                </td>
                <td className="px-5 py-3 text-slate-500">{dateFmt.format(c.startDate)}</td>
                <td className="px-5 py-3 text-slate-500">{dateFmt.format(c.endDate)}</td>
                <td className="px-5 py-3">{sar.format(Number(c.rentAmount))}</td>
                <td className="px-5 py-3 text-slate-500">{t.paymentFrequency[c.paymentFrequency]}</td>
              </tr>
            ))}
            {contracts.length === 0 && (
              <tr>
                <td colSpan={7} className="px-5 py-8 text-center text-slate-400">
                  {t.reports.activeContracts.empty}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
