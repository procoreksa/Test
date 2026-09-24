import Link from "next/link";
import { listDocuments } from "@/lib/actions/documents";
import { getLocale, getDictionary } from "@/lib/i18n";
import type { DocumentCategory, DocumentStatus } from "@prisma/client";

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default async function DocumentsPage({
  searchParams,
}: {
  searchParams: Promise<{ category?: string; status?: string; q?: string; page?: string }>;
}) {
  const params = await searchParams;
  const locale = await getLocale();
  const t = getDictionary(locale);

  const filters = {
    category: (params.category as DocumentCategory) || undefined,
    status: (params.status as DocumentStatus) || undefined,
    q: params.q || undefined,
    page: params.page ? Number(params.page) : 1,
  };

  const { rows, page, totalPages } = await listDocuments(filters);

  function pageHref(nextPage: number) {
    const usp = new URLSearchParams();
    if (params.category) usp.set("category", params.category);
    if (params.status) usp.set("status", params.status);
    if (params.q) usp.set("q", params.q);
    usp.set("page", String(nextPage));
    return `/documents?${usp.toString()}`;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{t.documents.listTitle}</h1>
          <p className="text-slate-500 text-sm mt-1">{t.documents.listSubtitle}</p>
        </div>
        <Link href="/documents/new" className="bg-brand-gold hover:bg-brand-gold-dark text-brand-black rounded-lg px-5 py-2.5 font-semibold text-sm">
          {t.documents.newButton}
        </Link>
      </div>

      <form method="get" className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 grid grid-cols-1 md:grid-cols-4 gap-4">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">{t.documents.filterCategory}</label>
          <select name="category" defaultValue={params.category ?? ""} className="w-full rounded-lg border border-slate-300 px-3 py-2">
            <option value="">{t.documents.filterAll}</option>
            {(Object.keys(t.documentCategoryLabel) as DocumentCategory[]).map((v) => (
              <option key={v} value={v}>
                {t.documentCategoryLabel[v]}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">{t.documents.filterStatus}</label>
          <select name="status" defaultValue={params.status ?? "ACTIVE"} className="w-full rounded-lg border border-slate-300 px-3 py-2">
            {(Object.keys(t.documentStatusLabel) as DocumentStatus[]).map((v) => (
              <option key={v} value={v}>
                {t.documentStatusLabel[v]}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">{t.documents.filterSearch}</label>
          <input name="q" defaultValue={params.q} className="w-full rounded-lg border border-slate-300 px-3 py-2" />
        </div>
        <div className="flex items-end">
          <button className="bg-brand-gold hover:bg-brand-gold-dark text-brand-black rounded-lg px-5 py-2.5 font-semibold w-full">{t.documents.filterApply}</button>
        </div>
      </form>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-500 text-right">
            <tr>
              <th className="px-4 py-3 font-medium">{t.documents.colDocumentNumber}</th>
              <th className="px-4 py-3 font-medium">{t.documents.colTitle}</th>
              <th className="px-4 py-3 font-medium">{t.documents.colCategory}</th>
              <th className="px-4 py-3 font-medium">{t.documents.colVisibility}</th>
              <th className="px-4 py-3 font-medium">{t.documents.colEntity}</th>
              <th className="px-4 py-3 font-medium">{t.documents.colCurrentVersion}</th>
              <th className="px-4 py-3 font-medium">{t.documents.colCreatedAt}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((doc) => (
              <tr key={doc.id}>
                <td className="px-4 py-3 font-medium text-slate-800 whitespace-nowrap">
                  <Link href={`/documents/${doc.id}`} className="hover:underline">
                    {doc.documentNumber}
                  </Link>
                </td>
                <td className="px-4 py-3 text-slate-700">{doc.title}</td>
                <td className="px-4 py-3 text-slate-500">{t.documentCategoryLabel[doc.category]}</td>
                <td className="px-4 py-3 text-slate-500">{t.documentVisibilityLabel[doc.visibility]}</td>
                <td className="px-4 py-3 text-slate-500 whitespace-nowrap">
                  {t.documentEntityTypeLabel[doc.securityContextEntityType]}
                </td>
                <td className="px-4 py-3 text-slate-500">
                  {doc.currentVersion ? `${doc.currentVersion.fileName} (${formatFileSize(doc.currentVersion.fileSize)})` : t.documents.noCurrentVersion}
                </td>
                <td className="px-4 py-3 text-slate-500 whitespace-nowrap">{new Date(doc.createdAt).toLocaleString(locale)}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-slate-400">
                  {t.documents.empty}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between">
        <span className="text-sm text-slate-500">{t.documents.pageOf(page, totalPages)}</span>
        <div className="flex gap-2">
          {page > 1 && (
            <Link href={pageHref(page - 1)} className="text-sm text-brand-gold-dark hover:underline">
              {t.documents.previous}
            </Link>
          )}
          {page < totalPages && (
            <Link href={pageHref(page + 1)} className="text-sm text-brand-gold-dark hover:underline">
              {t.documents.next}
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
