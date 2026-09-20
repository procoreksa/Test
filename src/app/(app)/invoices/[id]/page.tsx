import QRCode from "qrcode";
import Link from "next/link";
import { getInvoiceById, cancelInvoice } from "@/lib/actions/invoices";
import { recordPayment } from "@/lib/actions/payments";
import { PrintButton } from "@/components/print-button";

const sar = new Intl.NumberFormat("ar-SA", { style: "currency", currency: "SAR" });
const dateFmt = new Intl.DateTimeFormat("ar-SA", { day: "numeric", month: "long", year: "numeric" });

const methodLabel: Record<string, string> = {
  CASH: "نقدًا",
  BANK_TRANSFER: "تحويل بنكي",
  CHEQUE: "شيك",
  CARD: "بطاقة",
  ONLINE: "دفع إلكتروني",
};

export default async function InvoiceDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const invoice = await getInvoiceById(id);
  const qrDataUrl = invoice.qrCodeBase64
    ? await QRCode.toDataURL(invoice.qrCodeBase64, { margin: 1, width: 160 })
    : null;

  const remaining = Number(invoice.totalAmount) - Number(invoice.paidAmount);

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between no-print">
        <Link href="/invoices" className="text-sm text-slate-500 hover:text-slate-800">
          ← رجوع إلى الفواتير
        </Link>
        <div className="flex gap-2">
          <a
            href={`/api/invoices/${invoice.id}/xml`}
            className="bg-white border border-slate-300 hover:bg-slate-50 rounded-lg px-4 py-2 text-sm font-medium"
          >
            تنزيل XML (UBL)
          </a>
          <PrintButton />
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-8 print:shadow-none print:border-0">
        <div className="flex items-start justify-between border-b border-slate-100 pb-6 mb-6">
          <div>
            <h1 className="text-xl font-bold text-slate-900">{invoice.organization.name}</h1>
            {invoice.organization.nameAr && <p className="text-slate-500">{invoice.organization.nameAr}</p>}
            <p className="text-xs text-slate-400 mt-1">
              الرقم الضريبي: {invoice.organization.vatNumber ?? "—"}
            </p>
            <p className="text-xs text-slate-400">
              {[invoice.organization.district, invoice.organization.city].filter(Boolean).join("، ")}
            </p>
          </div>
          <div className="text-left">
            <p className="text-lg font-bold text-brand-gold-dark">
              {invoice.kind === "SIMPLIFIED" ? "فاتورة ضريبية مبسّطة" : "فاتورة ضريبية"}
            </p>
            <p className="text-sm text-slate-500">{invoice.invoiceNumber}</p>
            <p className="text-xs text-slate-400 mt-1">{dateFmt.format(invoice.issueDate)}</p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-6 mb-6">
          <div>
            <p className="text-xs text-slate-400 mb-1">العميل</p>
            <p className="font-semibold text-slate-800">{invoice.renter.fullNameAr || invoice.renter.fullName}</p>
            {invoice.renter.vatNumber && (
              <p className="text-xs text-slate-400">الرقم الضريبي: {invoice.renter.vatNumber}</p>
            )}
            {invoice.contract && (
              <p className="text-xs text-slate-400">
                عقد رقم {invoice.contract.contractNumber} — وحدة {invoice.contract.unit.unitNumber} (
                {invoice.contract.unit.property.nameAr || invoice.contract.unit.property.name})
              </p>
            )}
          </div>
          {qrDataUrl && (
            <div className="flex flex-col items-end">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={qrDataUrl} alt="ZATCA QR Code" width={140} height={140} />
              <p className="text-[10px] text-slate-400 mt-1">رمز الاستجابة السريعة (فاتورة)</p>
            </div>
          )}
        </div>

        <table className="w-full text-sm mb-6">
          <thead className="border-b border-slate-200 text-slate-500">
            <tr>
              <th className="py-2 text-right font-medium">الوصف</th>
              <th className="py-2 text-right font-medium">الكمية</th>
              <th className="py-2 text-right font-medium">سعر الوحدة</th>
              <th className="py-2 text-right font-medium">الضريبة</th>
              <th className="py-2 text-right font-medium">الإجمالي</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {invoice.lines.map((line) => (
              <tr key={line.id}>
                <td className="py-2">{line.descriptionAr || line.description}</td>
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
              <span className="text-slate-500">الإجمالي قبل الضريبة</span>
              <span>{sar.format(Number(invoice.subtotal))}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">ضريبة القيمة المضافة</span>
              <span>{sar.format(Number(invoice.vatAmount))}</span>
            </div>
            <div className="flex justify-between font-bold text-base border-t border-slate-200 pt-1 mt-1">
              <span>الإجمالي المستحق</span>
              <span>{sar.format(Number(invoice.totalAmount))}</span>
            </div>
            <div className="flex justify-between text-emerald-600">
              <span>المسدد</span>
              <span>{sar.format(Number(invoice.paidAmount))}</span>
            </div>
            {remaining > 0.01 && (
              <div className="flex justify-between text-red-600 font-medium">
                <span>المتبقي</span>
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
          <p>حالة الربط مع فاتورة (ZATCA): {invoice.zatcaStatus}</p>
        </div>
      </div>

      {remaining > 0.01 && invoice.status !== "CANCELLED" && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 no-print">
          <h2 className="font-semibold text-slate-800 mb-4">تسجيل دفعة / سند قبض</h2>
          <form action={recordPayment} className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <input type="hidden" name="invoiceId" value={invoice.id} />
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">المبلغ</label>
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
              <label className="block text-sm font-medium text-slate-700 mb-1">طريقة الدفع</label>
              <select name="method" className="w-full rounded-lg border border-slate-300 px-3 py-2">
                {Object.entries(methodLabel).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">رقم المرجع</label>
              <input name="referenceNumber" className="w-full rounded-lg border border-slate-300 px-3 py-2" />
            </div>
            <div className="flex items-end">
              <button className="w-full bg-brand-gold hover:bg-brand-gold-dark text-brand-black rounded-lg px-4 py-2 font-semibold">
                تسجيل الدفعة
              </button>
            </div>
          </form>
        </div>
      )}

      {invoice.payments.length > 0 && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 no-print">
          <h2 className="font-semibold text-slate-800 mb-4">سجل المدفوعات</h2>
          <ul className="divide-y divide-slate-100 text-sm">
            {invoice.payments.map((p) => (
              <li key={p.id} className="py-2 flex justify-between">
                <span>
                  {p.receiptNumber} · {methodLabel[p.method]}
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
          <button className="text-red-500 hover:underline text-sm">إلغاء الفاتورة</button>
        </form>
      )}
    </div>
  );
}
