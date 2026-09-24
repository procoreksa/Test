import { requireTenantSession } from "@/lib/tenant-session";
import { getTenantOrganizationBranding } from "@/lib/actions/portal/tenancy";
import { tenantLogoutAction } from "@/lib/actions/portal/auth-actions";
import { NavLink } from "@/components/nav-link";
import { LanguageSwitcher } from "@/components/language-switcher";
import { MobileSidebarShell } from "@/components/mobile-sidebar-shell";
import { getLocale, getDictionary } from "@/lib/i18n";

/**
 * The Tenant Portal's own protected route group (Step 11/12) - a
 * completely separate shell from src/app/(app)/layout.tsx's internal
 * staff sidebar, never mixed into it. Every page under this group is
 * gated by requireTenantSession() here, exactly once, at the layout
 * level - individual pages/actions still re-verify resource ownership
 * independently (defense in depth, same posture the internal app uses).
 */
export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  await requireTenantSession();
  const [locale, org] = await Promise.all([getLocale(), getTenantOrganizationBranding()]);
  const t = getDictionary(locale);
  const logoSrc = org.logoUrl || "/logo.jpg";

  const navItems = [
    { href: "/portal", label: t.tenantPortal.navDashboard, icon: "🏠" },
    { href: "/portal/contracts", label: t.tenantPortal.navContract, icon: "📄" },
    { href: "/portal/payments", label: t.tenantPortal.navPayments, icon: "💰" },
    { href: "/portal/invoices", label: t.tenantPortal.navInvoices, icon: "🧾" },
    { href: "/portal/move-in", label: t.tenantPortal.navMoveIn, icon: "🔑" },
    { href: "/portal/maintenance", label: t.tenantPortal.navMaintenance, icon: "🛠️" },
    { href: "/portal/move-out", label: t.tenantPortal.navMoveOut, icon: "📤" },
    { href: "/portal/security-deposit", label: t.tenantPortal.navSecurityDeposit, icon: "🏦" },
    { href: "/portal/documents", label: t.tenantPortal.navDocuments, icon: "📁" },
    { href: "/portal/profile", label: t.tenantPortal.navProfile, icon: "👤" },
  ];

  const brandMark = (
    <div className="flex items-center gap-2">
      <div className="w-8 h-8 rounded-full overflow-hidden ring-1 ring-brand-gold/60 shrink-0 bg-white">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={logoSrc} alt="" className="w-full h-full object-cover" />
      </div>
      <p className="font-bold text-brand-gold leading-tight tracking-wide text-sm">{t.tenantPortal.portalTitle}</p>
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
            <p className="font-bold text-brand-gold leading-tight tracking-wide">{t.tenantPortal.portalTitle}</p>
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
          <form action={tenantLogoutAction}>
            <button className="w-full text-sm text-red-400 hover:bg-white/5 rounded-lg px-3 py-2 text-right mt-2">{t.tenantPortal.signOut}</button>
          </form>
        </div>
      </MobileSidebarShell>

      <main className="flex-1 min-w-0">
        <div className="p-4 md:p-8 max-w-5xl mx-auto">{children}</div>
      </main>
    </div>
  );
}
