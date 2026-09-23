import Link from "next/link";
import { getLocale, getDictionary } from "@/lib/i18n";

/**
 * The Owner Portal's own neutral Not Found page (anti-enumeration). Every
 * entitlement helper in src/lib/owner-session.ts calls Next's notFound() on
 * any ownership mismatch - id malformed, belongs to another owner in the
 * same organization, belongs to another organization, or (for a Unit) is
 * explicitly owned by someone else even though this owner holds the parent
 * Compound/Building - so this exact page renders identically in every
 * case; it never reveals which. Rendered inside the protected route
 * group's own layout (never the internal staff shell nor the Tenant
 * Portal's), so it only ever reaches an authenticated owner. Mirrors
 * src/app/portal/(portal)/not-found.tsx's own Tenant Portal precedent.
 */
export default async function OwnerPortalNotFound() {
  const t = getDictionary(await getLocale());

  return (
    <div className="flex flex-col items-center justify-center text-center py-20">
      <h1 className="text-2xl font-bold text-slate-900 mb-2">{t.ownerPortal.notFoundTitle}</h1>
      <p className="text-slate-500 mb-6">{t.ownerPortal.notFoundMessage}</p>
      <Link href="/owner-portal" className="bg-brand-gold hover:bg-brand-gold-dark text-brand-black rounded-lg px-5 py-2.5 font-semibold text-sm">
        {t.ownerPortal.notFoundBackLink}
      </Link>
    </div>
  );
}
