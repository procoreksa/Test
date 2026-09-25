import Link from "next/link";
import { getTenantPayments } from "@/lib/actions/portal/finance";
import { getLocale, getDictionary, currencyFormatter, shortDateFormatter } from "@/lib/i18n";

export default async function TenantReceiptsPage() {
  const [payments, locale] = await Promise.all([getTenantPayments(), getLocale()]);
  const t = getDictionary(locale);
  const moneyFmt = currencyFormatter(locale);
  const dateFmt = shortDateFormatter(locale);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-slate-900">{t.tenantPortal.receiptsTitle}</h1>
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-500 text-right">
            <tr>
              <th className="px-4 py-3 font-medium">{t.tenantPortal.colReceiptNumber}</th>
              <th className="px-4 py-3 font-medium">{t.tenantPortal.colPaymentDate}</th>
              <th className="px-4 py-3 font-medium">{t.tenantPortal.colAmount}</th>
              <th className="px-4 py-3 font-medium">{t.tenantPortal.colMethod}</th>
              <th className="px-4 py-3 font-medium">{t.tenantPortal.colInvoiceNumber}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {payments.map((p) => (
              <tr key={p.id}>
                <td className="px-4 py-3 font-medium text-slate-800 whitespace-nowrap">{p.receiptNumber}</td>
                <td className="px-4 py-3 text-slate-500 whitespace-nowrap">{dateFmt.format(p.paymentDate)}</td>
                <td className="px-4 py-3 text-slate-700">
                  {moneyFmt.format(Number(p.amount))}
                  {p.status === "REVERSED" && <span className="ms-2 text-xs text-red-600">({t.tenantPortal.reversedNotice})</span>}
                </td>
                <td className="px-4 py-3 text-slate-500">{t.paymentMethod[p.method]}</td>
                <td className="px-4 py-3">
                  <Link href={`/portal/invoices/${p.invoice.id}`} className="text-brand-gold-dark hover:underline">
                    {p.invoice.invoiceNumber}
                  </Link>
                </td>
              </tr>
            ))}
            {payments.length === 0 && (
              <tr>
                <td colSpan={5} className="px-5 py-8 text-center text-slate-400">
                  {t.tenantPortal.emptyPayments}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
