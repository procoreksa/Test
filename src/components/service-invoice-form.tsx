"use client";

import { useActionState, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { issueServiceInvoice } from "@/lib/actions/service-invoices";
import { SearchableSelect, type SearchableSelectOption } from "@/components/searchable-select";
import { computeLine } from "@/lib/zatca/vat";

type PaymentMethod = "CASH" | "BANK_TRANSFER" | "CHEQUE" | "CARD" | "ONLINE";

const PAYMENT_METHODS: PaymentMethod[] = ["CASH", "BANK_TRANSFER", "CHEQUE", "CARD", "ONLINE"];

export interface ServiceOption {
  id: string;
  label: string;
  defaultPrice: number | null;
  vatRate: number;
}

interface Labels {
  newInvoiceTitle: string;
  fieldCustomer: string;
  fieldService: string;
  fieldDescription: string;
  fieldQuantity: string;
  fieldUnitPrice: string;
  fieldVatRate: string;
  fieldPaymentMethod: string;
  onAccount: string;
  fieldReference: string;
  fieldNotes: string;
  selectPlaceholder: string;
  noResults: string;
  subtotal: string;
  vat: string;
  total: string;
  submit: string;
}

export function ServiceInvoiceForm({
  t,
  customers,
  services,
  paymentMethodLabels,
  intlLocale,
}: {
  t: Labels;
  customers: SearchableSelectOption[];
  services: ServiceOption[];
  paymentMethodLabels: Record<PaymentMethod, string>;
  intlLocale: string;
}) {
  const router = useRouter();
  const [serviceId, setServiceId] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [unitPrice, setUnitPrice] = useState("");
  const [vatRate, setVatRate] = useState("15");
  const [paymentMethod, setPaymentMethod] = useState<"ON_ACCOUNT" | PaymentMethod>("CASH");

  const [state, formAction, pending] = useActionState<{ error?: string }, FormData>(async (_prev, formData) => {
    try {
      const result = await issueServiceInvoice(formData);
      if (result.invoiceId) {
        router.push(`/invoices/${result.invoiceId}`);
        return {};
      }
      return { error: result.error };
    } catch (err) {
      return { error: err instanceof Error ? err.message : String(err) };
    }
  }, {});

  const onServiceChange = (id: string) => {
    setServiceId(id);
    const service = services.find((s) => s.id === id);
    if (!service) return;
    if (service.defaultPrice !== null) setUnitPrice(String(service.defaultPrice));
    setVatRate(String(service.vatRate));
  };

  // Display-only preview using the same VAT math the server applies when issuing.
  const preview = useMemo(() => {
    const line = computeLine({ quantity: Number(quantity) || 0, unitPrice: Number(unitPrice) || 0, vatRate: Number(vatRate) || 0 });
    return { subtotal: line.taxableAmount, vat: line.vatAmount, total: line.lineTotal };
  }, [quantity, unitPrice, vatRate]);
  const fmt = new Intl.NumberFormat(intlLocale, { style: "currency", currency: "SAR" });

  const inputClass = "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm";
  const labelClass = "block text-sm font-medium text-slate-700 mb-1";

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
      <h2 className="font-semibold text-slate-800 mb-4">{t.newInvoiceTitle}</h2>
      {state.error && <p className="mb-4 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3">{state.error}</p>}

      <form action={formAction} className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className={labelClass}>{t.fieldCustomer}</label>
            <SearchableSelect name="renterId" options={customers} placeholder={t.selectPlaceholder} noResultsText={t.noResults} />
          </div>
          <div>
            <label className={labelClass}>{t.fieldService}</label>
            <select name="serviceId" required value={serviceId} onChange={(e) => onServiceChange(e.target.value)} className={inputClass}>
              <option value="">{t.selectPlaceholder}</option>
              {services.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label className={labelClass}>{t.fieldDescription}</label>
          <input name="description" className={inputClass} />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label className={labelClass}>{t.fieldQuantity}</label>
            <input name="quantity" type="number" min="0.01" step="0.01" required value={quantity} onChange={(e) => setQuantity(e.target.value)} className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>{t.fieldUnitPrice}</label>
            <input name="unitPrice" type="number" min="0.01" step="0.01" required value={unitPrice} onChange={(e) => setUnitPrice(e.target.value)} className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>{t.fieldVatRate}</label>
            <input name="vatRate" type="number" min="0" max="100" step="0.01" required value={vatRate} onChange={(e) => setVatRate(e.target.value)} className={inputClass} />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className={labelClass}>{t.fieldPaymentMethod}</label>
            <select
              name="paymentMethod"
              value={paymentMethod}
              onChange={(e) => setPaymentMethod(e.target.value as "ON_ACCOUNT" | PaymentMethod)}
              className={inputClass}
            >
              {PAYMENT_METHODS.map((m) => (
                <option key={m} value={m}>
                  {paymentMethodLabels[m]}
                </option>
              ))}
              <option value="ON_ACCOUNT">{t.onAccount}</option>
            </select>
          </div>
          {paymentMethod !== "ON_ACCOUNT" && paymentMethod !== "CASH" && (
            <div>
              <label className={labelClass}>{t.fieldReference}</label>
              <input name="referenceNumber" className={inputClass} />
            </div>
          )}
        </div>

        <div>
          <label className={labelClass}>{t.fieldNotes}</label>
          <textarea name="notes" rows={2} className={inputClass} />
        </div>

        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 border-t border-slate-100 pt-4">
          <dl className="text-sm space-y-1">
            <div className="flex gap-3 justify-between sm:justify-start">
              <dt className="text-slate-500">{t.subtotal}</dt>
              <dd className="font-medium">{fmt.format(preview.subtotal)}</dd>
            </div>
            <div className="flex gap-3 justify-between sm:justify-start">
              <dt className="text-slate-500">{t.vat}</dt>
              <dd className="font-medium">{fmt.format(preview.vat)}</dd>
            </div>
            <div className="flex gap-3 justify-between sm:justify-start">
              <dt className="text-slate-800 font-semibold">{t.total}</dt>
              <dd className="font-bold text-slate-900">{fmt.format(preview.total)}</dd>
            </div>
          </dl>
          <button disabled={pending} className="bg-brand-gold hover:bg-brand-gold-dark text-brand-black rounded-lg px-6 py-2.5 font-semibold disabled:opacity-50">
            {t.submit}
          </button>
        </div>
      </form>
    </div>
  );
}
