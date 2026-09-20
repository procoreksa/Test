import { listRenters, createRenter, deleteRenter } from "@/lib/actions/renters";

const idTypeLabel: Record<string, string> = {
  NATIONAL_ID: "هوية وطنية",
  IQAMA: "إقامة",
  COMMERCIAL_REGISTRATION: "سجل تجاري",
  PASSPORT: "جواز سفر",
  GCC_ID: "بطاقة خليجية",
};

export default async function RentersPage() {
  const renters = await listRenters();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">المستأجرون</h1>
        <p className="text-slate-500 text-sm mt-1">
          بيانات المستأجرين — أضف الرقم الضريبي فقط للمستأجرين من الشركات (B2B) لإصدار فاتورة ضريبية قياسية
        </p>
      </div>

      <details className="bg-white rounded-xl border border-slate-200 shadow-sm group">
        <summary className="cursor-pointer list-none px-5 py-4 font-semibold text-slate-800 flex items-center justify-between">
          إضافة مستأجر جديد
          <span className="text-brand-gold-dark group-open:rotate-45 transition-transform text-xl">+</span>
        </summary>
        <form action={createRenter} className="px-5 pb-5 grid grid-cols-1 md:grid-cols-3 gap-4">
          <Field label="الاسم الكامل" name="fullName" required />
          <Field label="الاسم بالعربية" name="fullNameAr" />
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">نوع الهوية</label>
            <select name="idType" className="w-full rounded-lg border border-slate-300 px-3 py-2">
              {Object.entries(idTypeLabel).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>
          <Field label="رقم الهوية" name="idNumber" />
          <Field label="الرقم الضريبي (اختياري - لعملاء الشركات)" name="vatNumber" />
          <Field label="رقم الجوال" name="phone" />
          <Field label="البريد الإلكتروني" name="email" type="email" />
          <div className="md:col-span-2">
            <Field label="العنوان" name="address" />
          </div>
          <div className="md:col-span-3">
            <button className="bg-brand-gold hover:bg-brand-gold-dark text-brand-black rounded-lg px-5 py-2.5 font-semibold">
              حفظ المستأجر
            </button>
          </div>
        </form>
      </details>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-500 text-right">
            <tr>
              <th className="px-5 py-3 font-medium">الاسم</th>
              <th className="px-5 py-3 font-medium">نوع الهوية</th>
              <th className="px-5 py-3 font-medium">رقم الهوية</th>
              <th className="px-5 py-3 font-medium">الرقم الضريبي</th>
              <th className="px-5 py-3 font-medium">التواصل</th>
              <th className="px-5 py-3 font-medium"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {renters.map((r) => (
              <tr key={r.id}>
                <td className="px-5 py-3 font-medium text-slate-800">{r.fullNameAr || r.fullName}</td>
                <td className="px-5 py-3">{idTypeLabel[r.idType]}</td>
                <td className="px-5 py-3 text-slate-500">{r.idNumber ?? "—"}</td>
                <td className="px-5 py-3">
                  {r.vatNumber ? (
                    <span className="px-2 py-1 rounded-full bg-brand-gold-tint text-brand-gold-dark text-xs font-medium">
                      {r.vatNumber}
                    </span>
                  ) : (
                    <span className="text-slate-400 text-xs">فرد (فاتورة مبسّطة)</span>
                  )}
                </td>
                <td className="px-5 py-3 text-slate-500">{r.phone || r.email || "—"}</td>
                <td className="px-5 py-3 text-left">
                  <form
                    action={async () => {
                      "use server";
                      await deleteRenter(r.id);
                    }}
                  >
                    <button className="text-red-500 hover:underline text-xs">حذف</button>
                  </form>
                </td>
              </tr>
            ))}
            {renters.length === 0 && (
              <tr>
                <td colSpan={6} className="px-5 py-8 text-center text-slate-400">
                  لا يوجد مستأجرون بعد
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Field({
  label,
  name,
  required,
  type = "text",
}: {
  label: string;
  name: string;
  required?: boolean;
  type?: string;
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-slate-700 mb-1">{label}</label>
      <input
        name={name}
        type={type}
        required={required}
        className="w-full rounded-lg border border-slate-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-gold"
      />
    </div>
  );
}
