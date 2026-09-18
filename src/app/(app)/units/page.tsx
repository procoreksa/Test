import { listUnits, createUnit, deleteUnit } from "@/lib/actions/units";
import { listProperties } from "@/lib/actions/properties";

const unitTypeLabel: Record<string, string> = {
  APARTMENT: "شقة",
  VILLA: "فيلا",
  OFFICE: "مكتب",
  SHOP: "محل",
  WAREHOUSE: "مستودع",
  OTHER: "أخرى",
};

const statusLabel: Record<string, { label: string; className: string }> = {
  VACANT: { label: "شاغرة", className: "bg-slate-100 text-slate-600" },
  OCCUPIED: { label: "مؤجرة", className: "bg-emerald-100 text-emerald-700" },
  MAINTENANCE: { label: "صيانة", className: "bg-amber-100 text-amber-700" },
};

const sar = new Intl.NumberFormat("ar-SA", { style: "currency", currency: "SAR" });

export default async function UnitsPage() {
  const [units, properties] = await Promise.all([listUnits(), listProperties()]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">الوحدات</h1>
        <p className="text-slate-500 text-sm mt-1">إدارة الوحدات العقارية وحالتها الإيجارية</p>
      </div>

      <details className="bg-white rounded-xl border border-slate-200 shadow-sm group">
        <summary className="cursor-pointer list-none px-5 py-4 font-semibold text-slate-800 flex items-center justify-between">
          إضافة وحدة جديدة
          <span className="text-teal-600 group-open:rotate-45 transition-transform text-xl">+</span>
        </summary>
        <form action={createUnit} className="px-5 pb-5 grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">العقار</label>
            <select name="propertyId" required className="w-full rounded-lg border border-slate-300 px-3 py-2">
              {properties.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nameAr || p.name}
                </option>
              ))}
            </select>
          </div>
          <Field label="رقم الوحدة" name="unitNumber" required />
          <Field label="الطابق" name="floor" />
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">نوع الوحدة</label>
            <select name="unitType" className="w-full rounded-lg border border-slate-300 px-3 py-2">
              {Object.entries(unitTypeLabel).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>
          <Field label="المساحة (م²)" name="areaSqm" type="number" step="0.01" />
          <Field label="عدد الغرف" name="bedrooms" type="number" />
          <Field label="عدد الحمامات" name="bathrooms" type="number" />
          <Field label="قيمة الإيجار الأساسية (ريال)" name="baseRentAmount" type="number" step="0.01" required />
          <label className="flex items-center gap-2 mt-6 text-sm text-slate-600">
            <input type="checkbox" name="vatApplicable" className="rounded border-slate-300" />
            خاضعة لضريبة القيمة المضافة (تجاري)
          </label>
          <div className="md:col-span-3">
            <button className="bg-teal-600 hover:bg-teal-700 text-white rounded-lg px-5 py-2.5 font-semibold">
              حفظ الوحدة
            </button>
          </div>
        </form>
      </details>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-500 text-right">
            <tr>
              <th className="px-5 py-3 font-medium">الوحدة</th>
              <th className="px-5 py-3 font-medium">العقار</th>
              <th className="px-5 py-3 font-medium">النوع</th>
              <th className="px-5 py-3 font-medium">الإيجار الأساسي</th>
              <th className="px-5 py-3 font-medium">الحالة</th>
              <th className="px-5 py-3 font-medium">المستأجر الحالي</th>
              <th className="px-5 py-3 font-medium"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {units.map((u) => (
              <tr key={u.id}>
                <td className="px-5 py-3 font-medium text-slate-800">{u.unitNumber}</td>
                <td className="px-5 py-3 text-slate-500">{u.property.nameAr || u.property.name}</td>
                <td className="px-5 py-3">{unitTypeLabel[u.unitType]}</td>
                <td className="px-5 py-3">{sar.format(Number(u.baseRentAmount))}</td>
                <td className="px-5 py-3">
                  <span className={`px-2 py-1 rounded-full text-xs font-medium ${statusLabel[u.status].className}`}>
                    {statusLabel[u.status].label}
                  </span>
                </td>
                <td className="px-5 py-3 text-slate-500">{u.contracts[0]?.renter.fullName ?? "—"}</td>
                <td className="px-5 py-3 text-left">
                  <form
                    action={async () => {
                      "use server";
                      await deleteUnit(u.id);
                    }}
                  >
                    <button className="text-red-500 hover:underline text-xs">حذف</button>
                  </form>
                </td>
              </tr>
            ))}
            {units.length === 0 && (
              <tr>
                <td colSpan={7} className="px-5 py-8 text-center text-slate-400">
                  لا يوجد وحدات بعد
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
  step,
}: {
  label: string;
  name: string;
  required?: boolean;
  type?: string;
  step?: string;
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-slate-700 mb-1">{label}</label>
      <input
        name={name}
        type={type}
        step={step}
        required={required}
        className="w-full rounded-lg border border-slate-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-teal-500"
      />
    </div>
  );
}
