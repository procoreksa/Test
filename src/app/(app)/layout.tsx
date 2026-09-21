import { requireSession, getCurrentUserRole } from "@/lib/session";
import { signOut } from "@/lib/auth";
import { getOrganizationBranding } from "@/lib/actions/organization";
import { can } from "@/lib/permissions";
import { NavLink } from "@/components/nav-link";
import { LanguageSwitcher } from "@/components/language-switcher";
import { MobileSidebarShell } from "@/components/mobile-sidebar-shell";
import { getLocale, getDictionary } from "@/lib/i18n";
import type { Dictionary } from "@/lib/i18n";
import type { Permission } from "@/lib/permissions";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await requireSession();
  const [locale, org, role] = await Promise.all([getLocale(), getOrganizationBranding(), getCurrentUserRole()]);
  const t = getDictionary(locale);
  const logoSrc = org.logoUrl || "/logo.jpg";

  const allNavItems: Array<{ href: string; label: string; icon: string; permission: Permission }> = [
    { href: "/dashboard", label: t.nav.dashboard, icon: "📊", permission: "dashboard.view" },
    { href: "/properties", label: t.nav.properties, icon: "🏢", permission: "property.view" },
    { href: "/units", label: t.nav.units, icon: "🚪", permission: "unit.view" },
    { href: "/renters", label: t.nav.renters, icon: "👥", permission: "renter.view" },
    { href: "/contracts", label: t.nav.contracts, icon: "📄", permission: "contract.view" },
    { href: "/collections", label: t.nav.collections, icon: "💰", permission: "invoice.view" },
    { href: "/invoices", label: t.nav.invoices, icon: "🧾", permission: "invoice.view" },
    { href: "/payments", label: t.nav.payments, icon: "🧮", permission: "payment.view" },
    { href: "/reports", label: t.nav.reports, icon: "📈", permission: "report.view" },
    { href: "/settings", label: t.nav.settings, icon: "⚙️", permission: "settings.view" },
  ];
  const navItems = allNavItems.filter((item) => can(item.permission, role));

  const brandMark = (
    <div className="flex items-center gap-2">
      <div className="w-8 h-8 rounded-full overflow-hidden ring-1 ring-brand-gold/60 shrink-0 bg-white">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={logoSrc} alt="" className="w-full h-full object-cover" />
      </div>
      <p className="font-bold text-brand-gold leading-tight tracking-wide text-sm">PRO CORE</p>
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
            <p className="font-bold text-brand-gold leading-tight tracking-wide">PRO CORE</p>
            <p className="text-[11px] text-white/40 leading-tight">{t.nav.brandTagline}</p>
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
          <p className="text-sm font-semibold text-white truncate">{session.user.organizationName}</p>
          <p className="text-xs text-white/40 truncate mb-3">
            {session.user.name} · {roleLabel(t, session.user.role)}
          </p>
          <form
            action={async () => {
              "use server";
              await signOut({ redirectTo: "/login" });
            }}
          >
            <button className="w-full text-sm text-red-400 hover:bg-white/5 rounded-lg px-3 py-2 text-right">
              {t.nav.signOut}
            </button>
          </form>
        </div>
      </MobileSidebarShell>

      <main className="flex-1 min-w-0">
        <div className="p-4 md:p-8 max-w-7xl mx-auto">{children}</div>
      </main>
    </div>
  );
}

function roleLabel(t: Dictionary, role: string) {
  const map = t.roles as Record<string, string>;
  return map[role] ?? role;
}
