"use client";

import { useMemo, useState } from "react";
import type { PaymentFrequency } from "@prisma/client";
import { computeOfferPricing } from "@/lib/crm/offer-pricing";
import { currencyFormatter } from "@/lib/i18n/format";
import type { Locale } from "@/lib/i18n/config";

export interface OfferPricingDefaults {
  annualRent: number;
  discountAmount: number;
  discountPercentage: number;
  securityDeposit: number;
  contractFee: number;
  leasingCommissionAmount: number;
  leasingCommissionRate: number | null;
  commissionVatRate: number;
  paymentFrequency: PaymentFrequency;
}

/**
 * Owns every pricing-related input on the New/Edit Offer form and renders a
 * live-recomputed preview beside them (Step 24) - the exact same pure
 * computeOfferPricing() the server persists from, so the preview can never
 * drift from what actually gets saved. Named inputs render inside this
 * component so the surrounding <form> picks them up via ordinary FormData,
 * same pattern as OfferUnitPicker/ViewingUnitPicker.
 */
export function OfferPricingForm({
  defaults,
  labels,
  paymentFrequencyOptions,
  locale,
}: {
  defaults: OfferPricingDefaults;
  labels: {
    annualRent: string;
    discountAmount: string;
    discountPercentage: string;
    securityDeposit: string;
    contractFee: string;
    commissionAmount: string;
    commissionRate: string;
    commissionVatRate: string;
    paymentFrequency: string;
    previewTitle: string;
    previewGross: string;
    previewDiscount: string;
    previewNet: string;
    previewCommission: string;
    previewCommissionVat: string;
    previewDeposit: string;
    previewContractFee: string;
    previewInitialPayment: string;
    /** Template with {count}/{amount} placeholders - a function value cannot cross the Server->Client Component prop boundary, so interpolation happens here instead. */
    previewInstallmentsTemplate: string;
  };
  paymentFrequencyOptions: Array<{ value: PaymentFrequency; label: string }>;
  locale: Locale;
}) {
  const currencyFormat = (value: number) => currencyFormatter(locale).format(value);
  const [annualRent, setAnnualRent] = useState(defaults.annualRent);
  const [discountAmount, setDiscountAmount] = useState(defaults.discountAmount);
  const [discountPercentage, setDiscountPercentage] = useState(defaults.discountPercentage);
  const [securityDeposit, setSecurityDeposit] = useState(defaults.securityDeposit);
  const [contractFee, setContractFee] = useState(defaults.contractFee);
  const [commissionAmount, setCommissionAmount] = useState(defaults.leasingCommissionAmount);
  const [commissionRate, setCommissionRate] = useState(defaults.leasingCommissionRate ?? 0);
  const [commissionVatRate, setCommissionVatRate] = useState(defaults.commissionVatRate);
  const [paymentFrequency, setPaymentFrequency] = useState<PaymentFrequency>(defaults.paymentFrequency);
  const [discountMode, setDiscountMode] = useState<"amount" | "percentage">(defaults.discountPercentage > 0 ? "percentage" : "amount");
  const [commissionMode, setCommissionMode] = useState<"amount" | "rate">(defaults.leasingCommissionRate ? "rate" : "amount");

  const pricing = useMemo(
    () =>
      computeOfferPricing({
        annualRent,
        discountAmount: discountMode === "amount" ? discountAmount : undefined,
        discountPercentage: discountMode === "percentage" ? discountPercentage : undefined,
        commissionAmount: commissionMode === "amount" ? commissionAmount : undefined,
        commissionRate: commissionMode === "rate" ? commissionRate : undefined,
        commissionVatRate,
        securityDeposit,
        contractFee,
        paymentFrequency,
      }),
    [annualRent, discountAmount, discountPercentage, discountMode, commissionAmount, commissionRate, commissionMode, commissionVatRate, securityDeposit, contractFee, paymentFrequency]
  );

  return (
    <div className="md:col-span-2 grid grid-cols-1 lg:grid-cols-2 gap-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">{labels.annualRent}</label>
          <input
            type="number"
            name="annualRent"
            min={0}
            step="0.01"
            required
            value={annualRent}
            onChange={(e) => setAnnualRent(Number(e.target.value) || 0)}
            className="w-full rounded-lg border border-slate-300 px-3 py-2"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">{labels.paymentFrequency}</label>
          <select name="paymentFrequency" value={paymentFrequency} onChange={(e) => setPaymentFrequency(e.target.value as PaymentFrequency)} className="w-full rounded-lg border border-slate-300 px-3 py-2">
            {paymentFrequencyOptions.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>

        <div className="sm:col-span-2 flex gap-4 text-sm">
          <label className="flex items-center gap-1.5">
            <input type="radio" checked={discountMode === "amount"} onChange={() => setDiscountMode("amount")} /> {labels.discountAmount}
          </label>
          <label className="flex items-center gap-1.5">
            <input type="radio" checked={discountMode === "percentage"} onChange={() => setDiscountMode("percentage")} /> {labels.discountPercentage}
          </label>
        </div>
        {discountMode === "amount" ? (
          <input
            type="number"
            name="discountAmount"
            min={0}
            step="0.01"
            value={discountAmount}
            onChange={(e) => setDiscountAmount(Number(e.target.value) || 0)}
            className="sm:col-span-2 w-full rounded-lg border border-slate-300 px-3 py-2"
          />
        ) : (
          <input
            type="number"
            name="discountPercentage"
            min={0}
            max={100}
            step="0.1"
            value={discountPercentage}
            onChange={(e) => setDiscountPercentage(Number(e.target.value) || 0)}
            className="sm:col-span-2 w-full rounded-lg border border-slate-300 px-3 py-2"
          />
        )}

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">{labels.securityDeposit}</label>
          <input
            type="number"
            name="securityDeposit"
            min={0}
            step="0.01"
            required
            value={securityDeposit}
            onChange={(e) => setSecurityDeposit(Number(e.target.value) || 0)}
            className="w-full rounded-lg border border-slate-300 px-3 py-2"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">{labels.contractFee}</label>
          <input
            type="number"
            name="contractFee"
            min={0}
            step="0.01"
            value={contractFee}
            onChange={(e) => setContractFee(Number(e.target.value) || 0)}
            className="w-full rounded-lg border border-slate-300 px-3 py-2"
          />
        </div>

        <div className="sm:col-span-2 flex gap-4 text-sm">
          <label className="flex items-center gap-1.5">
            <input type="radio" checked={commissionMode === "amount"} onChange={() => setCommissionMode("amount")} /> {labels.commissionAmount}
          </label>
          <label className="flex items-center gap-1.5">
            <input type="radio" checked={commissionMode === "rate"} onChange={() => setCommissionMode("rate")} /> {labels.commissionRate}
          </label>
        </div>
        {commissionMode === "amount" ? (
          <input
            type="number"
            name="leasingCommissionAmount"
            min={0}
            step="0.01"
            value={commissionAmount}
            onChange={(e) => setCommissionAmount(Number(e.target.value) || 0)}
            className="w-full rounded-lg border border-slate-300 px-3 py-2"
          />
        ) : (
          <input
            type="number"
            name="leasingCommissionRate"
            min={0}
            step="0.1"
            value={commissionRate}
            onChange={(e) => setCommissionRate(Number(e.target.value) || 0)}
            className="w-full rounded-lg border border-slate-300 px-3 py-2"
          />
        )}
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">{labels.commissionVatRate}</label>
          <input
            type="number"
            name="commissionVatRate"
            min={0}
            step="0.1"
            value={commissionVatRate}
            onChange={(e) => setCommissionVatRate(Number(e.target.value) || 0)}
            className="w-full rounded-lg border border-slate-300 px-3 py-2"
          />
        </div>
      </div>

      <div className="bg-slate-50 rounded-lg border border-slate-200 p-4 h-fit">
        <h3 className="font-semibold text-slate-800 mb-3">{labels.previewTitle}</h3>
        <dl className="space-y-1.5 text-sm">
          <Row label={labels.previewGross} value={currencyFormat(pricing.grossAnnualRent)} />
          <Row label={`${labels.previewDiscount} (${pricing.discountPercentage}%)`} value={`-${currencyFormat(pricing.discountAmount)}`} />
          <Row label={labels.previewNet} value={currencyFormat(pricing.netAnnualRent)} bold />
          <Row label={labels.previewCommission} value={currencyFormat(pricing.leasingCommissionAmount)} />
          <Row label={`${labels.previewCommissionVat} (${pricing.commissionVatRate}%)`} value={currencyFormat(pricing.commissionVatAmount)} />
          <Row label={labels.previewDeposit} value={currencyFormat(pricing.securityDeposit)} />
          <Row label={labels.previewContractFee} value={currencyFormat(pricing.contractFee)} />
          <div className="border-t border-slate-200 my-2" />
          <Row label={labels.previewInitialPayment} value={currencyFormat(pricing.initialPaymentTotal)} bold />
          <p className="text-xs text-slate-400 pt-1">
            {labels.previewInstallmentsTemplate.replace("{count}", String(pricing.installmentCount)).replace("{amount}", currencyFormat(pricing.installmentAmount))}
          </p>
        </dl>
      </div>
    </div>
  );
}

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className={`flex items-center justify-between ${bold ? "font-semibold text-slate-900" : "text-slate-600"}`}>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}
