import Link from "next/link";
import { listMaintenanceWorkOrders } from "@/lib/actions/maintenance";
import { getLocale, getDictionary, shortDateFormatter, currencyFormatter } from "@/lib/i18n";
import { StatusBadge, PriorityBadge } from "../requests/page";
import type { MaintenanceWorkOrderStatus, MaintenancePriority } from "@prisma/client";

export default async function MaintenanceWorkOrdersListPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string; priority?: string; overdueOnly?: string; page?: string }>;
}) {
  const params = await searchParams;
  const [locale] = await Promise.all([getLocale()]);
  const t = getDictionary(locale);
  const dateFmt = shortDateFormatter(locale);
  const moneyFmt = currencyFormatter(locale);

  const filters = {
    search: params.q || undefined,
    status: params.status || undefined,
    priority: params.priority || undefined,
    overdueOnly: params.overdueOnly === "on",
    page: params.page ? Number(params.page) : 1,
  };

  const { rows, page, totalPages } = await listMaintenanceWorkOrders(filters);

  function pageHref(nextPage: number) {
    const usp = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (key !== "page" && value) usp.set(key, value);
    }
    usp.set("page", String(nextPage));
    return `/operations/maintenance/work-orders?${usp.toString()}`;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">{t.maintenance.workOrdersListTitle}</h1>
        <p className="text-slate-500 text-sm mt-1">{t.maintenance.workOrdersListSubtitle}</p>
      </div>

      <form method="get" className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="md:col-span-2">
          <input name="q" defaultValue={params.q} placeholder={t.maintenance.requestSearchPlaceholder} className="w-full rounded-lg border border-slate-300 px-3 py-2" />
        </div>
        <div>
          <select name="status" defaultValue={params.status ?? ""} className="w-full rounded-lg border border-slate-300 px-3 py-2">
            <option value="">{t.maintenance.filterAll}</option>
            {(Object.keys(t.maintenanceWorkOrderStatus) as MaintenanceWorkOrderStatus[]).map((v) => (
              <option key={v} value={v}>
                {t.maintenanceWorkOrderStatus[v]}
              </option>
            ))}
          </select>
        </div>
        <div>
          <select name="priority" defaultValue={params.priority ?? ""} className="w-full rounded-lg border border-slate-300 px-3 py-2">
            <option value="">{t.maintenance.filterAll}</option>
            {(Object.keys(t.maintenancePriority) as MaintenancePriority[]).map((v) => (
              <option key={v} value={v}>
                {t.maintenancePriority[v]}
              </option>
            ))}
          </select>
        </div>
        <div className="md:col-span-4 flex items-center gap-4">
          <label className="flex items-center gap-2 text-sm text-slate-600">
            <input type="checkbox" name="overdueOnly" defaultChecked={params.overdueOnly === "on"} className="rounded border-slate-300" />
            {t.maintenance.filterSlaBreached}
          </label>
          <button className="bg-brand-gold hover:bg-brand-gold-dark text-brand-black rounded-lg px-5 py-2.5 font-semibold">{t.maintenance.filterApply}</button>
        </div>
      </form>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-500 text-right">
            <tr>
              <th className="px-4 py-3 font-medium">{t.maintenance.colWorkOrderNumber}</th>
              <th className="px-4 py-3 font-medium">{t.maintenance.colRequest}</th>
              <th className="px-4 py-3 font-medium">{t.maintenance.colPriority}</th>
              <th className="px-4 py-3 font-medium">{t.maintenance.colStatus}</th>
              <th className="px-4 py-3 font-medium">{t.maintenance.colResponsibleParty}</th>
              <th className="px-4 py-3 font-medium">{t.maintenance.colScheduled}</th>
              <th className="px-4 py-3 font-medium">{t.maintenance.colStarted}</th>
              <th className="px-4 py-3 font-medium">{t.maintenance.colActualCost}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((w) => (
              <tr key={w.id}>
                <td className="px-4 py-3 font-medium text-slate-800 whitespace-nowrap">
                  <Link href={`/operations/maintenance/work-orders/${w.id}`} className="hover:underline">
                    {w.workOrderNumber}
                  </Link>
                  {w.overdue && <span className="ms-2 px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-red-100 text-red-700">{t.maintenance.filterSlaBreached}</span>}
                </td>
                <td className="px-4 py-3 text-slate-500">{w.request.requestNumber}</td>
                <td className="px-4 py-3">
                  <PriorityBadge priority={w.priority} label={t.maintenancePriority[w.priority]} />
                </td>
                <td className="px-4 py-3">
                  <StatusBadge status={w.status} label={t.maintenanceWorkOrderStatus[w.status]} />
                </td>
                <td className="px-4 py-3 text-slate-500">{w.assignedToUser?.name ?? w.vendor?.name ?? "—"}</td>
                <td className="px-4 py-3 text-slate-500 whitespace-nowrap">{w.scheduledStart ? dateFmt.format(w.scheduledStart) : "—"}</td>
                <td className="px-4 py-3 text-slate-500 whitespace-nowrap">{w.startedAt ? dateFmt.format(w.startedAt) : "—"}</td>
                <td className="px-4 py-3 text-slate-500 whitespace-nowrap">{w.actualCost ? moneyFmt.format(Number(w.actualCost)) : "—"}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={8} className="px-5 py-8 text-center text-slate-400">
                  {t.maintenance.empty}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between">
        <span className="text-sm text-slate-500">{t.maintenance.pageOf(page, totalPages)}</span>
        <div className="flex gap-2">
          {page > 1 && (
            <Link href={pageHref(page - 1)} className="text-sm text-brand-gold-dark hover:underline">
              {t.maintenance.previous}
            </Link>
          )}
          {page < totalPages && (
            <Link href={pageHref(page + 1)} className="text-sm text-brand-gold-dark hover:underline">
              {t.maintenance.next}
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
