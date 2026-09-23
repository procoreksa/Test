import Link from "next/link";
import { listCorporateAllocations } from "@/lib/actions/corporate-allocations";
import { getCorporateAccountOptions } from "@/lib/actions/corporate-accounts";
import { getCurrentUserRole } from "@/lib/session";
import { can } from "@/lib/permissions";
import { getLocale, getDictionary, pickLocalized, shortDateFormatter } from "@/lib/i18n";
import type { CorporateHousingAllocationStatus } from "@prisma/client";

export default async function CorporateAllocationsListPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; corporateAccountId?: string; page?: string }>;
}) {
  const params = await searchParams;
  const [role, locale, accounts] = await Promise.all([getCurrentUserRole(), getLocale(), getCorporateAccountOptions()]);
  const t = getDictionary(locale);
  const dateFmt = shortDateFormatter(locale);
  const canCreate = can("corporateAllocation.create", role);

  const filters = {
    status: (params.status as CorporateHousingAllocationStatus) || undefined,
    corporateAccountId: params.corporateAccountId || undefined,
    page: params.page ? Number(params.page) : 1,
  };

  const { rows, page, totalPages } = await listCorporateAllocations(filters);

  function pageHref(nextPage: number) {
    const usp = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (key !== "page" && value) usp.set(key, value);
    }
    usp.set("page", String(nextPage));
    return `/corporate-housing/allocations?${usp.toString()}`;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{t.corporateHousing.allocationsTitle}</h1>
          <p className="text-slate-500 text-sm mt-1">{t.corporateHousing.allocationsSubtitle}</p>
        </div>
        {canCreate && (
          <Link href="/corporate-housing/allocations/new" className="bg-brand-gold hover:bg-brand-gold-dark text-brand-black rounded-lg px-5 py-2.5 font-semibold text-sm">
            + {t.corporateHousing.newAllocationButton}
          </Link>
        )}
      </div>

      <form method="get" className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 grid grid-cols-1 md:grid-cols-4 gap-4">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">{t.corporateHousing.colStatus}</label>
          <select name="status" defaultValue={params.status ?? ""} className="w-full rounded-lg border border-slate-300 px-3 py-2">
            <option value="">{t.corporateHousing.filterAll}</option>
            {(Object.keys(t.corporateHousingAllocationStatus) as CorporateHousingAllocationStatus[]).map((v) => (
              <option key={v} value={v}>
                {t.corporateHousingAllocationStatus[v]}
              </option>
            ))}
          </select>
        </div>
        <div className="md:col-span-2">
          <label className="block text-sm font-medium text-slate-700 mb-1">{t.corporateHousing.colCorporateAccount}</label>
          <select name="corporateAccountId" defaultValue={params.corporateAccountId ?? ""} className="w-full rounded-lg border border-slate-300 px-3 py-2">
            <option value="">{t.corporateHousing.filterAll}</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.accountNumber} — {a.displayName}
              </option>
            ))}
          </select>
        </div>
        <div className="flex items-end">
          <button className="bg-brand-gold hover:bg-brand-gold-dark text-brand-black rounded-lg px-5 py-2.5 font-semibold w-full">{t.corporateHousing.filterApply}</button>
        </div>
      </form>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-500 text-right">
            <tr>
              <th className="px-4 py-3 font-medium">{t.corporateHousing.colAllocationNumber}</th>
              <th className="px-4 py-3 font-medium">{t.corporateHousing.colCorporateAccount}</th>
              <th className="px-4 py-3 font-medium">{t.corporateHousing.colOccupant}</th>
              <th className="px-4 py-3 font-medium">{t.corporateHousing.colContract}</th>
              <th className="px-4 py-3 font-medium">{t.corporateHousing.colUnit}</th>
              <th className="px-4 py-3 font-medium">{t.corporateHousing.colStartDate}</th>
              <th className="px-4 py-3 font-medium">{t.corporateHousing.colPlannedEndDate}</th>
              <th className="px-4 py-3 font-medium">{t.corporateHousing.colStatus}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((a) => (
              <tr key={a.id}>
                <td className="px-4 py-3 font-medium text-slate-800 whitespace-nowrap">
                  <Link href={`/corporate-housing/allocations/${a.id}`} className="hover:underline">
                    {a.allocationNumber}
                  </Link>
                </td>
                <td className="px-4 py-3 text-slate-500">{a.corporateAccount.displayName}</td>
                <td className="px-4 py-3 text-slate-500">{pickLocalized(locale, a.occupant.fullNameAr, a.occupant.fullName)}</td>
                <td className="px-4 py-3 text-slate-500">{a.contract.contractNumber}</td>
                <td className="px-4 py-3 text-slate-500">{a.unit.unitNumber}</td>
                <td className="px-4 py-3 text-slate-500 whitespace-nowrap">{dateFmt.format(a.startDate)}</td>
                <td className="px-4 py-3 text-slate-500 whitespace-nowrap">{a.plannedEndDate ? dateFmt.format(a.plannedEndDate) : "—"}</td>
                <td className="px-4 py-3">
                  <StatusBadge status={a.status} label={t.corporateHousingAllocationStatus[a.status]} />
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={8} className="px-5 py-8 text-center text-slate-400">
                  {t.corporateHousing.emptyAllocations}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between">
        <span className="text-sm text-slate-500">
          {page} / {totalPages}
        </span>
        <div className="flex gap-2">
          {page > 1 && (
            <Link href={pageHref(page - 1)} className="text-sm text-brand-gold-dark hover:underline">
              {t.corporateHousing.previousLabel}
            </Link>
          )}
          {page < totalPages && (
            <Link href={pageHref(page + 1)} className="text-sm text-brand-gold-dark hover:underline">
              {t.corporateHousing.nextLabel}
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}

export function StatusBadge({ status, label }: { status: string; label: string }) {
  const toneClass =
    status === "ACTIVE"
      ? "bg-emerald-100 text-emerald-700"
      : status === "PLANNED"
        ? "bg-sky-100 text-sky-700"
        : status === "CANCELLED"
          ? "bg-red-100 text-red-700"
          : "bg-slate-100 text-slate-600";
  return <span className={`px-2 py-1 rounded-full text-xs font-medium whitespace-nowrap ${toneClass}`}>{label}</span>;
}
