import { getOwnerPortalMaintenanceRequestDetail } from "@/lib/actions/owner-portal/maintenance";
import { getLocale, getDictionary, currencyFormatter, shortDateFormatter } from "@/lib/i18n";

export default async function OwnerPortalMaintenanceDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [{ request, ownerExpenseAmount }, locale] = await Promise.all([getOwnerPortalMaintenanceRequestDetail(id), getLocale()]);
  const t = getDictionary(locale);
  const moneyFmt = currencyFormatter(locale);
  const dateFmt = shortDateFormatter(locale);
  const workOrder = request.workOrders[0];

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-slate-900">{request.requestNumber}</h1>

      <section className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-y-3 text-sm">
          <div>
            <dt className="text-slate-500">{t.ownerPortal.colProperty}</dt>
            <dd className="text-slate-800 font-medium">{request.unit?.unitNumber ?? request.building?.name ?? request.compound?.name ?? "-"}</dd>
          </div>
          <div>
            <dt className="text-slate-500">{t.ownerPortal.colCategory}</dt>
            <dd className="text-slate-800 font-medium">{t.maintenanceCategory[request.category]}</dd>
          </div>
          <div>
            <dt className="text-slate-500">{t.ownerPortal.colPriority}</dt>
            <dd className="text-slate-800 font-medium">{t.maintenancePriority[request.priority]}</dd>
          </div>
          <div>
            <dt className="text-slate-500">{t.ownerPortal.colStatus}</dt>
            <dd className="text-slate-800 font-medium">{t.maintenanceRequestStatus[request.status]}</dd>
          </div>
          <div>
            <dt className="text-slate-500">{t.ownerPortal.colReportedDate}</dt>
            <dd className="text-slate-800 font-medium">{dateFmt.format(request.reportedAt)}</dd>
          </div>
          {request.resolvedAt && (
            <div>
              <dt className="text-slate-500">{t.ownerPortal.completionDateLabel}</dt>
              <dd className="text-slate-800 font-medium">{dateFmt.format(request.resolvedAt)}</dd>
            </div>
          )}
        </dl>
        {request.description && <p className="text-sm text-slate-600 mt-4 border-t border-slate-100 pt-4">{request.description}</p>}
      </section>

      {workOrder && (
        <section className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
          <h2 className="font-semibold text-slate-800 mb-3">{t.ownerPortal.workOrderStatusLabel}</h2>
          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-y-3 text-sm">
            <div>
              <dt className="text-slate-500">{t.ownerPortal.workOrderStatusLabel}</dt>
              <dd className="text-slate-800 font-medium">{t.maintenanceWorkOrderStatus[workOrder.status]}</dd>
            </div>
            <div>
              <dt className="text-slate-500">{t.ownerPortal.costResponsibilityLabel}</dt>
              <dd className="text-slate-800 font-medium">{t.maintenanceCostResponsibility[workOrder.costResponsibility]}</dd>
            </div>
            {workOrder.completedAt && (
              <div>
                <dt className="text-slate-500">{t.ownerPortal.completionDateLabel}</dt>
                <dd className="text-slate-800 font-medium">{dateFmt.format(workOrder.completedAt)}</dd>
              </div>
            )}
            {workOrder.actualCost !== null && (
              <div>
                <dt className="text-slate-500">{t.ownerPortal.operationalMaintenanceCostLabel}</dt>
                <dd className="text-slate-800 font-medium">{moneyFmt.format(Number(workOrder.actualCost))}</dd>
              </div>
            )}
          </dl>
          {workOrder.actualCost !== null && <p className="text-xs text-slate-400 mt-3">{t.ownerPortal.operationalMaintenanceCostNotice}</p>}
        </section>
      )}

      <section className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
        <h2 className="font-semibold text-slate-800 mb-3">{t.ownerPortal.ownerExpenseLabel}</h2>
        {ownerExpenseAmount !== null ? (
          <p className="text-lg font-bold text-red-700">{moneyFmt.format(Number(ownerExpenseAmount))}</p>
        ) : (
          <p className="text-sm text-slate-400">{t.ownerPortal.ownerExpenseNotice}</p>
        )}
      </section>
    </div>
  );
}
