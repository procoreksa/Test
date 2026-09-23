import { getMoveOutById } from "@/lib/actions/move-outs";
import { getOrganizationBranding } from "@/lib/actions/organization";
import { computeConditionComparisonLabel } from "@/lib/operations/move-out-rules";
import { getLocale, getDictionary, longDateFormatter, longDateTimeFormatter, pickLocalized } from "@/lib/i18n";
import { unitLocationLabel } from "@/lib/unit-location";
import { PrintButton } from "@/components/print-button";
import type { InspectionCategory } from "@prisma/client";

export default async function MoveOutReportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [{ moveOut, defects, baselineMoveIn, inventoryDiff, meterConsumption, keyReconciliation }, org, locale] = await Promise.all([
    getMoveOutById(id),
    getOrganizationBranding(),
    getLocale(),
  ]);
  const t = getDictionary(locale);
  const dateFmt = longDateFormatter(locale);
  const dateTimeFmt = longDateTimeFormatter(locale);

  const itemsByCategory = new Map<InspectionCategory, typeof moveOut.inspectionItems>();
  for (const item of moveOut.inspectionItems) {
    if (!item.isApplicable) continue;
    const arr = itemsByCategory.get(item.category) ?? [];
    arr.push(item);
    itemsByCategory.set(item.category, arr);
  }

  const flaggedItems = moveOut.inspectionItems.filter((i) => i.isApplicable && (i.requiresAttention || i.condition === "DAMAGED" || i.condition === "NOT_WORKING" || i.condition === "POOR"));
  const linkedMaintenanceRequests = moveOut.maintenanceRequests;

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
              <p className="text-xs text-slate-500">{t.moveOut.reportOrgLabel}</p>
            </div>
          </div>
          <div className="text-right">
            <h1 className="text-xl font-bold text-slate-900">{t.moveOut.reportTitle}</h1>
            <p className="text-sm text-slate-500">{t.moveOut.reportSubtitle(moveOut.moveOutNumber)}</p>
          </div>
        </div>

        <dl className="grid grid-cols-2 gap-y-2 text-sm">
          <dt className="text-slate-500">{t.moveOut.reportContractLabel}</dt>
          <dd className="text-slate-800 font-medium">{moveOut.contract.contractNumber}</dd>
          <dt className="text-slate-500">{t.moveOut.fieldRenter}</dt>
          <dd className="text-slate-800 font-medium">{pickLocalized(locale, moveOut.renter.fullNameAr, moveOut.renter.fullName)}</dd>
          <dt className="text-slate-500">{t.moveOut.fieldUnit}</dt>
          <dd className="text-slate-800 font-medium">
            {moveOut.unit.unitNumber} — {unitLocationLabel(locale, moveOut.unit)}
          </dd>
          <dt className="text-slate-500">{t.moveOut.reportLeaseDatesLabel}</dt>
          <dd className="text-slate-800 font-medium">
            {dateFmt.format(moveOut.contract.startDate)} – {dateFmt.format(moveOut.contract.endDate)}
          </dd>
          <dt className="text-slate-500">{t.moveIn.fieldHandoverDate}</dt>
          <dd className="text-slate-800 font-medium">{baselineMoveIn?.handoverDate ? dateFmt.format(baselineMoveIn.handoverDate) : t.moveOut.notSet}</dd>
          <dt className="text-slate-500">{t.moveOut.fieldVacateDate}</dt>
          <dd className="text-slate-800 font-medium">{moveOut.vacateDate ? dateFmt.format(moveOut.vacateDate) : t.moveOut.notSet}</dd>
          <dt className="text-slate-500">{t.moveOut.reportInspectionDateLabel}</dt>
          <dd className="text-slate-800 font-medium">{moveOut.startedAt ? dateFmt.format(moveOut.startedAt) : t.moveOut.notSet}</dd>
          <dt className="text-slate-500">{t.moveOut.fieldInspector}</dt>
          <dd className="text-slate-800 font-medium">{moveOut.inspectedByUser?.name ?? t.moveOut.notSet}</dd>
          <dt className="text-slate-500">{t.moveOut.colStatus}</dt>
          <dd className="text-slate-800 font-medium">{t.moveOutStatus[moveOut.status]}</dd>
        </dl>

        <div>
          <h2 className="font-semibold text-slate-800 mb-2 border-b border-slate-100 pb-1">{t.moveOut.reportConditionComparisonSection}</h2>
          {Array.from(itemsByCategory.entries()).map(([category, items]) => (
            <div key={category} className="mb-3">
              <h3 className="text-sm font-semibold text-slate-700">{t.inspectionCategory[category]}</h3>
              <table className="w-full text-xs mt-1">
                <thead>
                  <tr className="text-slate-500 text-right">
                    <th className="py-1 font-medium">{t.moveOut.inventoryItemNameLabel}</th>
                    <th className="py-1 font-medium">{t.moveOut.moveInConditionLabel}</th>
                    <th className="py-1 font-medium">{t.moveOut.moveOutConditionLabel}</th>
                    <th className="py-1 font-medium">{t.moveOut.conditionChangeLabel}</th>
                    <th className="py-1 font-medium">{t.moveOut.requiresAttentionLabel}</th>
                    <th className="py-1 font-medium">{t.moveOut.notesLabel}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {items.map((item) => {
                    const baselineCondition = item.moveInInspectionItem?.condition ?? null;
                    const comparison = computeConditionComparisonLabel(baselineCondition, item.condition);
                    return (
                      <tr key={item.id}>
                        <td className="py-1 text-slate-700">{pickLocalized(locale, item.itemNameAr, item.itemName)}</td>
                        <td className="py-1 text-slate-600">{baselineCondition ? t.conditionRating[baselineCondition] : "—"}</td>
                        <td className="py-1 text-slate-600">{item.condition ? t.conditionRating[item.condition] : "—"}</td>
                        <td className="py-1 text-slate-600">{t.conditionComparison[comparison]}</td>
                        <td className="py-1 text-slate-600">{item.requiresAttention ? t.common.yes : t.common.no}</td>
                        <td className="py-1 text-slate-500">{item.notes ?? ""}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ))}
        </div>

        <div>
          <h2 className="font-semibold text-slate-800 mb-2 border-b border-slate-100 pb-1">{t.moveOut.sectionInventory}</h2>
          <table className="w-full text-xs">
            <thead>
              <tr className="text-slate-500 text-right">
                <th className="py-1 font-medium">{t.moveOut.inventoryCategoryLabel}</th>
                <th className="py-1 font-medium">{t.moveOut.inventoryItemNameLabel}</th>
                <th className="py-1 font-medium">{t.moveOut.inventoryMoveInQtyLabel}</th>
                <th className="py-1 font-medium">{t.moveOut.inventoryMoveOutQtyLabel}</th>
                <th className="py-1 font-medium">{t.moveOut.conditionChangeLabel}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {inventoryDiff.map((line, i) => (
                <tr key={i}>
                  <td className="py-1 text-slate-700">
                    {t.inspectionCategory[line.category]} — {line.itemName}
                  </td>
                  <td className="py-1 text-slate-600">{line.moveInQuantity ?? "—"}</td>
                  <td className="py-1 text-slate-600">{line.moveOutQuantity ?? "—"}</td>
                  <td className="py-1 text-slate-500">{t.inventoryDiffStatus[line.status]}</td>
                </tr>
              ))}
              {inventoryDiff.length === 0 && (
                <tr>
                  <td className="py-1 text-slate-400" colSpan={5}>
                    {t.moveOut.inventoryEmpty}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div>
          <h2 className="font-semibold text-slate-800 mb-2 border-b border-slate-100 pb-1">{t.moveOut.sectionMeters}</h2>
          <table className="w-full text-xs">
            <tbody className="divide-y divide-slate-100">
              {meterConsumption.map((m, i) => (
                <tr key={i}>
                  <td className="py-1 text-slate-700">{t.meterType[m.meterType]}</td>
                  <td className="py-1 text-slate-600">
                    {t.moveOut.meterMoveInReadingLabel}: {m.moveInReading ?? "—"}
                  </td>
                  <td className="py-1 text-slate-600">
                    {t.moveOut.meterMoveOutReadingLabel}: {m.moveOutReading ?? "—"}
                  </td>
                  <td className="py-1 text-slate-500">
                    {t.moveOut.meterDifferenceLabel}: {m.consumption ?? "—"}
                  </td>
                </tr>
              ))}
              {meterConsumption.length === 0 && (
                <tr>
                  <td className="py-1 text-slate-400">{t.moveOut.meterEmpty}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div>
          <h2 className="font-semibold text-slate-800 mb-2 border-b border-slate-100 pb-1">{t.moveOut.sectionKeys}</h2>
          {moveOut.noKeysToReturn ? (
            <p className="text-sm text-slate-500">{t.moveOut.noKeysToReturnLabel}</p>
          ) : (
            <table className="w-full text-xs">
              <tbody className="divide-y divide-slate-100">
                {keyReconciliation.lines.map((k, i) => (
                  <tr key={i}>
                    <td className="py-1 text-slate-700">
                      {t.keyType[k.keyType]} — {k.description}
                    </td>
                    <td className="py-1 text-slate-600">
                      {t.moveOut.keyIssuedLabel}: {k.expectedQuantity} · {t.moveOut.keyReturnedLabel}: {k.returnedQuantity}
                    </td>
                    <td className="py-1 text-slate-500">{k.fullyReturned ? t.moveOut.keyFullyReturnedLabel : ""}</td>
                  </tr>
                ))}
                {keyReconciliation.lines.length === 0 && (
                  <tr>
                    <td className="py-1 text-slate-400">{t.moveOut.keyEmpty}</td>
                  </tr>
                )}
              </tbody>
            </table>
          )}
        </div>

        <div>
          <h2 className="font-semibold text-slate-800 mb-2 border-b border-slate-100 pb-1">{t.moveOut.reportFindingsSummarySection}</h2>
          <p className="text-xs text-slate-500 mb-2">
            {t.moveOut.findingsRequiresAttention}: {defects.requiresAttentionCount} · {t.moveOut.findingsDamaged}: {defects.damagedCount} · {t.moveOut.findingsNotWorking}: {defects.notWorkingCount} ·{" "}
            {t.moveOut.findingsPoor}: {defects.poorCount}
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
            <p className="text-sm text-slate-500">{t.moveOut.reportNoFindings}</p>
          )}
        </div>

        <div>
          <h2 className="font-semibold text-slate-800 mb-2 border-b border-slate-100 pb-1">{t.moveOut.reportMaintenanceSection}</h2>
          {linkedMaintenanceRequests.length > 0 ? (
            <ul className="text-sm list-disc ps-5 space-y-0.5">
              {linkedMaintenanceRequests.map((r) => (
                <li key={r.id}>
                  {r.requestNumber} — {r.title} ({t.maintenanceRequestStatus[r.status]})
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-slate-500">{t.moveOut.maintenanceEmpty}</p>
          )}
        </div>

        {moveOut.tenantComments && (
          <div>
            <h2 className="font-semibold text-slate-800 mb-2 border-b border-slate-100 pb-1">{t.moveOut.fieldTenantComments}</h2>
            <p className="text-sm text-slate-700">{moveOut.tenantComments}</p>
          </div>
        )}

        <div>
          <h2 className="font-semibold text-slate-800 mb-2 border-b border-slate-100 pb-1">{t.moveOut.reportAcknowledgementSection}</h2>
          <div className="grid grid-cols-2 gap-4 text-sm mt-2">
            <div>
              <p className="text-slate-500">{t.moveOut.tenantRepresentativeNameLabel}</p>
              <p className="font-medium text-slate-800">{moveOut.tenantRepresentativeName ?? "—"}</p>
              <p className="text-slate-500 mt-2">{t.moveOut.tenantAcknowledgedAtLabel}</p>
              <p className="font-medium text-slate-800">
                {moveOut.tenantAcknowledgedAt ? dateTimeFmt.format(moveOut.tenantAcknowledgedAt) : moveOut.tenantAcknowledgementOverride ? t.moveOut.overrideLabel : "—"}
              </p>
            </div>
            <div>
              <p className="text-slate-500">{t.moveOut.fieldHandedOverBy}</p>
              <p className="font-medium text-slate-800">{moveOut.handedOverByUser?.name ?? "—"}</p>
              <p className="text-slate-500 mt-2">{t.moveOut.staffAcknowledgedAtLabel}</p>
              <p className="font-medium text-slate-800">{moveOut.staffAcknowledgedAt ? dateTimeFmt.format(moveOut.staffAcknowledgedAt) : "—"}</p>
            </div>
          </div>
          <p className="text-xs text-slate-400 mt-3">{t.moveOut.reportNotLegalSignatureNotice}</p>
        </div>

        <div className="border-t border-slate-200 pt-4">
          <p className="text-xs text-slate-500 leading-relaxed">{t.moveOut.reportDisclaimer}</p>
        </div>

        <p className="text-xs text-slate-400 text-center border-t border-slate-100 pt-3">
          {t.moveOut.reportPrintedOn} {dateTimeFmt.format(new Date())}
        </p>
      </div>
    </div>
  );
}
