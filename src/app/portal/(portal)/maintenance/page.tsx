import Link from "next/link";
import { getTenantMaintenanceRequests } from "@/lib/actions/portal/maintenance";
import { getLocale, getDictionary, shortDateFormatter } from "@/lib/i18n";

export default async function TenantMaintenancePage() {
  const [requests, locale] = await Promise.all([getTenantMaintenanceRequests(), getLocale()]);
  const t = getDictionary(locale);
  const dateFmt = shortDateFormatter(locale);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{t.tenantPortal.maintenanceTitle}</h1>
          <p className="text-slate-500 text-sm mt-1">{t.tenantPortal.maintenanceSubtitle}</p>
        </div>
        <Link href="/portal/maintenance/new" className="bg-brand-gold hover:bg-brand-gold-dark text-brand-black rounded-lg px-5 py-2.5 font-semibold text-sm">
          + {t.tenantPortal.newMaintenanceRequestButton}
        </Link>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-500 text-right">
            <tr>
              <th className="px-4 py-3 font-medium">{t.tenantPortal.colRequestNumber}</th>
              <th className="px-4 py-3 font-medium">{t.tenantPortal.fieldTitle}</th>
              <th className="px-4 py-3 font-medium">{t.tenantPortal.fieldCategory}</th>
              <th className="px-4 py-3 font-medium">{t.tenantPortal.fieldPriority}</th>
              <th className="px-4 py-3 font-medium">{t.tenantPortal.colStatus}</th>
              <th className="px-4 py-3 font-medium">{t.tenantPortal.colReported}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {requests.map((r) => (
              <tr key={r.id}>
                <td className="px-4 py-3 font-medium text-slate-800 whitespace-nowrap">
                  <Link href={`/portal/maintenance/${r.id}`} className="hover:underline">
                    {r.requestNumber}
                  </Link>
                </td>
                <td className="px-4 py-3 text-slate-700">{r.title}</td>
                <td className="px-4 py-3 text-slate-500">{t.maintenanceCategory[r.category]}</td>
                <td className="px-4 py-3 text-slate-500">{t.maintenancePriority[r.priority]}</td>
                <td className="px-4 py-3 text-slate-500">{t.maintenanceRequestStatus[r.status]}</td>
                <td className="px-4 py-3 text-slate-500 whitespace-nowrap">{dateFmt.format(r.reportedAt)}</td>
              </tr>
            ))}
            {requests.length === 0 && (
              <tr>
                <td colSpan={6} className="px-5 py-8 text-center text-slate-400">
                  {t.tenantPortal.emptyMaintenance}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
