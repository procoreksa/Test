import { getLeadConversionReport } from "@/lib/actions/crm";
import { StatCard } from "@/components/stat-card";
import { getLocale, getDictionary } from "@/lib/i18n";
import { PrintButton } from "@/components/print-button";

export default async function LeadConversionReportPage() {
  const [report, locale] = await Promise.all([getLeadConversionReport(), getLocale()]);
  const t = getDictionary(locale);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between no-print">
        <h1 className="text-2xl font-bold text-slate-900">{t.crm.reportConversion}</h1>
        <PrintButton label={t.printButton} />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label={t.crm.kpiConversionRate} value={`${report.conversionRate}%`} tone="positive" />
        <StatCard label={t.crm.kpiWonLeads} value={String(report.wonCount)} />
        <StatCard label={t.crm.kpiLostLeads} value={String(report.lostCount)} tone="danger" />
        <StatCard label={t.crm.kpiActiveLeads} value={String(report.activeCount)} />
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 text-sm text-slate-600">
        <p>
          {t.crm.conversionFormulaNote} = {report.wonCount} / ({report.wonCount} + {report.lostCount}) = <strong>{report.conversionRate}%</strong>
        </p>
        <p className="mt-1 text-slate-400">{t.crm.conversionActiveNote(report.activeCount)}</p>
      </div>
    </div>
  );
}
