import Link from "next/link";
import { listReservations, listReservationAssignableUsers } from "@/lib/actions/reservations";
import { getCompoundOptions } from "@/lib/actions/compounds";
import { getCurrentUserRole } from "@/lib/session";
import { can } from "@/lib/permissions";
import { getLocale, getDictionary, shortDateFormatter, currencyFormatter, pickLocalized } from "@/lib/i18n";
import type { ReservationStatus, ReservationAmountStatus } from "@prisma/client";

export default async function ReservationsListPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    status?: string;
    amountStatus?: string;
    assignedToUserId?: string;
    compoundId?: string;
    unitId?: string;
    leadId?: string;
    dateFrom?: string;
    dateTo?: string;
    holdUntilFrom?: string;
    holdUntilTo?: string;
    expiredOnly?: string;
    expiringToday?: string;
    activeOnly?: string;
    page?: string;
  }>;
}) {
  const params = await searchParams;
  const [role, locale, agents, compounds] = await Promise.all([
    getCurrentUserRole(),
    getLocale(),
    listReservationAssignableUsers().catch(() => []),
    getCompoundOptions(),
  ]);
  const t = getDictionary(locale);
  const dateFmt = shortDateFormatter(locale);
  const sar = currencyFormatter(locale);
  const canCreate = can("reservation.create", role);

  const filters = {
    search: params.q || undefined,
    status: params.status || undefined,
    amountStatus: params.amountStatus || undefined,
    assignedToUserId: params.assignedToUserId || undefined,
    compoundId: params.compoundId || undefined,
    unitId: params.unitId || undefined,
    leadId: params.leadId || undefined,
    dateFrom: params.dateFrom ? new Date(params.dateFrom) : undefined,
    dateTo: params.dateTo ? new Date(`${params.dateTo}T23:59:59`) : undefined,
    holdUntilFrom: params.holdUntilFrom ? new Date(params.holdUntilFrom) : undefined,
    holdUntilTo: params.holdUntilTo ? new Date(`${params.holdUntilTo}T23:59:59`) : undefined,
    expiredOnly: params.expiredOnly === "on",
    expiringToday: params.expiringToday === "on",
    activeOnly: params.activeOnly === "on",
    page: params.page ? Number(params.page) : 1,
  };

  const { rows, page, totalPages } = await listReservations(filters);

  function pageHref(nextPage: number) {
    const usp = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (key !== "page" && value) usp.set(key, value);
    }
    usp.set("page", String(nextPage));
    return `/crm/reservations?${usp.toString()}`;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{t.reservation.listTitle}</h1>
          <p className="text-slate-500 text-sm mt-1">{t.reservation.listSubtitle}</p>
        </div>
        {canCreate && (
          <Link href="/crm/reservations/new" className="bg-brand-gold hover:bg-brand-gold-dark text-brand-black rounded-lg px-5 py-2.5 font-semibold text-sm">
            + {t.reservation.newTitle}
          </Link>
        )}
      </div>

      <form method="get" className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="md:col-span-2">
          <label className="block text-sm font-medium text-slate-700 mb-1">{t.crm.searchLabel}</label>
          <input name="q" defaultValue={params.q} placeholder={t.reservation.searchPlaceholder} className="w-full rounded-lg border border-slate-300 px-3 py-2" />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">{t.reservation.filterStatus}</label>
          <select name="status" defaultValue={params.status ?? ""} className="w-full rounded-lg border border-slate-300 px-3 py-2">
            <option value="">{t.reservation.filterAll}</option>
            {(Object.keys(t.reservationStatus) as ReservationStatus[]).map((v) => (
              <option key={v} value={v}>
                {t.reservationStatus[v]}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">{t.reservation.filterAmountStatus}</label>
          <select name="amountStatus" defaultValue={params.amountStatus ?? ""} className="w-full rounded-lg border border-slate-300 px-3 py-2">
            <option value="">{t.reservation.filterAll}</option>
            {(Object.keys(t.reservationAmountStatus) as ReservationAmountStatus[]).map((v) => (
              <option key={v} value={v}>
                {t.reservationAmountStatus[v]}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">{t.reservation.filterAgent}</label>
          <select name="assignedToUserId" defaultValue={params.assignedToUserId ?? ""} className="w-full rounded-lg border border-slate-300 px-3 py-2">
            <option value="">{t.reservation.filterAll}</option>
            {agents.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">{t.reservation.filterCompound}</label>
          <select name="compoundId" defaultValue={params.compoundId ?? ""} className="w-full rounded-lg border border-slate-300 px-3 py-2">
            <option value="">{t.reservation.filterAll}</option>
            {compounds.map((c) => (
              <option key={c.id} value={c.id}>
                {pickLocalized(locale, c.arabicName, c.name)}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">{t.reservation.filterHoldUntilFrom}</label>
          <input type="date" name="holdUntilFrom" defaultValue={params.holdUntilFrom} className="w-full rounded-lg border border-slate-300 px-3 py-2" />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">{t.reservation.filterHoldUntilTo}</label>
          <input type="date" name="holdUntilTo" defaultValue={params.holdUntilTo} className="w-full rounded-lg border border-slate-300 px-3 py-2" />
        </div>
        <div className="md:col-span-4 flex flex-wrap items-center gap-4">
          <label className="flex items-center gap-2 text-sm text-slate-600">
            <input type="checkbox" name="activeOnly" defaultChecked={params.activeOnly === "on"} className="rounded border-slate-300" />
            {t.reservation.filterActiveOnly}
          </label>
          <label className="flex items-center gap-2 text-sm text-slate-600">
            <input type="checkbox" name="expiringToday" defaultChecked={params.expiringToday === "on"} className="rounded border-slate-300" />
            {t.reservation.filterExpiringToday}
          </label>
          <label className="flex items-center gap-2 text-sm text-slate-600">
            <input type="checkbox" name="expiredOnly" defaultChecked={params.expiredOnly === "on"} className="rounded border-slate-300" />
            {t.reservation.filterExpiredOnly}
          </label>
          <button className="bg-brand-gold hover:bg-brand-gold-dark text-brand-black rounded-lg px-5 py-2.5 font-semibold">{t.reservation.filterApply}</button>
        </div>
      </form>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-500 text-right">
            <tr>
              <th className="px-4 py-3 font-medium">{t.reservation.colReservationNumber}</th>
              <th className="px-4 py-3 font-medium">{t.reservation.colLead}</th>
              <th className="px-4 py-3 font-medium">{t.reservation.colOfferNumber}</th>
              <th className="px-4 py-3 font-medium">{t.reservation.colUnit}</th>
              <th className="px-4 py-3 font-medium">{t.reservation.colCompound}</th>
              <th className="px-4 py-3 font-medium">{t.reservation.colStatus}</th>
              <th className="px-4 py-3 font-medium">{t.reservation.colAmount}</th>
              <th className="px-4 py-3 font-medium">{t.reservation.colAmountStatus}</th>
              <th className="px-4 py-3 font-medium">{t.reservation.colReservedAt}</th>
              <th className="px-4 py-3 font-medium">{t.reservation.colHoldUntil}</th>
              <th className="px-4 py-3 font-medium">{t.reservation.colAgent}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((r) => {
              const compound = r.unit.floor.building.compound;
              return (
                <tr key={r.id}>
                  <td className="px-4 py-3 font-medium text-slate-800 whitespace-nowrap">
                    <Link href={`/crm/reservations/${r.id}`} className="hover:underline">
                      {r.reservationNumber}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-slate-700">{r.lead.fullName}</td>
                  <td className="px-4 py-3 text-slate-500">{r.offer.offerNumber}</td>
                  <td className="px-4 py-3 text-slate-500">{r.unit.unitNumber}</td>
                  <td className="px-4 py-3 text-slate-500">{pickLocalized(locale, compound.arabicName, compound.name)}</td>
                  <td className="px-4 py-3">
                    <StatusBadge status={r.status} label={t.reservationStatus[r.status]} />
                  </td>
                  <td className="px-4 py-3 text-slate-500 whitespace-nowrap">{sar.format(Number(r.reservationAmount))}</td>
                  <td className="px-4 py-3 text-slate-500">{t.reservationAmountStatus[r.reservationAmountStatus]}</td>
                  <td className="px-4 py-3 text-slate-500 whitespace-nowrap">{dateFmt.format(r.reservedAt)}</td>
                  <td className="px-4 py-3 text-slate-500 whitespace-nowrap">{dateFmt.format(r.holdUntil)}</td>
                  <td className="px-4 py-3 text-slate-500">{r.assignedToUser?.name ?? "—"}</td>
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr>
                <td colSpan={11} className="px-5 py-8 text-center text-slate-400">
                  {t.reservation.empty}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between">
        <span className="text-sm text-slate-500">{t.reservation.pageOf(page, totalPages)}</span>
        <div className="flex gap-2">
          {page > 1 && (
            <Link href={pageHref(page - 1)} className="text-sm text-brand-gold-dark hover:underline">
              {t.reservation.previous}
            </Link>
          )}
          {page < totalPages && (
            <Link href={pageHref(page + 1)} className="text-sm text-brand-gold-dark hover:underline">
              {t.reservation.next}
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}

function StatusBadge({ status, label }: { status: string; label: string }) {
  const toneClass =
    status === "CONFIRMED"
      ? "bg-emerald-100 text-emerald-700"
      : status === "CANCELLED" || status === "EXPIRED"
        ? "bg-red-100 text-red-700"
        : status === "PENDING"
          ? "bg-brand-gold/20 text-brand-gold-dark"
          : status === "RELEASED"
            ? "bg-slate-200 text-slate-600"
            : "bg-slate-100 text-slate-600";
  return <span className={`px-2 py-1 rounded-full text-xs font-medium whitespace-nowrap ${toneClass}`}>{label}</span>;
}
