import Link from "next/link";
import { listDocumentsForEntity } from "@/lib/actions/documents";
import { getLocale, getDictionary } from "@/lib/i18n";
import type { DocumentEntityType } from "@prisma/client";

/**
 * Reusable integration card for internal Contract/Owner/Unit pages (Step
 * 45-48). Deliberately scoped to EXACTLY the given (entityType, entityId)
 * security context - never widened to "every document related to this
 * Renter/Contract chain" (Step 46/47's explicit non-leakage rule: a
 * Renter's page must not expose every Contract document merely because the
 * renter relation exists, and a Unit's building plans may be
 * INTERNAL_ONLY). Uses listDocumentsForEntity(), which itself only ever
 * queries `securityContextEntityType`/`Id` - the one authoritative link -
 * never DocumentLink rows (those are non-authorizing discoverability
 * metadata only).
 */
export async function DocumentsCard({ entityType, entityId }: { entityType: DocumentEntityType; entityId: string }) {
  const [documents, locale] = await Promise.all([listDocumentsForEntity(entityType, entityId), getLocale()]);
  const t = getDictionary(locale);

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-semibold text-slate-800">{t.documents.navTitle}</h2>
        <Link
          href={`/documents/new?entityType=${entityType}&entityId=${entityId}`}
          className="text-xs font-semibold text-brand-gold-dark hover:underline"
        >
          {t.documents.newButton}
        </Link>
      </div>
      <ul className="divide-y divide-slate-100">
        {documents.map((doc) => (
          <li key={doc.id} className="py-2 flex items-center justify-between text-sm">
            <Link href={`/documents/${doc.id}`} className="text-slate-700 hover:underline">
              {doc.title}
            </Link>
            <span className="text-xs text-slate-400">{t.documentCategoryLabel[doc.category]}</span>
          </li>
        ))}
        {documents.length === 0 && <li className="py-2 text-sm text-slate-400">{t.documents.empty}</li>}
      </ul>
    </div>
  );
}
