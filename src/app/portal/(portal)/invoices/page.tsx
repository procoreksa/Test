import Link from "next/link";
import { getTenantInvoices } from "@/lib/actions/portal/finance";
import { getLocale, getDictionary, currencyFormatter, shortDateFormatter } from "@/lib/i18n";

export default async function TenantInvoicesPage() {
  const [invoices, locale] = await Promise.all([getTenantInvoices(), getLocale()]);
  const t = getDictionary(locale);
  const moneyFmt = currencyFormatter(locale);
  const dateFmt = shortDateFormatter(locale);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-slate-900">{t.tenantPortal.invoicesTitle}</h1>
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-500 text-right">
            <tr>
              <th className="px-4 py-3 font-medium">{t.tenantPortal.colInvoiceNumber}</th>
              <th className="px-4 py-3 font-medium">{t.tenantPortal.colIssueDate}</th>
              <th className="px-4 py-3 font-medium">{t.tenantPortal.colTotal}</th>
              <th className="px-4 py-3 font-medium">{t.tenantPortal.colPaid}</th>
              <th className="px-4 py-3 font-medium">{t.tenantPortal.colBalance}</th>
              <th className="px-4 py-3 font-medium">{t.tenantPortal.colStatus}</th>
              <th className="px-4 py-3 font-medium"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {invoices.map((inv) => (
              <tr key={inv.id}>
                <td className="px-4 py-3 font-medium text-slate-800 whitespace-nowrap">{inv.invoiceNumber}</td>
                <td className="px-4 py-3 text-slate-500 whitespace-nowrap">{dateFmt.format(inv.issueDate)}</td>
                <td className="px-4 py-3 text-slate-700">{moneyFmt.format(Number(inv.totalAmount))}</td>
                <td className="px-4 py-3 text-slate-500">{moneyFmt.format(Number(inv.paidAmount))}</td>
                <td className="px-4 py-3 text-slate-700">{moneyFmt.format(Number(inv.totalAmount) - Number(inv.paidAmount))}</td>
                <td className="px-4 py-3 text-slate-500">{t.invoiceStatus[inv.status]}</td>
                <td className="px-4 py-3">
                  <Link href={`/portal/invoices/${inv.id}`} className="text-brand-gold-dark hover:underline font-medium">
                    {t.tenantPortal.viewInvoiceButton}
                  </Link>
                </td>
              </tr>
            ))}
            {invoices.length === 0 && (
              <tr>
                <td colSpan={7} className="px-5 py-8 text-center text-slate-400">
                  {t.tenantPortal.emptyInvoices}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
