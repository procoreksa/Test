import { redirect } from "next/navigation";
import Link from "next/link";
import {
  getOfferById,
  getOfferVersionChain,
  submitOfferForApproval,
  approveOffer,
  declineOfferApproval,
  sendOffer,
  moveOfferToNegotiation,
  acceptOffer,
  rejectOffer,
  cancelOffer,
  reviseOffer,
} from "@/lib/actions/offers";
import { listLeadActivities } from "@/lib/actions/lead-activities";
import { getActiveReservationForOffer } from "@/lib/actions/reservations";
import { getConvertedContractForOffer } from "@/lib/actions/reservation-contract";
import { getCurrentUserRole } from "@/lib/session";
import { can } from "@/lib/permissions";
import { canApproveDiscount } from "@/lib/crm/offer-rules";
import { getLocale, getDictionary, longDateFormatter, longDateTimeFormatter, currencyFormatter } from "@/lib/i18n";
import { unitLocationLabel } from "@/lib/unit-location";
import { PrintButton } from "@/components/print-button";
import { AuditTimeline } from "@/components/audit-timeline";

export default async function OfferProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [offer, role, locale] = await Promise.all([getOfferById(id), getCurrentUserRole(), getLocale()]);
  const [versionChain, activities] = await Promise.all([getOfferVersionChain(offer.offerNumber), listLeadActivities(offer.leadId).catch(() => [])]);
  const canViewReservation = can("reservation.view", role);
  const activeReservation = offer.status === "ACCEPTED" && canViewReservation ? await getActiveReservationForOffer(offer.id) : null;
  const convertedContract = offer.status === "ACCEPTED" && canViewReservation && !activeReservation ? await getConvertedContractForOffer(offer.id) : null;
  const canCreateReservation = can("reservation.create", role);
  const t = getDictionary(locale);
  const dateFmt = longDateFormatter(locale);
  const dateTimeFmt = longDateTimeFormatter(locale);
  const sar = currencyFormatter(locale);

  const canUpdate = can("offer.update", role);
  const canSubmit = can("offer.submit", role);
  const canApprovePermission = can("offer.approve", role);
  const canSend = can("offer.send", role);
  const canAccept = can("offer.accept", role);
  const canReject = can("offer.reject", role);
  const canCancel = can("offer.cancel", role);
  const canRevise = can("offer.revise", role);

  const discountPercentage = Number(offer.discountPercentage);
  const canApproveThisOffer = canApprovePermission && canApproveDiscount(role, discountPercentage);

  const isDraft = offer.status === "DRAFT";
  const isPendingApproval = offer.status === "PENDING_APPROVAL";
  const isApproved = offer.status === "APPROVED";
  const isSent = offer.status === "SENT";
  const isNegotiation = offer.status === "UNDER_NEGOTIATION";
  const canReviseThis = offer.status !== "DRAFT" && offer.status !== "ACCEPTED" && offer.status !== "SUPERSEDED";
  // Matches OFFER_TRANSITIONS in offer-rules.ts exactly - PENDING_APPROVAL
  // deliberately excluded: while awaiting internal approval, the only moves
  // are approve or decline-back-to-draft, never a direct cancel.
  const canCancelThis = isDraft || isApproved || isSent || isNegotiation;

  return (
    <div className="space-y-6">
      <div className="no-print">
        <Link href="/crm/offers" className="text-brand-gold-dark hover:underline text-sm">
          {t.offer.profileBack}
        </Link>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-8 print:shadow-none print:border-0">
        <div className="flex items-start justify-between border-b border-slate-100 pb-6 mb-6 no-print">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">
              {offer.offerNumber} <span className="text-slate-400 text-lg font-normal">— {t.offer.colVersionShort}{offer.versionNumber}</span>
            </h1>
            <p className="text-slate-500 text-sm mt-1">
              <Link href={`/crm/leads/${offer.leadId}`} className="hover:underline">
                {offer.lead.fullName}
              </Link>
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="px-3 py-1.5 rounded-full text-sm font-medium bg-slate-100 text-slate-700">{t.offerStatus[offer.status]}</span>
            <PrintButton label={t.offer.actionPrint} />
          </div>
        </div>

        {/* Print header - organization branding, shown only when printing */}
        <div className="hidden print:flex items-start justify-between border-b border-slate-100 pb-6 mb-6">
          <div className="flex items-start gap-4">
            {offer.organization.logoUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={offer.organization.logoUrl} alt="" className="w-14 h-14 rounded-lg object-contain border border-slate-100 shrink-0" />
            )}
            <div>
              <h1 className="text-xl font-bold text-slate-900">{offer.organization.name}</h1>
              {offer.organization.nameAr && <p className="text-slate-500">{offer.organization.nameAr}</p>}
              <p className="text-xs text-slate-400 mt-1">{[offer.organization.district, offer.organization.city].filter(Boolean).join(locale === "ar" ? "، " : ", ")}</p>
            </div>
          </div>
          <div className="text-left">
            <p className="text-lg font-bold text-brand-gold-dark">{t.offer.printTitle}</p>
            <p className="text-sm text-slate-500">{offer.offerNumber} — {t.offer.colVersionShort}{offer.versionNumber}</p>
            <p className="text-xs text-slate-400 mt-1">{dateFmt.format(offer.createdAt)}</p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div>
            <h2 className="font-semibold text-slate-800 mb-3">{t.offer.profileLeadTitle}</h2>
            <dl className="grid grid-cols-2 gap-y-2 text-sm">
              <dt className="text-slate-500">{t.offer.printCustomer}</dt>
              <dd className="text-slate-800 font-medium">{offer.lead.fullName}</dd>
              <dt className="text-slate-500">{t.offer.fieldAssignedAgent}</dt>
              <dd className="text-slate-800 font-medium">{offer.assignedToUser?.name ?? "—"}</dd>
              {offer.viewing && (
                <>
                  <dt className="text-slate-500 no-print">{t.offer.fieldViewing}</dt>
                  <dd className="text-slate-800 font-medium no-print">
                    <Link href={`/crm/viewings/${offer.viewing.id}`} className="hover:underline">
                      {offer.viewing.viewingNumber}
                    </Link>
                  </dd>
                </>
              )}
            </dl>
          </div>

          <div>
            <h2 className="font-semibold text-slate-800 mb-3">{t.offer.profileUnitTitle}</h2>
            <dl className="grid grid-cols-2 gap-y-2 text-sm">
              <dt className="text-slate-500">{t.offer.printUnit}</dt>
              <dd className="text-slate-800 font-medium">{offer.unit.unitNumber}</dd>
              <dt className="text-slate-500">{t.offer.printCompound}</dt>
              <dd className="text-slate-800 font-medium">{unitLocationLabel(locale, offer.unit)}</dd>
              <dt className="text-slate-500">{t.offer.fieldFurnishedStatus}</dt>
              <dd className="text-slate-800 font-medium">{t.furnishingPreference[offer.furnishedStatus]}</dd>
            </dl>
          </div>

          <div>
            <h2 className="font-semibold text-slate-800 mb-3">{t.offer.profilePricingTitle}</h2>
            <dl className="grid grid-cols-2 gap-y-2 text-sm">
              <dt className="text-slate-500">{t.offer.previewGrossAnnualRent}</dt>
              <dd className="text-slate-800 font-medium">{sar.format(Number(offer.annualRent))}</dd>
              <dt className="text-slate-500">{t.offer.previewDiscount}</dt>
              <dd className="text-slate-800 font-medium">
                {sar.format(Number(offer.discountAmount))} ({discountPercentage}%)
              </dd>
              <dt className="text-slate-500">{t.offer.previewNetAnnualRent}</dt>
              <dd className="text-slate-900 font-bold">{sar.format(Number(offer.netAnnualRent))}</dd>
            </dl>
          </div>

          <div>
            <h2 className="font-semibold text-slate-800 mb-3">{t.offer.profilePaymentTermsTitle}</h2>
            <dl className="grid grid-cols-2 gap-y-2 text-sm">
              <dt className="text-slate-500">{t.offer.fieldPaymentFrequency}</dt>
              <dd className="text-slate-800 font-medium">{t.paymentFrequency[offer.paymentFrequency]}</dd>
              <dt className="text-slate-500">{t.offer.printPaymentSchedule}</dt>
              <dd className="text-slate-800 font-medium">{sar.format(Number(offer.totalInitialPayment))} {t.offer.previewInitialPayment.toLowerCase()}</dd>
              <dt className="text-slate-500">{t.offer.fieldLeaseDurationMonths}</dt>
              <dd className="text-slate-800 font-medium">{offer.leaseDurationMonths}</dd>
              {offer.leaseStartDate && (
                <>
                  <dt className="text-slate-500">{t.offer.fieldLeaseStartDate}</dt>
                  <dd className="text-slate-800 font-medium">{dateFmt.format(offer.leaseStartDate)}</dd>
                </>
              )}
            </dl>
          </div>

          <div>
            <h2 className="font-semibold text-slate-800 mb-3">{t.offer.profileDepositTitle}</h2>
            <p className="text-slate-800 font-medium text-sm">{sar.format(Number(offer.securityDeposit))}</p>
            {Number(offer.contractFee) > 0 && (
              <p className="text-sm text-slate-500 mt-1">
                {t.offer.fieldContractFee}: {sar.format(Number(offer.contractFee))}
              </p>
            )}
          </div>

          <div>
            <h2 className="font-semibold text-slate-800 mb-3">{t.offer.profileCommissionTitle}</h2>
            <dl className="grid grid-cols-2 gap-y-2 text-sm">
              <dt className="text-slate-500">{t.offer.printCommission}</dt>
              <dd className="text-slate-800 font-medium">{sar.format(Number(offer.leasingCommissionAmount))}</dd>
              <dt className="text-slate-500">{t.offer.profileVatTitle} ({Number(offer.commissionVatRate)}%)</dt>
              <dd className="text-slate-800 font-medium">{sar.format(Number(offer.commissionVatAmount))}</dd>
            </dl>
          </div>

          {offer.specialTerms && (
            <div className="lg:col-span-2">
              <h2 className="font-semibold text-slate-800 mb-2">{t.offer.profileSpecialTermsTitle}</h2>
              <p className="text-sm text-slate-700 whitespace-pre-wrap">{offer.specialTerms}</p>
            </div>
          )}

          <div>
            <h2 className="font-semibold text-slate-800 mb-3">{t.offer.profileValidityTitle}</h2>
            <dl className="grid grid-cols-2 gap-y-2 text-sm">
              <dt className="text-slate-500">{t.offer.fieldValidFrom}</dt>
              <dd className="text-slate-800 font-medium">{dateFmt.format(offer.validFrom)}</dd>
              <dt className="text-slate-500">{t.offer.printValidity}</dt>
              <dd className="text-slate-800 font-medium">{dateFmt.format(offer.validUntil)}</dd>
            </dl>
          </div>

          <div className="no-print">
            <h2 className="font-semibold text-slate-800 mb-3">{t.offer.profileStatusTitle}</h2>
            <dl className="grid grid-cols-2 gap-y-2 text-sm">
              <dt className="text-slate-500">{t.offer.approvalStatusLabel}</dt>
              <dd className="text-slate-800 font-medium">{t.approvalStatus[offer.approvalStatus]}</dd>
              {discountPercentage > 10 && (
                <>
                  <dt className="text-slate-500"> </dt>
                  <dd className="text-amber-600 text-xs">{t.offer.approvalRequiredBadge}</dd>
                </>
              )}
              {offer.sentAt && (
                <>
                  <dt className="text-slate-500">{t.offer.actionSend}</dt>
                  <dd className="text-slate-800 font-medium">{dateTimeFmt.format(offer.sentAt)}</dd>
                </>
              )}
              {offer.acceptedAt && (
                <>
                  <dt className="text-slate-500">{t.offer.actionAccept}</dt>
                  <dd className="text-slate-800 font-medium">{dateTimeFmt.format(offer.acceptedAt)}</dd>
                </>
              )}
              {offer.rejectedAt && (
                <>
                  <dt className="text-slate-500">{t.offer.actionReject}</dt>
                  <dd className="text-slate-800 font-medium">
                    {dateTimeFmt.format(offer.rejectedAt)} {offer.rejectReason && `— ${t.offerRejectReason[offer.rejectReason]}`}
                  </dd>
                </>
              )}
            </dl>
          </div>
        </div>
      </div>

      {offer.status === "ACCEPTED" && canViewReservation && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 no-print">
          <h2 className="font-semibold text-slate-800 mb-3">{t.reservation.activeReservationTitle}</h2>
          {activeReservation ? (
            <dl className="grid grid-cols-2 md:grid-cols-4 gap-y-2 text-sm">
              <dt className="text-slate-500">{t.reservation.colReservationNumber}</dt>
              <dd className="text-slate-800 font-medium">
                <Link href={`/crm/reservations/${activeReservation.id}`} className="text-brand-gold-dark hover:underline">
                  {activeReservation.reservationNumber}
                </Link>
              </dd>
              <dt className="text-slate-500">{t.reservation.colStatus}</dt>
              <dd className="text-slate-800 font-medium">{t.reservationStatus[activeReservation.status]}</dd>
              <dt className="text-slate-500">{t.reservation.fieldHoldUntil}</dt>
              <dd className="text-slate-800 font-medium">{dateTimeFmt.format(activeReservation.holdUntil)}</dd>
              <dt className="text-slate-500">{t.reservation.colAmountStatus}</dt>
              <dd className="text-slate-800 font-medium">{t.reservationAmountStatus[activeReservation.reservationAmountStatus]}</dd>
            </dl>
          ) : convertedContract ? (
            <div className="flex items-center gap-3 text-sm">
              <span className="text-slate-500">{t.reservationContract.sourceReservation}:</span>
              <Link href={`/contracts/${convertedContract.id}/edit`} className="text-brand-gold-dark hover:underline font-medium">
                {convertedContract.contractNumber}
              </Link>
            </div>
          ) : canCreateReservation ? (
            <Link href={`/crm/reservations/new?offerId=${offer.id}`} className="rounded-lg bg-brand-gold hover:bg-brand-gold-dark text-brand-black px-4 py-2 text-sm font-semibold">
              {t.reservation.createReservationButton}
            </Link>
          ) : (
            <p className="text-sm text-slate-400">{t.reservation.noActiveReservation}</p>
          )}
        </div>
      )}

      <div className="flex flex-wrap gap-2 no-print">
        {isDraft && canUpdate && (
          <Link href={`/crm/offers/${offer.id}/edit`} className="bg-white border border-slate-300 hover:bg-slate-50 rounded-lg px-4 py-2 text-sm font-medium">
            {t.offer.actionEdit}
          </Link>
        )}
        {isDraft && canSubmit && (
          <form action={async () => { "use server"; await submitOfferForApproval(offer.id); }}>
            <button className="bg-brand-gold hover:bg-brand-gold-dark text-brand-black rounded-lg px-4 py-2 text-sm font-semibold">{t.offer.actionSubmitForApproval}</button>
          </form>
        )}
        {isPendingApproval && canApproveThisOffer && (
          <form action={async () => { "use server"; await approveOffer(offer.id); }}>
            <button className="bg-brand-gold hover:bg-brand-gold-dark text-brand-black rounded-lg px-4 py-2 text-sm font-semibold">{t.offer.actionApprove}</button>
          </form>
        )}
        {isApproved && canSend && (
          <form action={async () => { "use server"; await sendOffer(offer.id); }}>
            <button className="bg-brand-gold hover:bg-brand-gold-dark text-brand-black rounded-lg px-4 py-2 text-sm font-semibold">{t.offer.actionSend}</button>
          </form>
        )}
        {isSent && canUpdate && (
          <form action={async () => { "use server"; await moveOfferToNegotiation(offer.id); }}>
            <button className="bg-white border border-slate-300 hover:bg-slate-50 rounded-lg px-4 py-2 text-sm font-medium">{t.offer.actionMoveToNegotiation}</button>
          </form>
        )}
        {(isSent || isNegotiation) && canAccept && (
          <form action={async () => { "use server"; await acceptOffer(offer.id); }}>
            <button className="bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg px-4 py-2 text-sm font-semibold">{t.offer.actionAccept}</button>
          </form>
        )}
        {canReviseThis && canRevise && (
          <form action={async () => { "use server"; const newId = await reviseOffer(offer.id); redirect(`/crm/offers/${newId}/edit`); }}>
            <button className="bg-white border border-slate-300 hover:bg-slate-50 rounded-lg px-4 py-2 text-sm font-medium">{t.offer.actionRevise}</button>
          </form>
        )}
        {canCancelThis && canCancel && (
          <form action={async () => { "use server"; await cancelOffer(offer.id); }}>
            <button className="bg-red-500 hover:bg-red-600 text-white rounded-lg px-4 py-2 text-sm font-semibold">{t.offer.actionCancel}</button>
          </form>
        )}
      </div>

      {isPendingApproval && canApprovePermission && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 no-print">
          <h2 className="font-semibold text-slate-800 mb-4">{t.offer.declineApprovalTitle}</h2>
          <form action={declineOfferApproval} className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <input type="hidden" name="offerId" value={offer.id} />
            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-slate-700 mb-1">{t.offer.fieldDeclineNotes}</label>
              <input name="notes" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
            </div>
            <div className="flex items-end">
              <button className="bg-red-500 hover:bg-red-600 text-white rounded-lg px-4 py-2 text-sm font-semibold w-full">{t.offer.declineApprovalSubmit}</button>
            </div>
          </form>
        </div>
      )}

      {(isSent || isNegotiation) && canReject && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 no-print">
          <h2 className="font-semibold text-slate-800 mb-4">{t.offer.rejectTitle}</h2>
          <form action={rejectOffer} className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <input type="hidden" name="offerId" value={offer.id} />
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">{t.offer.fieldRejectReason}</label>
              <select name="rejectReason" required className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">
                {(Object.keys(t.offerRejectReason) as Array<keyof typeof t.offerRejectReason>).map((v) => (
                  <option key={v} value={v}>
                    {t.offerRejectReason[v]}
                  </option>
                ))}
              </select>
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-slate-700 mb-1">{t.offer.fieldRejectReasonNote}</label>
              <input name="rejectReasonNote" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
            </div>
            <div className="sm:col-span-3">
              <button className="bg-red-500 hover:bg-red-600 text-white rounded-lg px-4 py-2 text-sm font-semibold">{t.offer.rejectSubmit}</button>
            </div>
          </form>
        </div>
      )}

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 no-print">
        <h2 className="font-semibold text-slate-800 mb-4">{t.offer.profileVersionHistoryTitle}</h2>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-start text-slate-400 text-xs uppercase">
              <th className="py-2 text-start">{t.offer.colVersion}</th>
              <th className="py-2 text-start">{t.offer.colStatus}</th>
              <th className="py-2 text-start">{t.offer.colNetRent}</th>
              <th className="py-2 text-start">{t.offer.colDiscount}</th>
              <th className="py-2 text-start">{t.offer.colCreatedDate}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {versionChain.map((v) => (
              <tr key={v.id} className={v.id === offer.id ? "bg-brand-gold/5" : ""}>
                <td className="py-2">
                  <Link href={`/crm/offers/${v.id}`} className="text-brand-gold-dark hover:underline">
                    V{v.versionNumber}
                  </Link>
                  {v.id === offer.id && <span className="ms-2 text-xs text-slate-400">({t.offer.currentVersionBadge})</span>}
                </td>
                <td className="py-2">{t.offerStatus[v.status]}</td>
                <td className="py-2">{sar.format(Number(v.netAnnualRent))}</td>
                <td className="py-2">{Number(v.discountPercentage)}%</td>
                <td className="py-2">{dateFmt.format(v.createdAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 no-print">
        <h2 className="font-semibold text-slate-800 mb-4">{t.offer.profileActivitiesTitle}</h2>
        {activities.length === 0 ? (
          <p className="text-sm text-slate-400">{t.crm.activitiesEmpty}</p>
        ) : (
          <ul className="space-y-2 text-sm">
            {activities.slice(0, 10).map((a) => (
              <li key={a.id} className="border-s-2 border-slate-200 ps-3">
                <p className="text-slate-700">{a.subject}</p>
                <p className="text-xs text-slate-400">{dateTimeFmt.format(a.activityDate)}</p>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="no-print">
        <AuditTimeline entityType="LeasingOffer" entityId={offer.id} />
      </div>
    </div>
  );
}
