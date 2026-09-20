import Link from "next/link";
import { listInvoices } from "@/lib/actions/invoices";
import { getLocale, getDictionary, currencyFormatter, shortDateFormatter, pickLocalized } from "@/lib/i18n";

const statusTone: Record<string, string> = {
  DRAFT: "bg-slate-100 text-slate-600",
  ISSUED: "bg-blue-100 text-blue-700",
  PARTIALLY_PAID: "bg-amber-100 text-amber-700",
  PAID: "bg-emerald-100 text-emerald-700",
  OVERDUE: "bg-red-100 text-red-700",
  CANCELLED: "bg-slate-100 text-slate-400",
};

export default async function InvoicesPage() {
  const [invoices, locale] = await Promise.all([listInvoices(), getLocale()]);
  const t = getDictionary(locale);
  const sar = currencyFormatter(locale);
  const dateFmt = shortDateFormatter(locale);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">{t.invoices.title}</h1>
        <p className="text-slate-500 text-sm mt-1">{t.invoices.subtitle}</p>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-500 text-right">
            <tr>
              <th className="px-5 py-3 font-medium">{t.invoices.colInvoiceNumber}</th>
              <th className="px-5 py-3 font-medium">{t.invoices.colKind}</th>
              <th className="px-5 py-3 font-medium">{t.invoices.colCustomer}</th>
              <th className="px-5 py-3 font-medium">{t.invoices.colIssueDate}</th>
              <th className="px-5 py-3 font-medium">{t.invoices.colTotal}</th>
              <th className="px-5 py-3 font-medium">{t.invoices.colStatus}</th>
              <th className="px-5 py-3 font-medium"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {invoices.map((inv) => (
              <tr key={inv.id}>
                <td className="px-5 py-3 font-medium text-slate-800">{inv.invoiceNumber}</td>
                <td className="px-5 py-3 text-slate-500 text-xs">{t.invoiceKind[inv.kind]}</td>
                <td className="px-5 py-3">{pickLocalized(locale, inv.renter.fullNameAr, inv.renter.fullName)}</td>
                <td className="px-5 py-3 text-slate-500">{dateFmt.format(inv.issueDate)}</td>
                <td className="px-5 py-3 font-medium">{sar.format(Number(inv.totalAmount))}</td>
                <td className="px-5 py-3">
                  <span className={`px-2 py-1 rounded-full text-xs font-medium ${statusTone[inv.status]}`}>
                    {t.invoiceStatus[inv.status]}
                  </span>
                </td>
                <td className="px-5 py-3 text-left">
                  <Link href={`/invoices/${inv.id}`} className="text-brand-gold-dark hover:underline text-xs font-medium">
                    {t.invoices.viewInvoice}
                  </Link>
                </td>
              </tr>
            ))}
            {invoices.length === 0 && (
              <tr>
                <td colSpan={7} className="px-5 py-8 text-center text-slate-400">
                  {t.invoices.empty}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
