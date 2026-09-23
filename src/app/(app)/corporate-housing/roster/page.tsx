import { getCorporateHousingOccupancyRoster } from "@/lib/actions/corporate-housing-reports";
import { getOrganizationBranding } from "@/lib/actions/organization";
import { getLocale, getDictionary, longDateTimeFormatter, shortDateFormatter, pickLocalized } from "@/lib/i18n";
import { unitLocationLabel } from "@/lib/unit-location";
import { PrintButton } from "@/components/print-button";

/**
 * Bilingual printable Occupancy Roster (Step 71 of docs/CORPORATE-HOUSING.md)
 * - always shows both the English and Arabic titles regardless of the
 * viewer's locale, internal-staff-only (corporateHousingReports.view),
 * never exposed to the Owner Portal or Tenant Portal.
 */
export default async function CorporateHousingOccupancyRosterPage() {
  const [rows, org, locale] = await Promise.all([getCorporateHousingOccupancyRoster(), getOrganizationBranding(), getLocale()]);
  const t = getDictionary(locale);
  const dateFmt = shortDateFormatter(locale);
  const dateTimeFmt = longDateTimeFormatter(locale);

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <div className="no-print flex justify-end">
        <PrintButton label={t.corporateHousing.printRosterButton} />
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-8 space-y-6">
        <div className="flex items-start justify-between border-b border-slate-200 pb-4">
          <div className="flex items-center gap-3">
            {org.logoUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={org.logoUrl} alt="" className="w-12 h-12 rounded-full object-cover" />
            )}
            <p className="font-bold text-slate-900">{pickLocalized(locale, org.nameAr, org.name)}</p>
          </div>
          <div className="text-right">
            <h1 className="text-lg font-bold text-slate-900">CORPORATE HOUSING OCCUPANCY ROSTER</h1>
            <h2 className="text-lg font-bold text-slate-900" dir="rtl">كشف إشغال إسكان الشركات</h2>
          </div>
        </div>

        <table className="w-full text-xs">
          <thead className="border-b border-slate-300 text-slate-600">
            <tr>
              <th className="py-2 text-start">{t.corporateHousing.colAllocationNumber}</th>
              <th className="py-2 text-start">{t.corporateHousing.colCorporateAccount}</th>
              <th className="py-2 text-start">{t.corporateHousing.colOccupant}</th>
              <th className="py-2 text-start">{t.corporateHousing.colUnit}</th>
              <th className="py-2 text-start">{t.corporateHousing.sectionUnits}</th>
              <th className="py-2 text-start">{t.corporateHousing.colStartDate}</th>
              <th className="py-2 text-start">{t.corporateHousing.colPlannedEndDate}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((r) => (
              <tr key={r.id}>
                <td className="py-2">{r.allocationNumber}</td>
                <td className="py-2">{r.corporateAccount.displayName}</td>
                <td className="py-2">
                  {pickLocalized(locale, r.occupant.fullNameAr, r.occupant.fullName)} {r.occupant.employeeNumber ? `(${r.occupant.employeeNumber})` : ""}
                </td>
                <td className="py-2">
                  {r.unit.unitNumber} {r.roomLabel ? `— ${r.roomLabel}` : ""}
                </td>
                <td className="py-2">{unitLocationLabel(locale, r.unit)}</td>
                <td className="py-2 whitespace-nowrap">{dateFmt.format(r.startDate)}</td>
                <td className="py-2 whitespace-nowrap">{r.plannedEndDate ? dateFmt.format(r.plannedEndDate) : "—"}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={7} className="py-6 text-center text-slate-400">
                  —
                </td>
              </tr>
            )}
          </tbody>
        </table>

        <p className="text-xs text-slate-400 text-center border-t border-slate-100 pt-3">
          {dateTimeFmt.format(new Date())}
        </p>
      </div>
    </div>
  );
}
