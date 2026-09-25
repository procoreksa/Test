import Link from "next/link";
import { listMoveOuts } from "@/lib/actions/move-outs";
import { getCompoundOptions } from "@/lib/actions/compounds";
import { getCurrentUserRole } from "@/lib/session";
import { can } from "@/lib/permissions";
import { getLocale, getDictionary, shortDateFormatter, pickLocalized } from "@/lib/i18n";
import { unitLocationLabel } from "@/lib/unit-location";
import type { MoveOutStatus } from "@prisma/client";

export default async function MoveOutsListPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    status?: string;
    compoundId?: string;
    hasFindings?: string;
    hasMaintenanceRequests?: string;
    completedOnly?: string;
    cancelledOnly?: string;
    overdueOnly?: string;
    page?: string;
  }>;
}) {
  const params = await searchParams;
  const [role, locale, compounds] = await Promise.all([getCurrentUserRole(), getLocale(), getCompoundOptions()]);
  const t = getDictionary(locale);
  const dateFmt = shortDateFormatter(locale);
  const canCreate = can("moveOut.create", role);

  const filters = {
    search: params.q || undefined,
    status: params.status || undefined,
    compoundId: params.compoundId || undefined,
    hasFindings: params.hasFindings === "on",
    hasMaintenanceRequests: params.hasMaintenanceRequests === "on",
    completedOnly: params.completedOnly === "on",
    cancelledOnly: params.cancelledOnly === "on",
    overdueOnly: params.overdueOnly === "on",
    page: params.page ? Number(params.page) : 1,
  };

  const { rows, page, totalPages } = await listMoveOuts(filters);

  function pageHref(nextPage: number) {
    const usp = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (key !== "page" && value) usp.set(key, value);
    }
    usp.set("page", String(nextPage));
    return `/operations/move-outs?${usp.toString()}`;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{t.moveOut.listTitle}</h1>
          <p className="text-slate-500 text-sm mt-1">{t.moveOut.listSubtitle}</p>
        </div>
        <div className="flex items-center gap-3">
          <Link href="/operations/move-outs/reports" className="text-sm text-brand-gold-dark hover:underline font-medium">
            {t.operations.reportsTitle} →
          </Link>
          {canCreate && (
            <Link href="/operations/move-outs/new" className="bg-brand-gold hover:bg-brand-gold-dark text-brand-black rounded-lg px-5 py-2.5 font-semibold text-sm">
              + {t.moveOut.newTitle}
            </Link>
          )}
        </div>
      </div>

      <form method="get" className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="md:col-span-2">
          <label className="block text-sm font-medium text-slate-700 mb-1">{t.moveOut.searchPlaceholder}</label>
          <input name="q" defaultValue={params.q} placeholder={t.moveOut.searchPlaceholder} className="w-full rounded-lg border border-slate-300 px-3 py-2" />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">{t.moveOut.filterStatus}</label>
          <select name="status" defaultValue={params.status ?? ""} className="w-full rounded-lg border border-slate-300 px-3 py-2">
            <option value="">{t.moveOut.filterAll}</option>
            {(Object.keys(t.moveOutStatus) as MoveOutStatus[]).map((v) => (
              <option key={v} value={v}>
                {t.moveOutStatus[v]}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">{t.moveOut.filterCompound}</label>
          <select name="compoundId" defaultValue={params.compoundId ?? ""} className="w-full rounded-lg border border-slate-300 px-3 py-2">
            <option value="">{t.moveOut.filterAll}</option>
            {compounds.map((c) => (
              <option key={c.id} value={c.id}>
                {pickLocalized(locale, c.arabicName, c.name)}
              </option>
            ))}
          </select>
        </div>
        <div className="md:col-span-4 flex flex-wrap items-center gap-4">
          <label className="flex items-center gap-2 text-sm text-slate-600">
            <input type="checkbox" name="hasFindings" defaultChecked={params.hasFindings === "on"} className="rounded border-slate-300" />
            {t.moveOut.filterHasFindings}
          </label>
          <label className="flex items-center gap-2 text-sm text-slate-600">
            <input type="checkbox" name="hasMaintenanceRequests" defaultChecked={params.hasMaintenanceRequests === "on"} className="rounded border-slate-300" />
            {t.moveOut.filterHasMaintenance}
          </label>
          <label className="flex items-center gap-2 text-sm text-slate-600">
            <input type="checkbox" name="completedOnly" defaultChecked={params.completedOnly === "on"} className="rounded border-slate-300" />
            {t.moveOut.filterCompletedOnly}
          </label>
          <label className="flex items-center gap-2 text-sm text-slate-600">
            <input type="checkbox" name="cancelledOnly" defaultChecked={params.cancelledOnly === "on"} className="rounded border-slate-300" />
            {t.moveOut.filterCancelledOnly}
          </label>
          <label className="flex items-center gap-2 text-sm text-slate-600">
            <input type="checkbox" name="overdueOnly" defaultChecked={params.overdueOnly === "on"} className="rounded border-slate-300" />
            {t.moveOut.filterOverdueOnly}
          </label>
          <button className="bg-brand-gold hover:bg-brand-gold-dark text-brand-black rounded-lg px-5 py-2.5 font-semibold">{t.moveOut.filterApply}</button>
        </div>
      </form>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-500 text-right">
            <tr>
              <th className="px-4 py-3 font-medium">{t.moveOut.colMoveOutNumber}</th>
              <th className="px-4 py-3 font-medium">{t.moveOut.colUnit}</th>
              <th className="px-4 py-3 font-medium">{t.moveOut.colRenter}</th>
              <th className="px-4 py-3 font-medium">{t.moveOut.colContract}</th>
              <th className="px-4 py-3 font-medium">{t.moveOut.colCompound}</th>
              <th className="px-4 py-3 font-medium">{t.moveOut.colScheduled}</th>
              <th className="px-4 py-3 font-medium">{t.moveOut.colVacate}</th>
              <th className="px-4 py-3 font-medium">{t.moveOut.colStatus}</th>
              <th className="px-4 py-3 font-medium">{t.moveOut.colProgress}</th>
              <th className="px-4 py-3 font-medium">{t.moveOut.colFindings}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((m) => (
              <tr key={m.id}>
                <td className="px-4 py-3 font-medium text-slate-800 whitespace-nowrap">
                  <Link href={`/operations/move-outs/${m.id}`} className="hover:underline">
                    {m.moveOutNumber}
                  </Link>
                  {m.overdue && <span className="ms-2 px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-red-100 text-red-700">{t.moveOut.filterOverdueOnly}</span>}
                </td>
                <td className="px-4 py-3 text-slate-500">{m.unit.unitNumber}</td>
                <td className="px-4 py-3 text-slate-700">{pickLocalized(locale, m.renter.fullNameAr, m.renter.fullName)}</td>
                <td className="px-4 py-3 text-slate-500">{m.contract.contractNumber}</td>
                <td className="px-4 py-3 text-slate-500">{unitLocationLabel(locale, m.unit)}</td>
                <td className="px-4 py-3 text-slate-500 whitespace-nowrap">{m.scheduledAt ? dateFmt.format(m.scheduledAt) : "—"}</td>
                <td className="px-4 py-3 text-slate-500 whitespace-nowrap">{m.vacateDate ? dateFmt.format(m.vacateDate) : "—"}</td>
                <td className="px-4 py-3">
                  <StatusBadge status={m.status} label={t.moveOutStatus[m.status]} />
                </td>
                <td className="px-4 py-3 text-slate-500 whitespace-nowrap">{t.moveOut.progressLabel(m.progress.completed, m.progress.total, m.progress.percent)}</td>
                <td className="px-4 py-3 text-slate-500 whitespace-nowrap">
                  {m.defects.requiresAttentionCount > 0 || m.defects.damagedCount > 0 || m.defects.notWorkingCount > 0 || m.defects.poorCount > 0 ? (
                    <span className="px-1.5 py-0.5 rounded-full text-[11px] font-medium bg-amber-100 text-amber-700">{m.defects.requiresAttentionCount}</span>
                  ) : (
                    "—"
                  )}
                  {m._count.maintenanceRequests > 0 && <span className="ms-1 px-1.5 py-0.5 rounded-full text-[11px] font-medium bg-sky-100 text-sky-700">🛠️ {m._count.maintenanceRequests}</span>}
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={10} className="px-5 py-8 text-center text-slate-400">
                  {t.moveOut.empty}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between">
        <span className="text-sm text-slate-500">{t.moveOut.pageOf(page, totalPages)}</span>
        <div className="flex gap-2">
          {page > 1 && (
            <Link href={pageHref(page - 1)} className="text-sm text-brand-gold-dark hover:underline">
              {t.moveOut.previous}
            </Link>
          )}
          {page < totalPages && (
            <Link href={pageHref(page + 1)} className="text-sm text-brand-gold-dark hover:underline">
              {t.moveOut.next}
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}

function StatusBadge({ status, label }: { status: string; label: string }) {
  const toneClass =
    status === "COMPLETED"
      ? "bg-emerald-100 text-emerald-700"
      : status === "CANCELLED"
        ? "bg-red-100 text-red-700"
        : status === "READY_FOR_CLOSURE"
          ? "bg-brand-gold/20 text-brand-gold-dark"
          : status === "PENDING_FINDINGS_REVIEW"
            ? "bg-amber-100 text-amber-700"
            : status === "IN_PROGRESS"
              ? "bg-sky-100 text-sky-700"
              : "bg-slate-100 text-slate-600";
  return <span className={`px-2 py-1 rounded-full text-xs font-medium whitespace-nowrap ${toneClass}`}>{label}</span>;
}
