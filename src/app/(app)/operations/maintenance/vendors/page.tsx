import Link from "next/link";
import { listVendors } from "@/lib/actions/maintenance";
import { getCurrentUserRole } from "@/lib/session";
import { can } from "@/lib/permissions";
import { getLocale, getDictionary } from "@/lib/i18n";

export default async function MaintenanceVendorsListPage({ searchParams }: { searchParams: Promise<{ q?: string; page?: string }> }) {
  const params = await searchParams;
  const [role, locale] = await Promise.all([getCurrentUserRole(), getLocale()]);
  const t = getDictionary(locale);
  const canManage = can("maintenance.vendor.manage", role);

  const { rows, page, totalPages } = await listVendors({ search: params.q || undefined, page: params.page ? Number(params.page) : 1 });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{t.maintenance.vendorsListTitle}</h1>
          <p className="text-slate-500 text-sm mt-1">{t.maintenance.vendorsListSubtitle}</p>
        </div>
        {canManage && (
          <Link href="/operations/maintenance/vendors/new" className="bg-brand-gold hover:bg-brand-gold-dark text-brand-black rounded-lg px-5 py-2.5 font-semibold text-sm">
            + {t.maintenance.newVendorTitle}
          </Link>
        )}
      </div>

      <form method="get" className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
        <input name="q" defaultValue={params.q} placeholder={t.maintenance.requestSearchPlaceholder} className="w-full rounded-lg border border-slate-300 px-3 py-2" />
      </form>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-500 text-right">
            <tr>
              <th className="px-4 py-3 font-medium">{t.maintenance.colVendorNumber}</th>
              <th className="px-4 py-3 font-medium">{t.maintenance.colVendorName}</th>
              <th className="px-4 py-3 font-medium">{t.maintenance.colSpecialties}</th>
              <th className="px-4 py-3 font-medium">{t.maintenance.colActive}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((v) => (
              <tr key={v.id}>
                <td className="px-4 py-3 font-medium text-slate-800 whitespace-nowrap">
                  <Link href={`/operations/maintenance/vendors/${v.id}`} className="hover:underline">
                    {v.vendorNumber}
                  </Link>
                </td>
                <td className="px-4 py-3 text-slate-700">{v.name}</td>
                <td className="px-4 py-3 text-slate-500">{v.specialties.map((s) => t.maintenanceCategory[s.category]).join(", ") || "—"}</td>
                <td className="px-4 py-3">
                  <span className={`px-2 py-1 rounded-full text-xs font-medium ${v.active ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>
                    {v.active ? t.maintenance.activeLabel : t.maintenance.inactiveLabel}
                  </span>
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={4} className="px-5 py-8 text-center text-slate-400">
                  {t.maintenance.empty}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="text-sm text-slate-500">{t.maintenance.pageOf(page, totalPages)}</div>
    </div>
  );
}
