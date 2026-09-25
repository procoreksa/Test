import { getTenantContracts } from "@/lib/actions/portal/tenancy";
import { getTenantPaymentSchedule } from "@/lib/actions/portal/finance";
import { getLocale, getDictionary, currencyFormatter, shortDateFormatter } from "@/lib/i18n";

export default async function TenantPaymentsPage() {
  const { current } = await getTenantContracts();
  const [schedule, locale] = await Promise.all([current ? getTenantPaymentSchedule(current.id) : Promise.resolve([]), getLocale()]);
  const t = getDictionary(locale);
  const moneyFmt = currencyFormatter(locale);
  const dateFmt = shortDateFormatter(locale);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-slate-900">{t.tenantPortal.paymentScheduleTitle}</h1>

      {!current ? (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 text-center text-slate-500">{t.tenantPortal.noCurrentTenancy}</div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-500 text-right">
              <tr>
                <th className="px-4 py-3 font-medium">{t.tenantPortal.colInstallment}</th>
                <th className="px-4 py-3 font-medium">{t.tenantPortal.colDueDate}</th>
                <th className="px-4 py-3 font-medium">{t.tenantPortal.colAmount}</th>
                <th className="px-4 py-3 font-medium">{t.tenantPortal.colStatus}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {schedule.map((s) => (
                <tr key={s.id}>
                  <td className="px-4 py-3 font-medium text-slate-800">#{s.installmentNo}</td>
                  <td className="px-4 py-3 text-slate-500 whitespace-nowrap">{dateFmt.format(s.dueDate)}</td>
                  <td className="px-4 py-3 text-slate-700">{moneyFmt.format(Number(s.amount))}</td>
                  <td className="px-4 py-3 text-slate-500">{t.scheduleStatus[s.status]}</td>
                </tr>
              ))}
              {schedule.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-5 py-8 text-center text-slate-400">
                    {t.tenantPortal.emptyInvoices}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
