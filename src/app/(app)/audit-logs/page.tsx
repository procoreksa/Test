import Link from "next/link";
import { listAuditLogs, listAuditActors } from "@/lib/actions/audit";
import { getCurrentUserRole } from "@/lib/session";
import { can } from "@/lib/permissions";
import { getLocale, getDictionary, longDateTimeFormatter } from "@/lib/i18n";
import { PrintButton } from "@/components/print-button";
import type { AuditAction } from "@/lib/audit";

function formatChangesSummary(previousValues: unknown, newValues: unknown): string {
  if (!newValues || typeof newValues !== "object") return "—";
  const after = newValues as Record<string, unknown>;
  const before = (previousValues && typeof previousValues === "object" ? previousValues : {}) as Record<string, unknown>;
  const fields = Object.keys(after);
  if (fields.length === 0) return "—";
  return fields
    .slice(0, 3)
    .map((f) => {
      const from = before[f];
      const to = after[f];
      const fromStr = from === null || from === undefined ? "—" : typeof from === "object" ? JSON.stringify(from) : String(from);
      const toStr = to === null || to === undefined ? "—" : typeof to === "object" ? JSON.stringify(to) : String(to);
      return from === undefined ? `${f}: ${toStr}` : `${f}: ${fromStr} → ${toStr}`;
    })
    .join(" · ");
}

export default async function AuditLogsPage({
  searchParams,
}: {
  searchParams: Promise<{
    from?: string;
    to?: string;
    userId?: string;
    action?: string;
    entityType?: string;
    entityId?: string;
    financialOnly?: string;
    q?: string;
    page?: string;
  }>;
}) {
  const params = await searchParams;
  const [role, locale] = await Promise.all([getCurrentUserRole(), getLocale()]);
  const t = getDictionary(locale);
  const dateFmt = longDateTimeFormatter(locale);
  const canExport = can("audit.export", role);

  const filters = {
    from: params.from ? new Date(params.from) : undefined,
    to: params.to ? new Date(`${params.to}T23:59:59`) : undefined,
    userId: params.userId || undefined,
    action: params.action || undefined,
    entityType: params.entityType || undefined,
    entityId: params.entityId || undefined,
    financialOnly: params.financialOnly === "on",
    search: params.q || undefined,
    page: params.page ? Number(params.page) : 1,
  };

  const [{ rows, page, totalPages }, actors] = await Promise.all([listAuditLogs(filters), listAuditActors()]);

  function pageHref(nextPage: number) {
    const usp = new URLSearchParams();
    if (params.from) usp.set("from", params.from);
    if (params.to) usp.set("to", params.to);
    if (params.userId) usp.set("userId", params.userId);
    if (params.action) usp.set("action", params.action);
    if (params.entityType) usp.set("entityType", params.entityType);
    if (params.entityId) usp.set("entityId", params.entityId);
    if (params.financialOnly) usp.set("financialOnly", params.financialOnly);
    if (params.q) usp.set("q", params.q);
    usp.set("page", String(nextPage));
    return `/audit-logs?${usp.toString()}`;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between no-print">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{t.auditLogs.title}</h1>
          <p className="text-slate-500 text-sm mt-1">{t.auditLogs.subtitle}</p>
        </div>
        {canExport && <PrintButton label={t.printButton} />}
      </div>

      <form method="get" className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 grid grid-cols-1 md:grid-cols-4 gap-4 no-print">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">{t.auditLogs.filterFrom}</label>
          <input type="date" name="from" defaultValue={params.from} className="w-full rounded-lg border border-slate-300 px-3 py-2" />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">{t.auditLogs.filterTo}</label>
          <input type="date" name="to" defaultValue={params.to} className="w-full rounded-lg border border-slate-300 px-3 py-2" />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">{t.auditLogs.filterUser}</label>
          <select name="userId" defaultValue={params.userId ?? ""} className="w-full rounded-lg border border-slate-300 px-3 py-2">
            <option value="">{t.common.none}</option>
            {actors.map((a) => (
              <option key={a.userId} value={a.userId}>
                {a.userEmail ?? a.userId}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">{t.auditLogs.filterAction}</label>
          <select name="action" defaultValue={params.action ?? ""} className="w-full rounded-lg border border-slate-300 px-3 py-2">
            <option value="">{t.common.none}</option>
            {(Object.keys(t.auditAction) as AuditAction[]).map((a) => (
              <option key={a} value={a}>
                {t.auditAction[a]}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">{t.auditLogs.filterEntityType}</label>
          <input name="entityType" defaultValue={params.entityType} className="w-full rounded-lg border border-slate-300 px-3 py-2" />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">{t.auditLogs.filterEntityId}</label>
          <input name="entityId" defaultValue={params.entityId} className="w-full rounded-lg border border-slate-300 px-3 py-2" />
        </div>
        <div className="md:col-span-2">
          <label className="block text-sm font-medium text-slate-700 mb-1">{t.reports.searchPlaceholder}</label>
          <input name="q" defaultValue={params.q} placeholder={t.auditLogs.searchPlaceholder} className="w-full rounded-lg border border-slate-300 px-3 py-2" />
        </div>
        {(role === "OWNER" || role === "ADMIN") && (
          <label className="flex items-center gap-2 mt-6 text-sm text-slate-600">
            <input type="checkbox" name="financialOnly" defaultChecked={params.financialOnly === "on"} className="rounded border-slate-300" />
            {t.auditLogs.filterFinancialOnly}
          </label>
        )}
        <div className="md:col-span-4">
          <button className="bg-brand-gold hover:bg-brand-gold-dark text-brand-black rounded-lg px-5 py-2.5 font-semibold">
            {t.auditLogs.filterApply}
          </button>
        </div>
      </form>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-500 text-right">
            <tr>
              <th className="px-5 py-3 font-medium">{t.auditLogs.colDate}</th>
              <th className="px-5 py-3 font-medium">{t.auditLogs.colUser}</th>
              <th className="px-5 py-3 font-medium">{t.auditLogs.colAction}</th>
              <th className="px-5 py-3 font-medium">{t.auditLogs.colEntity}</th>
              <th className="px-5 py-3 font-medium">{t.auditLogs.colChanges}</th>
              <th className="px-5 py-3 font-medium">{t.auditLogs.colCategory}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((row) => (
              <tr key={row.id}>
                <td className="px-5 py-3 text-slate-500 whitespace-nowrap">{dateFmt.format(row.createdAt)}</td>
                <td className="px-5 py-3 text-slate-700">{row.userEmail ?? t.auditLogs.system}</td>
                <td className="px-5 py-3 font-medium text-slate-800">{t.auditAction[row.action as AuditAction] ?? row.action}</td>
                <td className="px-5 py-3 text-slate-500">
                  {row.entityType} — {row.entityDisplayName ?? row.entityId}
                </td>
                <td className="px-5 py-3 text-slate-500 text-xs max-w-xs truncate" title={formatChangesSummary(row.previousValues, row.newValues)}>
                  {formatChangesSummary(row.previousValues, row.newValues)}
                </td>
                <td className="px-5 py-3">
                  <span className="px-2 py-1 rounded-full text-xs font-medium bg-slate-100 text-slate-600">{row.category}</span>
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={6} className="px-5 py-8 text-center text-slate-400">
                  {t.auditLogs.empty}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between no-print">
        <span className="text-sm text-slate-500">{t.auditLogs.pageOf(page, totalPages)}</span>
        <div className="flex gap-2">
          {page > 1 && (
            <Link href={pageHref(page - 1)} className="text-sm text-brand-gold-dark hover:underline">
              {t.auditLogs.previous}
            </Link>
          )}
          {page < totalPages && (
            <Link href={pageHref(page + 1)} className="text-sm text-brand-gold-dark hover:underline">
              {t.auditLogs.next}
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
