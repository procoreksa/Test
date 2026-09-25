import Link from "next/link";
import { listViewings } from "@/lib/actions/viewings";
import { listAssignableUsers } from "@/lib/actions/leads";
import { getCompoundOptions } from "@/lib/actions/compounds";
import { getCurrentUserRole } from "@/lib/session";
import { can } from "@/lib/permissions";
import { getLocale, getDictionary, shortDateFormatter, shortTimeFormatter, pickLocalized } from "@/lib/i18n";
import { dateBucketRange, type ViewingDateBucket } from "@/lib/crm/viewing-rules";
import type { ViewingStatus, ViewingOutcome } from "@prisma/client";

function bucketHref(bucket: ViewingDateBucket) {
  const { from, to } = dateBucketRange(bucket, new Date());
  const toInclusive = new Date(to.getTime() - 1);
  const usp = new URLSearchParams({ dateFrom: from.toISOString().slice(0, 10), dateTo: toInclusive.toISOString().slice(0, 10) });
  return `/crm/viewings?${usp.toString()}`;
}

export default async function ViewingsListPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    status?: string;
    outcome?: string;
    assignedToUserId?: string;
    compoundId?: string;
    unitId?: string;
    leadId?: string;
    dateFrom?: string;
    dateTo?: string;
    mine?: string;
    page?: string;
  }>;
}) {
  const params = await searchParams;
  const [role, locale, agents, compounds] = await Promise.all([
    getCurrentUserRole(),
    getLocale(),
    listAssignableUsers().catch(() => []),
    getCompoundOptions(),
  ]);
  const t = getDictionary(locale);
  const dateFmt = shortDateFormatter(locale);
  const timeFmt = shortTimeFormatter(locale);
  const canCreate = can("viewing.create", role);

  const filters = {
    search: params.q || undefined,
    status: params.status || undefined,
    outcome: params.outcome || undefined,
    assignedToUserId: params.assignedToUserId || undefined,
    compoundId: params.compoundId || undefined,
    unitId: params.unitId || undefined,
    leadId: params.leadId || undefined,
    dateFrom: params.dateFrom ? new Date(params.dateFrom) : undefined,
    dateTo: params.dateTo ? new Date(`${params.dateTo}T23:59:59`) : undefined,
    mine: params.mine === "on",
    page: params.page ? Number(params.page) : 1,
  };

  const { rows, page, totalPages } = await listViewings(filters);

  function pageHref(nextPage: number) {
    const usp = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (key !== "page" && value) usp.set(key, value);
    }
    usp.set("page", String(nextPage));
    return `/crm/viewings?${usp.toString()}`;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{t.viewing.listTitle}</h1>
          <p className="text-slate-500 text-sm mt-1">{t.viewing.listSubtitle}</p>
        </div>
        {canCreate && (
          <Link href="/crm/viewings/new" className="bg-brand-gold hover:bg-brand-gold-dark text-brand-black rounded-lg px-5 py-2.5 font-semibold text-sm">
            + {t.viewing.newTitle}
          </Link>
        )}
      </div>

      <form method="get" className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="md:col-span-2">
          <label className="block text-sm font-medium text-slate-700 mb-1">{t.crm.searchLabel}</label>
          <input name="q" defaultValue={params.q} placeholder={t.viewing.searchPlaceholder} className="w-full rounded-lg border border-slate-300 px-3 py-2" />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">{t.viewing.filterStatus}</label>
          <select name="status" defaultValue={params.status ?? ""} className="w-full rounded-lg border border-slate-300 px-3 py-2">
            <option value="">{t.viewing.filterAll}</option>
            {(Object.keys(t.viewingStatus) as ViewingStatus[]).map((v) => (
              <option key={v} value={v}>
                {t.viewingStatus[v]}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">{t.viewing.filterOutcome}</label>
          <select name="outcome" defaultValue={params.outcome ?? ""} className="w-full rounded-lg border border-slate-300 px-3 py-2">
            <option value="">{t.viewing.filterAll}</option>
            {(Object.keys(t.viewingOutcome) as ViewingOutcome[]).map((v) => (
              <option key={v} value={v}>
                {t.viewingOutcome[v]}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">{t.viewing.filterAgent}</label>
          <select name="assignedToUserId" defaultValue={params.assignedToUserId ?? ""} className="w-full rounded-lg border border-slate-300 px-3 py-2">
            <option value="">{t.viewing.filterAll}</option>
            {agents.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">{t.viewing.filterCompound}</label>
          <select name="compoundId" defaultValue={params.compoundId ?? ""} className="w-full rounded-lg border border-slate-300 px-3 py-2">
            <option value="">{t.viewing.filterAll}</option>
            {compounds.map((c) => (
              <option key={c.id} value={c.id}>
                {pickLocalized(locale, c.arabicName, c.name)}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">{t.viewing.filterDateFrom}</label>
          <input type="date" name="dateFrom" defaultValue={params.dateFrom} className="w-full rounded-lg border border-slate-300 px-3 py-2" />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">{t.viewing.filterDateTo}</label>
          <input type="date" name="dateTo" defaultValue={params.dateTo} className="w-full rounded-lg border border-slate-300 px-3 py-2" />
        </div>
        <label className="flex items-center gap-2 mt-6 text-sm text-slate-600">
          <input type="checkbox" name="mine" defaultChecked={params.mine === "on"} className="rounded border-slate-300" />
          {t.viewing.filterMine}
        </label>
        <div className="md:col-span-4 flex flex-wrap items-center gap-4">
          <Link href={bucketHref("today")} className="text-xs text-brand-gold-dark hover:underline">
            {t.viewing.filterToday}
          </Link>
          <Link href={bucketHref("tomorrow")} className="text-xs text-brand-gold-dark hover:underline">
            {t.viewing.filterTomorrow}
          </Link>
          <Link href={bucketHref("thisWeek")} className="text-xs text-brand-gold-dark hover:underline">
            {t.viewing.filterThisWeek}
          </Link>
          <button className="bg-brand-gold hover:bg-brand-gold-dark text-brand-black rounded-lg px-5 py-2.5 font-semibold">{t.viewing.filterApply}</button>
        </div>
      </form>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-500 text-right">
            <tr>
              <th className="px-4 py-3 font-medium">{t.viewing.colViewingNumber}</th>
              <th className="px-4 py-3 font-medium">{t.viewing.colLead}</th>
              <th className="px-4 py-3 font-medium">{t.viewing.colCompound}</th>
              <th className="px-4 py-3 font-medium">{t.viewing.colUnits}</th>
              <th className="px-4 py-3 font-medium">{t.viewing.colDate}</th>
              <th className="px-4 py-3 font-medium">{t.viewing.colTime}</th>
              <th className="px-4 py-3 font-medium">{t.viewing.colAgent}</th>
              <th className="px-4 py-3 font-medium">{t.viewing.colStatus}</th>
              <th className="px-4 py-3 font-medium">{t.viewing.colOutcome}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((v) => {
              const compound = v.units[0]?.unit.floor.building.compound;
              return (
                <tr key={v.id}>
                  <td className="px-4 py-3 font-medium text-slate-800">
                    <Link href={`/crm/viewings/${v.id}`} className="hover:underline">
                      {v.viewingNumber}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-slate-700">{v.lead.fullName}</td>
                  <td className="px-4 py-3 text-slate-500">{compound ? pickLocalized(locale, compound.arabicName, compound.name) : "—"}</td>
                  <td className="px-4 py-3 text-slate-500">{v.units.map((u) => u.unit.unitNumber).join(", ")}</td>
                  <td className="px-4 py-3 text-slate-500 whitespace-nowrap">{dateFmt.format(v.scheduledStart)}</td>
                  <td className="px-4 py-3 text-slate-500 whitespace-nowrap">
                    {timeFmt.format(v.scheduledStart)} - {timeFmt.format(v.scheduledEnd)}
                  </td>
                  <td className="px-4 py-3 text-slate-500">{v.assignedToUser?.name ?? "—"}</td>
                  <td className="px-4 py-3">
                    <StatusBadge status={v.status} label={t.viewingStatus[v.status]} />
                  </td>
                  <td className="px-4 py-3 text-slate-500">{v.outcome ? t.viewingOutcome[v.outcome] : "—"}</td>
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr>
                <td colSpan={9} className="px-5 py-8 text-center text-slate-400">
                  {t.viewing.empty}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between">
        <span className="text-sm text-slate-500">{t.viewing.pageOf(page, totalPages)}</span>
        <div className="flex gap-2">
          {page > 1 && (
            <Link href={pageHref(page - 1)} className="text-sm text-brand-gold-dark hover:underline">
              {t.viewing.previous}
            </Link>
          )}
          {page < totalPages && (
            <Link href={pageHref(page + 1)} className="text-sm text-brand-gold-dark hover:underline">
              {t.viewing.next}
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
      : status === "CANCELLED" || status === "NO_SHOW"
        ? "bg-red-100 text-red-700"
        : status === "CONFIRMED"
          ? "bg-brand-gold/20 text-brand-gold-dark"
          : "bg-slate-100 text-slate-600";
  return <span className={`px-2 py-1 rounded-full text-xs font-medium ${toneClass}`}>{label}</span>;
}
