import Link from "next/link";
import { listMoveIns } from "@/lib/actions/move-ins";
import { getCompoundOptions } from "@/lib/actions/compounds";
import { getCurrentUserRole } from "@/lib/session";
import { can } from "@/lib/permissions";
import { getLocale, getDictionary, shortDateFormatter, pickLocalized } from "@/lib/i18n";
import { unitLocationLabel } from "@/lib/unit-location";
import type { MoveInStatus } from "@prisma/client";

export default async function MoveInsListPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    status?: string;
    compoundId?: string;
    todayOnly?: string;
    upcomingOnly?: string;
    completedOnly?: string;
    overdueOnly?: string;
    page?: string;
  }>;
}) {
  const params = await searchParams;
  const [role, locale, compounds] = await Promise.all([getCurrentUserRole(), getLocale(), getCompoundOptions()]);
  const t = getDictionary(locale);
  const dateFmt = shortDateFormatter(locale);
  const canCreate = can("moveIn.create", role);

  const filters = {
    search: params.q || undefined,
    status: params.status || undefined,
    compoundId: params.compoundId || undefined,
    todayOnly: params.todayOnly === "on",
    upcomingOnly: params.upcomingOnly === "on",
    completedOnly: params.completedOnly === "on",
    overdueOnly: params.overdueOnly === "on",
    page: params.page ? Number(params.page) : 1,
  };

  const { rows, page, totalPages } = await listMoveIns(filters);

  function pageHref(nextPage: number) {
    const usp = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (key !== "page" && value) usp.set(key, value);
    }
    usp.set("page", String(nextPage));
    return `/operations/move-ins?${usp.toString()}`;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{t.moveIn.listTitle}</h1>
          <p className="text-slate-500 text-sm mt-1">{t.moveIn.listSubtitle}</p>
        </div>
        {canCreate && (
          <Link href="/operations/move-ins/new" className="bg-brand-gold hover:bg-brand-gold-dark text-brand-black rounded-lg px-5 py-2.5 font-semibold text-sm">
            + {t.moveIn.newTitle}
          </Link>
        )}
      </div>

      <form method="get" className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="md:col-span-2">
          <label className="block text-sm font-medium text-slate-700 mb-1">{t.moveIn.searchPlaceholder}</label>
          <input name="q" defaultValue={params.q} placeholder={t.moveIn.searchPlaceholder} className="w-full rounded-lg border border-slate-300 px-3 py-2" />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">{t.moveIn.filterStatus}</label>
          <select name="status" defaultValue={params.status ?? ""} className="w-full rounded-lg border border-slate-300 px-3 py-2">
            <option value="">{t.moveIn.filterAll}</option>
            {(Object.keys(t.moveInStatus) as MoveInStatus[]).map((v) => (
              <option key={v} value={v}>
                {t.moveInStatus[v]}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">{t.moveIn.filterCompound}</label>
          <select name="compoundId" defaultValue={params.compoundId ?? ""} className="w-full rounded-lg border border-slate-300 px-3 py-2">
            <option value="">{t.moveIn.filterAll}</option>
            {compounds.map((c) => (
              <option key={c.id} value={c.id}>
                {pickLocalized(locale, c.arabicName, c.name)}
              </option>
            ))}
          </select>
        </div>
        <div className="md:col-span-4 flex flex-wrap items-center gap-4">
          <label className="flex items-center gap-2 text-sm text-slate-600">
            <input type="checkbox" name="todayOnly" defaultChecked={params.todayOnly === "on"} className="rounded border-slate-300" />
            {t.moveIn.filterToday}
          </label>
          <label className="flex items-center gap-2 text-sm text-slate-600">
            <input type="checkbox" name="upcomingOnly" defaultChecked={params.upcomingOnly === "on"} className="rounded border-slate-300" />
            {t.moveIn.filterUpcoming}
          </label>
          <label className="flex items-center gap-2 text-sm text-slate-600">
            <input type="checkbox" name="completedOnly" defaultChecked={params.completedOnly === "on"} className="rounded border-slate-300" />
            {t.moveIn.filterCompleted}
          </label>
          <label className="flex items-center gap-2 text-sm text-slate-600">
            <input type="checkbox" name="overdueOnly" defaultChecked={params.overdueOnly === "on"} className="rounded border-slate-300" />
            {t.moveIn.filterOverdue}
          </label>
          <button className="bg-brand-gold hover:bg-brand-gold-dark text-brand-black rounded-lg px-5 py-2.5 font-semibold">{t.moveIn.filterApply}</button>
        </div>
      </form>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-500 text-right">
            <tr>
              <th className="px-4 py-3 font-medium">{t.moveIn.colMoveInNumber}</th>
              <th className="px-4 py-3 font-medium">{t.moveIn.colContract}</th>
              <th className="px-4 py-3 font-medium">{t.moveIn.colUnit}</th>
              <th className="px-4 py-3 font-medium">{t.moveIn.colCompound}</th>
              <th className="px-4 py-3 font-medium">{t.moveIn.colRenter}</th>
              <th className="px-4 py-3 font-medium">{t.moveIn.colStatus}</th>
              <th className="px-4 py-3 font-medium">{t.moveIn.colScheduled}</th>
              <th className="px-4 py-3 font-medium">{t.moveIn.colHandover}</th>
              <th className="px-4 py-3 font-medium">{t.moveIn.colProgress}</th>
              <th className="px-4 py-3 font-medium">{t.moveIn.colInspector}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((m) => (
              <tr key={m.id}>
                <td className="px-4 py-3 font-medium text-slate-800 whitespace-nowrap">
                  <Link href={`/operations/move-ins/${m.id}`} className="hover:underline">
                    {m.moveInNumber}
                  </Link>
                  {m.overdue && <span className="ms-2 px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-red-100 text-red-700">{t.moveIn.filterOverdue}</span>}
                </td>
                <td className="px-4 py-3 text-slate-500">{m.contract.contractNumber}</td>
                <td className="px-4 py-3 text-slate-500">{m.unit.unitNumber}</td>
                <td className="px-4 py-3 text-slate-500">{unitLocationLabel(locale, m.unit)}</td>
                <td className="px-4 py-3 text-slate-700">{pickLocalized(locale, m.renter.fullNameAr, m.renter.fullName)}</td>
                <td className="px-4 py-3">
                  <StatusBadge status={m.status} label={t.moveInStatus[m.status]} />
                </td>
                <td className="px-4 py-3 text-slate-500 whitespace-nowrap">{m.scheduledAt ? dateFmt.format(m.scheduledAt) : "—"}</td>
                <td className="px-4 py-3 text-slate-500 whitespace-nowrap">{m.handoverDate ? dateFmt.format(m.handoverDate) : "—"}</td>
                <td className="px-4 py-3 text-slate-500 whitespace-nowrap">{t.moveIn.progressLabel(m.progress.completed, m.progress.total, m.progress.percent)}</td>
                <td className="px-4 py-3 text-slate-500">{m.inspectedByUser?.name ?? "—"}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={10} className="px-5 py-8 text-center text-slate-400">
                  {t.moveIn.empty}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between">
        <span className="text-sm text-slate-500">{t.moveIn.pageOf(page, totalPages)}</span>
        <div className="flex gap-2">
          {page > 1 && (
            <Link href={pageHref(page - 1)} className="text-sm text-brand-gold-dark hover:underline">
              {t.moveIn.previous}
            </Link>
          )}
          {page < totalPages && (
            <Link href={pageHref(page + 1)} className="text-sm text-brand-gold-dark hover:underline">
              {t.moveIn.next}
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
        : status === "READY_FOR_HANDOVER"
          ? "bg-brand-gold/20 text-brand-gold-dark"
          : status === "IN_PROGRESS"
            ? "bg-sky-100 text-sky-700"
            : "bg-slate-100 text-slate-600";
  return <span className={`px-2 py-1 rounded-full text-xs font-medium whitespace-nowrap ${toneClass}`}>{label}</span>;
}
