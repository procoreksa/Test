import { requireOwnerSession } from "@/lib/owner-session";
import { getOwnerPortalOrganizationBranding } from "@/lib/actions/owner-portal/portfolio";
import { ownerLogoutAction } from "@/lib/actions/owner-portal/auth-actions";
import { NavLink } from "@/components/nav-link";
import { LanguageSwitcher } from "@/components/language-switcher";
import { MobileSidebarShell } from "@/components/mobile-sidebar-shell";
import { getLocale, getDictionary } from "@/lib/i18n";

/**
 * The Owner Portal's own protected route group - a completely separate
 * shell from both src/app/(app)/layout.tsx's internal staff sidebar and
 * src/app/portal/(portal)/layout.tsx's Tenant Portal shell, never mixed
 * into either. Every page under this group is gated by
 * requireOwnerSession() here, exactly once, at the layout level -
 * individual pages/actions still re-verify resource ownership
 * independently (defense in depth, same posture the internal app and
 * Tenant Portal both use).
 */
export default async function OwnerPortalLayout({ children }: { children: React.ReactNode }) {
  await requireOwnerSession();
  const [locale, org] = await Promise.all([getLocale(), getOwnerPortalOrganizationBranding()]);
  const t = getDictionary(locale);
  const logoSrc = org.logoUrl || "/logo.jpg";

  const navItems = [
    { href: "/owner-portal", label: t.ownerPortal.navDashboard, icon: "🏠" },
    { href: "/owner-portal/properties", label: t.ownerPortal.navProperties, icon: "🏢" },
    { href: "/owner-portal/units", label: t.ownerPortal.navUnits, icon: "🚪" },
    { href: "/owner-portal/contracts", label: t.ownerPortal.navContracts, icon: "📄" },
    { href: "/owner-portal/financials", label: t.ownerPortal.navFinancials, icon: "💰" },
    { href: "/owner-portal/ledger", label: t.ownerPortal.navLedger, icon: "📒" },
    { href: "/owner-portal/statements", label: t.ownerPortal.navStatements, icon: "🧾" },
    { href: "/owner-portal/maintenance", label: t.ownerPortal.navMaintenance, icon: "🛠️" },
    { href: "/owner-portal/documents", label: t.ownerPortal.navDocuments, icon: "📁" },
    { href: "/owner-portal/profile", label: t.ownerPortal.navProfile, icon: "👤" },
  ];

  const brandMark = (
    <div className="flex items-center gap-2">
      <div className="w-8 h-8 rounded-full overflow-hidden ring-1 ring-brand-gold/60 shrink-0 bg-white">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={logoSrc} alt="" className="w-full h-full object-cover" />
      </div>
      <p className="font-bold text-brand-gold leading-tight tracking-wide text-sm">{t.ownerPortal.portalTitle}</p>
    </div>
  );

  return (
    <div className="min-h-screen flex flex-col md:flex-row">
      <MobileSidebarShell brand={brandMark} openLabel={t.nav.openMenu} closeLabel={t.nav.closeMenu}>
        <div className="flex items-center gap-2 px-2 mb-4">
          <div className="w-10 h-10 rounded-full overflow-hidden ring-1 ring-brand-gold/60 shrink-0 bg-white">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={logoSrc} alt="" className="w-full h-full object-cover" />
          </div>
          <div>
            <p className="font-bold text-brand-gold leading-tight tracking-wide">{t.ownerPortal.portalTitle}</p>
          </div>
        </div>

        <div className="px-2 mb-6">
          <LanguageSwitcher locale={locale} labels={t.languageSwitcher} tone="dark" />
        </div>

        <nav className="flex-1 space-y-1 overflow-y-auto">
          {navItems.map((item) => (
            <NavLink key={item.href} {...item} />
          ))}
        </nav>

        <div className="border-t border-brand-black-line pt-4 mt-4">
          <p className="text-sm font-semibold text-white truncate">{org.name}</p>
          <form action={ownerLogoutAction}>
            <button className="w-full text-sm text-red-400 hover:bg-white/5 rounded-lg px-3 py-2 text-right mt-2">{t.ownerPortal.signOut}</button>
          </form>
        </div>
      </MobileSidebarShell>

      <main className="flex-1 min-w-0">
        <div className="p-4 md:p-8 max-w-5xl mx-auto">{children}</div>
      </main>
    </div>
  );
}
