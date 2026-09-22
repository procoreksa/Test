import { redirect } from "next/navigation";
import { createViewing, getViewingEligibleUnitsTree } from "@/lib/actions/viewings";
import { listAssignableUsers } from "@/lib/actions/leads";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/session";
import { getLocale, getDictionary } from "@/lib/i18n";
import { ViewingUnitPicker } from "@/components/viewing-unit-picker";

async function getLeadOptions() {
  const { organizationId } = await requirePermission("lead.view");
  return prisma.lead.findMany({
    where: { organizationId, status: { notIn: ["WON", "LOST", "ARCHIVED"] } },
    select: { id: true, leadNumber: true, fullName: true },
    orderBy: { createdAt: "desc" },
    take: 200,
  });
}

export default async function NewViewingPage({ searchParams }: { searchParams: Promise<{ leadId?: string }> }) {
  const { leadId } = await searchParams;
  const [locale, agents, leads, unitsTree] = await Promise.all([getLocale(), listAssignableUsers(), getLeadOptions(), getViewingEligibleUnitsTree()]);
  const t = getDictionary(locale);

  async function submit(formData: FormData) {
    "use server";
    const viewingId = await createViewing(formData);
    redirect(`/crm/viewings/${viewingId}`);
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">{t.viewing.newTitle}</h1>
        <p className="text-slate-500 text-sm mt-1">{t.viewing.newSubtitle}</p>
      </div>

      <form action={submit} className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">{t.viewing.fieldLead}</label>
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
          <label className="block text-sm font-medium text-slate-700 mb-1">{t.viewing.fieldAssignedAgent}</label>
          <select name="assignedToUserId" required className="w-full rounded-lg border border-slate-300 px-3 py-2">
            <option value="">—</option>
            {agents.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">{t.viewing.fieldScheduledStart}</label>
          <input type="datetime-local" name="scheduledStart" required className="w-full rounded-lg border border-slate-300 px-3 py-2" />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">{t.viewing.fieldScheduledEnd}</label>
          <input type="datetime-local" name="scheduledEnd" required className="w-full rounded-lg border border-slate-300 px-3 py-2" />
        </div>

        <div className="md:col-span-2">
          <h2 className="font-semibold text-slate-800 mb-3">{t.viewing.sectionUnits}</h2>
          <ViewingUnitPicker
            compounds={unitsTree}
            locale={locale}
            labels={{
              compound: t.viewing.pickCompound,
              building: t.viewing.pickBuilding,
              floor: t.viewing.pickFloor,
              unit: t.viewing.pickUnit,
              addUnit: t.viewing.addUnit,
              selectedTitle: t.viewing.selectedUnitsTitle,
              remove: t.viewing.removeUnit,
              noneSelected: t.viewing.noUnitsSelected,
            }}
          />
        </div>

        <div className="md:col-span-2">
          <label className="block text-sm font-medium text-slate-700 mb-1">{t.viewing.fieldCustomerNotes}</label>
          <textarea name="customerNotes" rows={2} className="w-full rounded-lg border border-slate-300 px-3 py-2" />
        </div>

        <div className="md:col-span-2">
          <button className="bg-brand-gold hover:bg-brand-gold-dark text-brand-black rounded-lg px-6 py-3 font-semibold">{t.viewing.save}</button>
        </div>
      </form>
    </div>
  );
}
