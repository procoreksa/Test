import Link from "next/link";
import { getReservationConversionPreview, convertReservationToContractAndRedirect } from "@/lib/actions/reservation-contract";
import { mapOfferToContractInput } from "@/lib/crm/reservation-contract-mapping";
import { getCurrentUserRole } from "@/lib/session";
import { can } from "@/lib/permissions";
import { getLocale, getDictionary, currencyFormatter, shortDateFormatter } from "@/lib/i18n";
import { unitLocationLabel } from "@/lib/unit-location";

export default async function CreateContractFromReservationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [reservation, role, locale] = await Promise.all([getReservationConversionPreview(id), getCurrentUserRole(), getLocale()]);
  const t = getDictionary(locale);
  const sar = currencyFormatter(locale);
  const dateFmt = shortDateFormatter(locale);

  const canConvert = can("reservation.convert", role);
  const isConfirmed = reservation.status === "CONFIRMED";
  const offer = reservation.offer;
  const hasLeaseStartDate = Boolean(offer.leaseStartDate);

  const mapped = offer.leaseStartDate
    ? mapOfferToContractInput(
        {
          netAnnualRent: Number(offer.netAnnualRent),
          paymentFrequency: offer.paymentFrequency,
          securityDeposit: Number(offer.securityDeposit),
          leasingCommissionAmount: Number(offer.leasingCommissionAmount),
          leaseDurationMonths: offer.leaseDurationMonths,
          specialTerms: offer.specialTerms,
        },
        offer.leaseStartDate
      )
    : null;

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <Link href={`/crm/reservations/${reservation.id}`} className="text-brand-gold-dark hover:underline text-sm">
          {t.reservationContract.back}
        </Link>
        <h1 className="text-2xl font-bold text-slate-900 mt-2">{t.reservationContract.createContractPageTitle}</h1>
        <p className="text-slate-500 text-sm mt-1">{t.reservationContract.createContractPageSubtitle(reservation.reservationNumber)}</p>
      </div>

      {!isConfirmed && (
        <p className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3">{t.validation.reservationNotConfirmedForConversion}</p>
      )}
      {isConfirmed && !hasLeaseStartDate && (
        <p className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3">{t.validation.offerMissingLeaseStartDate}</p>
      )}
      {!canConvert && <p className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3">{t.validation.notAuthorized}</p>}

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
        <h2 className="font-semibold text-slate-800 mb-1">{t.reservationContract.reviewTitle}</h2>
        <p className="text-xs text-slate-400 mb-4">{t.reservationContract.reviewDisclaimer}</p>

        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-y-3 text-sm">
          <dt className="text-slate-500">{t.reservationContract.fieldLeadTenant}</dt>
          <dd className="text-slate-800 font-medium">{reservation.lead.fullName}</dd>

          <dt className="text-slate-500">{t.reservationContract.fieldUnit}</dt>
          <dd className="text-slate-800 font-medium">{reservation.unit.unitNumber}</dd>

          <dt className="text-slate-500">{t.reservationContract.fieldCompound}</dt>
          <dd className="text-slate-800 font-medium">{unitLocationLabel(locale, reservation.unit)}</dd>

          <dt className="text-slate-500">{t.reservationContract.fieldOfferNumber}</dt>
          <dd className="text-slate-800 font-medium">
            {offer.offerNumber} — {t.offer.colVersionShort}
            {offer.versionNumber}
          </dd>

          <dt className="text-slate-500">{t.reservationContract.fieldReservationNumber}</dt>
          <dd className="text-slate-800 font-medium">{reservation.reservationNumber}</dd>

          <dt className="text-slate-500">{t.reservationContract.fieldNetAnnualRent}</dt>
          <dd className="text-slate-800 font-medium">{sar.format(Number(offer.netAnnualRent))}</dd>

          <dt className="text-slate-500">{t.reservationContract.fieldPaymentFrequency}</dt>
          <dd className="text-slate-800 font-medium">{t.paymentFrequency[offer.paymentFrequency]}</dd>

          <dt className="text-slate-500">{t.reservationContract.fieldSecurityDeposit}</dt>
          <dd className="text-slate-800 font-medium">{sar.format(Number(offer.securityDeposit))}</dd>

          <dt className="text-slate-500">{t.reservationContract.fieldCommission}</dt>
          <dd className="text-slate-800 font-medium">{sar.format(Number(offer.leasingCommissionAmount))}</dd>

          <dt className="text-slate-500">{t.reservationContract.fieldVat}</dt>
          <dd className="text-slate-800 font-medium">{reservation.unit.vatApplicable ? t.common.yes : t.common.no}</dd>

          {Number(offer.contractFee) > 0 && (
            <>
              <dt className="text-slate-500">
                {t.reservationContract.fieldContractFee}
                <span className="block text-xs text-slate-400">{t.reservationContract.fieldContractFeeNote}</span>
              </dt>
              <dd className="text-slate-800 font-medium">{sar.format(Number(offer.contractFee))}</dd>
            </>
          )}

          {mapped && (
            <>
              <dt className="text-slate-500">{t.reservationContract.fieldLeaseStart}</dt>
              <dd className="text-slate-800 font-medium">{dateFmt.format(mapped.startDate)}</dd>

              <dt className="text-slate-500">{t.reservationContract.fieldLeaseEnd}</dt>
              <dd className="text-slate-800 font-medium">{dateFmt.format(mapped.endDate)}</dd>
            </>
          )}

          {offer.specialTerms && (
            <>
              <dt className="text-slate-500">{t.reservationContract.fieldSpecialTerms}</dt>
              <dd className="text-slate-800 font-medium whitespace-pre-wrap">{offer.specialTerms}</dd>
            </>
          )}
        </dl>
      </div>

      {isConfirmed && hasLeaseStartDate && canConvert && (
        <form action={async () => { "use server"; await convertReservationToContractAndRedirect(reservation.id); }}>
          <button className="bg-brand-gold hover:bg-brand-gold-dark text-brand-black rounded-lg px-5 py-2.5 font-semibold">
            {t.reservationContract.submit}
          </button>
        </form>
      )}
    </div>
  );
}
