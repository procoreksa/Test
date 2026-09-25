import Link from "next/link";
import { listMaintenanceRequests } from "@/lib/actions/maintenance";
import { getCompoundOptions } from "@/lib/actions/compounds";
import { getCurrentUserRole } from "@/lib/session";
import { can } from "@/lib/permissions";
import { getLocale, getDictionary, shortDateFormatter, pickLocalized } from "@/lib/i18n";
import type { MaintenanceRequestStatus, MaintenancePriority, MaintenanceCategory } from "@prisma/client";

export default async function MaintenanceRequestsListPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string; priority?: string; category?: string; compoundId?: string; slaBreachedOnly?: string; openOnly?: string; emergencyOnly?: string; page?: string }>;
}) {
  const params = await searchParams;
  const [role, locale, compounds] = await Promise.all([getCurrentUserRole(), getLocale(), getCompoundOptions()]);
  const t = getDictionary(locale);
  const dateFmt = shortDateFormatter(locale);
  const canCreate = can("maintenance.request.create", role);

  const filters = {
    search: params.q || undefined,
    status: params.status || undefined,
    priority: params.priority || undefined,
    category: params.category || undefined,
    compoundId: params.compoundId || undefined,
    slaBreachedOnly: params.slaBreachedOnly === "on",
    openOnly: params.openOnly === "on",
    emergencyOnly: params.emergencyOnly === "on",
    page: params.page ? Number(params.page) : 1,
  };

  const { rows, page, totalPages } = await listMaintenanceRequests(filters);

  function pageHref(nextPage: number) {
    const usp = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (key !== "page" && value) usp.set(key, value);
    }
    usp.set("page", String(nextPage));
    return `/operations/maintenance/requests?${usp.toString()}`;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{t.maintenance.requestsListTitle}</h1>
          <p className="text-slate-500 text-sm mt-1">{t.maintenance.requestsListSubtitle}</p>
        </div>
        {canCreate && (
          <Link href="/operations/maintenance/requests/new" className="bg-brand-gold hover:bg-brand-gold-dark text-brand-black rounded-lg px-5 py-2.5 font-semibold text-sm">
            + {t.maintenance.newRequestTitle}
          </Link>
        )}
      </div>

      <form method="get" className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="md:col-span-2">
          <label className="block text-sm font-medium text-slate-700 mb-1">{t.maintenance.requestSearchPlaceholder}</label>
          <input name="q" defaultValue={params.q} placeholder={t.maintenance.requestSearchPlaceholder} className="w-full rounded-lg border border-slate-300 px-3 py-2" />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">{t.maintenance.filterStatus}</label>
          <select name="status" defaultValue={params.status ?? ""} className="w-full rounded-lg border border-slate-300 px-3 py-2">
            <option value="">{t.maintenance.filterAll}</option>
            {(Object.keys(t.maintenanceRequestStatus) as MaintenanceRequestStatus[]).map((v) => (
              <option key={v} value={v}>
                {t.maintenanceRequestStatus[v]}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">{t.maintenance.filterPriority}</label>
          <select name="priority" defaultValue={params.priority ?? ""} className="w-full rounded-lg border border-slate-300 px-3 py-2">
            <option value="">{t.maintenance.filterAll}</option>
            {(Object.keys(t.maintenancePriority) as MaintenancePriority[]).map((v) => (
              <option key={v} value={v}>
                {t.maintenancePriority[v]}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">{t.maintenance.filterCategory}</label>
          <select name="category" defaultValue={params.category ?? ""} className="w-full rounded-lg border border-slate-300 px-3 py-2">
            <option value="">{t.maintenance.filterAll}</option>
            {(Object.keys(t.maintenanceCategory) as MaintenanceCategory[]).map((v) => (
              <option key={v} value={v}>
                {t.maintenanceCategory[v]}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">{t.maintenance.filterCompound}</label>
          <select name="compoundId" defaultValue={params.compoundId ?? ""} className="w-full rounded-lg border border-slate-300 px-3 py-2">
            <option value="">{t.maintenance.filterAll}</option>
            {compounds.map((c) => (
              <option key={c.id} value={c.id}>
                {pickLocalized(locale, c.arabicName, c.name)}
              </option>
            ))}
          </select>
        </div>
        <div className="md:col-span-4 flex flex-wrap items-center gap-4">
          <label className="flex items-center gap-2 text-sm text-slate-600">
            <input type="checkbox" name="openOnly" defaultChecked={params.openOnly === "on"} className="rounded border-slate-300" />
            {t.maintenance.filterOpenOnly}
          </label>
          <label className="flex items-center gap-2 text-sm text-slate-600">
            <input type="checkbox" name="emergencyOnly" defaultChecked={params.emergencyOnly === "on"} className="rounded border-slate-300" />
            {t.maintenance.filterEmergencyOnly}
          </label>
          <label className="flex items-center gap-2 text-sm text-slate-600">
            <input type="checkbox" name="slaBreachedOnly" defaultChecked={params.slaBreachedOnly === "on"} className="rounded border-slate-300" />
            {t.maintenance.filterSlaBreached}
          </label>
          <button className="bg-brand-gold hover:bg-brand-gold-dark text-brand-black rounded-lg px-5 py-2.5 font-semibold">{t.maintenance.filterApply}</button>
        </div>
      </form>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-500 text-right">
            <tr>
              <th className="px-4 py-3 font-medium">{t.maintenance.colRequestNumber}</th>
              <th className="px-4 py-3 font-medium">{t.maintenance.colTitle}</th>
              <th className="px-4 py-3 font-medium">{t.maintenance.colLocation}</th>
              <th className="px-4 py-3 font-medium">{t.maintenance.colCategory}</th>
              <th className="px-4 py-3 font-medium">{t.maintenance.colPriority}</th>
              <th className="px-4 py-3 font-medium">{t.maintenance.colStatus}</th>
              <th className="px-4 py-3 font-medium">{t.maintenance.colReportedAt}</th>
              <th className="px-4 py-3 font-medium">{t.maintenance.colSla}</th>
              <th className="px-4 py-3 font-medium">{t.maintenance.colAssigned}</th>
              <th className="px-4 py-3 font-medium">{t.maintenance.colWorkOrder}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((r) => (
              <tr key={r.id}>
                <td className="px-4 py-3 font-medium text-slate-800 whitespace-nowrap">
                  <Link href={`/operations/maintenance/requests/${r.id}`} className="hover:underline">
                    {r.requestNumber}
                  </Link>
                </td>
                <td className="px-4 py-3 text-slate-700">{r.title}</td>
                <td className="px-4 py-3 text-slate-500 whitespace-nowrap">
                  {r.unit ? r.unit.unitNumber : r.building ? pickLocalized(locale, r.building.nameAr, r.building.name) : r.compound ? pickLocalized(locale, r.compound.arabicName, r.compound.name) : "—"}
                </td>
                <td className="px-4 py-3 text-slate-500">{t.maintenanceCategory[r.category]}</td>
                <td className="px-4 py-3">
                  <PriorityBadge priority={r.priority} label={t.maintenancePriority[r.priority]} />
                </td>
                <td className="px-4 py-3">
                  <StatusBadge status={r.status} label={t.maintenanceRequestStatus[r.status]} />
                </td>
                <td className="px-4 py-3 text-slate-500 whitespace-nowrap">{dateFmt.format(r.reportedAt)}</td>
                <td className="px-4 py-3">
                  <SlaBadge status={r.slaOverallStatus} label={t.maintenanceSlaStatus[r.slaOverallStatus]} />
                </td>
                <td className="px-4 py-3 text-slate-500">{r.assignedToUser?.name ?? "—"}</td>
                <td className="px-4 py-3 text-slate-500 whitespace-nowrap">{r.workOrders[0]?.workOrderNumber ?? "—"}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={10} className="px-5 py-8 text-center text-slate-400">
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

export function PriorityBadge({ priority, label }: { priority: string; label: string }) {
  const toneClass =
    priority === "EMERGENCY"
      ? "bg-red-100 text-red-700"
      : priority === "URGENT"
        ? "bg-orange-100 text-orange-700"
        : priority === "HIGH"
          ? "bg-amber-100 text-amber-700"
          : priority === "NORMAL"
            ? "bg-sky-100 text-sky-700"
            : "bg-slate-100 text-slate-600";
  return <span className={`px-2 py-1 rounded-full text-xs font-medium whitespace-nowrap ${toneClass}`}>{label}</span>;
}

export function StatusBadge({ status, label }: { status: string; label: string }) {
  const toneClass =
    status === "RESOLVED" || status === "CLOSED" || status === "VERIFIED"
      ? "bg-emerald-100 text-emerald-700"
      : status === "CANCELLED"
        ? "bg-red-100 text-red-700"
        : status === "ON_HOLD"
          ? "bg-amber-100 text-amber-700"
          : status === "IN_PROGRESS" || status === "COMPLETED"
            ? "bg-sky-100 text-sky-700"
            : "bg-slate-100 text-slate-600";
  return <span className={`px-2 py-1 rounded-full text-xs font-medium whitespace-nowrap ${toneClass}`}>{label}</span>;
}

export function SlaBadge({ status, label }: { status: string; label: string }) {
  const toneClass =
    status === "BREACHED" ? "bg-red-100 text-red-700" : status === "AT_RISK" ? "bg-amber-100 text-amber-700" : status === "MET" ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-600";
  return <span className={`px-2 py-1 rounded-full text-xs font-medium whitespace-nowrap ${toneClass}`}>{label}</span>;
}
