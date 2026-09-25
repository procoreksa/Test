import Link from "next/link";
import { getOwnerPortalMaintenanceRequests } from "@/lib/actions/owner-portal/maintenance";
import { getLocale, getDictionary, shortDateFormatter } from "@/lib/i18n";

/** Read-only in V1 (Step 68-73) - no create/triage/assign action exists here or anywhere in the Owner Portal. */
export default async function OwnerPortalMaintenancePage() {
  const [requests, locale] = await Promise.all([getOwnerPortalMaintenanceRequests(), getLocale()]);
  const t = getDictionary(locale);
  const dateFmt = shortDateFormatter(locale);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">{t.ownerPortal.maintenanceTitle}</h1>
        <p className="text-slate-500 text-sm mt-1">{t.ownerPortal.maintenanceSubtitle}</p>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-500 text-right">
            <tr>
              <th className="px-4 py-3 font-medium">{t.ownerPortal.colRequestNumber}</th>
              <th className="px-4 py-3 font-medium">{t.ownerPortal.colProperty}</th>
              <th className="px-4 py-3 font-medium">{t.ownerPortal.colCategory}</th>
              <th className="px-4 py-3 font-medium">{t.ownerPortal.colPriority}</th>
              <th className="px-4 py-3 font-medium">{t.ownerPortal.colStatus}</th>
              <th className="px-4 py-3 font-medium">{t.ownerPortal.colReportedDate}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {requests.map((r) => (
              <tr key={r.id}>
                <td className="px-4 py-3 font-medium text-slate-800 whitespace-nowrap">
                  <Link href={`/owner-portal/maintenance/${r.id}`} className="hover:underline">
                    {r.requestNumber}
                  </Link>
                </td>
                <td className="px-4 py-3 text-slate-500">{r.unit?.unitNumber ?? r.building?.name ?? r.compound?.name ?? "-"}</td>
                <td className="px-4 py-3 text-slate-500">{t.maintenanceCategory[r.category]}</td>
                <td className="px-4 py-3 text-slate-500">{t.maintenancePriority[r.priority]}</td>
                <td className="px-4 py-3 text-slate-500">{t.maintenanceRequestStatus[r.status]}</td>
                <td className="px-4 py-3 text-slate-500 whitespace-nowrap">{dateFmt.format(r.reportedAt)}</td>
              </tr>
            ))}
            {requests.length === 0 && (
              <tr>
                <td colSpan={6} className="px-5 py-8 text-center text-slate-400">
                  {t.ownerPortal.emptyMaintenance}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
