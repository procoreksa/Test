import Link from "next/link";
import { getLeadById, updateLead, changeLeadStatus, assignLead, markLeadLost, archiveLead, convertLeadToRenter, findPossibleRenterMatches, listAssignableUsers } from "@/lib/actions/leads";
import { createLeadActivity, listLeadActivities } from "@/lib/actions/lead-activities";
import { getCompoundOptions } from "@/lib/actions/compounds";
import { getViewingsForLead } from "@/lib/actions/viewings";
import { getOffersForLead } from "@/lib/actions/offers";
import { getReservationsForLead } from "@/lib/actions/reservations";
import { getCurrentUserRole } from "@/lib/session";
import { can } from "@/lib/permissions";
import { getLocale, getDictionary, currencyFormatter, shortDateFormatter, longDateTimeFormatter, pickLocalized } from "@/lib/i18n";
import { AuditTimeline } from "@/components/audit-timeline";

const MOVABLE_STATUSES = ["NEW", "CONTACTED", "QUALIFIED", "VIEWING_PENDING", "VIEWING_COMPLETED", "OFFER_PENDING", "NEGOTIATION", "RESERVATION_PENDING"] as const;

export default async function LeadProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [lead, activities, role, locale, agents, compounds, renterMatches, viewingsSummary, offersSummary, reservationsSummary] = await Promise.all([
    getLeadById(id),
    listLeadActivities(id).catch(() => []),
    getCurrentUserRole(),
    getLocale(),
    listAssignableUsers().catch(() => []),
    getCompoundOptions(),
    findPossibleRenterMatches(id).catch(() => []),
    getViewingsForLead(id).catch(() => ({ upcoming: [], past: [], lastOutcome: null, nextViewingDate: null })),
    getOffersForLead(id).catch(() => ({ offers: [], latest: null })),
    getReservationsForLead(id).catch(() => ({ reservations: [], active: null })),
  ]);
  const t = getDictionary(locale);
  const sar = currencyFormatter(locale);
  const dateFmt = shortDateFormatter(locale);
  const dateTimeFmt = longDateTimeFormatter(locale);

  const canUpdate = can("lead.update", role);
  const canAssign = can("lead.assign", role);
  const canConvert = can("lead.convert", role);
  const canArchive = can("lead.archive", role);
  const canLogActivity = can("leadActivity.create", role);
  const canViewActivity = can("leadActivity.view", role);
  const canScheduleViewing = can("viewing.create", role);
  const canViewViewings = can("viewing.view", role);
  const canCreateOffer = can("offer.create", role);
  const canViewOffers = can("offer.view", role);
  const canViewReservations = can("reservation.view", role);
  const canViewContract = can("contract.view", role);

  const isClosed = lead.status === "WON" || lead.status === "LOST" || lead.status === "ARCHIVED";

  return (
    <div className="space-y-6">
      <div>
        <Link href="/crm/leads" className="text-brand-gold-dark hover:underline text-sm">
          {t.crm.profileBack}
        </Link>
        <div className="flex items-center justify-between mt-2">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">{lead.fullName}</h1>
            <p className="text-slate-500 text-sm mt-1">
              {lead.leadNumber} · {t.leadType[lead.leadType]}
            </p>
          </div>
          <span className="px-3 py-1.5 rounded-full text-sm font-medium bg-slate-100 text-slate-700">{t.leadStatus[lead.status]}</span>
        </div>
        {lead.status === "ARCHIVED" && <p className="text-sm text-amber-600 mt-2">{t.crm.profileArchived}</p>}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
          <h2 className="font-semibold text-slate-800 mb-4">{t.crm.profileContactTitle}</h2>
          <dl className="grid grid-cols-2 gap-y-2 text-sm">
            <InfoRow label={t.crm.fieldMobile} value={lead.mobile} />
            <InfoRow label={t.crm.fieldAlternateMobile} value={lead.alternateMobile} />
            <InfoRow label={t.crm.fieldEmail} value={lead.email} />
            <InfoRow label={t.crm.fieldNationality} value={lead.nationality} />
            <InfoRow label={t.crm.fieldEmployer} value={lead.employer} />
            <InfoRow label={t.crm.fieldJobTitle} value={lead.jobTitle} />
            {lead.leadType === "CORPORATE" && (
              <>
                <InfoRow label={t.crm.fieldContactPersonName} value={lead.contactPersonName} />
                <InfoRow label={t.crm.fieldContactPersonMobile} value={lead.contactPersonMobile} />
                <InfoRow label={t.crm.fieldContactPersonEmail} value={lead.contactPersonEmail} />
                <InfoRow label={t.crm.fieldRequestedCity} value={lead.requestedCity} />
                <InfoRow label={t.crm.fieldProjectName} value={lead.projectName} />
              </>
            )}
          </dl>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
          <h2 className="font-semibold text-slate-800 mb-4">{t.crm.profileRequirementsTitle}</h2>
          <dl className="grid grid-cols-2 gap-y-2 text-sm">
            <InfoRow label={t.crm.fieldPreferredBedrooms} value={lead.preferredBedrooms?.toString()} />
            <InfoRow label={t.crm.fieldPreferredUnitType} value={lead.preferredUnitType ?? undefined} />
            <InfoRow label={t.crm.fieldFurnishedPreference} value={lead.furnishedPreference ? t.furnishingPreference[lead.furnishedPreference] : undefined} />
            <InfoRow label={t.crm.fieldMoveInDate} value={lead.moveInDate ? dateFmt.format(lead.moveInDate) : undefined} />
            <InfoRow label={t.crm.fieldLeaseDurationMonths} value={lead.leaseDurationMonths?.toString()} />
            <InfoRow label={t.crm.fieldPreferredCompound} value={lead.preferredCompound ? pickLocalized(locale, lead.preferredCompound.arabicName, lead.preferredCompound.name) : undefined} />
            <InfoRow label={t.crm.fieldSource} value={t.leadSource[lead.source]} />
          </dl>
          <div className="mt-3 pt-3 border-t border-slate-100">
            <InfoRow label={t.crm.profileBudgetTitle} value={`${lead.budgetMin ? sar.format(Number(lead.budgetMin)) : "—"} - ${lead.budgetMax ? sar.format(Number(lead.budgetMax)) : "—"}`} />
          </div>
        </div>
      </div>

      {canViewViewings && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-slate-800">{t.nav.crmViewings}</h2>
            {canScheduleViewing && !isClosed && (
              <Link href={`/crm/viewings/new?leadId=${lead.id}`} className="bg-brand-gold hover:bg-brand-gold-dark text-brand-black rounded-lg px-4 py-2 text-sm font-semibold">
                {t.viewing.scheduleViewingButton}
              </Link>
            )}
          </div>

          <dl className="grid grid-cols-2 gap-y-2 text-sm mb-4">
            <InfoRow label={t.viewing.lastViewingOutcome} value={viewingsSummary.lastOutcome ? t.viewingOutcome[viewingsSummary.lastOutcome] : undefined} />
            <InfoRow label={t.viewing.nextViewingDate} value={viewingsSummary.nextViewingDate ? dateTimeFmt.format(viewingsSummary.nextViewingDate) : undefined} />
          </dl>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <h3 className="text-sm font-semibold text-slate-700 mb-2">{t.viewing.upcomingViewingsTitle}</h3>
              {viewingsSummary.upcoming.length === 0 ? (
                <p className="text-sm text-slate-400">{t.viewing.noUpcomingViewings}</p>
              ) : (
                <ul className="space-y-1">
                  {viewingsSummary.upcoming.map((v) => (
                    <li key={v.id} className="text-sm">
                      <Link href={`/crm/viewings/${v.id}`} className="text-brand-gold-dark hover:underline">
                        {v.viewingNumber}
                      </Link>{" "}
                      — {dateTimeFmt.format(v.scheduledStart)} — {t.viewingStatus[v.status]}
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div>
              <h3 className="text-sm font-semibold text-slate-700 mb-2">{t.viewing.pastViewingsTitle}</h3>
              {viewingsSummary.past.length === 0 ? (
                <p className="text-sm text-slate-400">{t.viewing.noPastViewings}</p>
              ) : (
                <ul className="space-y-1">
                  {viewingsSummary.past.map((v) => (
                    <li key={v.id} className="text-sm">
                      <Link href={`/crm/viewings/${v.id}`} className="text-brand-gold-dark hover:underline">
                        {v.viewingNumber}
                      </Link>{" "}
                      — {dateTimeFmt.format(v.scheduledStart)} — {t.viewingStatus[v.status]}
                      {v.outcome ? ` — ${t.viewingOutcome[v.outcome]}` : ""}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}

      {canViewOffers && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-slate-800">{t.offer.offersTitle}</h2>
            {canCreateOffer && !isClosed && (
              <Link href={`/crm/offers/new?leadId=${lead.id}`} className="bg-brand-gold hover:bg-brand-gold-dark text-brand-black rounded-lg px-4 py-2 text-sm font-semibold">
                {t.offer.createOfferFromLeadButton}
              </Link>
            )}
          </div>

          {offersSummary.latest && (
            <dl className="grid grid-cols-2 gap-y-2 text-sm mb-4">
              <InfoRow label={t.offer.latestOfferLabel} value={`${offersSummary.latest.offerNumber} (${t.offer.colVersionShort}${offersSummary.latest.versionNumber})`} />
              <InfoRow label={t.offer.offerStatusLabel} value={t.offerStatus[offersSummary.latest.status]} />
              <InfoRow label={t.offer.offerAmountLabel} value={sar.format(Number(offersSummary.latest.netAnnualRent))} />
              <InfoRow label={t.offer.offerValidUntilLabel} value={dateFmt.format(offersSummary.latest.validUntil)} />
            </dl>
          )}

          {offersSummary.offers.length === 0 ? (
            <p className="text-sm text-slate-400">{t.offer.noOffers}</p>
          ) : (
            <ul className="space-y-1">
              {offersSummary.offers.map((o) => (
                <li key={o.id} className="text-sm">
                  <Link href={`/crm/offers/${o.id}`} className="text-brand-gold-dark hover:underline">
                    {o.offerNumber} — {t.offer.colVersionShort}{o.versionNumber}
                  </Link>{" "}
                  — {t.offerStatus[o.status]} — {sar.format(Number(o.netAnnualRent))}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {canViewReservations && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
          <h2 className="font-semibold text-slate-800 mb-4">{t.reservation.listTitle}</h2>

          {reservationsSummary.active && (
            <dl className="grid grid-cols-2 gap-y-2 text-sm mb-4">
              <InfoRow label={t.reservation.reservedUnitLabel} value={reservationsSummary.active.unit.unitNumber} />
              <InfoRow label={t.reservation.colStatus} value={t.reservationStatus[reservationsSummary.active.status]} />
              <InfoRow label={t.reservation.fieldHoldUntil} value={dateTimeFmt.format(reservationsSummary.active.holdUntil)} />
              <InfoRow label={t.reservation.colAmountStatus} value={t.reservationAmountStatus[reservationsSummary.active.reservationAmountStatus]} />
            </dl>
          )}

          {reservationsSummary.reservations.length === 0 ? (
            <p className="text-sm text-slate-400">{t.reservation.empty}</p>
          ) : (
            <ul className="space-y-1">
              {reservationsSummary.reservations.map((r) => (
                <li key={r.id} className="text-sm">
                  <Link href={`/crm/reservations/${r.id}`} className="text-brand-gold-dark hover:underline">
                    {r.reservationNumber}
                  </Link>{" "}
                  — {t.reservationStatus[r.status]} — {r.unit.unitNumber}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {lead.status === "WON" && lead.convertedContract && canViewContract && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
          <h2 className="font-semibold text-slate-800 mb-4">{t.reservationContract.leadFunnelWonTitle}</h2>
          <dl className="grid grid-cols-2 gap-y-2 text-sm">
            <InfoRow
              label={t.reservationContract.leadFunnelWonContract}
              value={
                <Link href={`/contracts/${lead.convertedContract.id}/edit`} className="text-brand-gold-dark hover:underline">
                  {lead.convertedContract.contractNumber}
                </Link>
              }
            />
            <InfoRow label={t.reservationContract.leadFunnelWonUnit} value={lead.convertedContract.unit.unitNumber} />
            <InfoRow label={t.reservationContract.leadFunnelWonLeaseStart} value={dateFmt.format(lead.convertedContract.startDate)} />
            <InfoRow label={t.reservationContract.leadFunnelWonLeaseEnd} value={dateFmt.format(lead.convertedContract.endDate)} />
          </dl>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
          <h2 className="font-semibold text-slate-800 mb-4">{t.crm.sectionAssignedAgent}</h2>
          <p className="text-sm text-slate-700 mb-3">{lead.assignedToUser?.name ?? t.crm.unassigned}</p>
          {canAssign && !isClosed && (
            <form
              action={async (formData: FormData) => {
                "use server";
                await assignLead(id, String(formData.get("assignedToUserId") || ""));
              }}
              className="flex gap-2"
            >
              <select name="assignedToUserId" defaultValue={lead.assignedToUserId ?? ""} className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm">
                <option value="">{t.crm.unassigned}</option>
                {agents.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
              <button className="bg-brand-gold hover:bg-brand-gold-dark text-brand-black rounded-lg px-4 py-2 text-sm font-semibold">{t.crm.profileAssignSubmit}</button>
            </form>
          )}
        </div>

        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
          <h2 className="font-semibold text-slate-800 mb-4">{t.crm.colStatus}</h2>
          {canUpdate && !isClosed ? (
            <form
              action={async (formData: FormData) => {
                "use server";
                await changeLeadStatus(id, String(formData.get("status")));
              }}
              className="flex gap-2"
            >
              <select name="status" defaultValue={lead.status} className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm">
                {MOVABLE_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {t.leadStatus[s]}
                  </option>
                ))}
              </select>
              <button className="bg-brand-gold hover:bg-brand-gold-dark text-brand-black rounded-lg px-4 py-2 text-sm font-semibold">{t.crm.pipelineMoveTo}</button>
            </form>
          ) : (
            <p className="text-sm text-slate-500">{t.leadStatus[lead.status]}</p>
          )}
        </div>
      </div>

      {canUpdate && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
          <details className="group">
            <summary className="cursor-pointer list-none font-semibold text-slate-800 flex items-center justify-between">
              {t.crm.profileEditTitle}
              <span className="text-brand-gold-dark group-open:rotate-45 transition-transform text-xl">+</span>
            </summary>
            <form action={updateLead} className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
              <input type="hidden" name="leadId" value={lead.id} />
              <EditField label={t.crm.fieldFirstName} name="firstName" defaultValue={lead.firstName ?? ""} />
              <EditField label={t.crm.fieldLastName} name="lastName" defaultValue={lead.lastName ?? ""} />
              <EditField label={t.crm.fieldCompanyName} name="companyName" defaultValue={lead.companyName ?? ""} />
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">{t.crm.fieldLeadType}</label>
                <select name="leadType" defaultValue={lead.leadType} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">
                  {(Object.keys(t.leadType) as Array<keyof typeof t.leadType>).map((v) => (
                    <option key={v} value={v}>
                      {t.leadType[v]}
                    </option>
                  ))}
                </select>
              </div>
              <EditField label={t.crm.fieldMobile} name="mobile" defaultValue={lead.mobile} required />
              <EditField label={t.crm.fieldEmail} name="email" defaultValue={lead.email ?? ""} />
              <EditField label={t.crm.fieldBudgetMin} name="budgetMin" defaultValue={lead.budgetMin?.toString() ?? ""} type="number" />
              <EditField label={t.crm.fieldBudgetMax} name="budgetMax" defaultValue={lead.budgetMax?.toString() ?? ""} type="number" />
              <EditField label={t.crm.fieldMoveInDate} name="moveInDate" defaultValue={lead.moveInDate ? lead.moveInDate.toISOString().slice(0, 10) : ""} type="date" />
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">{t.crm.fieldSource}</label>
                <select name="source" defaultValue={lead.source} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">
                  {(Object.keys(t.leadSource) as Array<keyof typeof t.leadSource>).map((v) => (
                    <option key={v} value={v}>
                      {t.leadSource[v]}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">{t.crm.fieldPreferredCompound}</label>
                <select name="preferredCompoundId" defaultValue={lead.preferredCompoundId ?? ""} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">
                  <option value="">—</option>
                  {compounds.map((c) => (
                    <option key={c.id} value={c.id}>
                      {pickLocalized(locale, c.arabicName, c.name)}
                    </option>
                  ))}
                </select>
              </div>
              <div className="md:col-span-2">
                <label className="block text-xs font-medium text-slate-700 mb-1">{t.crm.fieldNotes}</label>
                <textarea name="notes" defaultValue={lead.notes ?? ""} rows={2} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
              </div>
              <div className="md:col-span-2">
                <button className="bg-brand-gold hover:bg-brand-gold-dark text-brand-black rounded-lg px-4 py-2 text-sm font-semibold">{t.crm.save}</button>
              </div>
            </form>
          </details>
        </div>
      )}

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
        <h2 className="font-semibold text-slate-800 mb-4">{t.crm.profileConversionTitle}</h2>
        {lead.convertedRenter ? (
          <p className="text-sm text-emerald-700 font-medium">
            {t.crm.profileConvertedTo}: {lead.convertedRenter.fullName}
          </p>
        ) : (
          <>
            <p className="text-sm text-slate-500 mb-3">{t.crm.profileNotConverted}</p>
            {canConvert && !isClosed && (
              <form
                action={async (formData: FormData) => {
                  "use server";
                  await convertLeadToRenter(formData);
                }}
                className="space-y-3"
              >
                <input type="hidden" name="leadId" value={lead.id} />
                {renterMatches.length > 0 && (
                  <div className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                    {renterMatches.map((r) => (
                      <p key={r.id}>
                        {r.fullName} — {r.phone ?? r.email}
                      </p>
                    ))}
                  </div>
                )}
                <div className="flex flex-wrap items-center gap-4">
                  <label className="flex items-center gap-2 text-sm">
                    <input type="radio" name="mode" value="new" defaultChecked={renterMatches.length === 0} className="rounded-full border-slate-300" />
                    {t.crm.profileConvertModeNew}
                  </label>
                  {renterMatches.length > 0 && (
                    <label className="flex items-center gap-2 text-sm">
                      <input type="radio" name="mode" value="link" defaultChecked className="rounded-full border-slate-300" />
                      {t.crm.profileConvertModeLink}
                    </label>
                  )}
                </div>
                {renterMatches.length > 0 && (
                  <select name="renterId" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">
                    {renterMatches.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.fullName} — {r.phone ?? r.email}
                      </option>
                    ))}
                  </select>
                )}
                {renterMatches.length > 0 && (
                  <label className="flex items-center gap-2 text-xs text-slate-600">
                    <input type="checkbox" name="forceNewRenter" className="rounded border-slate-300" />
                    {t.crm.profileConvertForce}
                  </label>
                )}
                <button className="bg-brand-gold hover:bg-brand-gold-dark text-brand-black rounded-lg px-4 py-2 text-sm font-semibold">{t.crm.profileConvertSubmit}</button>
              </form>
            )}
          </>
        )}
      </div>

      {canUpdate && !isClosed && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
          <h2 className="font-semibold text-slate-800 mb-4">{t.crm.profileMarkLostTitle}</h2>
          <form action={markLeadLost} className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <input type="hidden" name="leadId" value={lead.id} />
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">{t.crm.fieldLostReason}</label>
              <select name="lostReason" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">
                {(Object.keys(t.leadLostReason) as Array<keyof typeof t.leadLostReason>).map((v) => (
                  <option key={v} value={v}>
                    {t.leadLostReason[v]}
                  </option>
                ))}
              </select>
            </div>
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-slate-700 mb-1">{t.crm.fieldLostReasonNote}</label>
              <input name="lostReasonNote" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
            </div>
            <div className="md:col-span-3">
              <button className="bg-red-500 hover:bg-red-600 text-white rounded-lg px-4 py-2 text-sm font-semibold">{t.crm.profileMarkLostSubmit}</button>
            </div>
          </form>
        </div>
      )}

      {canArchive && lead.status !== "ARCHIVED" && (
        <form
          action={async () => {
            "use server";
            await archiveLead(id);
          }}
        >
          <button className="text-red-500 hover:underline text-sm">{t.crm.profileArchive}</button>
        </form>
      )}

      {canViewActivity && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
          <h2 className="font-semibold text-slate-800 mb-4">{t.crm.profileActivitiesTitle}</h2>
          {activities.length === 0 ? (
            <p className="text-sm text-slate-400 mb-4">{t.crm.activitiesEmpty}</p>
          ) : (
            <ul className="space-y-3 mb-4">
              {activities.map((a) => (
                <li key={a.id} className="text-sm border-b border-slate-100 pb-2">
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-slate-800">{t.leadActivityType[a.activityType]}</span>
                    <span className="text-slate-400 text-xs">{dateTimeFmt.format(a.activityDate)}</span>
                  </div>
                  {a.subject && <p className="text-slate-600">{a.subject}</p>}
                  {a.notes && <p className="text-slate-500 text-xs mt-1">{a.notes}</p>}
                </li>
              ))}
            </ul>
          )}

          {canLogActivity && (
            <form action={createLeadActivity} className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-3 border-t border-slate-100">
              <input type="hidden" name="leadId" value={lead.id} />
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">{t.crm.fieldActivityType}</label>
                <select name="activityType" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">
                  {(Object.keys(t.leadActivityType) as Array<keyof typeof t.leadActivityType>).map((v) => (
                    <option key={v} value={v}>
                      {t.leadActivityType[v]}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">{t.crm.fieldActivitySubject}</label>
                <input name="subject" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
              </div>
              <div className="md:col-span-2">
                <label className="block text-xs font-medium text-slate-700 mb-1">{t.crm.fieldActivityNotes}</label>
                <textarea name="notes" rows={2} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">{t.crm.fieldNextFollowUp}</label>
                <input type="datetime-local" name="nextFollowUpAt" defaultValue={lead.nextFollowUpAt ? lead.nextFollowUpAt.toISOString().slice(0, 16) : ""} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
              </div>
              <div className="md:col-span-2">
                <button className="bg-brand-gold hover:bg-brand-gold-dark text-brand-black rounded-lg px-4 py-2 text-sm font-semibold">{t.crm.activitySave}</button>
              </div>
            </form>
          )}
        </div>
      )}

      <AuditTimeline entityType="Lead" entityId={lead.id} />
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value?: React.ReactNode }) {
  return (
    <>
      <dt className="text-slate-500">{label}</dt>
      <dd className="text-slate-800 font-medium">{value || "—"}</dd>
    </>
  );
}

function EditField({ label, name, defaultValue, required, type = "text" }: { label: string; name: string; defaultValue?: string; required?: boolean; type?: string }) {
  return (
    <div>
      <label className="block text-xs font-medium text-slate-700 mb-1">{label}</label>
      <input name={name} type={type} defaultValue={defaultValue} required={required} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
    </div>
  );
}
