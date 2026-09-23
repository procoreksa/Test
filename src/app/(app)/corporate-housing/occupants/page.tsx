import Link from "next/link";
import { listCorporateOccupants } from "@/lib/actions/corporate-occupants";
import { getCurrentUserRole } from "@/lib/session";
import { can } from "@/lib/permissions";
import { getLocale, getDictionary, pickLocalized } from "@/lib/i18n";
import type { CorporateOccupantStatus } from "@prisma/client";

export default async function CorporateOccupantsListPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string; page?: string }>;
}) {
  const params = await searchParams;
  const [role, locale] = await Promise.all([getCurrentUserRole(), getLocale()]);
  const t = getDictionary(locale);
  const canCreate = can("corporateOccupant.create", role);

  const filters = {
    search: params.q || undefined,
    status: (params.status as CorporateOccupantStatus) || undefined,
    page: params.page ? Number(params.page) : 1,
  };

  const { rows, page, totalPages } = await listCorporateOccupants(filters);

  function pageHref(nextPage: number) {
    const usp = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (key !== "page" && value) usp.set(key, value);
    }
    usp.set("page", String(nextPage));
    return `/corporate-housing/occupants?${usp.toString()}`;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{t.corporateHousing.occupantsTitle}</h1>
          <p className="text-slate-500 text-sm mt-1">{t.corporateHousing.occupantsSubtitle}</p>
        </div>
        {canCreate && (
          <Link href="/corporate-housing/occupants/new" className="bg-brand-gold hover:bg-brand-gold-dark text-brand-black rounded-lg px-5 py-2.5 font-semibold text-sm">
            + {t.corporateHousing.newOccupantButton}
          </Link>
        )}
      </div>

      <form method="get" className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="md:col-span-2">
          <label className="block text-sm font-medium text-slate-700 mb-1">{t.corporateHousing.searchLabel}</label>
          <input name="q" defaultValue={params.q} className="w-full rounded-lg border border-slate-300 px-3 py-2" />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">{t.corporateHousing.colStatus}</label>
          <select name="status" defaultValue={params.status ?? ""} className="w-full rounded-lg border border-slate-300 px-3 py-2">
            <option value="">{t.corporateHousing.filterAll}</option>
            {(Object.keys(t.corporateOccupantStatus) as CorporateOccupantStatus[]).map((v) => (
              <option key={v} value={v}>
                {t.corporateOccupantStatus[v]}
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
              <th className="px-4 py-3 font-medium">{t.corporateHousing.colEmployeeNumber}</th>
              <th className="px-4 py-3 font-medium">{t.corporateHousing.colOccupantName}</th>
              <th className="px-4 py-3 font-medium">{t.corporateHousing.colCorporateAccount}</th>
              <th className="px-4 py-3 font-medium">{t.corporateHousing.colStatus}</th>
              <th className="px-4 py-3 font-medium">{t.corporateHousing.colCurrentHousing}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((o) => (
              <tr key={o.id}>
                <td className="px-4 py-3 text-slate-500 whitespace-nowrap">{o.employeeNumber ?? "—"}</td>
                <td className="px-4 py-3 font-medium text-slate-800">
                  <Link href={`/corporate-housing/occupants/${o.id}`} className="hover:underline">
                    {pickLocalized(locale, o.fullNameAr, o.fullName)}
                  </Link>
                </td>
                <td className="px-4 py-3 text-slate-500">{o.corporateAccount.displayName}</td>
                <td className="px-4 py-3 text-slate-500">{t.corporateOccupantStatus[o.status]}</td>
                <td className="px-4 py-3 text-slate-500">{o.allocations[0]?.unit.unitNumber ?? t.corporateHousing.noCurrentAllocation}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={5} className="px-5 py-8 text-center text-slate-400">
                  {t.corporateHousing.emptyOccupants}
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
