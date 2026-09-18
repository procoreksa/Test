import { getOrganization, updateOrganization } from "@/lib/actions/organization";

export default async function SettingsPage() {
  const org = await getOrganization();

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">إعدادات المنشأة</h1>
        <p className="text-slate-500 text-sm mt-1">
          هذه البيانات تظهر على كل فاتورة ضريبية صادرة، وتُستخدم في رمز QR وملف XML (UBL)
        </p>
      </div>

      <form action={updateOrganization} className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 grid grid-cols-1 md:grid-cols-2 gap-4">
        <Field label="اسم المنشأة (بالإنجليزية)" name="name" defaultValue={org.name} required />
        <Field label="اسم المنشأة (بالعربية)" name="nameAr" defaultValue={org.nameAr ?? ""} />
        <Field label="السجل التجاري" name="commercialRegistration" defaultValue={org.commercialRegistration ?? ""} />
        <Field label="الرقم الضريبي (15 رقمًا)" name="vatNumber" defaultValue={org.vatNumber ?? ""} />
        <Field label="المدينة" name="city" defaultValue={org.city ?? ""} />
        <Field label="الحي" name="district" defaultValue={org.district ?? ""} />
        <Field label="الشارع" name="street" defaultValue={org.street ?? ""} />
        <Field label="رقم المبنى" name="buildingNumber" defaultValue={org.buildingNumber ?? ""} />
        <Field label="الرمز البريدي" name="postalCode" defaultValue={org.postalCode ?? ""} />
        <Field label="رقم الجوال" name="phone" defaultValue={org.phone ?? ""} />
        <Field label="البريد الإلكتروني" name="email" type="email" defaultValue={org.email ?? ""} />
        <div className="md:col-span-2">
          <button className="bg-teal-600 hover:bg-teal-700 text-white rounded-lg px-5 py-2.5 font-semibold">
            حفظ الإعدادات
          </button>
        </div>
      </form>

      <div className="bg-amber-50 border border-amber-200 text-amber-800 rounded-xl p-4 text-sm">
        <p className="font-semibold mb-1">حول الربط مع فاتورة (ZATCA)</p>
        <p>
          يقوم النظام حاليًا بتوليد رقم تسلسلي (ICV)، ومعرف فريد (UUID)، وسلسلة تجزئة (PIH) لكل فاتورة، إضافة إلى
          رمز QR بصيغة TLV (المرحلة الأولى) وملف XML بمعيار UBL 2.1. لإتمام الربط الفعلي مع بوابة فاتورة (المرحلة
          الثانية) يلزم استخراج شهادة CSID من بوابة الهيئة وتوقيع الفاتورة إلكترونيًا، ثم ضبط متغيرات البيئة
          الخاصة بـ ZATCA في إعدادات الخادم.
        </p>
      </div>
    </div>
  );
}

function Field({
  label,
  name,
  required,
  type = "text",
  defaultValue,
}: {
  label: string;
  name: string;
  required?: boolean;
  type?: string;
  defaultValue?: string;
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-slate-700 mb-1">{label}</label>
      <input
        name={name}
        type={type}
        required={required}
        defaultValue={defaultValue}
        className="w-full rounded-lg border border-slate-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-teal-500"
      />
    </div>
  );
}
