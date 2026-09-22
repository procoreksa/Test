import Link from "next/link";
import { getViewingById, confirmViewing, startViewing, completeViewing, cancelViewing, markViewingNoShow, rescheduleViewing, updateViewingNotes } from "@/lib/actions/viewings";
import { getCurrentUserRole } from "@/lib/session";
import { can } from "@/lib/permissions";
import { getLocale, getDictionary, longDateTimeFormatter, pickLocalized } from "@/lib/i18n";
import { AuditTimeline } from "@/components/audit-timeline";

export default async function ViewingProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [viewing, role, locale] = await Promise.all([getViewingById(id), getCurrentUserRole(), getLocale()]);
  const t = getDictionary(locale);
  const dateTimeFmt = longDateTimeFormatter(locale);

  const canUpdate = can("viewing.update", role);
  const canComplete = can("viewing.complete", role);
  const canCancel = can("viewing.cancel", role);

  const isScheduled = viewing.status === "SCHEDULED";
  const isConfirmed = viewing.status === "CONFIRMED";
  const isInProgress = viewing.status === "IN_PROGRESS";
  const isActive = isScheduled || isConfirmed || isInProgress;

  return (
    <div className="space-y-6">
      <div>
        <Link href="/crm/viewings" className="text-brand-gold-dark hover:underline text-sm">
          {t.viewing.profileBack}
        </Link>
        <div className="flex items-center justify-between mt-2">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">{viewing.viewingNumber}</h1>
            <p className="text-slate-500 text-sm mt-1">
              <Link href={`/crm/leads/${viewing.leadId}`} className="hover:underline">
                {viewing.lead.fullName}
              </Link>
            </p>
          </div>
          <span className="px-3 py-1.5 rounded-full text-sm font-medium bg-slate-100 text-slate-700">{t.viewingStatus[viewing.status]}</span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
          <h2 className="font-semibold text-slate-800 mb-4">{t.viewing.profileScheduleTitle}</h2>
          <dl className="grid grid-cols-2 gap-y-2 text-sm">
            <dt className="text-slate-500">{t.viewing.fieldScheduledStart}</dt>
            <dd className="text-slate-800 font-medium">{dateTimeFmt.format(viewing.scheduledStart)}</dd>
            <dt className="text-slate-500">{t.viewing.fieldScheduledEnd}</dt>
            <dd className="text-slate-800 font-medium">{dateTimeFmt.format(viewing.scheduledEnd)}</dd>
            <dt className="text-slate-500">{t.viewing.profileAgentTitle}</dt>
            <dd className="text-slate-800 font-medium">{viewing.assignedToUser?.name ?? "—"}</dd>
          </dl>

          {canUpdate && isActive && (
            <details className="mt-4 group">
              <summary className="cursor-pointer list-none text-sm text-brand-gold-dark font-medium">
                {t.viewing.rescheduleTitle}
                <span className="ms-2 group-open:rotate-45 inline-block transition-transform">+</span>
              </summary>
              <form action={rescheduleViewing} className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
                <input type="hidden" name="viewingId" value={viewing.id} />
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">{t.viewing.fieldScheduledStart}</label>
                  <input type="datetime-local" name="scheduledStart" required className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">{t.viewing.fieldScheduledEnd}</label>
                  <input type="datetime-local" name="scheduledEnd" required className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
                </div>
                <div className="sm:col-span-2">
                  <button className="bg-brand-gold hover:bg-brand-gold-dark text-brand-black rounded-lg px-4 py-2 text-sm font-semibold">{t.viewing.rescheduleSubmit}</button>
                </div>
              </form>
            </details>
          )}
        </div>

        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
          <h2 className="font-semibold text-slate-800 mb-4">{t.viewing.profileUnitsTitle}</h2>
          <ul className="space-y-2 text-sm">
            {viewing.units.map((vu) => {
              const building = vu.unit.floor.building;
              const compound = building.compound;
              return (
                <li key={vu.id} className="text-slate-700">
                  <span className="font-medium">{vu.unit.unitNumber}</span> —{" "}
                  {pickLocalized(locale, compound.arabicName, compound.name)} / {pickLocalized(locale, building.nameAr, building.name)}
                </li>
              );
            })}
          </ul>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {canUpdate && isScheduled && (
          <form action={async () => { "use server"; await confirmViewing(viewing.id); }}>
            <button className="bg-brand-gold hover:bg-brand-gold-dark text-brand-black rounded-lg px-4 py-2 text-sm font-semibold">{t.viewing.actionConfirm}</button>
          </form>
        )}
        {canUpdate && isConfirmed && (
          <form action={async () => { "use server"; await startViewing(viewing.id); }}>
            <button className="bg-brand-gold hover:bg-brand-gold-dark text-brand-black rounded-lg px-4 py-2 text-sm font-semibold">{t.viewing.actionStart}</button>
          </form>
        )}
        {canCancel && (isScheduled || isConfirmed) && (
          <form action={async () => { "use server"; await markViewingNoShow(viewing.id); }}>
            <button className="bg-red-500 hover:bg-red-600 text-white rounded-lg px-4 py-2 text-sm font-semibold">{t.viewing.actionNoShow}</button>
          </form>
        )}
      </div>

      {canComplete && isInProgress && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
          <h2 className="font-semibold text-slate-800 mb-4">{t.viewing.completeTitle}</h2>
          <form action={completeViewing} className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <input type="hidden" name="viewingId" value={viewing.id} />
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">{t.viewing.fieldOutcome}</label>
              <select name="outcome" required className="w-full rounded-lg border border-slate-300 px-3 py-2">
                {(Object.keys(t.viewingOutcome) as Array<keyof typeof t.viewingOutcome>).map((v) => (
                  <option key={v} value={v}>
                    {t.viewingOutcome[v]}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">{t.viewing.fieldFeedbackSummary}</label>
              <input name="feedbackSummary" className="w-full rounded-lg border border-slate-300 px-3 py-2" />
            </div>
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-slate-700 mb-1">{t.viewing.fieldInternalNotes}</label>
              <textarea name="internalNotes" rows={2} className="w-full rounded-lg border border-slate-300 px-3 py-2" />
            </div>
            <div className="md:col-span-2">
              <button className="bg-brand-gold hover:bg-brand-gold-dark text-brand-black rounded-lg px-4 py-2 text-sm font-semibold">{t.viewing.completeSubmit}</button>
            </div>
          </form>
        </div>
      )}

      {viewing.status === "COMPLETED" && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
          <h2 className="font-semibold text-slate-800 mb-4">{t.viewing.profileOutcomeTitle}</h2>
          <p className="text-sm text-slate-700 mb-2">{viewing.outcome ? t.viewingOutcome[viewing.outcome] : "—"}</p>
          {viewing.feedbackSummary && <p className="text-sm text-slate-500">{viewing.feedbackSummary}</p>}
          {(viewing.outcome === "OFFER_REQUESTED" || viewing.outcome === "RESERVATION_REQUESTED") && (
            <button disabled className="mt-3 rounded-lg border border-dashed border-slate-300 text-slate-400 px-4 py-2 text-sm cursor-not-allowed">
              {viewing.outcome === "OFFER_REQUESTED" ? t.viewing.futureOfferPlaceholder : t.viewing.futureReservationPlaceholder}
            </button>
          )}
        </div>
      )}

      {canCancel && isActive && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
          <h2 className="font-semibold text-slate-800 mb-4">{t.viewing.cancelTitle}</h2>
          <form action={cancelViewing} className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <input type="hidden" name="viewingId" value={viewing.id} />
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">{t.viewing.fieldCancelReason}</label>
              <select name="cancelReason" required className="w-full rounded-lg border border-slate-300 px-3 py-2">
                {(Object.keys(t.viewingCancelReason) as Array<keyof typeof t.viewingCancelReason>).map((v) => (
                  <option key={v} value={v}>
                    {t.viewingCancelReason[v]}
                  </option>
                ))}
              </select>
            </div>
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-slate-700 mb-1">{t.viewing.fieldCancelReasonNote}</label>
              <input name="cancelReasonNote" className="w-full rounded-lg border border-slate-300 px-3 py-2" />
            </div>
            <div className="md:col-span-3">
              <button className="bg-red-500 hover:bg-red-600 text-white rounded-lg px-4 py-2 text-sm font-semibold">{t.viewing.cancelSubmit}</button>
            </div>
          </form>
        </div>
      )}

      {canUpdate && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
          <details className="group">
            <summary className="cursor-pointer list-none font-semibold text-slate-800 flex items-center justify-between">
              {t.viewing.profileInternalNotesTitle}
              <span className="text-brand-gold-dark group-open:rotate-45 transition-transform text-xl">+</span>
            </summary>
            <form action={updateViewingNotes} className="mt-4 grid grid-cols-1 gap-3">
              <input type="hidden" name="viewingId" value={viewing.id} />
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">{t.viewing.fieldCustomerNotes}</label>
                <textarea name="customerNotes" defaultValue={viewing.customerNotes ?? ""} rows={2} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">{t.viewing.fieldInternalNotes}</label>
                <textarea name="internalNotes" defaultValue={viewing.internalNotes ?? ""} rows={2} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
              </div>
              <div>
                <button className="bg-brand-gold hover:bg-brand-gold-dark text-brand-black rounded-lg px-4 py-2 text-sm font-semibold">{t.crm.save}</button>
              </div>
            </form>
          </details>
        </div>
      )}

      <AuditTimeline entityType="Viewing" entityId={viewing.id} />
    </div>
  );
}
