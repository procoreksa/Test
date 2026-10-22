import Link from "next/link";
import {
  listServiceInvoices,
  listServiceCatalog,
  listServiceInvoiceCustomers,
  setServiceCatalogItemActive,
} from "@/lib/actions/service-invoices";
import { ServiceInvoiceForm } from "@/components/service-invoice-form";
import { ServiceCatalogForm } from "@/components/service-catalog-form";
import { getCurrentUserRole } from "@/lib/session";
import { can } from "@/lib/permissions";
import { getLocale, getDictionary, currencyFormatter, shortDateFormatter, pickLocalized, intlTag } from "@/lib/i18n";

const statusTone: Record<string, string> = {
  DRAFT: "bg-slate-100 text-slate-600",
  ISSUED: "bg-blue-100 text-blue-700",
  PARTIALLY_PAID: "bg-amber-100 text-amber-700",
  PAID: "bg-emerald-100 text-emerald-700",
  OVERDUE: "bg-red-100 text-red-700",
  CANCELLED: "bg-slate-100 text-slate-400",
};

export default async function ServiceInvoicesPage() {
  const [invoices, catalog, customers, locale, role] = await Promise.all([
    listServiceInvoices(),
    listServiceCatalog({ includeInactive: true }),
    listServiceInvoiceCustomers(),
    getLocale(),
    getCurrentUserRole(),
  ]);
  const t = getDictionary(locale);
  const st = t.serviceInvoices;
  const sar = currencyFormatter(locale);
  const dateFmt = shortDateFormatter(locale);
  const canCreate = can("invoice.create", role);
  const activeServices = catalog.filter((s) => s.isActive);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">{st.title}</h1>
        <p className="text-slate-500 text-sm mt-1">{st.subtitle}</p>
      </div>

      <p className="bg-amber-50 border border-amber-200 text-amber-800 text-sm rounded-lg px-4 py-3">{st.separateLedgerNotice}</p>

      {canCreate &&
        (activeServices.length === 0 ? (
          <p className="bg-white rounded-xl border border-slate-200 shadow-sm px-5 py-4 text-sm text-slate-600">{st.noServicesYet}</p>
        ) : (
          <ServiceInvoiceForm
            t={st}
            intlLocale={intlTag(locale)}
            paymentMethodLabels={t.paymentMethod}
            customers={customers.map((c) => ({
              id: c.id,
              label: pickLocalized(locale, c.fullNameAr, c.fullName),
              searchText: `${c.fullName} ${c.fullNameAr ?? ""} ${c.phone ?? ""}`,
            }))}
            services={activeServices.map((s) => ({
              id: s.id,
              label: pickLocalized(locale, s.nameAr, s.name),
              defaultPrice: s.defaultPrice === null ? null : Number(s.defaultPrice),
              vatRate: Number(s.vatRate),
            }))}
          />
        ))}

      <section className="space-y-3">
        {invoices.length === 0 ? (
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm px-5 py-8 text-center text-slate-400">{st.empty}</div>
        ) : (
          <>
            <div className="hidden md:block bg-white rounded-xl border border-slate-200 shadow-sm overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-slate-500 text-right">
                  <tr>
                    <th className="px-5 py-3 font-medium">{st.colInvoiceNumber}</th>
                    <th className="px-5 py-3 font-medium">{st.colDate}</th>
                    <th className="px-5 py-3 font-medium">{st.colCustomer}</th>
                    <th className="px-5 py-3 font-medium">{st.colService}</th>
                    <th className="px-5 py-3 font-medium">{st.colTotal}</th>
                    <th className="px-5 py-3 font-medium">{st.colPaymentMethod}</th>
                    <th className="px-5 py-3 font-medium">{st.colStatus}</th>
                    <th className="px-5 py-3 font-medium"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {invoices.map((inv) => (
                    <tr key={inv.id}>
                      <td className="px-5 py-3 font-medium text-slate-800">{inv.invoiceNumber}</td>
                      <td className="px-5 py-3 text-slate-500">{dateFmt.format(inv.issueDate)}</td>
                      <td className="px-5 py-3">{pickLocalized(locale, inv.renter.fullNameAr, inv.renter.fullName)}</td>
                      <td className="px-5 py-3">{inv.service ? pickLocalized(locale, inv.service.nameAr, inv.service.name) : "—"}</td>
                      <td className="px-5 py-3 font-medium">{sar.format(Number(inv.totalAmount))}</td>
                      <td className="px-5 py-3 text-slate-500">
                        {inv.payments.length > 0 ? t.paymentMethod[inv.payments[0].method] : st.onAccount}
                      </td>
                      <td className="px-5 py-3">
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${statusTone[inv.status]}`}>{t.invoiceStatus[inv.status]}</span>
                      </td>
                      <td className="px-5 py-3 text-left">
                        <Link href={`/invoices/${inv.id}`} className="text-brand-gold-dark hover:underline text-xs font-medium">
                          {st.viewInvoice}
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="md:hidden space-y-3">
              {invoices.map((inv) => (
                <Link key={inv.id} href={`/invoices/${inv.id}`} className="block bg-white rounded-xl border border-slate-200 shadow-sm p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="font-semibold text-slate-800">{inv.invoiceNumber}</div>
                    <span className={`px-2 py-1 rounded-full text-xs font-medium shrink-0 ${statusTone[inv.status]}`}>{t.invoiceStatus[inv.status]}</span>
                  </div>
                  <div className="mt-1 text-sm text-slate-600 break-words">{pickLocalized(locale, inv.renter.fullNameAr, inv.renter.fullName)}</div>
                  <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 text-sm">
                    <div>
                      <dt className="text-slate-400 text-xs">{st.colService}</dt>
                      <dd className="text-slate-700">{inv.service ? pickLocalized(locale, inv.service.nameAr, inv.service.name) : "—"}</dd>
                    </div>
                    <div>
                      <dt className="text-slate-400 text-xs">{st.colDate}</dt>
                      <dd className="text-slate-700">{dateFmt.format(inv.issueDate)}</dd>
                    </div>
                    <div>
                      <dt className="text-slate-400 text-xs">{st.colTotal}</dt>
                      <dd className="text-slate-700 font-medium">{sar.format(Number(inv.totalAmount))}</dd>
                    </div>
                    <div>
                      <dt className="text-slate-400 text-xs">{st.colPaymentMethod}</dt>
                      <dd className="text-slate-700">{inv.payments.length > 0 ? t.paymentMethod[inv.payments[0].method] : st.onAccount}</dd>
                    </div>
                  </dl>
                </Link>
              ))}
            </div>
          </>
        )}
      </section>

      <section className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 space-y-4">
        <div>
          <h2 className="font-semibold text-slate-800">{st.catalogTitle}</h2>
          <p className="text-slate-500 text-sm mt-1">{st.catalogSubtitle}</p>
        </div>

        {canCreate && <ServiceCatalogForm t={st} />}

        {catalog.length === 0 ? (
          <p className="text-sm text-slate-400">{st.catalogEmpty}</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {catalog.map((s) => (
              <li key={s.id} className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm">
                <div className="min-w-0">
                  <span className={`font-medium ${s.isActive ? "text-slate-800" : "text-slate-400 line-through"}`}>
                    {pickLocalized(locale, s.nameAr, s.name)}
                  </span>
                  {!s.isActive && <span className="ms-2 text-xs text-slate-400">({st.catalogInactive})</span>}
                  <div className="text-xs text-slate-500 mt-0.5">
                    {s.defaultPrice !== null && <>{sar.format(Number(s.defaultPrice))} · </>}
                    {st.catalogVatRate} {Number(s.vatRate)}
                  </div>
                </div>
                {canCreate && (
                  <form action={setServiceCatalogItemActive}>
                    <input type="hidden" name="id" value={s.id} />
                    <input type="hidden" name="active" value={s.isActive ? "false" : "true"} />
                    <button className="text-xs font-medium text-slate-600 hover:text-slate-900 border border-slate-300 rounded-lg px-3 py-1">
                      {s.isActive ? st.deactivate : st.activate}
                    </button>
                  </form>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
