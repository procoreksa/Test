import Link from "next/link";
import { listCollections } from "@/lib/actions/collections";
import { getCurrentUserRole } from "@/lib/session";
import { can } from "@/lib/permissions";
import { getLocale, getDictionary, currencyFormatter, shortDateFormatter, pickLocalized } from "@/lib/i18n";

const statusTone: Record<string, string> = {
  PENDING: "bg-slate-100 text-slate-600",
  PARTIALLY_INVOICED: "bg-blue-50 text-blue-600",
  INVOICED: "bg-blue-100 text-blue-700",
  PAID: "bg-emerald-100 text-emerald-700",
  PARTIALLY_PAID: "bg-amber-100 text-amber-700",
  OVERDUE: "bg-red-100 text-red-700",
  CANCELLED: "bg-slate-100 text-slate-400",
};

const BILLABLE_STATUSES = new Set(["PENDING", "OVERDUE", "PARTIALLY_INVOICED", "PARTIALLY_PAID"]);

export default async function CollectionsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const [schedules, locale, { q }, role] = await Promise.all([listCollections(), getLocale(), searchParams, getCurrentUserRole()]);
  const t = getDictionary(locale);
  const sar = currencyFormatter(locale);
  const dateFmt = shortDateFormatter(locale);
  const canIssueInvoice = can("invoice.create", role);

  const query = (q ?? "").trim().toLowerCase();
  const filtered = query
    ? schedules.filter((s) => {
        const renter = s.contract.renter;
        return (
          renter.fullName.toLowerCase().includes(query) ||
          (renter.fullNameAr ?? "").toLowerCase().includes(query) ||
          s.contract.unit.unitNumber.toLowerCase().includes(query)
        );
      })
    : schedules;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">{t.collections.title}</h1>
        <p className="text-slate-500 text-sm mt-1">{t.collections.subtitle}</p>
      </div>

      <form className="max-w-sm">
        <input
          type="search"
          name="q"
          defaultValue={q ?? ""}
          placeholder={t.collections.searchPlaceholder}
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
        />
      </form>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-500 text-right">
            <tr>
              <th className="px-5 py-3 font-medium">{t.collections.colRenter}</th>
              <th className="px-5 py-3 font-medium">{t.collections.colUnit}</th>
              <th className="px-5 py-3 font-medium">{t.collections.colInstallment}</th>
              <th className="px-5 py-3 font-medium">{t.collections.colDueDate}</th>
              <th className="px-5 py-3 font-medium">{t.collections.colAmount}</th>
              <th className="px-5 py-3 font-medium">{t.collections.colStatus}</th>
              <th className="px-5 py-3 font-medium"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filtered.map((s) => {
              const invoices = Array.from(
                new Map(s.invoiceLines.map((l) => [l.invoice.id, l.invoice])).values()
              );
              return (
                <tr key={s.id}>
                  <td className="px-5 py-3 font-medium text-slate-800">
                    {pickLocalized(locale, s.contract.renter.fullNameAr, s.contract.renter.fullName)}
                  </td>
                  <td className="px-5 py-3 text-slate-500">
                    {pickLocalized(locale, s.contract.unit.property.nameAr, s.contract.unit.property.name)} /{" "}
                    {s.contract.unit.unitNumber}
                  </td>
                  <td className="px-5 py-3 text-slate-500">#{s.installmentNo}</td>
                  <td className="px-5 py-3 text-slate-500">{dateFmt.format(s.dueDate)}</td>
                  <td className="px-5 py-3 font-medium">{sar.format(Number(s.amount))}</td>
                  <td className="px-5 py-3">
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${statusTone[s.status]}`}>
                      {t.scheduleStatus[s.status]}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-left space-y-1">
                    {invoices.map((inv) => (
                      <Link
                        key={inv.id}
                        href={`/invoices/${inv.id}`}
                        className="block text-brand-gold-dark hover:underline text-xs"
                      >
                        {t.collections.viewInvoice}
                      </Link>
                    ))}
                    {canIssueInvoice && BILLABLE_STATUSES.has(s.status) && (
                      <Link
                        href={`/collections/${s.id}/issue`}
                        className="block text-brand-gold-dark hover:underline text-xs font-medium"
                      >
                        {t.collections.issueInvoice}
                      </Link>
                    )}
                    {invoices.length === 0 && !BILLABLE_STATUSES.has(s.status) && s.status !== "CANCELLED" && (
                      <span className="text-xs text-slate-400">{t.collections.fullyInvoiced}</span>
                    )}
                  </td>
                </tr>
              );
            })}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={7} className="px-5 py-8 text-center text-slate-400">
                  {t.collections.empty}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
