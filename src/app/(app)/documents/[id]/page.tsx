import Link from "next/link";
import {
  getDocumentDetail,
  addDocumentVersion,
  changeDocumentVisibility,
  archiveDocument,
  restoreDocument,
  addDocumentLink,
  removeDocumentLink,
} from "@/lib/actions/documents";
import { isInlinePreviewable } from "@/lib/documents/visibility";
import { getCurrentUserRole } from "@/lib/session";
import { can } from "@/lib/permissions";
import { getLocale, getDictionary } from "@/lib/i18n";
import type { DocumentEntityType, DocumentVisibility } from "@prisma/client";

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default async function DocumentDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { id } = await params;
  const [{ document, auditTrail }, role, locale, sp] = await Promise.all([
    getDocumentDetail(id),
    getCurrentUserRole(),
    getLocale(),
    searchParams,
  ]);
  const t = getDictionary(locale);

  const canDownload = can("document.download", role);
  const canVersion = can("document.version.create", role);
  const canArchive = can("document.archive", role);
  const canRestore = can("document.restore", role);
  const canManageVisibility = can("document.visibility.manage", role);
  const canManageLinks = can("document.link.manage", role);

  async function uploadVersion(formData: FormData) {
    "use server";
    const { redirect } = await import("next/navigation");
    formData.set("documentId", id);
    try {
      await addDocumentVersion(formData);
      redirect(`/documents/${id}`);
    } catch (error) {
      if (error && typeof error === "object" && "digest" in error) throw error;
      redirect(`/documents/${id}?error=${encodeURIComponent(error instanceof Error ? error.message : String(error))}`);
    }
  }

  async function saveVisibility(formData: FormData) {
    "use server";
    formData.set("documentId", id);
    await changeDocumentVisibility(formData);
  }

  async function archive() {
    "use server";
    const formData = new FormData();
    formData.set("documentId", id);
    await archiveDocument(formData);
  }

  async function restore() {
    "use server";
    const formData = new FormData();
    formData.set("documentId", id);
    await restoreDocument(formData);
  }

  async function addLink(formData: FormData) {
    "use server";
    const { redirect } = await import("next/navigation");
    formData.set("documentId", id);
    try {
      await addDocumentLink(formData);
      redirect(`/documents/${id}`);
    } catch (error) {
      if (error && typeof error === "object" && "digest" in error) throw error;
      redirect(`/documents/${id}?error=${encodeURIComponent(error instanceof Error ? error.message : String(error))}`);
    }
  }

  async function removeLink(formData: FormData) {
    "use server";
    await removeDocumentLink(formData);
  }

  const currentVersionInline = document.currentVersion ? isInlinePreviewable(document.currentVersion.mimeType) : false;

  return (
    <div className="space-y-6">
      <div>
        <Link href="/documents" className="text-brand-gold-dark hover:underline text-sm">
          ← {t.documents.backLabel}
        </Link>
        <div className="flex items-center justify-between mt-2">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">
              {document.documentNumber} — {document.title}
            </h1>
            <div className="mt-2 flex items-center gap-2 text-xs">
              <span className={`px-2 py-1 rounded-full font-medium ${document.status === "ARCHIVED" ? "bg-slate-200 text-slate-600" : "bg-emerald-50 text-emerald-700"}`}>
                {document.status === "ARCHIVED" ? t.documents.archivedBadge : t.documents.activeBadge}
              </span>
              <span className="px-2 py-1 rounded-full bg-slate-100 text-slate-600 font-medium">{t.documentCategoryLabel[document.category]}</span>
              <span className="px-2 py-1 rounded-full bg-slate-100 text-slate-600 font-medium">{t.documentVisibilityLabel[document.visibility]}</span>
            </div>
          </div>
          <div className="flex gap-2">
            {canArchive && document.status === "ACTIVE" && (
              <form action={archive}>
                <button className="bg-red-50 hover:bg-red-100 text-red-700 rounded-lg px-4 py-2 font-semibold text-sm">{t.documents.archiveButton}</button>
              </form>
            )}
            {canRestore && document.status === "ARCHIVED" && (
              <form action={restore}>
                <button className="bg-emerald-50 hover:bg-emerald-100 text-emerald-700 rounded-lg px-4 py-2 font-semibold text-sm">{t.documents.restoreButton}</button>
              </form>
            )}
          </div>
        </div>
      </div>

      {sp.error && <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-4 text-sm">{decodeURIComponent(sp.error)}</div>}

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
        <h2 className="font-semibold text-slate-800 mb-3">{t.documents.sectionCurrentVersion}</h2>
        {document.currentVersion ? (
          <div className="flex items-center justify-between">
            <div className="text-sm text-slate-600">
              <p className="font-medium text-slate-800">{document.currentVersion.fileName}</p>
              <p>
                {document.currentVersion.mimeType} · {formatFileSize(document.currentVersion.fileSize)} · v{document.currentVersion.versionNumber}
              </p>
              <p className="text-xs text-slate-400 mt-1">
                {t.documents.securityContextLabel}: {t.documentEntityTypeLabel[document.securityContextEntityType]} ({document.securityContextEntityId})
              </p>
            </div>
            {canDownload && (
              <div className="flex gap-2">
                {currentVersionInline && (
                  <a
                    href={`/api/documents/${document.id}/download?mode=inline`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg px-4 py-2 font-semibold text-sm"
                  >
                    {t.documents.previewButton}
                  </a>
                )}
                <a href={`/api/documents/${document.id}/download`} className="bg-brand-gold hover:bg-brand-gold-dark text-brand-black rounded-lg px-4 py-2 font-semibold text-sm">
                  {t.documents.downloadButton}
                </a>
              </div>
            )}
          </div>
        ) : (
          <p className="text-sm text-slate-400">{t.documents.noCurrentVersion}</p>
        )}
      </div>

      {canVersion && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
          <h2 className="font-semibold text-slate-800 mb-3">{t.documents.uploadNewVersionTitle}</h2>
          <form action={uploadVersion} className="flex flex-col sm:flex-row gap-3">
            <input type="file" name="file" required accept=".pdf,.jpg,.jpeg,.png,.webp" className="flex-1 rounded-lg border border-slate-300 px-3 py-2" />
            <button className="bg-brand-gold hover:bg-brand-gold-dark text-brand-black rounded-lg px-5 py-2.5 font-semibold text-sm whitespace-nowrap">
              {t.documents.uploadNewVersionButton}
            </button>
          </form>
        </div>
      )}

      {canManageVisibility && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
          <h2 className="font-semibold text-slate-800 mb-3">{t.documents.changeVisibilityTitle}</h2>
          <form action={saveVisibility} className="flex flex-col sm:flex-row gap-3">
            <select name="visibility" defaultValue={document.visibility} className="flex-1 rounded-lg border border-slate-300 px-3 py-2">
              {(Object.keys(t.documentVisibilityLabel) as DocumentVisibility[]).map((v) => (
                <option key={v} value={v}>
                  {t.documentVisibilityLabel[v]}
                </option>
              ))}
            </select>
            <button className="bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg px-5 py-2.5 font-semibold text-sm whitespace-nowrap">
              {t.documents.changeVisibilityButton}
            </button>
          </form>
        </div>
      )}

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-x-auto">
        <h2 className="font-semibold text-slate-800 p-5 pb-0">{t.documents.sectionVersionHistory}</h2>
        <table className="w-full text-sm mt-3">
          <thead className="bg-slate-50 text-slate-500 text-right">
            <tr>
              <th className="px-4 py-3 font-medium">{t.documents.colVersionNumber}</th>
              <th className="px-4 py-3 font-medium">{t.documents.colFileName}</th>
              <th className="px-4 py-3 font-medium">{t.documents.colMimeType}</th>
              <th className="px-4 py-3 font-medium">{t.documents.colFileSize}</th>
              <th className="px-4 py-3 font-medium">{t.documents.colUploadedAt}</th>
              {canDownload && <th className="px-4 py-3 font-medium"></th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {document.versions.map((v) => (
              <tr key={v.id}>
                <td className="px-4 py-3 font-medium text-slate-800">v{v.versionNumber}</td>
                <td className="px-4 py-3 text-slate-700">{v.fileName}</td>
                <td className="px-4 py-3 text-slate-500">{v.mimeType}</td>
                <td className="px-4 py-3 text-slate-500">{formatFileSize(v.fileSize)}</td>
                <td className="px-4 py-3 text-slate-500 whitespace-nowrap">{new Date(v.createdAt).toLocaleString(locale)}</td>
                {canDownload && (
                  <td className="px-4 py-3">
                    <a href={`/api/documents/${document.id}/download?versionId=${v.id}`} className="text-xs font-semibold text-brand-gold-dark hover:underline">
                      {t.documents.downloadButton}
                    </a>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
        <h2 className="font-semibold text-slate-800 mb-3">{t.documents.sectionLinks}</h2>
        <ul className="space-y-2 mb-4">
          {document.links.map((link) => (
            <li key={link.id} className="flex items-center justify-between text-sm text-slate-600">
              <span>
                {t.documentEntityTypeLabel[link.entityType]} ({link.entityId})
              </span>
              {canManageLinks && (
                <form action={removeLink}>
                  <input type="hidden" name="linkId" value={link.id} />
                  <button className="text-xs font-semibold text-red-600 hover:underline">{t.documents.removeLinkButton}</button>
                </form>
              )}
            </li>
          ))}
          {document.links.length === 0 && <li className="text-sm text-slate-400">{t.documents.emptyLinks}</li>}
        </ul>
        {canManageLinks && (
          <form action={addLink} className="flex flex-col sm:flex-row gap-3">
            <select name="entityType" required className="flex-1 rounded-lg border border-slate-300 px-3 py-2">
              {(Object.keys(t.documentEntityTypeLabel) as DocumentEntityType[]).map((v) => (
                <option key={v} value={v}>
                  {t.documentEntityTypeLabel[v]}
                </option>
              ))}
            </select>
            <input name="entityId" required placeholder={t.documents.fieldLinkEntityId} className="flex-1 rounded-lg border border-slate-300 px-3 py-2" />
            <button className="bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg px-5 py-2.5 font-semibold text-sm whitespace-nowrap">
              {t.documents.addLinkButton}
            </button>
          </form>
        )}
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-x-auto">
        <h2 className="font-semibold text-slate-800 p-5 pb-0">{t.documents.sectionAuditTrail}</h2>
        <table className="w-full text-sm mt-3">
          <thead className="bg-slate-50 text-slate-500 text-right">
            <tr>
              <th className="px-4 py-3 font-medium">{t.communications.colCreatedAt}</th>
              <th className="px-4 py-3 font-medium">{t.auditLogs.colUser}</th>
              <th className="px-4 py-3 font-medium">{t.auditLogs.colAction}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {auditTrail.map((row) => (
              <tr key={row.id}>
                <td className="px-4 py-3 text-slate-500 whitespace-nowrap">{new Date(row.createdAt).toLocaleString(locale)}</td>
                <td className="px-4 py-3 text-slate-700">{row.userEmail ?? t.auditLogs.system}</td>
                <td className="px-4 py-3 text-slate-500">{t.auditAction[row.action as keyof typeof t.auditAction] ?? row.action}</td>
              </tr>
            ))}
            {auditTrail.length === 0 && (
              <tr>
                <td colSpan={3} className="px-4 py-8 text-center text-slate-400">
                  {t.documents.emptyAuditTrail}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
