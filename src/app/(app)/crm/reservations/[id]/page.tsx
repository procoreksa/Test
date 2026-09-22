import Link from "next/link";
import {
  getReservationById,
  submitReservation,
  confirmReservation,
  cancelReservation,
  releaseReservation,
  updateReservationAmountStatus,
} from "@/lib/actions/reservations";
import { listLeadActivities } from "@/lib/actions/lead-activities";
import { getCurrentUserRole } from "@/lib/session";
import { can } from "@/lib/permissions";
import { getLocale, getDictionary, longDateTimeFormatter, currencyFormatter, pickLocalized } from "@/lib/i18n";
import { unitLocationLabel } from "@/lib/unit-location";
import { AuditTimeline } from "@/components/audit-timeline";

export default async function ReservationProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [reservation, role, locale] = await Promise.all([getReservationById(id), getCurrentUserRole(), getLocale()]);
  const activities = await listLeadActivities(reservation.leadId).catch(() => []);
  const t = getDictionary(locale);
  const dateTimeFmt = longDateTimeFormatter(locale);
  const sar = currencyFormatter(locale);

  const canUpdate = can("reservation.update", role);
  const canConfirm = can("reservation.confirm", role);
  const canCancel = can("reservation.cancel", role);
  const canRelease = can("reservation.release", role);
  const canUpdateAmount = can("reservation.amount.update", role);
  const canConvert = can("reservation.convert", role);

  const isDraft = reservation.status === "DRAFT";
  const isPending = reservation.status === "PENDING";
  const isConfirmed = reservation.status === "CONFIRMED";
  const isConverted = reservation.status === "CONVERTED_TO_CONTRACT";
  const canCancelThis = isDraft || isPending || isConfirmed;

  return (
    <div className="space-y-6">
      <div>
        <Link href="/crm/reservations" className="text-brand-gold-dark hover:underline text-sm">
          {t.reservation.profileBack}
        </Link>
        <div className="flex items-center justify-between mt-2">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">{reservation.reservationNumber}</h1>
            <p className="text-slate-500 text-sm mt-1">
              <Link href={`/crm/leads/${reservation.leadId}`} className="hover:underline">
                {reservation.lead.fullName}
              </Link>
            </p>
          </div>
          <span className="px-3 py-1.5 rounded-full text-sm font-medium bg-slate-100 text-slate-700">{t.reservationStatus[reservation.status]}</span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
          <h2 className="font-semibold text-slate-800 mb-3">{t.reservation.profileOfferTitle}</h2>
          <dl className="grid grid-cols-2 gap-y-2 text-sm">
            <dt className="text-slate-500">{t.offer.colOfferNumber}</dt>
            <dd className="text-slate-800 font-medium">
              <Link href={`/crm/offers/${reservation.offer.id}`} className="hover:underline">
                {reservation.offer.offerNumber} — {t.offer.colVersionShort}
                {reservation.offer.versionNumber}
              </Link>
            </dd>
            <dt className="text-slate-500">{t.reservation.fieldAssignedAgent}</dt>
            <dd className="text-slate-800 font-medium">{reservation.assignedToUser?.name ?? "—"}</dd>
          </dl>
          <div className="mt-3 pt-3 border-t border-slate-100">
            <h3 className="text-sm font-semibold text-slate-700 mb-2">{t.reservation.profileCommercialSummaryTitle}</h3>
            <dl className="grid grid-cols-2 gap-y-2 text-sm">
              <dt className="text-slate-500">{t.offer.previewNetAnnualRent}</dt>
              <dd className="text-slate-800 font-medium">{sar.format(Number(reservation.offer.netAnnualRent))}</dd>
              <dt className="text-slate-500">{t.offer.previewDeposit}</dt>
              <dd className="text-slate-800 font-medium">{sar.format(Number(reservation.offer.securityDeposit))}</dd>
            </dl>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
          <h2 className="font-semibold text-slate-800 mb-3">{t.reservation.profileUnitTitle}</h2>
          <dl className="grid grid-cols-2 gap-y-2 text-sm">
            <dt className="text-slate-500">{t.offer.printUnit}</dt>
            <dd className="text-slate-800 font-medium">{reservation.unit.unitNumber}</dd>
            <dt className="text-slate-500">{t.offer.printCompound}</dt>
            <dd className="text-slate-800 font-medium">{unitLocationLabel(locale, reservation.unit)}</dd>
            <dt className="text-slate-500">{t.unitStatus.RESERVED}</dt>
            <dd className="text-slate-800 font-medium">{t.unitStatus[reservation.unit.status]}</dd>
          </dl>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
          <h2 className="font-semibold text-slate-800 mb-3">{t.reservation.profileHoldPeriodTitle}</h2>
          <dl className="grid grid-cols-2 gap-y-2 text-sm">
            <dt className="text-slate-500">{t.reservation.colReservedAt}</dt>
            <dd className="text-slate-800 font-medium">{dateTimeFmt.format(reservation.reservedAt)}</dd>
            <dt className="text-slate-500">{t.reservation.fieldHoldUntil}</dt>
            <dd className="text-slate-800 font-medium">{dateTimeFmt.format(reservation.holdUntil)}</dd>
            {reservation.confirmedAt && (
              <>
                <dt className="text-slate-500">{t.reservation.actionConfirm}</dt>
                <dd className="text-slate-800 font-medium">{dateTimeFmt.format(reservation.confirmedAt)}</dd>
              </>
            )}
            {reservation.cancelledAt && (
              <>
                <dt className="text-slate-500">{t.reservation.actionCancel}</dt>
                <dd className="text-slate-800 font-medium">
                  {dateTimeFmt.format(reservation.cancelledAt)} {reservation.cancelReason && `— ${t.reservationCancelReason[reservation.cancelReason]}`}
                </dd>
              </>
            )}
            {reservation.releasedAt && (
              <>
                <dt className="text-slate-500">{t.reservation.actionRelease}</dt>
                <dd className="text-slate-800 font-medium">{dateTimeFmt.format(reservation.releasedAt)}</dd>
              </>
            )}
            {reservation.expiredAt && (
              <>
                <dt className="text-slate-500">{t.reservationStatus.EXPIRED}</dt>
                <dd className="text-slate-800 font-medium">{dateTimeFmt.format(reservation.expiredAt)}</dd>
              </>
            )}
          </dl>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
          <h2 className="font-semibold text-slate-800 mb-3">{t.reservation.profileAmountTitle}</h2>
          <p className="text-xs text-slate-400 mb-2">{t.reservation.amountTrackingDisclaimer}</p>
          <dl className="grid grid-cols-2 gap-y-2 text-sm">
            <dt className="text-slate-500">{t.reservation.colAmount}</dt>
            <dd className="text-slate-800 font-medium">{sar.format(Number(reservation.reservationAmount))}</dd>
            <dt className="text-slate-500">{t.reservation.colAmountStatus}</dt>
            <dd className="text-slate-800 font-medium">{t.reservationAmountStatus[reservation.reservationAmountStatus]}</dd>
          </dl>

          {canUpdateAmount && (
            <details className="mt-4 group">
              <summary className="cursor-pointer list-none text-sm text-brand-gold-dark font-medium">
                {t.reservation.updateAmountStatusTitle}
                <span className="ms-2 group-open:rotate-45 inline-block transition-transform">+</span>
              </summary>
              <form action={updateReservationAmountStatus} className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
                <input type="hidden" name="reservationId" value={reservation.id} />
                <select name="reservationAmountStatus" defaultValue={reservation.reservationAmountStatus} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">
                  {(Object.keys(t.reservationAmountStatus) as Array<keyof typeof t.reservationAmountStatus>).map((v) => (
                    <option key={v} value={v}>
                      {t.reservationAmountStatus[v]}
                    </option>
                  ))}
                </select>
                <button className="bg-brand-gold hover:bg-brand-gold-dark text-brand-black rounded-lg px-4 py-2 text-sm font-semibold">{t.reservation.updateAmountStatusSubmit}</button>
              </form>
            </details>
          )}
        </div>

        {reservation.notes && (
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
            <h2 className="font-semibold text-slate-800 mb-2">{t.offer.fieldSpecialTerms}</h2>
            <p className="text-sm text-slate-700 whitespace-pre-wrap">{reservation.notes}</p>
          </div>
        )}

        {reservation.internalNotes && (
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
            <h2 className="font-semibold text-slate-800 mb-2">{t.reservation.profileInternalNotesTitle}</h2>
            <p className="text-sm text-slate-700 whitespace-pre-wrap">{reservation.internalNotes}</p>
          </div>
        )}
      </div>

      {isConfirmed && canConvert && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
          <Link
            href={`/crm/reservations/${reservation.id}/create-contract`}
            className="inline-block bg-brand-gold hover:bg-brand-gold-dark text-brand-black rounded-lg px-4 py-2 text-sm font-semibold"
          >
            {t.reservation.actionCreateContract}
          </Link>
        </div>
      )}

      {isConverted && reservation.convertedContract && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
          <h2 className="font-semibold text-slate-800 mb-3">{t.reservationContract.leadFunnelWonTitle}</h2>
          <dl className="grid grid-cols-2 gap-y-2 text-sm">
            <dt className="text-slate-500">{t.reservation.convertedContractLabel}</dt>
            <dd className="text-slate-800 font-medium">
              <Link href={`/contracts/${reservation.convertedContract.id}/edit`} className="text-brand-gold-dark hover:underline">
                {reservation.convertedContract.contractNumber}
              </Link>
            </dd>
            <dt className="text-slate-500">{t.reservation.convertedAtLabel}</dt>
            <dd className="text-slate-800 font-medium">{reservation.convertedAt ? dateTimeFmt.format(reservation.convertedAt) : "—"}</dd>
            <dt className="text-slate-500">{t.reservation.convertedRenterLabel}</dt>
            <dd className="text-slate-800 font-medium">
              {pickLocalized(locale, reservation.convertedContract.renter.fullNameAr, reservation.convertedContract.renter.fullName)}
            </dd>
            <dt className="text-slate-500">{t.reservation.colStatus}</dt>
            <dd className="text-slate-800 font-medium">{t.contractStatus[reservation.convertedContract.status]}</dd>
          </dl>
          <Link href={`/contracts/${reservation.convertedContract.id}/edit`} className="inline-block mt-3 text-brand-gold-dark hover:underline text-sm font-medium">
            {t.reservation.viewContractLink} →
          </Link>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {isDraft && canUpdate && (
          <form action={async () => { "use server"; await submitReservation(reservation.id); }}>
            <button className="bg-brand-gold hover:bg-brand-gold-dark text-brand-black rounded-lg px-4 py-2 text-sm font-semibold">{t.reservation.actionSubmit}</button>
          </form>
        )}
        {isPending && canConfirm && (
          <form action={async () => { "use server"; await confirmReservation(reservation.id); }}>
            <button className="bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg px-4 py-2 text-sm font-semibold">{t.reservation.actionConfirm}</button>
          </form>
        )}
        {isConfirmed && canRelease && (
          <form action={async () => { "use server"; await releaseReservation(reservation.id); }}>
            <button className="bg-white border border-slate-300 hover:bg-slate-50 rounded-lg px-4 py-2 text-sm font-medium">{t.reservation.actionRelease}</button>
          </form>
        )}
        {canCancelThis && canCancel && (
          <details className="w-full sm:w-auto">
            <summary className="cursor-pointer list-none inline-block bg-red-500 hover:bg-red-600 text-white rounded-lg px-4 py-2 text-sm font-semibold">{t.reservation.actionCancel}</summary>
            <form action={cancelReservation} className="mt-3 bg-white rounded-xl border border-slate-200 shadow-sm p-5 grid grid-cols-1 sm:grid-cols-3 gap-3">
              <input type="hidden" name="reservationId" value={reservation.id} />
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">{t.reservation.fieldCancelReason}</label>
                <select name="cancelReason" required className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">
                  {(Object.keys(t.reservationCancelReason) as Array<keyof typeof t.reservationCancelReason>).map((v) => (
                    <option key={v} value={v}>
                      {t.reservationCancelReason[v]}
                    </option>
                  ))}
                </select>
              </div>
              <div className="sm:col-span-2">
                <label className="block text-xs font-medium text-slate-700 mb-1">{t.reservation.fieldCancelReasonNote}</label>
                <input name="cancelReasonNote" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
              </div>
              <div className="sm:col-span-3">
                <button className="bg-red-500 hover:bg-red-600 text-white rounded-lg px-4 py-2 text-sm font-semibold">{t.reservation.cancelSubmit}</button>
              </div>
            </form>
          </details>
        )}
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
        <h2 className="font-semibold text-slate-800 mb-4">{t.reservation.profileActivitiesTitle}</h2>
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

      <AuditTimeline entityType="Reservation" entityId={reservation.id} />
    </div>
  );
}
