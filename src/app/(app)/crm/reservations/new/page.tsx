import { redirect } from "next/navigation";
import Link from "next/link";
import { createReservation, listReservableOffers, listReservationAssignableUsers } from "@/lib/actions/reservations";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/session";
import { getLocale, getDictionary, currencyFormatter } from "@/lib/i18n";
import { unitLocationLabel } from "@/lib/unit-location";
import { defaultHoldUntil } from "@/lib/crm/reservation-rules";

function toLocalInputValue(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default async function NewReservationPage({ searchParams }: { searchParams: Promise<{ offerId?: string }> }) {
  const { offerId } = await searchParams;
  const [locale, agents] = await Promise.all([getLocale(), listReservationAssignableUsers()]);
  const t = getDictionary(locale);
  const sar = currencyFormatter(locale);

  async function submit(formData: FormData) {
    "use server";
    const reservationId = await createReservation(formData);
    redirect(`/crm/reservations/${reservationId}`);
  }

  if (!offerId) {
    await requirePermission("reservation.create");
    const offers = await listReservableOffers();
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{t.reservation.newTitle}</h1>
          <p className="text-slate-500 text-sm mt-1">{t.reservation.selectOfferTitle}</p>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-500 text-right">
              <tr>
                <th className="px-4 py-3 font-medium">{t.offer.colOfferNumber}</th>
                <th className="px-4 py-3 font-medium">{t.offer.colLead}</th>
                <th className="px-4 py-3 font-medium">{t.offer.colUnit}</th>
                <th className="px-4 py-3 font-medium">{t.offer.colNetRent}</th>
                <th className="px-4 py-3 font-medium"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {offers.map((o) => (
                <tr key={o.id}>
                  <td className="px-4 py-3 font-medium text-slate-800">{o.offerNumber}</td>
                  <td className="px-4 py-3 text-slate-700">{o.lead.fullName}</td>
                  <td className="px-4 py-3 text-slate-500">{o.unit.unitNumber}</td>
                  <td className="px-4 py-3 text-slate-500">{sar.format(Number(o.netAnnualRent))}</td>
                  <td className="px-4 py-3 text-end">
                    <Link href={`/crm/reservations/new?offerId=${o.id}`} className="text-brand-gold-dark hover:underline font-medium">
                      {t.reservation.save} →
                    </Link>
                  </td>
                </tr>
              ))}
              {offers.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-5 py-8 text-center text-slate-400">
                    {t.reservation.noReservableOffers}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  const { organizationId } = await requirePermission("reservation.create");
  const offer = await prisma.leasingOffer.findUniqueOrThrow({
    where: { id: offerId, organizationId },
    include: { lead: true, unit: { include: { floor: { include: { building: { include: { compound: true } } } } } } },
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">{t.reservation.newTitle}</h1>
        <p className="text-slate-500 text-sm mt-1">{t.reservation.newSubtitle}</p>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
        <h2 className="font-semibold text-slate-800 mb-3">{t.reservation.profileCommercialSummaryTitle}</h2>
        <dl className="grid grid-cols-2 md:grid-cols-4 gap-y-2 text-sm">
          <dt className="text-slate-500">{t.offer.colOfferNumber}</dt>
          <dd className="text-slate-800 font-medium">{offer.offerNumber}</dd>
          <dt className="text-slate-500">{t.offer.colLead}</dt>
          <dd className="text-slate-800 font-medium">{offer.lead.fullName}</dd>
          <dt className="text-slate-500">{t.offer.colUnit}</dt>
          <dd className="text-slate-800 font-medium">
            {offer.unit.unitNumber} — {unitLocationLabel(locale, offer.unit)}
          </dd>
          <dt className="text-slate-500">{t.offer.previewNetAnnualRent}</dt>
          <dd className="text-slate-800 font-medium">{sar.format(Number(offer.netAnnualRent))}</dd>
        </dl>
      </div>

      <form action={submit} className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 grid grid-cols-1 md:grid-cols-2 gap-4">
        <input type="hidden" name="offerId" value={offer.id} />

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">{t.reservation.fieldAssignedAgent}</label>
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
          <label className="block text-sm font-medium text-slate-700 mb-1">{t.reservation.fieldHoldUntil}</label>
          <input type="datetime-local" name="holdUntil" required defaultValue={toLocalInputValue(defaultHoldUntil())} className="w-full rounded-lg border border-slate-300 px-3 py-2" />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">{t.reservation.fieldReservationAmount}</label>
          <input type="number" name="reservationAmount" min={0} step="0.01" defaultValue={0} className="w-full rounded-lg border border-slate-300 px-3 py-2" />
          <p className="text-xs text-slate-400 mt-1">{t.reservation.amountTrackingDisclaimer}</p>
        </div>

        <div className="md:col-span-2">
          <label className="block text-sm font-medium text-slate-700 mb-1">{t.reservation.fieldNotes}</label>
          <textarea name="notes" rows={2} className="w-full rounded-lg border border-slate-300 px-3 py-2" />
        </div>

        <div className="md:col-span-2">
          <button className="bg-brand-gold hover:bg-brand-gold-dark text-brand-black rounded-lg px-6 py-3 font-semibold">{t.reservation.save}</button>
        </div>
      </form>
    </div>
  );
}
