import Link from "next/link";
import { redirect } from "next/navigation";
import { listEligibleContractsForMoveIn, createMoveIn } from "@/lib/actions/move-ins";
import { getLocale, getDictionary, pickLocalized } from "@/lib/i18n";
import { unitLocationLabel } from "@/lib/unit-location";

async function createMoveInAndRedirect(formData: FormData) {
  "use server";
  const moveInId = await createMoveIn(formData);
  redirect(`/operations/move-ins/${moveInId}`);
}

export default async function NewMoveInPage({
  searchParams,
}: {
  searchParams: Promise<{ contractId?: string; q?: string }>;
}) {
  const { contractId, q } = await searchParams;
  const [contracts, locale] = await Promise.all([listEligibleContractsForMoveIn(q), getLocale()]);
  const t = getDictionary(locale);
  const preselected = contractId ? contracts.find((c) => c.id === contractId) : undefined;

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <Link href="/operations/move-ins" className="text-brand-gold-dark hover:underline text-sm">
          ← {t.moveIn.listTitle}
        </Link>
        <h1 className="text-2xl font-bold text-slate-900 mt-2">{t.moveIn.newTitle}</h1>
      </div>

      <form method="get" className="flex gap-2">
        <input name="q" defaultValue={q} placeholder={t.moveIn.contractSearchPlaceholder} className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm" />
        <button className="bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg px-4 py-2 text-sm font-medium">{t.moveIn.filterApply}</button>
      </form>

      <form action={createMoveInAndRedirect} className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 space-y-4">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">{t.moveIn.selectContract}</label>
          <select name="contractId" required defaultValue={preselected?.id ?? ""} className="w-full rounded-lg border border-slate-300 px-3 py-2">
            <option value="" disabled>
              {t.moveIn.selectContract}
            </option>
            {contracts.map((c) => (
              <option key={c.id} value={c.id}>
                {c.contractNumber} — {pickLocalized(locale, c.renter.fullNameAr, c.renter.fullName)} — {c.unit.unitNumber} ({unitLocationLabel(locale, c.unit)})
              </option>
            ))}
          </select>
          {contracts.length === 0 && <p className="text-xs text-slate-400 mt-1">{t.moveIn.noEligibleContracts}</p>}
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">{t.moveIn.scheduledAtLabel}</label>
          <input type="datetime-local" name="scheduledAt" className="w-full rounded-lg border border-slate-300 px-3 py-2" />
        </div>

        <label className="flex items-center gap-2 text-sm text-slate-600">
          <input type="checkbox" name="isFurnished" className="rounded border-slate-300" />
          {t.moveIn.isFurnishedLabel}
        </label>

        <button className="bg-brand-gold hover:bg-brand-gold-dark text-brand-black rounded-lg px-5 py-2.5 font-semibold" disabled={contracts.length === 0}>
          {t.moveIn.createButton}
        </button>
      </form>
    </div>
  );
}
