import Link from "next/link";
import { getServicesReport, listServiceCatalog } from "@/lib/actions/service-invoices";
import { listRenterOptions } from "@/lib/actions/reports";
import { getLocale, getDictionary, currencyFormatter, shortDateFormatter, pickLocalized } from "@/lib/i18n";
import { ReportHeader } from "@/components/report-header";
import { SearchableSelect } from "@/components/searchable-select";
import { defaultMonthRange } from "@/lib/report-dates";

export default async function ServicesReportPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string; renterId?: string; serviceId?: string }>;
}) {
  const params = await searchParams;
  const defaults = defaultMonthRange();
  const from = params.from || defaults.from;
  const to = params.to || defaults.to;
  const renterId = params.renterId || undefined;
  const serviceId = params.serviceId || undefined;

  const [{ invoices, totals }, renters, services, locale] = await Promise.all([
    getServicesReport({ from: new Date(from), to: new Date(`${to}T23:59:59`), renterId, serviceId }),
    listRenterOptions(),
    listServiceCatalog({ includeInactive: true }),
    getLocale(),
  ]);
  const t = getDictionary(locale);
  const st = t.serviceInvoices;
  const sar = currencyFormatter(locale);
  const dateFmt = shortDateFormatter(locale);
  const selectedRenter = renters.find((r) => r.id === renterId);

  return (
    <div className="space-y-6">
      <ReportHeader backLabel={t.reports.backToReports} printLabel={t.printButton} />

      <div>
        <h1 className="text-2xl font-bold text-slate-900">{st.reportTitle}</h1>
        <p className="text-slate-500 text-sm mt-1">{st.separateLedgerNotice}</p>
      </div>

      <form method="get" className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 items-end gap-4 no-print">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">{t.reports.filterFrom}</label>
          <input type="date" name="from" defaultValue={from} className="w-full rounded-lg border border-slate-300 px-3 py-2" />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">{t.reports.filterTo}</label>
          <input type="date" name="to" defaultValue={to} className="w-full rounded-lg border border-slate-300 px-3 py-2" />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">{st.reportFilterCustomer}</label>
          <SearchableSelect
            name="renterId"
            placeholder={st.reportAllCustomers}
            noResultsText={t.reports.noResults}
            defaultValue={renterId}
            defaultLabel={selectedRenter ? pickLocalized(locale, selectedRenter.fullNameAr, selectedRenter.fullName) : undefined}
            options={renters.map((r) => ({
              id: r.id,
              label: pickLocalized(locale, r.fullNameAr, r.fullName),
              searchText: `${r.fullName} ${r.fullNameAr ?? ""}`,
            }))}
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">{st.reportFilterService}</label>
          <select name="serviceId" defaultValue={serviceId ?? ""} className="w-full rounded-lg border border-slate-300 px-3 py-2">
            <option value="">{st.reportAllServices}</option>
            {services.map((s) => (
              <option key={s.id} value={s.id}>
                {pickLocalized(locale, s.nameAr, s.name)}
              </option>
            ))}
          </select>
        </div>
        <button className="bg-brand-gold hover:bg-brand-gold-dark text-brand-black rounded-lg px-5 py-2.5 font-semibold">{t.reports.filterApply}</button>
      </form>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: st.reportInvoiceCount, value: String(totals.count) },
          { label: st.colTotal, value: sar.format(totals.totalAmount) },
          { label: st.colPaid, value: sar.format(totals.paidAmount) },
          { label: st.colOutstanding, value: sar.format(totals.outstanding) },
        ].map((card) => (
          <div key={card.label} className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
            <div className="text-xs text-slate-500">{card.label}</div>
            <div className="text-lg font-bold text-slate-900 mt-1">{card.value}</div>
          </div>
        ))}
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-500 text-right">
            <tr>
              <th className="px-5 py-3 font-medium">{st.colDate}</th>
              <th className="px-5 py-3 font-medium">{st.colInvoiceNumber}</th>
              <th className="px-5 py-3 font-medium">{st.colCustomer}</th>
              <th className="px-5 py-3 font-medium">{st.colService}</th>
              <th className="px-5 py-3 font-medium">{st.colPaymentMethod}</th>
              <th className="px-5 py-3 font-medium">{st.subtotal}</th>
              <th className="px-5 py-3 font-medium">{st.vat}</th>
              <th className="px-5 py-3 font-medium">{st.colTotal}</th>
              <th className="px-5 py-3 font-medium">{st.colOutstanding}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {invoices.map((inv) => (
              <tr key={inv.id}>
                <td className="px-5 py-3 text-slate-500 whitespace-nowrap">{dateFmt.format(inv.issueDate)}</td>
                <td className="px-5 py-3 font-medium">
                  <Link href={`/invoices/${inv.id}`} className="text-slate-800 hover:underline">
                    {inv.invoiceNumber}
                  </Link>
                </td>
                <td className="px-5 py-3">{pickLocalized(locale, inv.renter.fullNameAr, inv.renter.fullName)}</td>
                <td className="px-5 py-3">
                  {inv.lines[0] ? pickLocalized(locale, inv.lines[0].descriptionAr, inv.lines[0].description) : inv.service ? pickLocalized(locale, inv.service.nameAr, inv.service.name) : "—"}
                </td>
                <td className="px-5 py-3 text-slate-500">{inv.payments.length > 0 ? t.paymentMethod[inv.payments[0].method] : st.onAccount}</td>
                <td className="px-5 py-3">{sar.format(Number(inv.subtotal))}</td>
                <td className="px-5 py-3">{sar.format(Number(inv.vatAmount))}</td>
                <td className="px-5 py-3 font-medium">{sar.format(Number(inv.totalAmount))}</td>
                <td className="px-5 py-3 text-red-600">{sar.format(Number(inv.totalAmount) - Number(inv.paidAmount))}</td>
              </tr>
            ))}
            {invoices.length === 0 && (
              <tr>
                <td colSpan={9} className="px-5 py-8 text-center text-slate-400">
                  {st.reportEmpty}
                </td>
              </tr>
            )}
          </tbody>
          {invoices.length > 0 && (
            <tfoot>
              <tr className="border-t border-slate-200 font-bold text-slate-800">
                <td colSpan={5} className="px-5 py-3 text-right">
                  {st.reportTotalLabel}
                </td>
                <td className="px-5 py-3">{sar.format(totals.subtotal)}</td>
                <td className="px-5 py-3">{sar.format(totals.vatAmount)}</td>
                <td className="px-5 py-3">{sar.format(totals.totalAmount)}</td>
                <td className="px-5 py-3 text-red-600">{sar.format(totals.outstanding)}</td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}
