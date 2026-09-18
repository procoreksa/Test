import Link from "next/link";
import { listCollections } from "@/lib/actions/collections";
import { issueInvoiceForSchedule } from "@/lib/actions/invoices";

const statusLabel: Record<string, { label: string; className: string }> = {
  PENDING: { label: "مستحقة", className: "bg-slate-100 text-slate-600" },
  INVOICED: { label: "تم إصدار فاتورة", className: "bg-blue-100 text-blue-700" },
  PAID: { label: "مسددة", className: "bg-emerald-100 text-emerald-700" },
  PARTIALLY_PAID: { label: "مسددة جزئيًا", className: "bg-amber-100 text-amber-700" },
  OVERDUE: { label: "متأخرة", className: "bg-red-100 text-red-700" },
  CANCELLED: { label: "ملغاة", className: "bg-slate-100 text-slate-400" },
};

const sar = new Intl.NumberFormat("ar-SA", { style: "currency", currency: "SAR" });
const dateFmt = new Intl.DateTimeFormat("ar-SA", { day: "numeric", month: "short", year: "numeric" });

export default async function CollectionsPage() {
  const schedules = await listCollections();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">متابعة الإيجارات والتحصيلات</h1>
        <p className="text-slate-500 text-sm mt-1">جدول دفعات كل العقود مع إمكانية إصدار الفاتورة الضريبية لكل دفعة مستحقة</p>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-500 text-right">
            <tr>
              <th className="px-5 py-3 font-medium">المستأجر</th>
              <th className="px-5 py-3 font-medium">الوحدة</th>
              <th className="px-5 py-3 font-medium">الدفعة</th>
              <th className="px-5 py-3 font-medium">تاريخ الاستحقاق</th>
              <th className="px-5 py-3 font-medium">المبلغ</th>
              <th className="px-5 py-3 font-medium">الحالة</th>
              <th className="px-5 py-3 font-medium"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {schedules.map((s) => (
              <tr key={s.id}>
                <td className="px-5 py-3 font-medium text-slate-800">{s.contract.renter.fullNameAr || s.contract.renter.fullName}</td>
                <td className="px-5 py-3 text-slate-500">
                  {s.contract.unit.property.nameAr || s.contract.unit.property.name} / {s.contract.unit.unitNumber}
                </td>
                <td className="px-5 py-3 text-slate-500">#{s.installmentNo}</td>
                <td className="px-5 py-3 text-slate-500">{dateFmt.format(s.dueDate)}</td>
                <td className="px-5 py-3 font-medium">{sar.format(Number(s.amount))}</td>
                <td className="px-5 py-3">
                  <span className={`px-2 py-1 rounded-full text-xs font-medium ${statusLabel[s.status].className}`}>
                    {statusLabel[s.status].label}
                  </span>
                </td>
                <td className="px-5 py-3 text-left">
                  {s.invoiceId ? (
                    <Link href={`/invoices/${s.invoiceId}`} className="text-teal-600 hover:underline text-xs">
                      عرض الفاتورة
                    </Link>
                  ) : (s.status === "PENDING" || s.status === "OVERDUE") ? (
                    <form
                      action={async () => {
                        "use server";
                        await issueInvoiceForSchedule(s.id);
                      }}
                    >
                      <button className="text-teal-600 hover:underline text-xs font-medium">إصدار فاتورة ضريبية</button>
                    </form>
                  ) : null}
                </td>
              </tr>
            ))}
            {schedules.length === 0 && (
              <tr>
                <td colSpan={7} className="px-5 py-8 text-center text-slate-400">
                  لا يوجد جدول دفعات بعد — أنشئ عقد إيجار أولًا
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
