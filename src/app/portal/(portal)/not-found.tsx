import Link from "next/link";
import { getLocale, getDictionary } from "@/lib/i18n";

/**
 * The Tenant Portal's own neutral Not Found page (Step 10 - anti-
 * enumeration). Every entitlement helper in src/lib/tenant-session.ts
 * calls Next's notFound() on any ownership mismatch, so this exact page
 * renders identically whether an id was malformed, belonged to another
 * tenant in the same organization, or belonged to another organization
 * entirely - it never reveals which, or that the resource exists at all.
 * Rendered inside the protected route group's own layout (never the
 * internal staff shell), so it only ever reaches an authenticated tenant.
 */
export default async function TenantPortalNotFound() {
  const t = getDictionary(await getLocale());

  return (
    <div className="flex flex-col items-center justify-center text-center py-20">
      <h1 className="text-2xl font-bold text-slate-900 mb-2">{t.tenantPortal.notFoundTitle}</h1>
      <p className="text-slate-500 mb-6">{t.tenantPortal.notFoundMessage}</p>
      <Link href="/portal" className="bg-brand-gold hover:bg-brand-gold-dark text-brand-black rounded-lg px-5 py-2.5 font-semibold text-sm">
        {t.tenantPortal.notFoundBackLink}
      </Link>
    </div>
  );
}
