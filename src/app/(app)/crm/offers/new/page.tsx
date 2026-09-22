import { redirect } from "next/navigation";
import { createOffer, getOfferEligibleUnitsTree, listOfferAssignableUsers } from "@/lib/actions/offers";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/session";
import { getLocale, getDictionary } from "@/lib/i18n";
import { OfferUnitPicker } from "@/components/offer-unit-picker";
import { OfferPricingForm } from "@/components/offer-pricing-form";
import { defaultSecurityDeposit } from "@/lib/crm/offer-pricing";
import { serializeUnitsTree } from "@/lib/crm/offer-unit-tree";

async function getLeadOptions() {
  const { organizationId } = await requirePermission("lead.view");
  return prisma.lead.findMany({
    where: { organizationId, status: { notIn: ["WON", "LOST", "ARCHIVED"] } },
    select: { id: true, leadNumber: true, fullName: true },
    orderBy: { createdAt: "desc" },
    take: 200,
  });
}

async function getViewingOptions(leadId?: string) {
  if (!leadId) return [];
  const { organizationId } = await requirePermission("viewing.view");
  return prisma.viewing.findMany({
    where: { organizationId, leadId, status: "COMPLETED" },
    select: { id: true, viewingNumber: true, scheduledStart: true },
    orderBy: { scheduledStart: "desc" },
  });
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function addDaysIso(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

export default async function NewOfferPage({ searchParams }: { searchParams: Promise<{ leadId?: string; viewingId?: string; unitId?: string }> }) {
  const { leadId, viewingId, unitId } = await searchParams;
  const [locale, agents, leads, rawUnitsTree] = await Promise.all([getLocale(), listOfferAssignableUsers(), getLeadOptions(), getOfferEligibleUnitsTree()]);
  const viewings = await getViewingOptions(leadId);
  const unitsTree = serializeUnitsTree(rawUnitsTree);
  const t = getDictionary(locale);

  let defaultAnnualRent = 0;
  if (unitId) {
    for (const c of unitsTree) {
      for (const b of c.buildings) {
        for (const f of b.floors) {
          const unit = f.units.find((u) => u.id === unitId);
          if (unit) defaultAnnualRent = Number(unit.baseRentAmount);
        }
      }
    }
  }
  const defaultDeposit = defaultSecurityDeposit(defaultAnnualRent, "ANNUAL");

  async function submit(formData: FormData) {
    "use server";
    const offerId = await createOffer(formData);
    redirect(`/crm/offers/${offerId}`);
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">{t.offer.newTitle}</h1>
        <p className="text-slate-500 text-sm mt-1">{t.offer.newSubtitle}</p>
      </div>

      <form action={submit} className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">{t.offer.fieldLead}</label>
          <select name="leadId" defaultValue={leadId ?? ""} required className="w-full rounded-lg border border-slate-300 px-3 py-2">
            <option value="">—</option>
            {leads.map((l) => (
              <option key={l.id} value={l.id}>
                {l.leadNumber} — {l.fullName}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">{t.offer.fieldViewing}</label>
          <select name="viewingId" defaultValue={viewingId ?? ""} className="w-full rounded-lg border border-slate-300 px-3 py-2">
            <option value="">—</option>
            {viewings.map((v) => (
              <option key={v.id} value={v.id}>
                {v.viewingNumber} — {v.scheduledStart.toLocaleDateString()}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">{t.offer.fieldAssignedAgent}</label>
          <select name="assignedToUserId" className="w-full rounded-lg border border-slate-300 px-3 py-2">
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
          <select name="furnishedStatus" defaultValue="UNFURNISHED" className="w-full rounded-lg border border-slate-300 px-3 py-2">
            {(Object.keys(t.furnishingPreference) as Array<keyof typeof t.furnishingPreference>).map((v) => (
              <option key={v} value={v}>
                {t.furnishingPreference[v]}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">{t.offer.fieldValidFrom}</label>
          <input type="date" name="validFrom" required defaultValue={todayIso()} className="w-full rounded-lg border border-slate-300 px-3 py-2" />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">{t.offer.fieldValidUntil}</label>
          <input type="date" name="validUntil" required defaultValue={addDaysIso(14)} className="w-full rounded-lg border border-slate-300 px-3 py-2" />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">{t.offer.fieldLeaseStartDate}</label>
          <input type="date" name="leaseStartDate" className="w-full rounded-lg border border-slate-300 px-3 py-2" />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">{t.offer.fieldLeaseDurationMonths}</label>
          <input type="number" name="leaseDurationMonths" min={1} defaultValue={12} className="w-full rounded-lg border border-slate-300 px-3 py-2" />
        </div>

        <div className="md:col-span-2">
          <h2 className="font-semibold text-slate-800 mb-3">{t.offer.fieldUnit}</h2>
          <OfferUnitPicker
            compounds={unitsTree}
            locale={locale}
            defaultUnitId={unitId}
            labels={{ compound: t.offer.pickCompound, building: t.offer.pickBuilding, floor: t.offer.pickFloor, unit: t.offer.pickUnit }}
          />
        </div>

        <OfferPricingForm
          defaults={{
            annualRent: defaultAnnualRent,
            discountAmount: 0,
            discountPercentage: 0,
            securityDeposit: defaultDeposit,
            contractFee: 0,
            leasingCommissionAmount: 0,
            leasingCommissionRate: null,
            commissionVatRate: 15,
            paymentFrequency: "ANNUAL",
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
          <textarea name="specialTerms" rows={2} className="w-full rounded-lg border border-slate-300 px-3 py-2" />
        </div>
        <div className="md:col-span-2">
          <label className="block text-sm font-medium text-slate-700 mb-1">{t.offer.fieldInternalNotes}</label>
          <textarea name="internalNotes" rows={2} className="w-full rounded-lg border border-slate-300 px-3 py-2" />
        </div>

        <div className="md:col-span-2">
          <button className="bg-brand-gold hover:bg-brand-gold-dark text-brand-black rounded-lg px-6 py-3 font-semibold">{t.offer.save}</button>
        </div>
      </form>
    </div>
  );
}
