import Link from "next/link";
import { getTenantInvoiceDetail } from "@/lib/actions/portal/finance";
import { getLocale, getDictionary, currencyFormatter, shortDateFormatter, pickLocalized } from "@/lib/i18n";
import { PrintButton } from "@/components/print-button";

export default async function TenantInvoiceDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [invoice, locale] = await Promise.all([getTenantInvoiceDetail(id), getLocale()]);
  const t = getDictionary(locale);
  const moneyFmt = currencyFormatter(locale);
  const dateFmt = shortDateFormatter(locale);

  return (
    <div className="space-y-6">
      <div className="no-print flex items-center justify-between">
        <Link href="/portal/invoices" className="text-brand-gold-dark hover:underline text-sm">
          ← {t.tenantPortal.invoicesTitle}
        </Link>
        <PrintButton label={t.printButton} />
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 space-y-6">
        <div className="flex items-start justify-between border-b border-slate-100 pb-4">
          <div>
            <h1 className="text-xl font-bold text-slate-900">{invoice.invoiceNumber}</h1>
            <p className="text-sm text-slate-500 mt-1">{invoice.contract?.contractNumber}</p>
          </div>
          <span className="px-2 py-1 rounded-full text-xs font-medium bg-slate-100 text-slate-600">{t.invoiceStatus[invoice.status]}</span>
        </div>

        <dl className="grid grid-cols-2 gap-y-2 text-sm">
          <dt className="text-slate-500">{t.tenantPortal.colIssueDate}</dt>
          <dd className="text-slate-800 font-medium">{dateFmt.format(invoice.issueDate)}</dd>
          {invoice.dueDate && (
            <>
              <dt className="text-slate-500">{t.tenantPortal.colDueDate}</dt>
              <dd className="text-slate-800 font-medium">{dateFmt.format(invoice.dueDate)}</dd>
            </>
          )}
        </dl>

        <div>
          <h2 className="font-semibold text-slate-800 mb-2">{t.tenantPortal.invoiceLinesTitle}</h2>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-slate-500 text-right border-b border-slate-100">
                <th className="py-2 font-medium">{t.tenantPortal.fieldDescription}</th>
                <th className="py-2 font-medium">{t.tenantPortal.colAmount}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {invoice.lines.map((line) => (
                <tr key={line.id}>
                  <td className="py-2 text-slate-700">{pickLocalized(locale, line.descriptionAr, line.description)}</td>
                  <td className="py-2 text-slate-700">{moneyFmt.format(Number(line.lineTotal))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <dl className="grid grid-cols-2 gap-y-2 text-sm border-t border-slate-100 pt-4">
          <dt className="text-slate-500">{t.tenantPortal.colSubtotal}</dt>
          <dd className="text-slate-800 font-medium">{moneyFmt.format(Number(invoice.subtotal))}</dd>
          <dt className="text-slate-500">{t.tenantPortal.colVat}</dt>
          <dd className="text-slate-800 font-medium">{moneyFmt.format(Number(invoice.vatAmount))}</dd>
          <dt className="text-slate-700 font-semibold">{t.tenantPortal.colTotal}</dt>
          <dd className="text-slate-900 font-bold">{moneyFmt.format(Number(invoice.totalAmount))}</dd>
          <dt className="text-slate-500">{t.tenantPortal.colPaid}</dt>
          <dd className="text-slate-800 font-medium">{moneyFmt.format(Number(invoice.paidAmount))}</dd>
          <dt className="text-slate-500">{t.tenantPortal.colBalance}</dt>
          <dd className="text-slate-800 font-medium">{moneyFmt.format(Number(invoice.totalAmount) - Number(invoice.paidAmount))}</dd>
        </dl>

        {invoice.payments.length > 0 && (
          <div className="border-t border-slate-100 pt-4">
            <h2 className="font-semibold text-slate-800 mb-2">{t.tenantPortal.receiptsTitle}</h2>
            <ul className="text-sm space-y-1">
              {invoice.payments.map((p) => (
                <li key={p.id} className="text-slate-600">
                  {p.receiptNumber} — {moneyFmt.format(Number(p.amount))} — {dateFmt.format(p.paymentDate)}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
