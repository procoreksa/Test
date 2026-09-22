import Link from "next/link";
import { listLeads, changeLeadStatus } from "@/lib/actions/leads";
import { getCurrentUserRole } from "@/lib/session";
import { can } from "@/lib/permissions";
import { getLocale, getDictionary, currencyFormatter, shortDateFormatter } from "@/lib/i18n";

const PIPELINE_COLUMNS = [
  "NEW",
  "CONTACTED",
  "QUALIFIED",
  "VIEWING_PENDING",
  "VIEWING_COMPLETED",
  "OFFER_PENDING",
  "NEGOTIATION",
  "RESERVATION_PENDING",
  "WON",
  "LOST",
] as const;

const MOVABLE_STATUSES = ["NEW", "CONTACTED", "QUALIFIED", "VIEWING_PENDING", "VIEWING_COMPLETED", "OFFER_PENDING", "NEGOTIATION", "RESERVATION_PENDING"] as const;

export default async function CrmPipelinePage() {
  const [role, locale] = await Promise.all([getCurrentUserRole(), getLocale()]);
  const t = getDictionary(locale);
  const sar = currencyFormatter(locale);
  const dateFmt = shortDateFormatter(locale);
  const canUpdate = can("lead.update", role);

  // The pipeline is a working-set view (active + just-closed leads), not a
  // paginated archive - each column is capped so the board stays usable;
  // /crm/leads is where the full, paginated, filterable list lives.
  const columns = await Promise.all(
    PIPELINE_COLUMNS.map(async (status) => {
      const { rows } = await listLeads({ status, page: 1 });
      return { status, leads: rows.slice(0, 20) };
    })
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">{t.crm.pipelineTitle}</h1>
        <p className="text-slate-500 text-sm mt-1">{t.crm.pipelineSubtitle}</p>
      </div>

      <div className="flex gap-4 overflow-x-auto pb-4">
        {columns.map(({ status, leads }) => (
          <div key={status} className="w-72 shrink-0 bg-slate-50 rounded-xl border border-slate-200">
            <div className="px-4 py-3 border-b border-slate-200 font-semibold text-slate-700 text-sm flex items-center justify-between">
              <span>{t.leadStatus[status]}</span>
              <span className="text-slate-400">{leads.length}</span>
            </div>
            <div className="p-3 space-y-3 max-h-[70vh] overflow-y-auto">
              {leads.map((lead) => (
                <div key={lead.id} className="bg-white rounded-lg border border-slate-200 p-3 shadow-sm text-sm space-y-1">
                  <Link href={`/crm/leads/${lead.id}`} className="font-medium text-slate-800 hover:underline block">
                    {lead.fullName}
                  </Link>
                  <p className="text-slate-500 text-xs">
                    {lead.budgetMin || lead.budgetMax ? `${lead.budgetMin ? sar.format(Number(lead.budgetMin)) : "—"} - ${lead.budgetMax ? sar.format(Number(lead.budgetMax)) : "—"}` : "—"}
                    {lead.preferredBedrooms ? ` · ${lead.preferredBedrooms} BR` : ""}
                  </p>
                  {lead.preferredCompound && <p className="text-slate-400 text-xs">{lead.preferredCompound.name}</p>}
                  <p className="text-slate-400 text-xs">{lead.assignedToUser?.name ?? t.crm.unassigned}</p>
                  {lead.nextFollowUpAt && <p className="text-amber-600 text-xs">{dateFmt.format(lead.nextFollowUpAt)}</p>}
                  {canUpdate && MOVABLE_STATUSES.includes(status as (typeof MOVABLE_STATUSES)[number]) && (
                    <form
                      action={async (formData: FormData) => {
                        "use server";
                        await changeLeadStatus(lead.id, String(formData.get("status")));
                      }}
                      className="pt-1"
                    >
                      <select name="status" defaultValue={status} className="w-full rounded border border-slate-300 px-2 py-1 text-xs">
                        {MOVABLE_STATUSES.map((s) => (
                          <option key={s} value={s}>
                            {t.leadStatus[s]}
                          </option>
                        ))}
                      </select>
                      <button className="mt-1 w-full text-xs bg-brand-gold hover:bg-brand-gold-dark text-brand-black rounded px-2 py-1 font-semibold">{t.crm.pipelineMoveTo}</button>
                    </form>
                  )}
                </div>
              ))}
              {leads.length === 0 && <p className="text-xs text-slate-400 text-center py-4">{t.crm.empty}</p>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
