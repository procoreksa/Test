import Image from "next/image";
import { requireSession } from "@/lib/session";
import { signOut } from "@/lib/auth";
import { NavLink } from "@/components/nav-link";
import { LanguageSwitcher } from "@/components/language-switcher";
import { getLocale, getDictionary } from "@/lib/i18n";
import type { Dictionary } from "@/lib/i18n";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await requireSession();
  const locale = await getLocale();
  const t = getDictionary(locale);

  const navItems = [
    { href: "/dashboard", label: t.nav.dashboard, icon: "📊" },
    { href: "/properties", label: t.nav.properties, icon: "🏢" },
    { href: "/units", label: t.nav.units, icon: "🚪" },
    { href: "/renters", label: t.nav.renters, icon: "👥" },
    { href: "/contracts", label: t.nav.contracts, icon: "📄" },
    { href: "/collections", label: t.nav.collections, icon: "💰" },
    { href: "/invoices", label: t.nav.invoices, icon: "🧾" },
    { href: "/payments", label: t.nav.payments, icon: "🧮" },
    { href: "/settings", label: t.nav.settings, icon: "⚙️" },
  ];

  return (
    <div className="min-h-screen flex">
      <aside className="no-print hidden md:flex w-64 shrink-0 flex-col bg-brand-black p-4">
        <div className="flex items-center gap-2 px-2 mb-4">
          <div className="w-10 h-10 rounded-full overflow-hidden ring-1 ring-brand-gold/60 shrink-0">
            <Image src="/logo.jpg" alt="Pro Core" width={40} height={40} className="w-full h-full object-cover" />
          </div>
          <div>
            <p className="font-bold text-brand-gold leading-tight tracking-wide">PRO CORE</p>
            <p className="text-[11px] text-white/40 leading-tight">{t.nav.brandTagline}</p>
          </div>
        </div>

        <div className="px-2 mb-6">
          <LanguageSwitcher locale={locale} labels={t.languageSwitcher} tone="dark" />
        </div>

        <nav className="flex-1 space-y-1">
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
      </aside>

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
