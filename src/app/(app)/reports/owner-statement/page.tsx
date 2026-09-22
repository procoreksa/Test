import { getOwnerStatement } from "@/lib/actions/owner-reports";
import { listOwners } from "@/lib/actions/owners";
import { getCompoundOptions } from "@/lib/actions/compounds";
import { listUnitOptions } from "@/lib/actions/reports";
import { getLocale, getDictionary, currencyFormatter, shortDateFormatter, pickLocalized } from "@/lib/i18n";
import { unitLocationLabel } from "@/lib/unit-location";
import { ReportHeader } from "@/components/report-header";

export default async function OwnerStatementReportPage({
  searchParams,
}: {
  searchParams: Promise<{ ownerId?: string; from?: string; to?: string; compoundId?: string; unitId?: string }>;
}) {
  const { ownerId, from, to, compoundId, unitId } = await searchParams;
  const [owners, compounds, units, locale] = await Promise.all([
    listOwners(),
    getCompoundOptions(),
    listUnitOptions(),
    getLocale(),
  ]);
  const t = getDictionary(locale);
  const sar = currencyFormatter(locale);
  const dateFmt = shortDateFormatter(locale);

  const statement = ownerId
    ? await getOwnerStatement({
        ownerId,
        from: from ? new Date(from) : undefined,
        to: to ? new Date(`${to}T23:59:59`) : undefined,
        compoundId: compoundId || undefined,
        unitId: unitId || undefined,
      })
    : null;

  return (
    <div className="space-y-6">
      <ReportHeader backLabel={t.reports.backToReports} printLabel={t.printButton} />

      <div>
        <h1 className="text-2xl font-bold text-slate-900">{t.reports.ownerStatement.title}</h1>
      </div>

      <form method="get" className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 grid grid-cols-1 md:grid-cols-5 gap-4 no-print">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">{t.reports.ownerStatement.fieldOwner}</label>
          <select name="ownerId" defaultValue={ownerId ?? ""} required className="w-full rounded-lg border border-slate-300 px-3 py-2">
            <option value="" disabled>
              {t.reports.selectPlaceholder}
            </option>
            {owners.map((o) => (
              <option key={o.id} value={o.id}>
                {pickLocalized(locale, o.nameAr, o.name)}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">{t.reports.filterFrom}</label>
          <input type="date" name="from" defaultValue={from} className="w-full rounded-lg border border-slate-300 px-3 py-2" />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">{t.reports.filterTo}</label>
          <input type="date" name="to" defaultValue={to} className="w-full rounded-lg border border-slate-300 px-3 py-2" />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">{t.reports.ownerStatement.fieldCompound}</label>
          <select name="compoundId" defaultValue={compoundId ?? ""} className="w-full rounded-lg border border-slate-300 px-3 py-2">
            <option value="">{t.common.none}</option>
            {compounds.map((c) => (
              <option key={c.id} value={c.id}>
                {pickLocalized(locale, c.arabicName, c.name)}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">{t.reports.ownerStatement.fieldUnit}</label>
          <select name="unitId" defaultValue={unitId ?? ""} className="w-full rounded-lg border border-slate-300 px-3 py-2">
            <option value="">{t.common.none}</option>
            {units.map((u) => (
              <option key={u.id} value={u.id}>
                {unitLocationLabel(locale, u)} / {u.unitNumber}
              </option>
            ))}
          </select>
        </div>
        <div className="md:col-span-5">
          <button className="bg-brand-gold hover:bg-brand-gold-dark text-brand-black rounded-lg px-5 py-2.5 font-semibold">
            {t.reports.filterApply}
          </button>
        </div>
      </form>

      {!statement ? (
        <p className="text-slate-400 text-sm">{t.reports.ownerStatement.noSelection}</p>
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <SummaryCard label={t.reports.ownerStatement.openingBalance} value={sar.format(Number(statement.openingBalance))} />
            <SummaryCard label={t.reports.ownerStatement.totalIncome} value={sar.format(Number(statement.totalIncome))} />
            <SummaryCard label={t.reports.ownerStatement.totalExpenses} value={sar.format(Number(statement.totalExpenses))} />
            <SummaryCard label={t.reports.ownerStatement.closingBalance} value={sar.format(Number(statement.closingBalance))} />
          </div>

          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-slate-500 text-right">
                <tr>
                  <th className="px-5 py-3 font-medium">{t.reports.ownerStatement.colDate}</th>
                  <th className="px-5 py-3 font-medium">{t.reports.ownerStatement.colReference}</th>
                  <th className="px-5 py-3 font-medium">{t.reports.ownerStatement.colDescription}</th>
                  <th className="px-5 py-3 font-medium">{t.reports.ownerStatement.colDebit}</th>
                  <th className="px-5 py-3 font-medium">{t.reports.ownerStatement.colCredit}</th>
                  <th className="px-5 py-3 font-medium">{t.reports.ownerStatement.colBalance}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {statement.rows.map((row, i) => (
                  <tr key={i}>
                    <td className="px-5 py-3 text-slate-500">{dateFmt.format(row.date)}</td>
                    <td className="px-5 py-3 text-slate-500">{row.reference}</td>
                    <td className="px-5 py-3">{pickLocalized(locale, row.descriptionAr, row.description)}</td>
                    <td className="px-5 py-3">{Number(row.debit) > 0 ? sar.format(Number(row.debit)) : "—"}</td>
                    <td className="px-5 py-3">{Number(row.credit) > 0 ? sar.format(Number(row.credit)) : "—"}</td>
                    <td className="px-5 py-3 font-medium">{sar.format(Number(row.runningBalance))}</td>
                  </tr>
                ))}
                {statement.rows.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-5 py-8 text-center text-slate-400">
                      {t.reports.ownerStatement.empty}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
      <p className="text-xs text-slate-500">{label}</p>
      <p className="text-lg font-bold text-slate-900 mt-1">{value}</p>
    </div>
  );
}
