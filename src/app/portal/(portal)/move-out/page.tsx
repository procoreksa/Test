import { getTenantContracts } from "@/lib/actions/portal/tenancy";
import { getTenantMoveOut } from "@/lib/actions/portal/move-out";
import { getLocale, getDictionary, longDateFormatter, pickLocalized } from "@/lib/i18n";

export default async function TenantMoveOutPage() {
  const { current, historical } = await getTenantContracts();
  const contractId = current?.id ?? historical[0]?.id;
  const [moveOut, locale] = await Promise.all([contractId ? getTenantMoveOut(contractId) : Promise.resolve(null), getLocale()]);
  const t = getDictionary(locale);
  const dateFmt = longDateFormatter(locale);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-slate-900">{t.tenantPortal.moveOutTitle}</h1>
      <p className="text-xs text-slate-400">{t.tenantPortal.findingsNoticeTenant}</p>

      {!moveOut ? (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 text-center text-slate-500">{t.tenantPortal.noMoveOutYet}</div>
      ) : (
        <>
          <section className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
            <dl className="grid grid-cols-2 gap-y-2 text-sm">
              <dt className="text-slate-500">{t.moveOut.fieldMoveOutNumber}</dt>
              <dd className="text-slate-800 font-medium">{moveOut.moveOutNumber}</dd>
              <dt className="text-slate-500">{t.tenantPortal.fieldStatus}</dt>
              <dd className="text-slate-800 font-medium">{t.moveOutStatus[moveOut.status]}</dd>
              {moveOut.vacateDate && (
                <>
                  <dt className="text-slate-500">{t.moveOut.fieldVacateDate}</dt>
                  <dd className="text-slate-800 font-medium">{dateFmt.format(moveOut.vacateDate)}</dd>
                </>
              )}
            </dl>
            {moveOut.tenantComments && <p className="text-sm text-slate-600 mt-4 border-t border-slate-100 pt-4">{moveOut.tenantComments}</p>}
          </section>

          <section className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
            <h2 className="font-semibold text-slate-800 mb-3">{t.moveOut.sectionChecklist}</h2>
            <div className="space-y-2">
              {moveOut.inspectionItems.map((item) => (
                <div key={item.id} className="flex items-center justify-between bg-slate-50 rounded-lg px-3 py-2 text-sm">
                  <span className="text-slate-700">{pickLocalized(locale, item.itemNameAr, item.itemName)}</span>
                  <span className="text-slate-500">{item.condition ? t.conditionRating[item.condition] : "—"}</span>
                </div>
              ))}
              {moveOut.inspectionItems.length === 0 && <p className="text-sm text-slate-400">—</p>}
            </div>
          </section>
        </>
      )}
    </div>
  );
}
