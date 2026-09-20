import { listProperties, createProperty, deleteProperty } from "@/lib/actions/properties";

const typeLabel: Record<string, string> = {
  RESIDENTIAL: "سكني",
  COMMERCIAL: "تجاري",
  MIXED: "مختلط",
};

export default async function PropertiesPage() {
  const properties = await listProperties();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">العقارات</h1>
          <p className="text-slate-500 text-sm mt-1">إدارة المباني والعقارات التابعة لمنشأتك</p>
        </div>
      </div>

      <details className="bg-white rounded-xl border border-slate-200 shadow-sm group">
        <summary className="cursor-pointer list-none px-5 py-4 font-semibold text-slate-800 flex items-center justify-between">
          إضافة عقار جديد
          <span className="text-brand-gold-dark group-open:rotate-45 transition-transform text-xl">+</span>
        </summary>
        <form action={createProperty} className="px-5 pb-5 grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="اسم العقار (بالإنجليزية)" name="name" required />
          <Field label="اسم العقار (بالعربية)" name="nameAr" />
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">نوع العقار</label>
            <select name="propertyType" className="w-full rounded-lg border border-slate-300 px-3 py-2">
              <option value="RESIDENTIAL">سكني</option>
              <option value="COMMERCIAL">تجاري</option>
              <option value="MIXED">مختلط</option>
            </select>
          </div>
          <Field label="المدينة" name="city" />
          <Field label="الحي" name="district" />
          <Field label="الشارع" name="street" />
          <div className="md:col-span-2">
            <button className="bg-brand-gold hover:bg-brand-gold-dark text-brand-black rounded-lg px-5 py-2.5 font-semibold">
              حفظ العقار
            </button>
          </div>
        </form>
      </details>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-500 text-right">
            <tr>
              <th className="px-5 py-3 font-medium">العقار</th>
              <th className="px-5 py-3 font-medium">النوع</th>
              <th className="px-5 py-3 font-medium">الموقع</th>
              <th className="px-5 py-3 font-medium">عدد الوحدات</th>
              <th className="px-5 py-3 font-medium"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {properties.map((p) => (
              <tr key={p.id}>
                <td className="px-5 py-3">
                  <p className="font-medium text-slate-800">{p.nameAr || p.name}</p>
                  <p className="text-slate-400 text-xs">{p.name}</p>
                </td>
                <td className="px-5 py-3">{typeLabel[p.propertyType]}</td>
                <td className="px-5 py-3 text-slate-500">{[p.district, p.city].filter(Boolean).join("، ") || "—"}</td>
                <td className="px-5 py-3">{p.units.length}</td>
                <td className="px-5 py-3 text-left">
                  <form
                    action={async () => {
                      "use server";
                      await deleteProperty(p.id);
                    }}
                  >
                    <button className="text-red-500 hover:underline text-xs">حذف</button>
                  </form>
                </td>
              </tr>
            ))}
            {properties.length === 0 && (
              <tr>
                <td colSpan={5} className="px-5 py-8 text-center text-slate-400">
                  لا يوجد عقارات بعد
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Field({ label, name, required }: { label: string; name: string; required?: boolean }) {
  return (
    <div>
      <label className="block text-sm font-medium text-slate-700 mb-1">{label}</label>
      <input
        name={name}
        required={required}
        className="w-full rounded-lg border border-slate-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-gold"
      />
    </div>
  );
}
