import { getEntityAuditTrail } from "@/lib/actions/audit";
import { getLocale, getDictionary, longDateTimeFormatter } from "@/lib/i18n";
import type { AuditAction } from "@/lib/audit";

function formatFieldChanges(
  previousValues: unknown,
  newValues: unknown
): Array<{ field: string; from: unknown; to: unknown }> {
  if (!newValues || typeof newValues !== "object") return [];
  const after = newValues as Record<string, unknown>;
  const before = (previousValues && typeof previousValues === "object" ? previousValues : {}) as Record<string, unknown>;
  return Object.keys(after).map((field) => ({ field, from: before[field], to: after[field] }));
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

/**
 * Reusable "who did what, when" timeline for one specific record - reads
 * directly from AuditLog via getEntityAuditTrail(). Mounted on detail pages
 * that have real per-record content (Invoice detail, Owner profile,
 * Contract edit) - see docs/AUDIT-AND-FINANCIAL-CONTROLS.md, "Entity audit
 * timeline".
 */
export async function AuditTimeline({ entityType, entityId }: { entityType: string; entityId: string }) {
  const [entries, locale] = await Promise.all([getEntityAuditTrail(entityType, entityId), getLocale()]);
  const t = getDictionary(locale);
  const dateFmt = longDateTimeFormatter(locale);

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
      <h2 className="font-semibold text-slate-800 mb-4">{t.auditTimeline.title}</h2>
      {entries.length === 0 ? (
        <p className="text-sm text-slate-400">{t.auditTimeline.empty}</p>
      ) : (
        <ul className="space-y-4">
          {entries.map((entry) => {
            const changes = formatFieldChanges(entry.previousValues, entry.newValues);
            return (
              <li key={entry.id} className="border-s-2 border-slate-200 ps-4">
                <p className="text-sm">
                  <span className="text-slate-400">{dateFmt.format(entry.createdAt)}</span>
                  {" — "}
                  <span className="font-medium text-slate-800">{t.auditAction[entry.action as AuditAction] ?? entry.action}</span>
                  {entry.userEmail && <span className="text-slate-500"> {t.auditTimeline.by(entry.userEmail)}</span>}
                </p>
                {changes.length > 0 && (
                  <ul className="mt-1 text-xs text-slate-500 space-y-0.5">
                    {changes.map((c) => (
                      <li key={c.field}>
                        {c.field}: {formatValue(c.from)} → {formatValue(c.to)}
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
