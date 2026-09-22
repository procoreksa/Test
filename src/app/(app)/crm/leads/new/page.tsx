import { redirect } from "next/navigation";
import { createLead, listAssignableUsers } from "@/lib/actions/leads";
import { getCompoundOptions } from "@/lib/actions/compounds";
import { getLocale, getDictionary, pickLocalized } from "@/lib/i18n";
import { LeadDuplicateCheck } from "@/components/lead-duplicate-check";
import { LeadTypeSelect } from "@/components/lead-type-toggle";

export default async function NewLeadPage() {
  const [locale, agents, compounds] = await Promise.all([getLocale(), listAssignableUsers(), getCompoundOptions()]);
  const t = getDictionary(locale);

  async function submit(formData: FormData) {
    "use server";
    await createLead(formData);
    redirect("/crm/leads");
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">{t.crm.newLeadTitle}</h1>
        <p className="text-slate-500 text-sm mt-1">{t.crm.newLeadSubtitle}</p>
      </div>

      <form action={submit} className="space-y-6">
        <Section title={t.crm.sectionCustomerInfo}>
          <LeadTypeSelect label={t.crm.fieldLeadType} labels={t.leadType} />
          <Field label={t.crm.fieldFirstName} name="firstName" />
          <Field label={t.crm.fieldLastName} name="lastName" />
          <Field label={t.crm.fieldCompanyName} name="companyName" />
          <LeadDuplicateCheck
            mobileLabel={t.crm.fieldMobile}
            emailLabel={t.crm.fieldEmail}
            warningTitle={t.crm.duplicateWarningTitle}
            mobileMatchLabel={t.crm.duplicateWarningMobile}
            emailMatchLabel={t.crm.duplicateWarningEmail}
          />
          <Field label={t.crm.fieldAlternateMobile} name="alternateMobile" />
          <Field label={t.crm.fieldNationality} name="nationality" />
          <Field label={t.crm.fieldEmployer} name="employer" />
          <Field label={t.crm.fieldJobTitle} name="jobTitle" />
          <Field label={t.crm.fieldFamilySize} name="familySize" type="number" />
        </Section>

        <div id="crm-corporate-section" style={{ display: "none" }}>
          <Section title={t.crm.sectionCorporate}>
            <Field label={t.crm.fieldContactPersonName} name="contactPersonName" />
            <Field label={t.crm.fieldContactPersonMobile} name="contactPersonMobile" />
            <Field label={t.crm.fieldContactPersonEmail} name="contactPersonEmail" type="email" />
            <Field label={t.crm.fieldEmployeeCount} name="employeeCount" type="number" />
            <Field label={t.crm.fieldRequiredUnits} name="requiredUnits" type="number" />
            <Field label={t.crm.fieldRequestedCity} name="requestedCity" />
            <Field label={t.crm.fieldProjectName} name="projectName" />
            <Field label={t.crm.fieldHousingStartDate} name="housingStartDate" type="date" />
            <Field label={t.crm.fieldHousingEndDate} name="housingEndDate" type="date" />
          </Section>
        </div>

        <Section title={t.crm.sectionHousingRequirements}>
          <Field label={t.crm.fieldPreferredBedrooms} name="preferredBedrooms" type="number" />
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">{t.crm.fieldPreferredUnitType}</label>
            <select name="preferredUnitType" className="w-full rounded-lg border border-slate-300 px-3 py-2">
              <option value="">—</option>
              {(["APARTMENT", "VILLA", "OFFICE", "SHOP", "WAREHOUSE", "OTHER"] as const).map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">{t.crm.fieldFurnishedPreference}</label>
            <select name="furnishedPreference" className="w-full rounded-lg border border-slate-300 px-3 py-2">
              <option value="">—</option>
              {(Object.keys(t.furnishingPreference) as Array<keyof typeof t.furnishingPreference>).map((v) => (
                <option key={v} value={v}>
                  {t.furnishingPreference[v]}
                </option>
              ))}
            </select>
          </div>
          <Field label={t.crm.fieldLeaseDurationMonths} name="leaseDurationMonths" type="number" />
        </Section>

        <Section title={t.crm.sectionBudget}>
          <Field label={t.crm.fieldBudgetMin} name="budgetMin" type="number" step="0.01" />
          <Field label={t.crm.fieldBudgetMax} name="budgetMax" type="number" step="0.01" />
        </Section>

        <Section title={t.crm.sectionMoveIn}>
          <Field label={t.crm.fieldMoveInDate} name="moveInDate" type="date" />
        </Section>

        <Section title={t.crm.sectionPreferredCompound}>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">{t.crm.fieldPreferredCompound}</label>
            <select name="preferredCompoundId" className="w-full rounded-lg border border-slate-300 px-3 py-2">
              <option value="">—</option>
              {compounds.map((c) => (
                <option key={c.id} value={c.id}>
                  {pickLocalized(locale, c.arabicName, c.name)}
                </option>
              ))}
            </select>
          </div>
        </Section>

        <Section title={t.crm.sectionLeadSource}>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">{t.crm.fieldSource}</label>
            <select name="source" className="w-full rounded-lg border border-slate-300 px-3 py-2">
              {(Object.keys(t.leadSource) as Array<keyof typeof t.leadSource>).map((v) => (
                <option key={v} value={v}>
                  {t.leadSource[v]}
                </option>
              ))}
            </select>
          </div>
        </Section>

        <Section title={t.crm.sectionAssignedAgent}>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">{t.crm.fieldAssignedAgent}</label>
            <select name="assignedToUserId" className="w-full rounded-lg border border-slate-300 px-3 py-2">
              <option value="">{t.crm.unassigned}</option>
              {agents.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </div>
        </Section>

        <Section title={t.crm.sectionNotes}>
          <div className="md:col-span-2">
            <textarea name="notes" rows={3} className="w-full rounded-lg border border-slate-300 px-3 py-2" />
          </div>
        </Section>

        <button className="bg-brand-gold hover:bg-brand-gold-dark text-brand-black rounded-lg px-6 py-3 font-semibold">{t.crm.save}</button>
      </form>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
      <h2 className="font-semibold text-slate-800 mb-4">{title}</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">{children}</div>
    </div>
  );
}

function Field({ label, name, type = "text", step }: { label: string; name: string; type?: string; step?: string }) {
  return (
    <div>
      <label className="block text-sm font-medium text-slate-700 mb-1">{label}</label>
      <input name={name} type={type} step={step} className="w-full rounded-lg border border-slate-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-gold" />
    </div>
  );
}
