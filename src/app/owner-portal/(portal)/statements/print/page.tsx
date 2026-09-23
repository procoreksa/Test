import { getOwnerPortalStatement } from "@/lib/actions/owner-portal/financials";
import { getOwnerPortalOrganizationBranding } from "@/lib/actions/owner-portal/portfolio";
import { getOwnerPortalProfile as getOwnerProfile } from "@/lib/actions/owner-portal/profile";
import { getLocale, getDictionary, currencyFormatter, shortDateFormatter, longDateTimeFormatter, pickLocalized } from "@/lib/i18n";
import { PrintButton } from "@/components/print-button";

/**
 * The Owner Portal's own professional, bilingual printable statement (Step
 * 33): "OWNER STATEMENT" / "كشف حساب المالك" - reuses the exact same print
 * architecture as src/app/portal/(portal)/security-deposit/statement/page.tsx
 * (`no-print` class + PrintButton + window.print()), never a bespoke PDF
 * pipeline. Always generated for the authenticated owner from their own
 * session - `from`/`to` are the only accepted query parameters.
 */
export default async function OwnerPortalStatementPrintPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const { from, to } = await searchParams;
  const locale = await getLocale();
  const t = getDictionary(locale);
  const moneyFmt = currencyFormatter(locale);
  const dateFmt = shortDateFormatter(locale);
  const dateTimeFmt = longDateTimeFormatter(locale);

  const [statement, org, profile] = await Promise.all([
    getOwnerPortalStatement({ from: from ? new Date(from) : undefined, to: to ? new Date(`${to}T23:59:59`) : undefined }),
    getOwnerPortalOrganizationBranding(),
    getOwnerProfile(),
  ]);

  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      <div className="no-print flex justify-end">
        <PrintButton label={t.printButton} />
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-8 space-y-6">
        <div className="flex items-start justify-between border-b border-slate-200 pb-4">
          <div>
            <p className="font-bold text-slate-900">{pickLocalized(locale, org.nameAr, org.name)}</p>
            <p className="text-sm text-slate-500 mt-1">{pickLocalized(locale, profile.owner.nameAr, profile.owner.name)}</p>
          </div>
          <div className="text-right">
            <h1 className="text-xl font-bold text-slate-900 uppercase tracking-wide">{t.ownerPortal.statementTitle}</h1>
            {(statement.from || statement.to) && (
              <p className="text-sm text-slate-500">
                {statement.from ? dateFmt.format(statement.from) : ""}
                {statement.from && statement.to ? " - " : ""}
                {statement.to ? dateFmt.format(statement.to) : ""}
              </p>
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div>
            <p className="text-xs text-slate-500">{t.ownerPortal.openingBalanceLabel}</p>
            <p className="font-semibold text-slate-900">{moneyFmt.format(Number(statement.openingBalance))}</p>
          </div>
          <div>
            <p className="text-xs text-slate-500">{t.ownerPortal.totalIncomeLabel}</p>
            <p className="font-semibold text-slate-900">{moneyFmt.format(Number(statement.totalIncome))}</p>
          </div>
          <div>
            <p className="text-xs text-slate-500">{t.ownerPortal.totalExpensesLabel}</p>
            <p className="font-semibold text-slate-900">{moneyFmt.format(Number(statement.totalExpenses))}</p>
          </div>
          <div>
            <p className="text-xs text-slate-500">{t.ownerPortal.closingBalanceLabel}</p>
            <p className="font-semibold text-slate-900">{moneyFmt.format(Number(statement.closingBalance))}</p>
          </div>
        </div>

        <table className="w-full text-xs">
          <thead>
            <tr className="text-slate-500 text-right">
              <th className="py-1 font-medium">{t.ownerPortal.colDate}</th>
              <th className="py-1 font-medium">{t.ownerPortal.colDescription}</th>
              <th className="py-1 font-medium">{t.ownerPortal.colProperty}</th>
              <th className="py-1 font-medium">{t.ownerPortal.colDebit}</th>
              <th className="py-1 font-medium">{t.ownerPortal.colCredit}</th>
              <th className="py-1 font-medium">{t.ownerPortal.colRunningBalance}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {statement.rows.map((row, i) => (
              <tr key={i}>
                <td className="py-1 text-slate-600">{dateFmt.format(row.date)}</td>
                <td className="py-1 text-slate-700">{row.description}</td>
                <td className="py-1 text-slate-600">{row.propertyLabel ?? "-"}</td>
                <td className="py-1 text-slate-600">{Number(row.debit) > 0 ? moneyFmt.format(Number(row.debit)) : "-"}</td>
                <td className="py-1 text-slate-600">{Number(row.credit) > 0 ? moneyFmt.format(Number(row.credit)) : "-"}</td>
                <td className="py-1 font-medium text-slate-800">{moneyFmt.format(Number(row.runningBalance))}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <p className="text-xs text-slate-400 text-center border-t border-slate-100 pt-3">{dateTimeFmt.format(new Date())}</p>
      </div>
    </div>
  );
}
