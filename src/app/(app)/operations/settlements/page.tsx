import Link from "next/link";
import { listSecurityDepositSettlements } from "@/lib/actions/security-deposits";
import { getLocale, getDictionary, shortDateFormatter, pickLocalized } from "@/lib/i18n";
import type { SettlementStatus } from "@prisma/client";

export default async function SettlementsListPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string; disputedOnly?: string; page?: string }>;
}) {
  const params = await searchParams;
  const locale = await getLocale();
  const t = getDictionary(locale);
  const dateFmt = shortDateFormatter(locale);

  const filters = {
    search: params.q || undefined,
    status: params.status || undefined,
    disputedOnly: params.disputedOnly === "on",
    page: params.page ? Number(params.page) : 1,
  };

  const { rows, page, totalPages } = await listSecurityDepositSettlements(filters);

  function pageHref(nextPage: number) {
    const usp = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (key !== "page" && value) usp.set(key, value);
    }
    usp.set("page", String(nextPage));
    return `/operations/settlements?${usp.toString()}`;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{t.securityDeposit.listTitle}</h1>
          <p className="text-slate-500 text-sm mt-1">{t.securityDeposit.listSubtitle}</p>
        </div>
        <Link href="/operations/settlements/reports" className="text-sm text-brand-gold-dark hover:underline font-medium">
          {t.securityDeposit.reportsTitle} →
        </Link>
      </div>

      <form method="get" className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="md:col-span-2">
          <label className="block text-sm font-medium text-slate-700 mb-1">{t.securityDeposit.filterSearch}</label>
          <input name="q" defaultValue={params.q} placeholder={t.securityDeposit.filterSearch} className="w-full rounded-lg border border-slate-300 px-3 py-2" />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">{t.securityDeposit.filterStatus}</label>
          <select name="status" defaultValue={params.status ?? ""} className="w-full rounded-lg border border-slate-300 px-3 py-2">
            <option value="">{t.securityDeposit.filterAll}</option>
            {(Object.keys(t.settlementStatus) as SettlementStatus[]).map((v) => (
              <option key={v} value={v}>
                {t.settlementStatus[v]}
              </option>
            ))}
          </select>
        </div>
        <div className="flex items-end gap-4">
          <label className="flex items-center gap-2 text-sm text-slate-600">
            <input type="checkbox" name="disputedOnly" defaultChecked={params.disputedOnly === "on"} className="rounded border-slate-300" />
            {t.securityDeposit.filterDisputedOnly}
          </label>
          <button className="bg-brand-gold hover:bg-brand-gold-dark text-brand-black rounded-lg px-5 py-2.5 font-semibold">{t.securityDeposit.filterApply}</button>
        </div>
      </form>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-500 text-right">
            <tr>
              <th className="px-4 py-3 font-medium">{t.securityDeposit.colSettlementNumber}</th>
              <th className="px-4 py-3 font-medium">{t.securityDeposit.colContract}</th>
              <th className="px-4 py-3 font-medium">{t.securityDeposit.colUnit}</th>
              <th className="px-4 py-3 font-medium">{t.securityDeposit.colTenant}</th>
              <th className="px-4 py-3 font-medium">{t.securityDeposit.colMoveOut}</th>
              <th className="px-4 py-3 font-medium">{t.securityDeposit.colStatus}</th>
              <th className="px-4 py-3 font-medium">{t.securityDeposit.colCreatedAt}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((s) => (
              <tr key={s.id}>
                <td className="px-4 py-3 font-medium text-slate-800 whitespace-nowrap">
                  <Link href={`/operations/settlements/${s.id}`} className="hover:underline">
                    {s.settlementNumber}
                  </Link>
                </td>
                <td className="px-4 py-3 text-slate-500">{s.contract.contractNumber}</td>
                <td className="px-4 py-3 text-slate-500">{s.unit.unitNumber}</td>
                <td className="px-4 py-3 text-slate-700">{pickLocalized(locale, s.renter.fullNameAr, s.renter.fullName)}</td>
                <td className="px-4 py-3 text-slate-500">{s.moveOut.moveOutNumber}</td>
                <td className="px-4 py-3">
                  <StatusBadge status={s.status} label={t.settlementStatus[s.status]} />
                </td>
                <td className="px-4 py-3 text-slate-500 whitespace-nowrap">{dateFmt.format(s.createdAt)}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={7} className="px-5 py-8 text-center text-slate-400">
                  {t.securityDeposit.empty}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between">
        <span className="text-sm text-slate-500">{t.securityDeposit.pageOf(page, totalPages)}</span>
        <div className="flex gap-2">
          {page > 1 && (
            <Link href={pageHref(page - 1)} className="text-sm text-brand-gold-dark hover:underline">
              {t.securityDeposit.previous}
            </Link>
          )}
          {page < totalPages && (
            <Link href={pageHref(page + 1)} className="text-sm text-brand-gold-dark hover:underline">
              {t.securityDeposit.next}
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}

function StatusBadge({ status, label }: { status: string; label: string }) {
  const toneClass =
    status === "SETTLED"
      ? "bg-emerald-100 text-emerald-700"
      : status === "CANCELLED"
        ? "bg-red-100 text-red-700"
        : status === "POSTED" || status === "PARTIALLY_SETTLED"
          ? "bg-sky-100 text-sky-700"
          : status === "APPROVED"
            ? "bg-brand-gold/20 text-brand-gold-dark"
            : status === "PENDING_APPROVAL"
              ? "bg-amber-100 text-amber-700"
              : "bg-slate-100 text-slate-600";
  return <span className={`px-2 py-1 rounded-full text-xs font-medium whitespace-nowrap ${toneClass}`}>{label}</span>;
}
