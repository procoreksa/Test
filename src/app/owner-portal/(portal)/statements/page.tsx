import Link from "next/link";
import { getOwnerPortalStatement } from "@/lib/actions/owner-portal/financials";
import { getLocale, getDictionary, currencyFormatter, shortDateFormatter } from "@/lib/i18n";

/**
 * Date-range Owner Statement (Step 31-33). `getOwnerPortalStatement()`
 * always resolves the authenticated owner from their own session - this
 * form only ever supplies `from`/`to`, never an ownerId, so there is
 * nothing here for a hostile client to override.
 */
export default async function OwnerPortalStatementsPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const { from, to } = await searchParams;
  const locale = await getLocale();
  const t = getDictionary(locale);
  const moneyFmt = currencyFormatter(locale);
  const dateFmt = shortDateFormatter(locale);

  const statement = await getOwnerPortalStatement({
    from: from ? new Date(from) : undefined,
    to: to ? new Date(`${to}T23:59:59`) : undefined,
  });

  const printHref = `/owner-portal/statements/print${from || to ? `?${new URLSearchParams({ ...(from ? { from } : {}), ...(to ? { to } : {}) }).toString()}` : ""}`;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl font-bold text-slate-900">{t.ownerPortal.statementTitle}</h1>
        <Link href={printHref} className="bg-slate-800 hover:bg-slate-900 text-white rounded-lg px-4 py-2 text-sm font-medium">
          {t.ownerPortal.printStatementButton}
        </Link>
      </div>

      <form method="get" className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">{t.ownerPortal.statementFrom}</label>
          <input type="date" name="from" defaultValue={from} className="w-full rounded-lg border border-slate-300 px-3 py-2" />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">{t.ownerPortal.statementTo}</label>
          <input type="date" name="to" defaultValue={to} className="w-full rounded-lg border border-slate-300 px-3 py-2" />
        </div>
        <div className="flex items-end">
          <button className="bg-brand-gold hover:bg-brand-gold-dark text-brand-black rounded-lg px-5 py-2.5 font-semibold text-sm">{t.ownerPortal.statementGenerateButton}</button>
        </div>
      </form>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <SummaryCard label={t.ownerPortal.openingBalanceLabel} value={moneyFmt.format(Number(statement.openingBalance))} />
        <SummaryCard label={t.ownerPortal.totalIncomeLabel} value={moneyFmt.format(Number(statement.totalIncome))} />
        <SummaryCard label={t.ownerPortal.totalExpensesLabel} value={moneyFmt.format(Number(statement.totalExpenses))} />
        <SummaryCard label={t.ownerPortal.closingBalanceLabel} value={moneyFmt.format(Number(statement.closingBalance))} />
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-500 text-right">
            <tr>
              <th className="px-4 py-3 font-medium">{t.ownerPortal.colDate}</th>
              <th className="px-4 py-3 font-medium">{t.ownerPortal.colDescription}</th>
              <th className="px-4 py-3 font-medium">{t.ownerPortal.colProperty}</th>
              <th className="px-4 py-3 font-medium">{t.ownerPortal.colDebit}</th>
              <th className="px-4 py-3 font-medium">{t.ownerPortal.colCredit}</th>
              <th className="px-4 py-3 font-medium">{t.ownerPortal.colRunningBalance}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {statement.rows.map((row, i) => (
              <tr key={i}>
                <td className="px-4 py-3 text-slate-500 whitespace-nowrap">{dateFmt.format(row.date)}</td>
                <td className="px-4 py-3 text-slate-700">{row.description}</td>
                <td className="px-4 py-3 text-slate-500">{row.propertyLabel ?? "-"}</td>
                <td className="px-4 py-3 text-slate-500">{Number(row.debit) > 0 ? moneyFmt.format(Number(row.debit)) : "-"}</td>
                <td className="px-4 py-3 text-slate-500">{Number(row.credit) > 0 ? moneyFmt.format(Number(row.credit)) : "-"}</td>
                <td className="px-4 py-3 font-medium text-slate-800">{moneyFmt.format(Number(row.runningBalance))}</td>
              </tr>
            ))}
            {statement.rows.length === 0 && (
              <tr>
                <td colSpan={6} className="px-5 py-8 text-center text-slate-400">
                  {t.ownerPortal.emptyLedger}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
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
