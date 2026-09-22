import Link from "next/link";
import { listOwners } from "@/lib/actions/owners";
import { createOwnership, endOwnership, getEffectiveOwnersForAsset, listOwnershipForAsset } from "@/lib/actions/ownership";
import { allocateToOwnersAction } from "@/lib/actions/owner-ledger";
import { getCurrentUserRole } from "@/lib/session";
import { can } from "@/lib/permissions";
import { getLocale, getDictionary, pickLocalized } from "@/lib/i18n";
import type { AssetLevel } from "@/lib/ownership";

/**
 * Shared ownership-management screen mounted at /compounds/[id]/ownership,
 * /buildings/[id]/ownership, and /units/[id]/ownership - one implementation
 * for all three asset levels (see docs/OWNERSHIP-ACCOUNTING.md).
 */
export async function OwnershipManager({
  level,
  assetId,
  assetLabel,
  backHref,
  backLabel,
}: {
  level: AssetLevel;
  assetId: string;
  assetLabel: string;
  backHref: string;
  backLabel: string;
}) {
  const [effectiveOwners, history, owners, locale, role] = await Promise.all([
    getEffectiveOwnersForAsset(level, assetId),
    listOwnershipForAsset(level, assetId),
    listOwners(),
    getLocale(),
    getCurrentUserRole(),
  ]);
  const t = getDictionary(locale);
  const canManage = can("ownership.manage", role);
  const canPostLedger = can("ownerLedger.create", role);

  const activeForThisAsset = history.filter((h) => h.status === "ACTIVE");
  const activeTotal = activeForThisAsset.reduce((sum, h) => sum + Number(h.ownershipPercentage), 0);
  const inheritedSourceLevel = effectiveOwners.length > 0 && effectiveOwners[0].sourceLevel !== level ? effectiveOwners[0].sourceLevel : null;

  return (
    <div className="space-y-6">
      <div>
        <Link href={backHref} className="text-brand-gold-dark hover:underline text-sm">
          {backLabel}
        </Link>
        <h1 className="text-2xl font-bold text-slate-900 mt-2">{t.ownership.title}</h1>
        <p className="text-slate-500 text-sm mt-1">
          {assetLabel} — {t.ownership.subtitle}
        </p>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
        <h2 className="font-semibold text-slate-800 mb-4">{t.ownership.effectiveOwnersTitle}</h2>
        {effectiveOwners.length === 0 ? (
          <p className="text-sm text-slate-400">{t.ownership.noEffectiveOwners}</p>
        ) : (
          <>
            {inheritedSourceLevel === "COMPOUND" && <p className="text-xs text-slate-400 mb-3">{t.ownership.inheritedFromCompound}</p>}
            {inheritedSourceLevel === "BUILDING" && <p className="text-xs text-slate-400 mb-3">{t.ownership.inheritedFromBuilding}</p>}
            <table className="w-full text-sm">
              <thead className="text-slate-500 text-right">
                <tr>
                  <th className="py-1 font-medium">{t.ownership.colOwner}</th>
                  <th className="py-1 font-medium">{t.ownership.colPercentage}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {effectiveOwners.map((o) => (
                  <tr key={o.ownerId}>
                    <td className="py-2">
                      <Link href={`/owners/${o.ownerId}`} className="text-brand-gold-dark hover:underline">
                        {pickLocalized(locale, o.ownerNameAr, o.ownerName)}
                      </Link>
                    </td>
                    <td className="py-2 font-medium">{Number(o.ownershipPercentage).toFixed(2)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
      </div>

      {canManage && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
          <h2 className="font-semibold text-slate-800 mb-1">{t.ownership.addOwner}</h2>
          <p className="text-xs text-slate-400 mb-4">{t.ownership.activeTotalLabel(activeTotal.toFixed(2))}</p>
          {activeTotal < 100 && activeForThisAsset.length > 0 && (
            <p className="text-xs text-amber-600 mb-4">{t.ownership.activeTotalUnder100}</p>
          )}
          <form action={createOwnership} className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <input type="hidden" name="assetLevel" value={level} />
            <input type="hidden" name="assetId" value={assetId} />
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">{t.ownership.fieldOwner}</label>
              <select name="ownerId" required className="w-full rounded-lg border border-slate-300 px-3 py-2">
                {owners.map((o) => (
                  <option key={o.id} value={o.id}>
                    {pickLocalized(locale, o.nameAr, o.name)}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">{t.ownership.fieldPercentage}</label>
              <input
                name="ownershipPercentage"
                type="number"
                step="0.01"
                min="0.01"
                max="100"
                required
                className="w-full rounded-lg border border-slate-300 px-3 py-2"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">{t.ownership.fieldEffectiveFrom}</label>
              <input
                name="effectiveFrom"
                type="date"
                defaultValue={new Date().toISOString().slice(0, 10)}
                required
                className="w-full rounded-lg border border-slate-300 px-3 py-2"
              />
            </div>
            <div className="flex items-end">
              <button className="w-full bg-brand-gold hover:bg-brand-gold-dark text-brand-black rounded-lg px-4 py-2 font-semibold">
                {t.ownership.save}
              </button>
            </div>
            <div className="md:col-span-4">
              <label className="block text-sm font-medium text-slate-700 mb-1">{t.ownership.fieldNotes}</label>
              <input name="notes" className="w-full rounded-lg border border-slate-300 px-3 py-2" />
            </div>
          </form>
        </div>
      )}

      {canPostLedger && effectiveOwners.length > 0 && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
          <h2 className="font-semibold text-slate-800 mb-4">{t.ownerLedger.allocateTitle}</h2>
          <form
            action={async (formData: FormData) => {
              "use server";
              await allocateToOwnersAction(formData);
            }}
            className="grid grid-cols-1 md:grid-cols-4 gap-4"
          >
            <input type="hidden" name="assetLevel" value={level} />
            <input type="hidden" name="assetId" value={assetId} />
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">{t.ownerLedger.fieldEntryType}</label>
              <select name="entryType" className="w-full rounded-lg border border-slate-300 px-3 py-2">
                {(
                  [
                    "RENT_INCOME",
                    "OTHER_INCOME",
                    "MANAGEMENT_FEE",
                    "MAINTENANCE_EXPENSE",
                    "UTILITY_EXPENSE",
                    "SERVICE_EXPENSE",
                    "GOVERNMENT_FEE",
                    "OTHER_EXPENSE",
                  ] as const
                ).map((value) => (
                  <option key={value} value={value}>
                    {t.ownerLedgerEntryType[value]}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">{t.ownerLedger.fieldAmount}</label>
              <input name="amount" type="number" step="0.01" min="0.01" required className="w-full rounded-lg border border-slate-300 px-3 py-2" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">{t.ownerLedger.fieldEntryDate}</label>
              <input
                name="entryDate"
                type="date"
                defaultValue={new Date().toISOString().slice(0, 10)}
                required
                className="w-full rounded-lg border border-slate-300 px-3 py-2"
              />
            </div>
            <div className="flex items-end">
              <button className="w-full bg-brand-gold hover:bg-brand-gold-dark text-brand-black rounded-lg px-4 py-2 font-semibold">
                {t.ownerLedger.allocateSubmit}
              </button>
            </div>
            <div className="md:col-span-4">
              <label className="block text-sm font-medium text-slate-700 mb-1">{t.ownerLedger.fieldDescription}</label>
              <input name="description" required className="w-full rounded-lg border border-slate-300 px-3 py-2" />
            </div>
          </form>
        </div>
      )}

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-5 pt-4">
          <h2 className="font-semibold text-slate-800">{t.ownership.historyTitle}</h2>
        </div>
        <table className="w-full text-sm mt-2">
          <thead className="bg-slate-50 text-slate-500 text-right">
            <tr>
              <th className="px-5 py-3 font-medium">{t.ownership.colOwner}</th>
              <th className="px-5 py-3 font-medium">{t.ownership.colPercentage}</th>
              <th className="px-5 py-3 font-medium">{t.ownership.colEffectiveFrom}</th>
              <th className="px-5 py-3 font-medium">{t.ownership.colEffectiveTo}</th>
              <th className="px-5 py-3 font-medium">{t.ownership.colStatus}</th>
              <th className="px-5 py-3 font-medium"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {history.map((h) => (
              <tr key={h.id}>
                <td className="px-5 py-3">
                  <Link href={`/owners/${h.owner.id}`} className="text-brand-gold-dark hover:underline">
                    {pickLocalized(locale, h.owner.nameAr, h.owner.name)}
                  </Link>
                </td>
                <td className="px-5 py-3 font-medium">{Number(h.ownershipPercentage).toFixed(2)}%</td>
                <td className="px-5 py-3 text-slate-500">{new Date(h.effectiveFrom).toLocaleDateString(locale === "ar" ? "ar-SA" : "en-US")}</td>
                <td className="px-5 py-3 text-slate-500">
                  {h.effectiveTo ? new Date(h.effectiveTo).toLocaleDateString(locale === "ar" ? "ar-SA" : "en-US") : "—"}
                </td>
                <td className="px-5 py-3">
                  <span
                    className={`px-2 py-1 rounded-full text-xs font-medium ${h.status === "ACTIVE" ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-400"}`}
                  >
                    {t.ownershipStatus[h.status]}
                  </span>
                </td>
                <td className="px-5 py-3 text-left">
                  {canManage && h.status === "ACTIVE" && (
                    <form
                      action={async () => {
                        "use server";
                        await endOwnership(h.id);
                      }}
                    >
                      <button className="text-red-500 hover:underline text-xs">{t.ownership.endOwnership}</button>
                    </form>
                  )}
                </td>
              </tr>
            ))}
            {history.length === 0 && (
              <tr>
                <td colSpan={6} className="px-5 py-8 text-center text-slate-400">
                  {t.ownership.empty}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
