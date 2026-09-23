import { getTenantContracts } from "@/lib/actions/portal/tenancy";
import { getTenantMoveIn } from "@/lib/actions/portal/move-in";
import { getLocale, getDictionary, longDateFormatter, pickLocalized } from "@/lib/i18n";

export default async function TenantMoveInPage() {
  const { current } = await getTenantContracts();
  const [moveIn, locale] = await Promise.all([current ? getTenantMoveIn(current.id) : Promise.resolve(null), getLocale()]);
  const t = getDictionary(locale);
  const dateFmt = longDateFormatter(locale);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-slate-900">{t.tenantPortal.moveInTitle}</h1>

      {!moveIn ? (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 text-center text-slate-500">{t.tenantPortal.noMoveInYet}</div>
      ) : (
        <>
          <section className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
            <dl className="grid grid-cols-2 gap-y-2 text-sm">
              <dt className="text-slate-500">{t.moveIn.fieldMoveInNumber}</dt>
              <dd className="text-slate-800 font-medium">{moveIn.moveInNumber}</dd>
              <dt className="text-slate-500">{t.tenantPortal.fieldStatus}</dt>
              <dd className="text-slate-800 font-medium">{t.moveInStatus[moveIn.status]}</dd>
              {moveIn.handoverDate && (
                <>
                  <dt className="text-slate-500">{t.moveIn.fieldHandoverDate}</dt>
                  <dd className="text-slate-800 font-medium">{dateFmt.format(moveIn.handoverDate)}</dd>
                </>
              )}
              <dt className="text-slate-500">{t.tenantPortal.moveInAcknowledgedLabel}</dt>
              <dd className="text-slate-800 font-medium">{moveIn.tenantAcknowledgedAt ? dateFmt.format(moveIn.tenantAcknowledgedAt) : t.common.no}</dd>
            </dl>
            {moveIn.tenantComments && <p className="text-sm text-slate-600 mt-4 border-t border-slate-100 pt-4">{moveIn.tenantComments}</p>}
          </section>

          <section className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
            <h2 className="font-semibold text-slate-800 mb-3">{t.moveIn.sectionChecklist}</h2>
            <div className="space-y-2">
              {moveIn.inspectionItems.map((item) => (
                <div key={item.id} className="flex items-center justify-between bg-slate-50 rounded-lg px-3 py-2 text-sm">
                  <span className="text-slate-700">{pickLocalized(locale, item.itemNameAr, item.itemName)}</span>
                  <span className="text-slate-500">{item.condition ? t.conditionRating[item.condition] : "—"}</span>
                </div>
              ))}
              {moveIn.inspectionItems.length === 0 && <p className="text-sm text-slate-400">—</p>}
            </div>
          </section>

          <section className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
            <h2 className="font-semibold text-slate-800 mb-3">{t.moveIn.sectionKeys}</h2>
            <ul className="text-sm space-y-1">
              {moveIn.keyItems.map((k) => (
                <li key={k.id} className="text-slate-600">
                  {t.keyType[k.keyType]} — {k.description} ({k.quantity})
                </li>
              ))}
              {moveIn.keyItems.length === 0 && <li className="text-slate-400">—</li>}
            </ul>
          </section>
        </>
      )}
    </div>
  );
}
