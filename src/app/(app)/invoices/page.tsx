import Link from "next/link";
import { listInvoices } from "@/lib/actions/invoices";

const statusLabel: Record<string, { label: string; className: string }> = {
  DRAFT: { label: "مسودة", className: "bg-slate-100 text-slate-600" },
  ISSUED: { label: "صادرة", className: "bg-blue-100 text-blue-700" },
  PARTIALLY_PAID: { label: "مسددة جزئيًا", className: "bg-amber-100 text-amber-700" },
  PAID: { label: "مسددة", className: "bg-emerald-100 text-emerald-700" },
  OVERDUE: { label: "متأخرة", className: "bg-red-100 text-red-700" },
  CANCELLED: { label: "ملغاة", className: "bg-slate-100 text-slate-400" },
};

const kindLabel: Record<string, string> = {
  STANDARD: "قياسية (B2B)",
  SIMPLIFIED: "مبسّطة (B2C)",
};

const sar = new Intl.NumberFormat("ar-SA", { style: "currency", currency: "SAR" });
const dateFmt = new Intl.DateTimeFormat("ar-SA", { day: "numeric", month: "short", year: "numeric" });

export default async function InvoicesPage() {
  const invoices = await listInvoices();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">الفواتير الضريبية</h1>
        <p className="text-slate-500 text-sm mt-1">
          فواتير متوافقة مع متطلبات هيئة الزكاة والضريبة والجمارك (فاتورة) — QR Code وسلسلة تجزئة (PIH) لكل فاتورة
        </p>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-500 text-right">
            <tr>
              <th className="px-5 py-3 font-medium">رقم الفاتورة</th>
              <th className="px-5 py-3 font-medium">النوع</th>
              <th className="px-5 py-3 font-medium">العميل</th>
              <th className="px-5 py-3 font-medium">تاريخ الإصدار</th>
              <th className="px-5 py-3 font-medium">الإجمالي</th>
              <th className="px-5 py-3 font-medium">الحالة</th>
              <th className="px-5 py-3 font-medium"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {invoices.map((inv) => (
              <tr key={inv.id}>
                <td className="px-5 py-3 font-medium text-slate-800">{inv.invoiceNumber}</td>
                <td className="px-5 py-3 text-slate-500 text-xs">{kindLabel[inv.kind]}</td>
                <td className="px-5 py-3">{inv.renter.fullNameAr || inv.renter.fullName}</td>
                <td className="px-5 py-3 text-slate-500">{dateFmt.format(inv.issueDate)}</td>
                <td className="px-5 py-3 font-medium">{sar.format(Number(inv.totalAmount))}</td>
                <td className="px-5 py-3">
                  <span className={`px-2 py-1 rounded-full text-xs font-medium ${statusLabel[inv.status].className}`}>
                    {statusLabel[inv.status].label}
                  </span>
                </td>
                <td className="px-5 py-3 text-left">
                  <Link href={`/invoices/${inv.id}`} className="text-brand-gold-dark hover:underline text-xs font-medium">
                    عرض الفاتورة
                  </Link>
                </td>
              </tr>
            ))}
            {invoices.length === 0 && (
              <tr>
                <td colSpan={7} className="px-5 py-8 text-center text-slate-400">
                  لا يوجد فواتير بعد — أصدر فاتورة من صفحة التحصيلات
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
