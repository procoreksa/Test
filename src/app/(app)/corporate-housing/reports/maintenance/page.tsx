import Link from "next/link";
import { getCorporateMaintenanceReport } from "@/lib/actions/corporate-housing-reports";
import { getLocale, getDictionary, pickLocalized, shortDateFormatter } from "@/lib/i18n";
import { ReportPager } from "@/components/report-pager";

export default async function CorporateMaintenanceReportPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const { page } = await searchParams;
  const [{ rows, page: p, totalPages }, locale] = await Promise.all([getCorporateMaintenanceReport(page ? Number(page) : 1), getLocale()]);
  const t = getDictionary(locale);
  const dateFmt = shortDateFormatter(locale);

  return (
    <div className="space-y-6">
      <div>
        <Link href="/corporate-housing/reports" className="text-brand-gold-dark hover:underline text-sm">
          ← {t.corporateHousing.reportsTitle}
        </Link>
        <h1 className="text-2xl font-bold text-slate-900 mt-2">{t.corporateHousing.reportMaintenance}</h1>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-500 text-right">
            <tr>
              <th className="px-4 py-3 font-medium">{t.maintenance.colRequestNumber}</th>
              <th className="px-4 py-3 font-medium">{t.corporateHousing.colUnit}</th>
              <th className="px-4 py-3 font-medium">{t.corporateHousing.fieldOccupant}</th>
              <th className="px-4 py-3 font-medium">{t.maintenance.colCategory}</th>
              <th className="px-4 py-3 font-medium">{t.maintenance.colPriority}</th>
              <th className="px-4 py-3 font-medium">{t.maintenance.colStatus}</th>
              <th className="px-4 py-3 font-medium">{t.maintenance.colReportedAt}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((r) => (
              <tr key={r.id}>
                <td className="px-4 py-3 font-medium text-slate-800">
                  <Link href={`/operations/maintenance/requests/${r.id}`} className="hover:underline">
                    {r.requestNumber}
                  </Link>
                </td>
                <td className="px-4 py-3 text-slate-500">{r.unit?.unitNumber ?? "—"}</td>
                <td className="px-4 py-3 text-slate-500">{r.corporateOccupant ? pickLocalized(locale, r.corporateOccupant.fullNameAr, r.corporateOccupant.fullName) : "—"}</td>
                <td className="px-4 py-3 text-slate-500">{t.maintenanceCategory[r.category]}</td>
                <td className="px-4 py-3 text-slate-500">{t.maintenancePriority[r.priority]}</td>
                <td className="px-4 py-3 text-slate-500">{t.maintenanceRequestStatus[r.status]}</td>
                <td className="px-4 py-3 text-slate-500 whitespace-nowrap">{dateFmt.format(r.reportedAt)}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={7} className="px-5 py-8 text-center text-slate-400">—</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <ReportPager
        page={p}
        totalPages={totalPages}
        hrefFor={(n) => `/corporate-housing/reports/maintenance?page=${n}`}
        previousLabel={t.corporateHousing.previousLabel}
        nextLabel={t.corporateHousing.nextLabel}
      />
    </div>
  );
}
