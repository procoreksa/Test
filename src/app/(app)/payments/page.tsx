import Link from "next/link";
import { listPayments } from "@/lib/actions/payments";
import { getLocale, getDictionary, currencyFormatter, shortDateFormatter, pickLocalized } from "@/lib/i18n";

export default async function PaymentsPage() {
  const [payments, locale] = await Promise.all([listPayments(), getLocale()]);
  const t = getDictionary(locale);
  const sar = currencyFormatter(locale);
  const dateFmt = shortDateFormatter(locale);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">{t.payments.title}</h1>
        <p className="text-slate-500 text-sm mt-1">{t.payments.subtitle}</p>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-500 text-right">
            <tr>
              <th className="px-5 py-3 font-medium">{t.payments.colReceiptNumber}</th>
              <th className="px-5 py-3 font-medium">{t.payments.colRenter}</th>
              <th className="px-5 py-3 font-medium">{t.payments.colInvoice}</th>
              <th className="px-5 py-3 font-medium">{t.payments.colMethod}</th>
              <th className="px-5 py-3 font-medium">{t.payments.colDate}</th>
              <th className="px-5 py-3 font-medium">{t.payments.colAmount}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {payments.map((p) => (
              <tr key={p.id}>
                <td className="px-5 py-3 font-medium text-slate-800">{p.receiptNumber}</td>
                <td className="px-5 py-3">{pickLocalized(locale, p.renter.fullNameAr, p.renter.fullName)}</td>
                <td className="px-5 py-3">
                  <Link href={`/invoices/${p.invoiceId}`} className="text-brand-gold-dark hover:underline">
                    {p.invoice.invoiceNumber}
                  </Link>
                </td>
                <td className="px-5 py-3 text-slate-500">{t.paymentMethod[p.method]}</td>
                <td className="px-5 py-3 text-slate-500">{dateFmt.format(p.paymentDate)}</td>
                <td className="px-5 py-3 font-medium text-emerald-600">{sar.format(Number(p.amount))}</td>
              </tr>
            ))}
            {payments.length === 0 && (
              <tr>
                <td colSpan={6} className="px-5 py-8 text-center text-slate-400">
                  {t.payments.empty}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
