import Link from "next/link";
import { listPayments, reversePayment } from "@/lib/actions/payments";
import { getCurrentUserRole } from "@/lib/session";
import { can } from "@/lib/permissions";
import { getLocale, getDictionary, currencyFormatter, shortDateFormatter, pickLocalized } from "@/lib/i18n";

export default async function PaymentsPage() {
  const [payments, locale, role] = await Promise.all([listPayments(), getLocale(), getCurrentUserRole()]);
  const t = getDictionary(locale);
  const sar = currencyFormatter(locale);
  const dateFmt = shortDateFormatter(locale);
  const canReverse = can("payment.create", role);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">{t.payments.title}</h1>
        <p className="text-slate-500 text-sm mt-1">{t.payments.subtitle}</p>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-500 text-right">
            <tr>
              <th className="px-5 py-3 font-medium">{t.payments.colReceiptNumber}</th>
              <th className="px-5 py-3 font-medium">{t.payments.colRenter}</th>
              <th className="px-5 py-3 font-medium">{t.payments.colInvoice}</th>
              <th className="px-5 py-3 font-medium">{t.payments.colMethod}</th>
              <th className="px-5 py-3 font-medium">{t.payments.colDate}</th>
              <th className="px-5 py-3 font-medium">{t.payments.colAmount}</th>
              <th className="px-5 py-3 font-medium">{t.payments.colStatus}</th>
              <th className="px-5 py-3 font-medium"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {payments.map((p) => {
              const amount = Number(p.amount);
              const isReversal = amount < 0;
              return (
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
                  <td className={`px-5 py-3 font-medium ${isReversal ? "text-red-600" : "text-emerald-600"}`}>{sar.format(amount)}</td>
                  <td className="px-5 py-3">
                    <span
                      className={`px-2 py-1 rounded-full text-xs font-medium ${p.status === "REVERSED" ? "bg-slate-100 text-slate-500" : "bg-emerald-100 text-emerald-700"}`}
                    >
                      {t.paymentStatus[p.status]}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-left">
                    {canReverse && p.status === "POSTED" && !isReversal && (
                      <form
                        action={async () => {
                          "use server";
                          await reversePayment(p.id);
                        }}
                      >
                        <button className="text-red-500 hover:underline text-xs">{t.payments.reverse}</button>
                      </form>
                    )}
                  </td>
                </tr>
              );
            })}
            {payments.length === 0 && (
              <tr>
                <td colSpan={8} className="px-5 py-8 text-center text-slate-400">
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
