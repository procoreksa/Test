import Link from "next/link";
import { listPayments } from "@/lib/actions/payments";

const methodLabel: Record<string, string> = {
  CASH: "نقدًا",
  BANK_TRANSFER: "تحويل بنكي",
  CHEQUE: "شيك",
  CARD: "بطاقة",
  ONLINE: "دفع إلكتروني",
};

const sar = new Intl.NumberFormat("ar-SA", { style: "currency", currency: "SAR" });
const dateFmt = new Intl.DateTimeFormat("ar-SA", { day: "numeric", month: "short", year: "numeric" });

export default async function PaymentsPage() {
  const payments = await listPayments();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">سندات القبض</h1>
        <p className="text-slate-500 text-sm mt-1">سجل كامل لكل المدفوعات المحصّلة مقابل الفواتير الضريبية</p>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-500 text-right">
            <tr>
              <th className="px-5 py-3 font-medium">رقم السند</th>
              <th className="px-5 py-3 font-medium">المستأجر</th>
              <th className="px-5 py-3 font-medium">الفاتورة</th>
              <th className="px-5 py-3 font-medium">طريقة الدفع</th>
              <th className="px-5 py-3 font-medium">التاريخ</th>
              <th className="px-5 py-3 font-medium">المبلغ</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {payments.map((p) => (
              <tr key={p.id}>
                <td className="px-5 py-3 font-medium text-slate-800">{p.receiptNumber}</td>
                <td className="px-5 py-3">{p.renter.fullNameAr || p.renter.fullName}</td>
                <td className="px-5 py-3">
                  <Link href={`/invoices/${p.invoiceId}`} className="text-teal-600 hover:underline">
                    {p.invoice.invoiceNumber}
                  </Link>
                </td>
                <td className="px-5 py-3 text-slate-500">{methodLabel[p.method]}</td>
                <td className="px-5 py-3 text-slate-500">{dateFmt.format(p.paymentDate)}</td>
                <td className="px-5 py-3 font-medium text-emerald-600">{sar.format(Number(p.amount))}</td>
              </tr>
            ))}
            {payments.length === 0 && (
              <tr>
                <td colSpan={6} className="px-5 py-8 text-center text-slate-400">
                  لا يوجد مدفوعات بعد
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
