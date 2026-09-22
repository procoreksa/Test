import Link from "next/link";
import { listOffers, listOfferAssignableUsers } from "@/lib/actions/offers";
import { getCompoundOptions } from "@/lib/actions/compounds";
import { getCurrentUserRole } from "@/lib/session";
import { can } from "@/lib/permissions";
import { getLocale, getDictionary, shortDateFormatter, currencyFormatter, pickLocalized } from "@/lib/i18n";
import type { OfferStatus } from "@prisma/client";

export default async function OffersListPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    status?: string;
    assignedToUserId?: string;
    compoundId?: string;
    unitId?: string;
    leadId?: string;
    dateFrom?: string;
    dateTo?: string;
    validUntilFrom?: string;
    validUntilTo?: string;
    expiredOnly?: string;
    acceptedOnly?: string;
    rejectedOnly?: string;
    page?: string;
  }>;
}) {
  const params = await searchParams;
  const [role, locale, agents, compounds] = await Promise.all([
    getCurrentUserRole(),
    getLocale(),
    listOfferAssignableUsers().catch(() => []),
    getCompoundOptions(),
  ]);
  const t = getDictionary(locale);
  const dateFmt = shortDateFormatter(locale);
  const sar = currencyFormatter(locale);
  const canCreate = can("offer.create", role);

  const filters = {
    search: params.q || undefined,
    status: params.status || undefined,
    assignedToUserId: params.assignedToUserId || undefined,
    compoundId: params.compoundId || undefined,
    unitId: params.unitId || undefined,
    leadId: params.leadId || undefined,
    dateFrom: params.dateFrom ? new Date(params.dateFrom) : undefined,
    dateTo: params.dateTo ? new Date(`${params.dateTo}T23:59:59`) : undefined,
    validUntilFrom: params.validUntilFrom ? new Date(params.validUntilFrom) : undefined,
    validUntilTo: params.validUntilTo ? new Date(`${params.validUntilTo}T23:59:59`) : undefined,
    expiredOnly: params.expiredOnly === "on",
    acceptedOnly: params.acceptedOnly === "on",
    rejectedOnly: params.rejectedOnly === "on",
    page: params.page ? Number(params.page) : 1,
  };

  const { rows, page, totalPages } = await listOffers(filters);

  function pageHref(nextPage: number) {
    const usp = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (key !== "page" && value) usp.set(key, value);
    }
    usp.set("page", String(nextPage));
    return `/crm/offers?${usp.toString()}`;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{t.offer.listTitle}</h1>
          <p className="text-slate-500 text-sm mt-1">{t.offer.listSubtitle}</p>
        </div>
        {canCreate && (
          <Link href="/crm/offers/new" className="bg-brand-gold hover:bg-brand-gold-dark text-brand-black rounded-lg px-5 py-2.5 font-semibold text-sm">
            + {t.offer.newTitle}
          </Link>
        )}
      </div>

      <form method="get" className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="md:col-span-2">
          <label className="block text-sm font-medium text-slate-700 mb-1">{t.crm.searchLabel}</label>
          <input name="q" defaultValue={params.q} placeholder={t.offer.searchPlaceholder} className="w-full rounded-lg border border-slate-300 px-3 py-2" />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">{t.offer.filterStatus}</label>
          <select name="status" defaultValue={params.status ?? ""} className="w-full rounded-lg border border-slate-300 px-3 py-2">
            <option value="">{t.offer.filterAll}</option>
            {(Object.keys(t.offerStatus) as OfferStatus[]).map((v) => (
              <option key={v} value={v}>
                {t.offerStatus[v]}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">{t.offer.filterAgent}</label>
          <select name="assignedToUserId" defaultValue={params.assignedToUserId ?? ""} className="w-full rounded-lg border border-slate-300 px-3 py-2">
            <option value="">{t.offer.filterAll}</option>
            {agents.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">{t.offer.filterCompound}</label>
          <select name="compoundId" defaultValue={params.compoundId ?? ""} className="w-full rounded-lg border border-slate-300 px-3 py-2">
            <option value="">{t.offer.filterAll}</option>
            {compounds.map((c) => (
              <option key={c.id} value={c.id}>
                {pickLocalized(locale, c.arabicName, c.name)}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">{t.offer.filterDateFrom}</label>
          <input type="date" name="dateFrom" defaultValue={params.dateFrom} className="w-full rounded-lg border border-slate-300 px-3 py-2" />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">{t.offer.filterDateTo}</label>
          <input type="date" name="dateTo" defaultValue={params.dateTo} className="w-full rounded-lg border border-slate-300 px-3 py-2" />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">{t.offer.filterValidUntilFrom}</label>
          <input type="date" name="validUntilFrom" defaultValue={params.validUntilFrom} className="w-full rounded-lg border border-slate-300 px-3 py-2" />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">{t.offer.filterValidUntilTo}</label>
          <input type="date" name="validUntilTo" defaultValue={params.validUntilTo} className="w-full rounded-lg border border-slate-300 px-3 py-2" />
        </div>
        <div className="md:col-span-4 flex flex-wrap items-center gap-4">
          <label className="flex items-center gap-2 text-sm text-slate-600">
            <input type="checkbox" name="expiredOnly" defaultChecked={params.expiredOnly === "on"} className="rounded border-slate-300" />
            {t.offer.filterExpiredOnly}
          </label>
          <label className="flex items-center gap-2 text-sm text-slate-600">
            <input type="checkbox" name="acceptedOnly" defaultChecked={params.acceptedOnly === "on"} className="rounded border-slate-300" />
            {t.offer.filterAcceptedOnly}
          </label>
          <label className="flex items-center gap-2 text-sm text-slate-600">
            <input type="checkbox" name="rejectedOnly" defaultChecked={params.rejectedOnly === "on"} className="rounded border-slate-300" />
            {t.offer.filterRejectedOnly}
          </label>
          <button className="bg-brand-gold hover:bg-brand-gold-dark text-brand-black rounded-lg px-5 py-2.5 font-semibold">{t.offer.filterApply}</button>
        </div>
      </form>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-500 text-right">
            <tr>
              <th className="px-4 py-3 font-medium">{t.offer.colOfferNumber}</th>
              <th className="px-4 py-3 font-medium">{t.offer.colVersionShort}</th>
              <th className="px-4 py-3 font-medium">{t.offer.colLead}</th>
              <th className="px-4 py-3 font-medium">{t.offer.colUnit}</th>
              <th className="px-4 py-3 font-medium">{t.offer.colCompound}</th>
              <th className="px-4 py-3 font-medium">{t.offer.colAnnualRent}</th>
              <th className="px-4 py-3 font-medium">{t.offer.colDiscount}</th>
              <th className="px-4 py-3 font-medium">{t.offer.colNetRent}</th>
              <th className="px-4 py-3 font-medium">{t.offer.colStatus}</th>
              <th className="px-4 py-3 font-medium">{t.offer.colAgent}</th>
              <th className="px-4 py-3 font-medium">{t.offer.colValidUntil}</th>
              <th className="px-4 py-3 font-medium">{t.offer.colCreatedDate}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((o) => {
              const compound = o.unit.floor.building.compound;
              return (
                <tr key={o.id}>
                  <td className="px-4 py-3 font-medium text-slate-800 whitespace-nowrap">
                    <Link href={`/crm/offers/${o.id}`} className="hover:underline">
                      {o.offerNumber}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-slate-500">{o.versionNumber}</td>
                  <td className="px-4 py-3 text-slate-700">{o.lead.fullName}</td>
                  <td className="px-4 py-3 text-slate-500">{o.unit.unitNumber}</td>
                  <td className="px-4 py-3 text-slate-500">{pickLocalized(locale, compound.arabicName, compound.name)}</td>
                  <td className="px-4 py-3 text-slate-500 whitespace-nowrap">{sar.format(Number(o.annualRent))}</td>
                  <td className="px-4 py-3 text-slate-500 whitespace-nowrap">{Number(o.discountPercentage)}%</td>
                  <td className="px-4 py-3 text-slate-700 font-medium whitespace-nowrap">{sar.format(Number(o.netAnnualRent))}</td>
                  <td className="px-4 py-3">
                    <StatusBadge status={o.status} label={t.offerStatus[o.status]} />
                  </td>
                  <td className="px-4 py-3 text-slate-500">{o.assignedToUser?.name ?? "—"}</td>
                  <td className="px-4 py-3 text-slate-500 whitespace-nowrap">{dateFmt.format(o.validUntil)}</td>
                  <td className="px-4 py-3 text-slate-500 whitespace-nowrap">{dateFmt.format(o.createdAt)}</td>
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr>
                <td colSpan={12} className="px-5 py-8 text-center text-slate-400">
                  {t.offer.empty}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between">
        <span className="text-sm text-slate-500">{t.offer.pageOf(page, totalPages)}</span>
        <div className="flex gap-2">
          {page > 1 && (
            <Link href={pageHref(page - 1)} className="text-sm text-brand-gold-dark hover:underline">
              {t.offer.previous}
            </Link>
          )}
          {page < totalPages && (
            <Link href={pageHref(page + 1)} className="text-sm text-brand-gold-dark hover:underline">
              {t.offer.next}
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}

function StatusBadge({ status, label }: { status: string; label: string }) {
  const toneClass =
    status === "ACCEPTED"
      ? "bg-emerald-100 text-emerald-700"
      : status === "REJECTED" || status === "CANCELLED" || status === "EXPIRED"
        ? "bg-red-100 text-red-700"
        : status === "SENT" || status === "UNDER_NEGOTIATION" || status === "APPROVED"
          ? "bg-brand-gold/20 text-brand-gold-dark"
          : "bg-slate-100 text-slate-600";
  return <span className={`px-2 py-1 rounded-full text-xs font-medium whitespace-nowrap ${toneClass}`}>{label}</span>;
}
