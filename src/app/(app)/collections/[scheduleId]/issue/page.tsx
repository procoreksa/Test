import Link from "next/link";
import { redirect } from "next/navigation";
import { getScheduleBillableComponents, issueInvoiceForSchedule } from "@/lib/actions/invoices";
import { getLocale, getDictionary, currencyFormatter, shortDateFormatter, pickLocalized } from "@/lib/i18n";
import { unitLocationLabel } from "@/lib/unit-location";
import type { InvoiceLineKind } from "@prisma/client";

const componentLabelKey: Record<InvoiceLineKind, "componentRent" | "componentCommission" | "componentCleaning" | "componentSecurityDeposit"> = {
  RENT: "componentRent",
  COMMISSION: "componentCommission",
  CLEANING: "componentCleaning",
  SECURITY_DEPOSIT: "componentSecurityDeposit",
  OTHER: "componentRent",
};

export default async function IssueInvoicePage({
  params,
}: {
  params: Promise<{ scheduleId: string }>;
}) {
  const { scheduleId } = await params;
  const [{ schedule, components }, locale] = await Promise.all([
    getScheduleBillableComponents(scheduleId),
    getLocale(),
  ]);
  const t = getDictionary(locale);
  const sar = currencyFormatter(locale);
  const dateFmt = shortDateFormatter(locale);

  const renterName = pickLocalized(locale, schedule.contract.renter.fullNameAr, schedule.contract.renter.fullName);
  const propertyName = unitLocationLabel(locale, schedule.contract.unit);
  const unitLabel = `${propertyName} / ${schedule.contract.unit.unitNumber}`;

  async function submit(formData: FormData) {
    "use server";
    const invoiceId = await issueInvoiceForSchedule(formData);
    redirect(`/invoices/${invoiceId}`);
  }

  return (
    <div className="space-y-6 max-w-lg">
      <div>
        <Link href="/collections" className="text-brand-gold-dark hover:underline text-sm">
          {t.collections.issuePage.back}
        </Link>
        <h1 className="text-2xl font-bold text-slate-900 mt-2">{t.collections.issuePage.title}</h1>
        <p className="text-slate-500 text-sm mt-1">{t.collections.issuePage.subtitle(renterName, unitLabel)}</p>
        <p className="text-slate-400 text-xs mt-1">{t.collections.issuePage.dueOn(dateFmt.format(schedule.dueDate))}</p>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
        {components.length === 0 ? (
          <p className="text-slate-400 text-sm">{t.collections.issuePage.noComponents}</p>
        ) : (
          <form action={submit} className="space-y-4">
            <input type="hidden" name="scheduleId" value={schedule.id} />
            <div className="space-y-2">
              {components.map((c) => (
                <label
                  key={c.kind}
                  className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 px-4 py-3 cursor-pointer hover:border-brand-gold"
                >
                  <span className="flex items-center gap-3">
                    <input type="checkbox" name="kind" value={c.kind} defaultChecked className="rounded border-slate-300" />
                    <span className="text-sm text-slate-700">{t.collections.issuePage[componentLabelKey[c.kind]]}</span>
                  </span>
                  <span className="text-sm font-medium text-slate-800">{sar.format(c.amount)}</span>
                </label>
              ))}
            </div>
            <button className="w-full bg-brand-gold hover:bg-brand-gold-dark text-brand-black rounded-lg px-5 py-2.5 font-semibold">
              {t.collections.issuePage.submit}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
