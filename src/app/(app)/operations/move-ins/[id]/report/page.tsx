import { getMoveInById } from "@/lib/actions/move-ins";
import { getOrganizationBranding } from "@/lib/actions/organization";
import { getLocale, getDictionary, longDateFormatter, longDateTimeFormatter, pickLocalized } from "@/lib/i18n";
import { unitLocationLabel } from "@/lib/unit-location";
import { PrintButton } from "@/components/print-button";
import type { InspectionCategory } from "@prisma/client";

export default async function MoveInReportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [{ moveIn, progress, defects }, org, locale] = await Promise.all([getMoveInById(id), getOrganizationBranding(), getLocale()]);
  const t = getDictionary(locale);
  const dateFmt = longDateFormatter(locale);
  const dateTimeFmt = longDateTimeFormatter(locale);

  const itemsByCategory = new Map<InspectionCategory, typeof moveIn.inspectionItems>();
  for (const item of moveIn.inspectionItems) {
    if (!item.isApplicable) continue;
    const arr = itemsByCategory.get(item.category) ?? [];
    arr.push(item);
    itemsByCategory.set(item.category, arr);
  }
  const flaggedItems = moveIn.inspectionItems.filter((i) => i.isApplicable && (i.requiresAttention || i.condition === "DAMAGED" || i.condition === "NOT_WORKING" || i.condition === "POOR"));

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div className="no-print flex justify-end">
        <PrintButton label={t.printButton} />
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-8 space-y-6">
        <div className="flex items-start justify-between border-b border-slate-200 pb-4">
          <div className="flex items-center gap-3">
            {org.logoUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={org.logoUrl} alt="" className="w-12 h-12 rounded-full object-cover" />
            )}
            <div>
              <p className="font-bold text-slate-900">{pickLocalized(locale, org.nameAr, org.name)}</p>
              <p className="text-xs text-slate-500">{t.moveIn.reportOrgLabel}</p>
            </div>
          </div>
          <div className="text-right">
            <h1 className="text-xl font-bold text-slate-900">{t.moveIn.reportTitle}</h1>
            <p className="text-sm text-slate-500">{t.moveIn.reportSubtitle(moveIn.moveInNumber)}</p>
          </div>
        </div>

        <dl className="grid grid-cols-2 gap-y-2 text-sm">
          <dt className="text-slate-500">{t.moveIn.reportContractLabel}</dt>
          <dd className="text-slate-800 font-medium">{moveIn.contract.contractNumber}</dd>
          <dt className="text-slate-500">{t.moveIn.fieldRenter}</dt>
          <dd className="text-slate-800 font-medium">{pickLocalized(locale, moveIn.renter.fullNameAr, moveIn.renter.fullName)}</dd>
          <dt className="text-slate-500">{t.moveIn.fieldUnit}</dt>
          <dd className="text-slate-800 font-medium">
            {moveIn.unit.unitNumber} — {unitLocationLabel(locale, moveIn.unit)}
          </dd>
          <dt className="text-slate-500">{t.moveIn.reportLeaseDatesLabel}</dt>
          <dd className="text-slate-800 font-medium">
            {dateFmt.format(moveIn.contract.startDate)} – {dateFmt.format(moveIn.contract.endDate)}
          </dd>
          <dt className="text-slate-500">{t.moveIn.fieldHandoverDate}</dt>
          <dd className="text-slate-800 font-medium">{moveIn.handoverDate ? dateFmt.format(moveIn.handoverDate) : t.moveIn.notSet}</dd>
          <dt className="text-slate-500">{t.moveIn.fieldIsFurnished}</dt>
          <dd className="text-slate-800 font-medium">{moveIn.isFurnished ? t.common.yes : t.common.no}</dd>
        </dl>

        <div>
          <h2 className="font-semibold text-slate-800 mb-2 border-b border-slate-100 pb-1">{t.moveIn.reportChecklistSummary}</h2>
          <p className="text-sm text-slate-600 mb-3">{t.moveIn.progressLabel(progress.completed, progress.total, progress.percent)}</p>
          {Array.from(itemsByCategory.entries()).map(([category, items]) => (
            <div key={category} className="mb-3">
              <h3 className="text-sm font-semibold text-slate-700">{t.inspectionCategory[category]}</h3>
              <table className="w-full text-xs mt-1">
                <tbody className="divide-y divide-slate-100">
                  {items.map((item) => (
                    <tr key={item.id}>
                      <td className="py-1 text-slate-700">{pickLocalized(locale, item.itemNameAr, item.itemName)}</td>
                      <td className="py-1 text-slate-600">{item.condition ? t.conditionRating[item.condition] : "—"}</td>
                      <td className="py-1 text-slate-500">{item.notes ?? ""}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </div>

        <div>
          <h2 className="font-semibold text-slate-800 mb-2 border-b border-slate-100 pb-1">{t.moveIn.reportDefectsSection}</h2>
          <p className="text-xs text-slate-500 mb-2">
            {t.moveIn.defectRequiresAttention}: {defects.requiresAttentionCount} · {t.moveIn.defectDamaged}: {defects.damagedCount} · {t.moveIn.defectNotWorking}: {defects.notWorkingCount} ·{" "}
            {t.moveIn.defectPoor}: {defects.poorCount}
          </p>
          {flaggedItems.length > 0 ? (
            <ul className="text-sm list-disc ps-5 space-y-0.5">
              {flaggedItems.map((item) => (
                <li key={item.id}>
                  {pickLocalized(locale, item.itemNameAr, item.itemName)} — {item.condition ? t.conditionRating[item.condition] : ""} {item.notes ? `(${item.notes})` : ""}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-slate-500">{t.moveIn.reportNoDefects}</p>
          )}
        </div>

        <div>
          <h2 className="font-semibold text-slate-800 mb-2 border-b border-slate-100 pb-1">{t.moveIn.sectionInventory}</h2>
          <table className="w-full text-xs">
            <tbody className="divide-y divide-slate-100">
              {moveIn.inventoryItems.map((inv) => (
                <tr key={inv.id}>
                  <td className="py-1 text-slate-700">
                    {t.inspectionCategory[inv.category]} — {inv.itemName}
                  </td>
                  <td className="py-1 text-slate-600">{t.moveIn.inventoryQuantityLabel}: {inv.quantity}</td>
                  <td className="py-1 text-slate-500">{inv.condition ? t.conditionRating[inv.condition] : ""}</td>
                </tr>
              ))}
              {moveIn.inventoryItems.length === 0 && (
                <tr>
                  <td className="py-1 text-slate-400">{t.moveIn.inventoryEmpty}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div>
          <h2 className="font-semibold text-slate-800 mb-2 border-b border-slate-100 pb-1">{t.moveIn.sectionMeters}</h2>
          <table className="w-full text-xs">
            <tbody className="divide-y divide-slate-100">
              {moveIn.meterReadings.map((m) => (
                <tr key={m.id}>
                  <td className="py-1 text-slate-700">{t.meterType[m.meterType]}</td>
                  <td className="py-1 text-slate-600">{String(m.reading)} {m.unitOfMeasure ?? ""}</td>
                  <td className="py-1 text-slate-500">{m.meterNumber ?? ""}</td>
                </tr>
              ))}
              {moveIn.meterReadings.length === 0 && (
                <tr>
                  <td className="py-1 text-slate-400">{t.moveIn.meterEmpty}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div>
          <h2 className="font-semibold text-slate-800 mb-2 border-b border-slate-100 pb-1">{t.moveIn.sectionKeys}</h2>
          {moveIn.noKeysToRecord ? (
            <p className="text-sm text-slate-500">{t.moveIn.noKeysToRecordLabel}</p>
          ) : (
            <table className="w-full text-xs">
              <tbody className="divide-y divide-slate-100">
                {moveIn.keyItems.map((k) => (
                  <tr key={k.id}>
                    <td className="py-1 text-slate-700">{t.keyType[k.keyType]} — {k.description}</td>
                    <td className="py-1 text-slate-600">{t.moveIn.keyQuantityLabel}: {k.quantity}</td>
                  </tr>
                ))}
                {moveIn.keyItems.length === 0 && (
                  <tr>
                    <td className="py-1 text-slate-400">{t.moveIn.keyEmpty}</td>
                  </tr>
                )}
              </tbody>
            </table>
          )}
        </div>

        {moveIn.tenantComments && (
          <div>
            <h2 className="font-semibold text-slate-800 mb-2 border-b border-slate-100 pb-1">{t.moveIn.fieldTenantComments}</h2>
            <p className="text-sm text-slate-700">{moveIn.tenantComments}</p>
          </div>
        )}

        <div>
          <h2 className="font-semibold text-slate-800 mb-2 border-b border-slate-100 pb-1">{t.moveIn.reportAcknowledgementSection}</h2>
          <div className="grid grid-cols-2 gap-4 text-sm mt-2">
            <div>
              <p className="text-slate-500">{t.moveIn.tenantRepresentativeNameLabel}</p>
              <p className="font-medium text-slate-800">{moveIn.tenantRepresentativeName ?? "—"}</p>
              <p className="text-slate-500 mt-2">{t.moveIn.tenantAcknowledgedAtLabel}</p>
              <p className="font-medium text-slate-800">
                {moveIn.tenantAcknowledgedAt ? dateTimeFmt.format(moveIn.tenantAcknowledgedAt) : moveIn.tenantAcknowledgementOverride ? t.moveIn.overrideLabel : "—"}
              </p>
            </div>
            <div>
              <p className="text-slate-500">{t.moveIn.fieldHandedOverBy}</p>
              <p className="font-medium text-slate-800">{moveIn.handedOverByUser?.name ?? "—"}</p>
              <p className="text-slate-500 mt-2">{t.moveIn.staffAcknowledgedAtLabel}</p>
              <p className="font-medium text-slate-800">{moveIn.staffAcknowledgedAt ? dateTimeFmt.format(moveIn.staffAcknowledgedAt) : "—"}</p>
            </div>
          </div>
          <p className="text-xs text-slate-400 mt-3">{t.moveIn.reportNotLegalSignatureNotice}</p>
        </div>

        <p className="text-xs text-slate-400 text-center border-t border-slate-100 pt-3">
          {t.moveIn.reportPrintedOn} {dateTimeFmt.format(new Date())}
        </p>
      </div>
    </div>
  );
}
