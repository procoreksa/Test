import Link from "next/link";
import { getTenantMaintenanceRequestDetail, cancelTenantMaintenanceRequest } from "@/lib/actions/portal/maintenance";
import { getLocale, getDictionary, longDateFormatter } from "@/lib/i18n";

export default async function TenantMaintenanceDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [{ request, cancellable }, locale] = await Promise.all([getTenantMaintenanceRequestDetail(id), getLocale()]);
  const t = getDictionary(locale);
  const dateFmt = longDateFormatter(locale);

  return (
    <div className="space-y-6">
      <div>
        <Link href="/portal/maintenance" className="text-brand-gold-dark hover:underline text-sm">
          ← {t.tenantPortal.maintenanceTitle}
        </Link>
        <h1 className="text-2xl font-bold text-slate-900 mt-2">{request.requestNumber}</h1>
      </div>

      <section className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
        <dl className="grid grid-cols-2 gap-y-2 text-sm">
          <dt className="text-slate-500">{t.tenantPortal.colStatus}</dt>
          <dd className="text-slate-800 font-medium">{t.maintenanceRequestStatus[request.status]}</dd>
          <dt className="text-slate-500">{t.tenantPortal.fieldCategory}</dt>
          <dd className="text-slate-800 font-medium">{t.maintenanceCategory[request.category]}</dd>
          <dt className="text-slate-500">{t.tenantPortal.fieldPriority}</dt>
          <dd className="text-slate-800 font-medium">{t.maintenancePriority[request.priority]}</dd>
          <dt className="text-slate-500">{t.tenantPortal.colReported}</dt>
          <dd className="text-slate-800 font-medium">{dateFmt.format(request.reportedAt)}</dd>
          {request.preferredVisitDate && (
            <>
              <dt className="text-slate-500">{t.tenantPortal.fieldPreferredVisitDate}</dt>
              <dd className="text-slate-800 font-medium">{dateFmt.format(request.preferredVisitDate)}</dd>
            </>
          )}
        </dl>
        {request.description && <p className="text-sm text-slate-600 mt-4 border-t border-slate-100 pt-4">{request.description}</p>}

        {cancellable && (
          <details className="mt-4">
            <summary className="cursor-pointer list-none inline-block bg-red-50 hover:bg-red-100 text-red-700 rounded-lg px-4 py-2 text-sm font-semibold">{t.tenantPortal.cancelRequestButton}</summary>
            <form action={cancelTenantMaintenanceRequest} className="mt-3">
              <input type="hidden" name="requestId" value={request.id} />
              <button className="bg-red-600 hover:bg-red-700 text-white rounded-lg px-4 py-2 text-sm font-semibold">{t.tenantPortal.confirmCancelMaintenanceButton}</button>
            </form>
          </details>
        )}
      </section>

      {request.workOrders.length > 0 && (
        <section className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
          <h2 className="font-semibold text-slate-800 mb-3">{t.tenantPortal.workStatusLabel}</h2>
          <ul className="text-sm space-y-2">
            {request.workOrders.map((wo) => (
              <li key={wo.id} className="border-b border-slate-100 last:border-b-0 pb-2 last:pb-0">
                <p className="font-medium text-slate-700">
                  {wo.workOrderNumber} — {t.maintenanceWorkOrderStatus[wo.status]}
                </p>
                {wo.scheduledStart && (
                  <p className="text-xs text-slate-500 mt-1">
                    {t.tenantPortal.scheduledVisitLabel}: {dateFmt.format(wo.scheduledStart)}
                  </p>
                )}
                {wo.completionNotes && <p className="text-xs text-slate-600 mt-1">{wo.completionNotes}</p>}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
