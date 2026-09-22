import { redirect } from "next/navigation";
import { getOfferById, updateOfferDraft, getOfferEligibleUnitsTree, listOfferAssignableUsers } from "@/lib/actions/offers";
import { getLocale, getDictionary } from "@/lib/i18n";
import { OfferUnitPicker } from "@/components/offer-unit-picker";
import { OfferPricingForm } from "@/components/offer-pricing-form";
import { serializeUnitsTree } from "@/lib/crm/offer-unit-tree";

export default async function EditOfferPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const offer = await getOfferById(id);
  const [locale, agents, rawUnitsTree] = await Promise.all([getLocale(), listOfferAssignableUsers(), getOfferEligibleUnitsTree(offer.unitId)]);
  const unitsTree = serializeUnitsTree(rawUnitsTree);
  const t = getDictionary(locale);

  if (offer.status !== "DRAFT") {
    redirect(`/crm/offers/${id}`);
  }

  async function submit(formData: FormData) {
    "use server";
    formData.set("offerId", id);
    await updateOfferDraft(formData);
    redirect(`/crm/offers/${id}`);
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">{t.offer.editTitle}</h1>
        <p className="text-slate-500 text-sm mt-1">{t.offer.editSubtitle}</p>
      </div>

      <form action={submit} className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 grid grid-cols-1 md:grid-cols-2 gap-4">
        <input type="hidden" name="leadId" value={offer.leadId} />
        {offer.viewingId && <input type="hidden" name="viewingId" value={offer.viewingId} />}

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">{t.offer.fieldLead}</label>
          <p className="px-3 py-2 rounded-lg bg-slate-50 border border-slate-200 text-slate-700">{offer.lead.fullName}</p>
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">{t.offer.fieldAssignedAgent}</label>
          <select name="assignedToUserId" defaultValue={offer.assignedToUserId ?? ""} className="w-full rounded-lg border border-slate-300 px-3 py-2">
            <option value="">—</option>
            {agents.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">{t.offer.fieldFurnishedStatus}</label>
          <select name="furnishedStatus" defaultValue={offer.furnishedStatus} className="w-full rounded-lg border border-slate-300 px-3 py-2">
            {(Object.keys(t.furnishingPreference) as Array<keyof typeof t.furnishingPreference>).map((v) => (
              <option key={v} value={v}>
                {t.furnishingPreference[v]}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">{t.offer.fieldValidFrom}</label>
          <input type="date" name="validFrom" required defaultValue={offer.validFrom.toISOString().slice(0, 10)} className="w-full rounded-lg border border-slate-300 px-3 py-2" />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">{t.offer.fieldValidUntil}</label>
          <input type="date" name="validUntil" required defaultValue={offer.validUntil.toISOString().slice(0, 10)} className="w-full rounded-lg border border-slate-300 px-3 py-2" />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">{t.offer.fieldLeaseStartDate}</label>
          <input type="date" name="leaseStartDate" defaultValue={offer.leaseStartDate?.toISOString().slice(0, 10) ?? ""} className="w-full rounded-lg border border-slate-300 px-3 py-2" />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">{t.offer.fieldLeaseDurationMonths}</label>
          <input type="number" name="leaseDurationMonths" min={1} defaultValue={offer.leaseDurationMonths} className="w-full rounded-lg border border-slate-300 px-3 py-2" />
        </div>

        <div className="md:col-span-2">
          <h2 className="font-semibold text-slate-800 mb-3">{t.offer.fieldUnit}</h2>
          <OfferUnitPicker
            compounds={unitsTree}
            locale={locale}
            defaultUnitId={offer.unitId}
            labels={{ compound: t.offer.pickCompound, building: t.offer.pickBuilding, floor: t.offer.pickFloor, unit: t.offer.pickUnit }}
          />
        </div>

        <OfferPricingForm
          defaults={{
            annualRent: Number(offer.annualRent),
            discountAmount: Number(offer.discountAmount),
            discountPercentage: Number(offer.discountPercentage),
            securityDeposit: Number(offer.securityDeposit),
            contractFee: Number(offer.contractFee),
            leasingCommissionAmount: Number(offer.leasingCommissionAmount),
            leasingCommissionRate: offer.leasingCommissionRate ? Number(offer.leasingCommissionRate) : null,
            commissionVatRate: Number(offer.commissionVatRate),
            paymentFrequency: offer.paymentFrequency,
          }}
          paymentFrequencyOptions={(Object.keys(t.paymentFrequency) as Array<keyof typeof t.paymentFrequency>).map((v) => ({ value: v, label: t.paymentFrequency[v] }))}
          locale={locale}
          labels={{
            annualRent: t.offer.fieldAnnualRent,
            discountAmount: t.offer.fieldDiscountAmount,
            discountPercentage: t.offer.fieldDiscountPercentage,
            securityDeposit: t.offer.fieldSecurityDeposit,
            contractFee: t.offer.fieldContractFee,
            commissionAmount: t.offer.fieldCommissionAmount,
            commissionRate: t.offer.fieldCommissionRate,
            commissionVatRate: t.offer.fieldCommissionVatRate,
            paymentFrequency: t.offer.fieldPaymentFrequency,
            previewTitle: t.offer.previewTitle,
            previewGross: t.offer.previewGrossAnnualRent,
            previewDiscount: t.offer.previewDiscount,
            previewNet: t.offer.previewNetAnnualRent,
            previewCommission: t.offer.previewCommission,
            previewCommissionVat: t.offer.previewCommissionVat,
            previewDeposit: t.offer.previewDeposit,
            previewContractFee: t.offer.previewContractFee,
            previewInitialPayment: t.offer.previewInitialPayment,
            previewInstallmentsTemplate: t.offer.previewInstallmentsTemplate,
          }}
        />

        <div className="md:col-span-2">
          <label className="block text-sm font-medium text-slate-700 mb-1">{t.offer.fieldSpecialTerms}</label>
          <textarea name="specialTerms" rows={2} defaultValue={offer.specialTerms ?? ""} className="w-full rounded-lg border border-slate-300 px-3 py-2" />
        </div>
        <div className="md:col-span-2">
          <label className="block text-sm font-medium text-slate-700 mb-1">{t.offer.fieldInternalNotes}</label>
          <textarea name="internalNotes" rows={2} defaultValue={offer.internalNotes ?? ""} className="w-full rounded-lg border border-slate-300 px-3 py-2" />
        </div>

        <div className="md:col-span-2">
          <button className="bg-brand-gold hover:bg-brand-gold-dark text-brand-black rounded-lg px-6 py-3 font-semibold">{t.offer.save}</button>
        </div>
      </form>
    </div>
  );
}
