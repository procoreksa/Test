import Link from "next/link";
import { getMaintenanceByCompoundReport } from "@/lib/actions/maintenance-reports";
import { getLocale, getDictionary, pickLocalized } from "@/lib/i18n";

export default async function MaintenanceByCompoundReportPage() {
  const [rows, locale] = await Promise.all([getMaintenanceByCompoundReport(), getLocale()]);
  const t = getDictionary(locale);

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <Link href="/operations/maintenance/reports" className="text-brand-gold-dark hover:underline text-sm">
          ← {t.maintenance.reportsTitle}
        </Link>
        <h1 className="text-2xl font-bold text-slate-900 mt-2">{t.maintenance.reportByCompound}</h1>
      </div>
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
        <table className="w-full text-sm">
          <tbody>
            {rows
              .sort((a, b) => b.count - a.count)
              .map((row) => (
                <tr key={row.compoundId} className="border-b border-slate-100">
                  <td className="py-2 text-slate-600">{row.compound ? pickLocalized(locale, row.compound.arabicName, row.compound.name) : "—"}</td>
                  <td className="py-2 text-end font-medium">{row.count}</td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
