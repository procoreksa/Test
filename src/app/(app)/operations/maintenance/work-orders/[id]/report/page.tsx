import { getMaintenanceWorkOrderById } from "@/lib/actions/maintenance";
import { getOrganizationBranding } from "@/lib/actions/organization";
import { getLocale, getDictionary, longDateFormatter, longDateTimeFormatter, currencyFormatter, pickLocalized } from "@/lib/i18n";
import { PrintButton } from "@/components/print-button";

export default async function MaintenanceWorkOrderReportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [wo, org, locale] = await Promise.all([getMaintenanceWorkOrderById(id), getOrganizationBranding(), getLocale()]);
  const t = getDictionary(locale);
  const dateFmt = longDateFormatter(locale);
  const dateTimeFmt = longDateTimeFormatter(locale);
  const moneyFmt = currencyFormatter(locale);

  const locationLabel = wo.request.unit?.unitNumber ?? wo.request.building?.name ?? wo.request.compound?.name ?? "—";

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div className="no-print flex justify-end">
        <PrintButton label={t.printButton} />
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-8 space-y-6">
        <div className="flex items-start justify-between border-b border-slate-200 pb-4">
          <div className="flex items-center gap-3">
            {org.logoUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={org.logoUrl} alt="" className="w-12 h-12 rounded-full object-cover" />
            )}
            <div>
              <p className="font-bold text-slate-900">{pickLocalized(locale, org.nameAr, org.name)}</p>
              <p className="text-xs text-slate-500">{t.maintenance.reportOrgLabel}</p>
            </div>
          </div>
          <div className="text-right">
            <h1 className="text-xl font-bold text-slate-900">{t.maintenance.reportTitle}</h1>
            <p className="text-sm text-slate-500">{t.maintenance.reportSubtitle(wo.workOrderNumber)}</p>
          </div>
        </div>

        <dl className="grid grid-cols-2 gap-y-2 text-sm">
          <dt className="text-slate-500">{t.maintenance.colRequest}</dt>
          <dd className="text-slate-800 font-medium">{wo.request.requestNumber} — {wo.request.title}</dd>
          <dt className="text-slate-500">{t.maintenance.colLocation}</dt>
          <dd className="text-slate-800 font-medium">{locationLabel}</dd>
          <dt className="text-slate-500">{t.maintenance.fieldCategory}</dt>
          <dd className="text-slate-800 font-medium">{t.maintenanceCategory[wo.request.category]}</dd>
          <dt className="text-slate-500">{t.maintenance.fieldPriority}</dt>
          <dd className="text-slate-800 font-medium">{t.maintenancePriority[wo.priority]}</dd>
          <dt className="text-slate-500">{t.maintenance.fieldAssignedUser}</dt>
          <dd className="text-slate-800 font-medium">{wo.assignedToUser?.name ?? wo.vendor?.name ?? "—"}</dd>
          <dt className="text-slate-500">{t.maintenance.fieldScheduledStart}</dt>
          <dd className="text-slate-800 font-medium">{wo.scheduledStart ? dateTimeFmt.format(wo.scheduledStart) : "—"}</dd>
        </dl>

        <div>
          <h2 className="text-sm font-bold text-slate-800 border-b border-slate-200 pb-2 mb-2">{t.maintenance.sectionDiagnosis}</h2>
          <p className="text-sm text-slate-700 whitespace-pre-wrap">{wo.diagnosis || "—"}</p>
        </div>

        <div>
          <h2 className="text-sm font-bold text-slate-800 border-b border-slate-200 pb-2 mb-2">{t.maintenance.sectionCompletion}</h2>
          <p className="text-sm text-slate-700 whitespace-pre-wrap">{wo.workPerformed || "—"}</p>
        </div>

        <div>
          <h2 className="text-sm font-bold text-slate-800 border-b border-slate-200 pb-2 mb-2">{t.maintenance.sectionCostSummary}</h2>
          <table className="w-full text-sm">
            <tbody>
              <tr>
                <td className="py-1 text-slate-500">{t.maintenance.costLaborTotal}</td>
                <td className="py-1 text-end font-medium">{moneyFmt.format(Number(wo.costSummary.laborCost))}</td>
              </tr>
              <tr>
                <td className="py-1 text-slate-500">{t.maintenance.costPartsTotal}</td>
                <td className="py-1 text-end font-medium">{moneyFmt.format(Number(wo.costSummary.partsCost))}</td>
              </tr>
              <tr>
                <td className="py-1 text-slate-500">{t.maintenance.costOtherTotal}</td>
                <td className="py-1 text-end font-medium">{moneyFmt.format(Number(wo.costSummary.otherCost))}</td>
              </tr>
              <tr className="border-t border-slate-200">
                <td className="py-1 font-bold text-slate-800">{t.maintenance.costActualTotal}</td>
                <td className="py-1 text-end font-bold text-slate-800">{moneyFmt.format(Number(wo.costSummary.actualCost))}</td>
              </tr>
            </tbody>
          </table>
          <p className="text-xs text-slate-400 mt-2">{t.maintenance.costOperationalNotice}</p>
        </div>

        <div className="grid grid-cols-2 gap-y-2 text-sm border-t border-slate-200 pt-4">
          <dt className="text-slate-500">{t.maintenance.sectionCompletion}</dt>
          <dd className="text-slate-800 font-medium">{wo.completedAt ? dateTimeFmt.format(wo.completedAt) : "—"}</dd>
          <dt className="text-slate-500">{t.maintenance.sectionVerification}</dt>
          <dd className="text-slate-800 font-medium">{wo.verifiedAt ? dateTimeFmt.format(wo.verifiedAt) : "—"}</dd>
        </div>

        <p className="text-xs text-slate-400 text-center pt-4 border-t border-slate-200">
          {t.maintenance.reportPrintedOn} {dateFmt.format(new Date())}
        </p>
      </div>
    </div>
  );
}
