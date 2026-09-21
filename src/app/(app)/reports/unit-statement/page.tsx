import { listUnitOptions, getUnitStatement, type LedgerEntry } from "@/lib/actions/reports";
import { getLocale, getDictionary, currencyFormatter, shortDateFormatter, pickLocalized } from "@/lib/i18n";
import { ReportHeader } from "@/components/report-header";
import { SearchableSelect } from "@/components/searchable-select";

function entryLabel(entry: LedgerEntry, t: ReturnType<typeof getDictionary>) {
  if (entry.type === "PAYMENT") return t.reports.renterStatement.paymentEntry;
  switch (entry.kind) {
    case "RENT":
      return t.reports.renterStatement.rentEntry;
    case "COMMISSION":
      return t.reports.renterStatement.commissionEntry;
    case "CLEANING":
      return t.reports.renterStatement.cleaningEntry;
    case "SECURITY_DEPOSIT":
      return t.reports.renterStatement.depositEntry;
    default:
      return t.reports.renterStatement.invoiceEntry;
  }
}

export default async function UnitStatementReportPage({
  searchParams,
}: {
  searchParams: Promise<{ unitId?: string }>;
}) {
  const [{ unitId }, units, locale] = await Promise.all([searchParams, listUnitOptions(), getLocale()]);
  const t = getDictionary(locale);
  const sar = currencyFormatter(locale);
  const dateFmt = shortDateFormatter(locale);

  const data = unitId ? await getUnitStatement(unitId) : null;
  const selectedUnit = units.find((u) => u.id === unitId);

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <ReportHeader backLabel={t.reports.backToReports} printLabel={t.printButton} />

      <div>
        <h1 className="text-2xl font-bold text-slate-900">{t.reports.unitStatement.title}</h1>
      </div>

      <form method="get" className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 flex items-end gap-4 no-print">
        <div className="flex-1">
          <label className="block text-sm font-medium text-slate-700 mb-1">{t.reports.filterUnit}</label>
          <SearchableSelect
            name="unitId"
            placeholder={t.reports.searchPlaceholder}
            noResultsText={t.reports.noResults}
            defaultValue={unitId}
            defaultLabel={
              selectedUnit
                ? `${pickLocalized(locale, selectedUnit.property.nameAr, selectedUnit.property.name)} / ${selectedUnit.unitNumber}`
                : undefined
            }
            options={units.map((u) => ({
              id: u.id,
              label: `${pickLocalized(locale, u.property.nameAr, u.property.name)} / ${u.unitNumber}`,
              searchText: `${u.unitNumber} ${u.property.name} ${u.property.nameAr ?? ""}`,
            }))}
          />
        </div>
        <button className="bg-brand-gold hover:bg-brand-gold-dark text-brand-black rounded-lg px-5 py-2.5 font-semibold">
          {t.reports.filterApply}
        </button>
      </form>

      {!data ? (
        <p className="text-slate-400 text-sm">{t.reports.unitStatement.noSelection}</p>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
          <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-100 pb-4 mb-4">
            <div className="flex items-start gap-3">
              {data.organization.logoUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={data.organization.logoUrl}
                  alt=""
                  className="w-12 h-12 rounded-lg object-contain border border-slate-100 shrink-0"
                />
              )}
              <div>
                <h2 className="font-semibold text-slate-800">
                  {pickLocalized(locale, data.unit.property.nameAr, data.unit.property.name)} / {data.unit.unitNumber}
                </h2>
                <p className="text-xs text-slate-400">{pickLocalized(locale, data.organization.nameAr, data.organization.name)}</p>
              </div>
            </div>
            {data.currentContract ? (
              <div className="text-sm text-slate-600 text-start sm:text-end space-y-0.5">
                <p>
                  {t.reports.renterStatement.renterLabel}:{" "}
                  <span className="font-medium text-slate-800">
                    {pickLocalized(locale, data.currentContract.renterNameAr, data.currentContract.renterName ?? "")}
                  </span>
                </p>
                <p>
                  {t.reports.renterStatement.annualRentLabel}:{" "}
                  <span className="font-medium text-slate-800">{sar.format(data.currentContract.annualRent)}</span>
                </p>
                <p>
                  {t.reports.renterStatement.contractTermLabel}:{" "}
                  <span className="font-medium text-slate-800">
                    {dateFmt.format(data.currentContract.startDate)} – {dateFmt.format(data.currentContract.endDate)}
                  </span>
                </p>
              </div>
            ) : (
              <p className="text-sm text-slate-400">{t.reports.renterStatement.noActiveContract}</p>
            )}
          </div>
          <table className="w-full text-sm">
            <thead className="border-b border-slate-200 text-slate-500">
              <tr>
                <th className="py-2 text-right font-medium">{t.reports.unitStatement.colDate}</th>
                <th className="py-2 text-right font-medium">{t.reports.unitStatement.colType}</th>
                <th className="py-2 text-right font-medium">{t.reports.unitStatement.colContract}</th>
                <th className="py-2 text-right font-medium">{t.reports.unitStatement.colReference}</th>
                <th className="py-2 text-right font-medium">{t.reports.unitStatement.colDebit}</th>
                <th className="py-2 text-right font-medium">{t.reports.unitStatement.colCredit}</th>
                <th className="py-2 text-right font-medium">{t.reports.unitStatement.colBalance}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {data.ledger.map((entry, idx) => (
                <tr key={idx}>
                  <td className="py-2 text-slate-500">{dateFmt.format(entry.date)}</td>
                  <td className="py-2">{entryLabel(entry, t)}</td>
                  <td className="py-2 text-slate-500">{entry.contractNumber ?? t.common.none}</td>
                  <td className="py-2 text-slate-500">{entry.reference}</td>
                  <td className="py-2">{entry.debit > 0 ? sar.format(entry.debit) : "—"}</td>
                  <td className="py-2 text-emerald-600">{entry.credit > 0 ? sar.format(entry.credit) : "—"}</td>
                  <td className="py-2 font-medium">{sar.format(entry.balance)}</td>
                </tr>
              ))}
              {data.ledger.length === 0 && (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-slate-400">
                    {t.reports.unitStatement.empty}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
          <div className="flex justify-end mt-4 pt-4 border-t border-slate-200">
            <div className="flex justify-between w-64 font-bold">
              <span>{t.reports.unitStatement.balanceDue}</span>
              <span>{sar.format(data.ledger.length > 0 ? data.ledger[data.ledger.length - 1].balance : 0)}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
