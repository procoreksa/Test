import { createDocumentWithFile } from "@/lib/actions/documents";
import { getLocale, getDictionary } from "@/lib/i18n";
import type { DocumentCategory, DocumentEntityType, DocumentVisibility } from "@prisma/client";

export default async function NewDocumentPage({
  searchParams,
}: {
  searchParams: Promise<{ entityType?: string; entityId?: string; error?: string }>;
}) {
  const [locale, params] = await Promise.all([getLocale(), searchParams]);
  const t = getDictionary(locale);

  // A trusted, application-generated preselection (e.g. the "Upload
  // Document" link on a Contract/Unit/Renter page's DocumentsCard, which
  // always passes its own already-organization-scoped record id) is
  // rendered as a locked reference rather than an editable field, so the
  // id never has to be manually re-typed/copy-pasted - the exact class of
  // human error a production incident traced this failure to. This is a
  // UX convenience only: createDocumentWithFile() still independently
  // re-validates entity existence and organization scope server-side no
  // matter how this value arrived (never trust the query string).
  const trimmedEntityId = params.entityId?.trim();
  const preselectedEntityType =
    params.entityType && params.entityType in t.documentEntityTypeLabel ? (params.entityType as DocumentEntityType) : null;
  const hasPreselectedEntity = Boolean(preselectedEntityType && trimmedEntityId);

  async function submit(formData: FormData) {
    "use server";
    const { redirect } = await import("next/navigation");
    try {
      const { documentId } = await createDocumentWithFile(formData);
      redirect(`/documents/${documentId}`);
    } catch (error) {
      if (error && typeof error === "object" && "digest" in error) throw error; // rethrow Next.js redirect
      redirect(`/documents/new?error=${encodeURIComponent(error instanceof Error ? error.message : String(error))}`);
    }
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">{t.documents.newTitle}</h1>
        <p className="text-slate-500 text-sm mt-1">{t.documents.newSubtitle}</p>
      </div>

      {params.error && <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-4 text-sm">{decodeURIComponent(params.error)}</div>}

      <form action={submit} className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 space-y-5">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">{t.documents.fieldTitle}</label>
          <input name="title" required className="w-full rounded-lg border border-slate-300 px-3 py-2" />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">{t.documents.fieldCategory}</label>
            <select name="category" required defaultValue="GENERAL" className="w-full rounded-lg border border-slate-300 px-3 py-2">
              {(Object.keys(t.documentCategoryLabel) as DocumentCategory[]).map((v) => (
                <option key={v} value={v}>
                  {t.documentCategoryLabel[v]}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">{t.documents.fieldVisibility}</label>
            <select name="visibility" required defaultValue="INTERNAL_ONLY" className="w-full rounded-lg border border-slate-300 px-3 py-2">
              {(Object.keys(t.documentVisibilityLabel) as DocumentVisibility[]).map((v) => (
                <option key={v} value={v}>
                  {t.documentVisibilityLabel[v]}
                </option>
              ))}
            </select>
          </div>
        </div>

        {hasPreselectedEntity && preselectedEntityType && trimmedEntityId ? (
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">{t.documents.fieldEntityType}</label>
            <p className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-slate-700 text-sm">
              {t.documentEntityTypeLabel[preselectedEntityType]}
              <span className="text-slate-400 font-mono text-xs ms-2">({trimmedEntityId})</span>
            </p>
            <p className="text-xs text-slate-400 mt-1">{t.documents.fieldEntityLockedHint}</p>
            <input type="hidden" name="securityContextEntityType" value={preselectedEntityType} />
            <input type="hidden" name="securityContextEntityId" value={trimmedEntityId} />
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">{t.documents.fieldEntityType}</label>
              <select name="securityContextEntityType" required defaultValue="CONTRACT" className="w-full rounded-lg border border-slate-300 px-3 py-2">
                {(Object.keys(t.documentEntityTypeLabel) as DocumentEntityType[]).map((v) => (
                  <option key={v} value={v}>
                    {t.documentEntityTypeLabel[v]}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">{t.documents.fieldEntityId}</label>
              <input name="securityContextEntityId" required className="w-full rounded-lg border border-slate-300 px-3 py-2" />
              <p className="text-xs text-slate-400 mt-1">{t.documents.fieldEntityIdHint}</p>
            </div>
          </div>
        )}

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">{t.documents.fieldFile}</label>
          <input type="file" name="file" required accept=".pdf,.jpg,.jpeg,.png,.webp" className="w-full rounded-lg border border-slate-300 px-3 py-2" />
          <p className="text-xs text-slate-400 mt-1">{t.documents.fileHint}</p>
        </div>

        <button className="bg-brand-gold hover:bg-brand-gold-dark text-brand-black rounded-lg px-5 py-2.5 font-semibold text-sm">{t.documents.createButton}</button>
      </form>
    </div>
  );
}
