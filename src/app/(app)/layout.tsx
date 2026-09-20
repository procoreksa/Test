import Image from "next/image";
import { requireSession } from "@/lib/session";
import { signOut } from "@/lib/auth";
import { NavLink } from "@/components/nav-link";

const NAV_ITEMS = [
  { href: "/dashboard", label: "لوحة التحكم", icon: "📊" },
  { href: "/properties", label: "العقارات", icon: "🏢" },
  { href: "/units", label: "الوحدات", icon: "🚪" },
  { href: "/renters", label: "المستأجرون", icon: "👥" },
  { href: "/contracts", label: "عقود الإيجار", icon: "📄" },
  { href: "/collections", label: "التحصيلات", icon: "💰" },
  { href: "/invoices", label: "الفواتير الضريبية", icon: "🧾" },
  { href: "/payments", label: "سندات القبض", icon: "🧮" },
  { href: "/settings", label: "إعدادات المنشأة", icon: "⚙️" },
];

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await requireSession();

  return (
    <div className="min-h-screen flex">
      <aside className="no-print hidden md:flex w-64 shrink-0 flex-col bg-brand-black p-4">
        <div className="flex items-center gap-2 px-2 mb-6">
          <div className="w-10 h-10 rounded-full overflow-hidden ring-1 ring-brand-gold/60 shrink-0">
            <Image src="/logo.jpg" alt="Pro Core" width={40} height={40} className="w-full h-full object-cover" />
          </div>
          <div>
            <p className="font-bold text-brand-gold leading-tight tracking-wide">PRO CORE</p>
            <p className="text-[11px] text-white/40 leading-tight">Property Management</p>
          </div>
        </div>

        <nav className="flex-1 space-y-1">
          {NAV_ITEMS.map((item) => (
            <NavLink key={item.href} {...item} />
          ))}
        </nav>

        <div className="border-t border-brand-black-line pt-4 mt-4">
          <p className="text-sm font-semibold text-white truncate">{session.user.organizationName}</p>
          <p className="text-xs text-white/40 truncate mb-3">
            {session.user.name} · {roleLabel(session.user.role)}
          </p>
          <form
            action={async () => {
              "use server";
              await signOut({ redirectTo: "/login" });
            }}
          >
            <button className="w-full text-sm text-red-400 hover:bg-white/5 rounded-lg px-3 py-2 text-right">
              تسجيل الخروج
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

function roleLabel(role: string) {
  const map: Record<string, string> = {
    OWNER: "مالك",
    ADMIN: "مدير النظام",
    MANAGER: "مدير",
    ACCOUNTANT: "محاسب",
    VIEWER: "مشاهد",
  };
  return map[role] ?? role;
}
