import { getTenantDocuments } from "@/lib/actions/portal/documents";
import { getLocale, getDictionary } from "@/lib/i18n";

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default async function TenantDocumentsPage() {
  const [documents, locale] = await Promise.all([getTenantDocuments(), getLocale()]);
  const t = getDictionary(locale);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">{t.documents.portalTitle}</h1>
        <p className="text-slate-500 text-sm mt-1">{t.documents.portalSubtitle}</p>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm divide-y divide-slate-100">
        {documents.map((doc) => (
          <div key={doc.documentId} className="p-4 flex items-center justify-between gap-4">
            <div>
              <p className="font-medium text-slate-800">{doc.title}</p>
              <p className="text-xs text-slate-500 mt-0.5">
                {t.documentCategoryLabel[doc.category as keyof typeof t.documentCategoryLabel] ?? doc.category}
                {doc.currentVersion && ` · ${doc.currentVersion.fileName} (${formatFileSize(doc.currentVersion.fileSize)})`}
              </p>
            </div>
            {doc.canDownload ? (
              <a href={`/api/portal/documents/${doc.documentId}/download`} className="bg-brand-gold hover:bg-brand-gold-dark text-brand-black rounded-lg px-4 py-2 font-semibold text-sm whitespace-nowrap">
                {t.documents.portalDownloadButton}
              </a>
            ) : (
              <span className="text-xs text-slate-400 whitespace-nowrap">{t.documents.portalNoVersion}</span>
            )}
          </div>
        ))}
        {documents.length === 0 && <div className="p-8 text-center text-slate-400 text-sm">{t.documents.portalEmpty}</div>}
      </div>
    </div>
  );
}
