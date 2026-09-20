import QRCode from "qrcode";
import Link from "next/link";
import { getInvoiceById, cancelInvoice } from "@/lib/actions/invoices";
import { recordPayment } from "@/lib/actions/payments";
import { PrintButton } from "@/components/print-button";
import { getLocale, getDictionary, currencyFormatter, longDateFormatter, pickLocalized } from "@/lib/i18n";

export default async function InvoiceDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [invoice, locale] = await Promise.all([getInvoiceById(id), getLocale()]);
  const t = getDictionary(locale);
  const sar = currencyFormatter(locale);
  const dateFmt = longDateFormatter(locale);

  const qrDataUrl = invoice.qrCodeBase64
    ? await QRCode.toDataURL(invoice.qrCodeBase64, { margin: 1, width: 160 })
    : null;

  const remaining = Number(invoice.totalAmount) - Number(invoice.paidAmount);

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between no-print">
        <Link href="/invoices" className="text-sm text-slate-500 hover:text-slate-800">
          {t.invoiceDetail.back}
        </Link>
        <div className="flex gap-2">
          <a
            href={`/api/invoices/${invoice.id}/xml`}
            className="bg-white border border-slate-300 hover:bg-slate-50 rounded-lg px-4 py-2 text-sm font-medium"
          >
            {t.invoiceDetail.downloadXml}
          </a>
          <PrintButton label={t.printButton} />
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-8 print:shadow-none print:border-0">
        <div className="flex items-start justify-between border-b border-slate-100 pb-6 mb-6">
          <div className="flex items-start gap-4">
            {invoice.organization.logoUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={invoice.organization.logoUrl}
                alt=""
                className="w-14 h-14 rounded-lg object-contain border border-slate-100 shrink-0"
              />
            )}
            <div>
              <h1 className="text-xl font-bold text-slate-900">{invoice.organization.name}</h1>
              {invoice.organization.nameAr && <p className="text-slate-500">{invoice.organization.nameAr}</p>}
              <p className="text-xs text-slate-400 mt-1">
                {t.invoiceDetail.vatNumberLabel}: {invoice.organization.vatNumber ?? t.common.none}
              </p>
              <p className="text-xs text-slate-400">
                {[invoice.organization.district, invoice.organization.city].filter(Boolean).join(locale === "ar" ? "، " : ", ")}
              </p>
            </div>
          </div>
          <div className="text-left">
            <p className="text-lg font-bold text-brand-gold-dark">
              {invoice.kind === "SIMPLIFIED" ? t.invoiceDetail.taxInvoiceSimplified : t.invoiceDetail.taxInvoiceStandard}
            </p>
            <p className="text-sm text-slate-500">{invoice.invoiceNumber}</p>
            <p className="text-xs text-slate-400 mt-1">{dateFmt.format(invoice.issueDate)}</p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-6 mb-6">
          <div>
            <p className="text-xs text-slate-400 mb-1">{t.invoiceDetail.customer}</p>
            <p className="font-semibold text-slate-800">{pickLocalized(locale, invoice.renter.fullNameAr, invoice.renter.fullName)}</p>
            {invoice.renter.vatNumber && (
              <p className="text-xs text-slate-400">
                {t.invoiceDetail.vatNumberLabel}: {invoice.renter.vatNumber}
              </p>
            )}
            {invoice.contract && (
              <p className="text-xs text-slate-400">
                {t.invoiceDetail.contractLine(
                  invoice.contract.contractNumber,
                  invoice.contract.unit.unitNumber,
                  pickLocalized(locale, invoice.contract.unit.property.nameAr, invoice.contract.unit.property.name)
                )}
              </p>
            )}
          </div>
          {qrDataUrl && (
            <div className="flex flex-col items-end">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={qrDataUrl} alt="ZATCA QR Code" width={140} height={140} />
              <p className="text-[10px] text-slate-400 mt-1">{t.invoiceDetail.qrCaption}</p>
            </div>
          )}
        </div>

        <table className="w-full text-sm mb-6">
          <thead className="border-b border-slate-200 text-slate-500">
            <tr>
              <th className="py-2 text-right font-medium">{t.invoiceDetail.colDescription}</th>
              <th className="py-2 text-right font-medium">{t.invoiceDetail.colQuantity}</th>
              <th className="py-2 text-right font-medium">{t.invoiceDetail.colUnitPrice}</th>
              <th className="py-2 text-right font-medium">{t.invoiceDetail.colVat}</th>
              <th className="py-2 text-right font-medium">{t.invoiceDetail.colTotal}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {invoice.lines.map((line) => (
              <tr key={line.id}>
                <td className="py-2">{locale === "ar" ? line.descriptionAr || line.description : line.description}</td>
                <td className="py-2">{Number(line.quantity)}</td>
                <td className="py-2">{sar.format(Number(line.unitPrice))}</td>
                <td className="py-2">
                  {sar.format(Number(line.vatAmount))} ({Number(line.vatRate)}%)
                </td>
                <td className="py-2 font-medium">{sar.format(Number(line.lineTotal))}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="flex justify-end">
          <div className="w-64 space-y-1 text-sm">
            <div className="flex justify-between">
              <span className="text-slate-500">{t.invoiceDetail.subtotal}</span>
              <span>{sar.format(Number(invoice.subtotal))}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">{t.invoiceDetail.vatAmount}</span>
              <span>{sar.format(Number(invoice.vatAmount))}</span>
            </div>
            <div className="flex justify-between font-bold text-base border-t border-slate-200 pt-1 mt-1">
              <span>{t.invoiceDetail.totalDue}</span>
              <span>{sar.format(Number(invoice.totalAmount))}</span>
            </div>
            <div className="flex justify-between text-emerald-600">
              <span>{t.invoiceDetail.paidAmount}</span>
              <span>{sar.format(Number(invoice.paidAmount))}</span>
            </div>
            {remaining > 0.01 && (
              <div className="flex justify-between text-red-600 font-medium">
                <span>{t.invoiceDetail.remaining}</span>
                <span>{sar.format(remaining)}</span>
              </div>
            )}
          </div>
        </div>

        <div
          dir="ltr"
          className="mt-8 pt-4 border-t border-dashed border-slate-200 text-[10px] text-slate-400 space-y-0.5 font-mono text-left"
        >
          <p>UUID: {invoice.uuid}</p>
          <p>ICV: {invoice.icv}</p>
          <p>PIH: {invoice.previousInvoiceHash}</p>
          <p>Invoice Hash: {invoice.invoiceHash}</p>
          <p>
            {t.invoiceDetail.zatcaStatusLabel}: {invoice.zatcaStatus}
          </p>
        </div>
      </div>

      {remaining > 0.01 && invoice.status !== "CANCELLED" && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 no-print">
          <h2 className="font-semibold text-slate-800 mb-4">{t.invoiceDetail.recordPaymentTitle}</h2>
          <form action={recordPayment} className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <input type="hidden" name="invoiceId" value={invoice.id} />
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">{t.invoiceDetail.fieldAmount}</label>
              <input
                name="amount"
                type="number"
                step="0.01"
                max={remaining}
                defaultValue={remaining}
                required
                className="w-full rounded-lg border border-slate-300 px-3 py-2"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">{t.invoiceDetail.fieldMethod}</label>
              <select name="method" className="w-full rounded-lg border border-slate-300 px-3 py-2">
                {(Object.keys(t.paymentMethod) as Array<keyof typeof t.paymentMethod>).map((value) => (
                  <option key={value} value={value}>
                    {t.paymentMethod[value]}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">{t.invoiceDetail.fieldReference}</label>
              <input name="referenceNumber" className="w-full rounded-lg border border-slate-300 px-3 py-2" />
            </div>
            <div className="flex items-end">
              <button className="w-full bg-brand-gold hover:bg-brand-gold-dark text-brand-black rounded-lg px-4 py-2 font-semibold">
                {t.invoiceDetail.recordPaymentSubmit}
              </button>
            </div>
          </form>
        </div>
      )}

      {invoice.payments.length > 0 && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 no-print">
          <h2 className="font-semibold text-slate-800 mb-4">{t.invoiceDetail.paymentsHistoryTitle}</h2>
          <ul className="divide-y divide-slate-100 text-sm">
            {invoice.payments.map((p) => (
              <li key={p.id} className="py-2 flex justify-between">
                <span>
                  {p.receiptNumber} · {t.paymentMethod[p.method]}
                </span>
                <span className="font-medium">{sar.format(Number(p.amount))}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {invoice.status !== "CANCELLED" && invoice.status !== "PAID" && (
        <form
          action={async () => {
            "use server";
            await cancelInvoice(invoice.id);
          }}
          className="no-print"
        >
          <button className="text-red-500 hover:underline text-sm">{t.invoiceDetail.cancelInvoice}</button>
        </form>
      )}
    </div>
  );
}
