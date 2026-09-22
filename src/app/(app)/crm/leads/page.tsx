import Link from "next/link";
import { listLeads } from "@/lib/actions/leads";
import { listAssignableUsers } from "@/lib/actions/leads";
import { getCompoundOptions } from "@/lib/actions/compounds";
import { getCurrentUserRole } from "@/lib/session";
import { can } from "@/lib/permissions";
import { getLocale, getDictionary, currencyFormatter, shortDateFormatter, pickLocalized } from "@/lib/i18n";
import type { LeadStatus, LeadSource, LeadType } from "@prisma/client";

export default async function CrmLeadsPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    status?: string;
    source?: string;
    leadType?: string;
    assignedToUserId?: string;
    preferredCompoundId?: string;
    moveInFrom?: string;
    moveInTo?: string;
    createdFrom?: string;
    createdTo?: string;
    followUp?: string;
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
  const sar = currencyFormatter(locale);
  const dateFmt = shortDateFormatter(locale);
  const canCreate = can("lead.create", role);

  const filters = {
    search: params.q || undefined,
    status: params.status || undefined,
    source: params.source || undefined,
    leadType: params.leadType || undefined,
    assignedToUserId: params.assignedToUserId || undefined,
    preferredCompoundId: params.preferredCompoundId || undefined,
    moveInFrom: params.moveInFrom ? new Date(params.moveInFrom) : undefined,
    moveInTo: params.moveInTo ? new Date(params.moveInTo) : undefined,
    createdFrom: params.createdFrom ? new Date(params.createdFrom) : undefined,
    createdTo: params.createdTo ? new Date(`${params.createdTo}T23:59:59`) : undefined,
    followUp: (params.followUp as "today" | "overdue" | "upcoming" | undefined) || undefined,
    page: params.page ? Number(params.page) : 1,
  };

  const { rows, page, totalPages } = await listLeads(filters);

  function pageHref(nextPage: number) {
    const usp = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (key !== "page" && value) usp.set(key, value);
    }
    usp.set("page", String(nextPage));
    return `/crm/leads?${usp.toString()}`;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{t.crm.leadsTitle}</h1>
          <p className="text-slate-500 text-sm mt-1">{t.crm.leadsSubtitle}</p>
        </div>
        {canCreate && (
          <Link href="/crm/leads/new" className="bg-brand-gold hover:bg-brand-gold-dark text-brand-black rounded-lg px-5 py-2.5 font-semibold text-sm">
            + {t.crm.newLeadTitle}
          </Link>
        )}
      </div>

      <form method="get" className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="md:col-span-2">
          <label className="block text-sm font-medium text-slate-700 mb-1">{t.crm.searchLabel}</label>
          <input name="q" defaultValue={params.q} placeholder={t.crm.searchPlaceholder} className="w-full rounded-lg border border-slate-300 px-3 py-2" />
        </div>
        <Select label={t.crm.filterStatus} name="status" defaultValue={params.status} options={Object.keys(t.leadStatus) as LeadStatus[]} labels={t.leadStatus} allLabel={t.crm.filterAll} />
        <Select label={t.crm.filterSource} name="source" defaultValue={params.source} options={Object.keys(t.leadSource) as LeadSource[]} labels={t.leadSource} allLabel={t.crm.filterAll} />
        <Select label={t.crm.filterLeadType} name="leadType" defaultValue={params.leadType} options={Object.keys(t.leadType) as LeadType[]} labels={t.leadType} allLabel={t.crm.filterAll} />
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">{t.crm.filterAgent}</label>
          <select name="assignedToUserId" defaultValue={params.assignedToUserId ?? ""} className="w-full rounded-lg border border-slate-300 px-3 py-2">
            <option value="">{t.crm.filterAll}</option>
            {agents.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">{t.crm.filterCompound}</label>
          <select name="preferredCompoundId" defaultValue={params.preferredCompoundId ?? ""} className="w-full rounded-lg border border-slate-300 px-3 py-2">
            <option value="">{t.crm.filterAll}</option>
            {compounds.map((c) => (
              <option key={c.id} value={c.id}>
                {pickLocalized(locale, c.arabicName, c.name)}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">{t.crm.filterFollowUp}</label>
          <select name="followUp" defaultValue={params.followUp ?? ""} className="w-full rounded-lg border border-slate-300 px-3 py-2">
            <option value="">{t.crm.filterAll}</option>
            <option value="overdue">{t.crm.followUpOverdue}</option>
            <option value="today">{t.crm.followUpToday}</option>
            <option value="upcoming">{t.crm.followUpUpcoming}</option>
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">{t.crm.filterMoveInFrom}</label>
          <input type="date" name="moveInFrom" defaultValue={params.moveInFrom} className="w-full rounded-lg border border-slate-300 px-3 py-2" />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">{t.crm.filterMoveInTo}</label>
          <input type="date" name="moveInTo" defaultValue={params.moveInTo} className="w-full rounded-lg border border-slate-300 px-3 py-2" />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">{t.crm.filterCreatedFrom}</label>
          <input type="date" name="createdFrom" defaultValue={params.createdFrom} className="w-full rounded-lg border border-slate-300 px-3 py-2" />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">{t.crm.filterCreatedTo}</label>
          <input type="date" name="createdTo" defaultValue={params.createdTo} className="w-full rounded-lg border border-slate-300 px-3 py-2" />
        </div>
        <div className="md:col-span-4">
          <button className="bg-brand-gold hover:bg-brand-gold-dark text-brand-black rounded-lg px-5 py-2.5 font-semibold">{t.crm.filterApply}</button>
        </div>
      </form>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-500 text-right">
            <tr>
              <th className="px-4 py-3 font-medium">{t.crm.colLeadNumber}</th>
              <th className="px-4 py-3 font-medium">{t.crm.colNameCompany}</th>
              <th className="px-4 py-3 font-medium">{t.crm.colMobile}</th>
              <th className="px-4 py-3 font-medium">{t.crm.colSource}</th>
              <th className="px-4 py-3 font-medium">{t.crm.colBudget}</th>
              <th className="px-4 py-3 font-medium">{t.crm.colBedrooms}</th>
              <th className="px-4 py-3 font-medium">{t.crm.colCompound}</th>
              <th className="px-4 py-3 font-medium">{t.crm.colMoveIn}</th>
              <th className="px-4 py-3 font-medium">{t.crm.colStatus}</th>
              <th className="px-4 py-3 font-medium">{t.crm.colAgent}</th>
              <th className="px-4 py-3 font-medium">{t.crm.colFollowUp}</th>
              <th className="px-4 py-3 font-medium">{t.crm.colCreated}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((lead) => (
              <tr key={lead.id}>
                <td className="px-4 py-3 font-medium text-slate-800">
                  <Link href={`/crm/leads/${lead.id}`} className="hover:underline">
                    {lead.leadNumber}
                  </Link>
                </td>
                <td className="px-4 py-3 text-slate-700">{lead.fullName}</td>
                <td className="px-4 py-3 text-slate-500">{lead.mobile}</td>
                <td className="px-4 py-3 text-slate-500">{t.leadSource[lead.source]}</td>
                <td className="px-4 py-3 text-slate-500">
                  {lead.budgetMin || lead.budgetMax
                    ? `${lead.budgetMin ? sar.format(Number(lead.budgetMin)) : "—"} - ${lead.budgetMax ? sar.format(Number(lead.budgetMax)) : "—"}`
                    : "—"}
                </td>
                <td className="px-4 py-3 text-slate-500">{lead.preferredBedrooms ?? "—"}</td>
                <td className="px-4 py-3 text-slate-500">{lead.preferredCompound ? pickLocalized(locale, lead.preferredCompound.arabicName, lead.preferredCompound.name) : "—"}</td>
                <td className="px-4 py-3 text-slate-500 whitespace-nowrap">{lead.moveInDate ? dateFmt.format(lead.moveInDate) : "—"}</td>
                <td className="px-4 py-3">
                  <StatusBadge status={lead.status} label={t.leadStatus[lead.status]} />
                </td>
                <td className="px-4 py-3 text-slate-500">{lead.assignedToUser?.name ?? t.crm.unassigned}</td>
                <td className="px-4 py-3 text-slate-500 whitespace-nowrap">{lead.nextFollowUpAt ? dateFmt.format(lead.nextFollowUpAt) : "—"}</td>
                <td className="px-4 py-3 text-slate-400 whitespace-nowrap">{dateFmt.format(lead.createdAt)}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={12} className="px-5 py-8 text-center text-slate-400">
                  {t.crm.empty}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between">
        <span className="text-sm text-slate-500">{t.crm.pageOf(page, totalPages)}</span>
        <div className="flex gap-2">
          {page > 1 && (
            <Link href={pageHref(page - 1)} className="text-sm text-brand-gold-dark hover:underline">
              {t.crm.previous}
            </Link>
          )}
          {page < totalPages && (
            <Link href={pageHref(page + 1)} className="text-sm text-brand-gold-dark hover:underline">
              {t.crm.next}
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}

function Select<T extends string>({
  label,
  name,
  defaultValue,
  options,
  labels,
  allLabel,
}: {
  label: string;
  name: string;
  defaultValue?: string;
  options: T[];
  labels: Record<T, string>;
  allLabel: string;
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-slate-700 mb-1">{label}</label>
      <select name={name} defaultValue={defaultValue ?? ""} className="w-full rounded-lg border border-slate-300 px-3 py-2">
        <option value="">{allLabel}</option>
        {options.map((value) => (
          <option key={value} value={value}>
            {labels[value]}
          </option>
        ))}
      </select>
    </div>
  );
}

function StatusBadge({ status, label }: { status: string; label: string }) {
  const toneClass =
    status === "WON"
      ? "bg-emerald-100 text-emerald-700"
      : status === "LOST"
        ? "bg-red-100 text-red-700"
        : status === "ARCHIVED"
          ? "bg-slate-200 text-slate-500"
          : status === "QUALIFIED"
            ? "bg-brand-gold/20 text-brand-gold-dark"
            : "bg-slate-100 text-slate-600";
  return <span className={`px-2 py-1 rounded-full text-xs font-medium ${toneClass}`}>{label}</span>;
}
