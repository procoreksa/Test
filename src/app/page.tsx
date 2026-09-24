import Link from "next/link";
import Image from "next/image";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { getLocale, getDictionary } from "@/lib/i18n";
import { LanguageSwitcher } from "@/components/language-switcher";

/**
 * Prompt 24 real-user Finding 1: the three separate auth systems (internal
 * staff, Tenant Portal, Owner Portal) are healthy but had zero cross-links
 * or any visible entry point - a real tenant or owner had no way to
 * discover their portal without being handed the raw URL out of band.
 * This is a pure routing landing page: it never touches session/auth
 * logic for any of the three systems, it only points to their existing,
 * untouched login routes.
 */
export default async function Home() {
  const session = await auth();
  if (session?.user) redirect("/dashboard");

  const locale = await getLocale();
  const t = getDictionary(locale);

  return (
    <div className="min-h-screen flex items-center justify-center bg-brand-black px-4">
      <div className="w-full max-w-lg bg-white rounded-2xl shadow-2xl p-8 border border-brand-gold/20">
        <div className="flex justify-center mb-6">
          <LanguageSwitcher locale={locale} labels={t.languageSwitcher} tone="light" />
        </div>

        <div className="text-center mb-8">
          <div className="mx-auto w-16 h-16 rounded-full overflow-hidden ring-2 ring-brand-gold mb-4">
            <Image src="/logo.jpg" alt="Pro Core" width={64} height={64} className="w-full h-full object-cover" />
          </div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-wide">{t.portalSelector.title}</h1>
          <p className="text-slate-500 text-sm mt-3">{t.portalSelector.subtitle}</p>
        </div>

        <div className="grid grid-cols-1 gap-3">
          <Link href="/login" className="flex items-center justify-between rounded-xl border border-slate-200 hover:border-brand-gold hover:bg-brand-gold/5 px-5 py-4 transition-colors">
            <div>
              <p className="font-semibold text-slate-900">{t.portalSelector.staffTitle}</p>
              <p className="text-xs text-slate-500">{t.portalSelector.staffSubtitle}</p>
            </div>
            <span className="text-slate-300">→</span>
          </Link>
          <Link href="/portal/login" className="flex items-center justify-between rounded-xl border border-slate-200 hover:border-brand-gold hover:bg-brand-gold/5 px-5 py-4 transition-colors">
            <div>
              <p className="font-semibold text-slate-900">{t.portalSelector.tenantTitle}</p>
              <p className="text-xs text-slate-500">{t.portalSelector.tenantSubtitle}</p>
            </div>
            <span className="text-slate-300">→</span>
          </Link>
          <Link href="/owner-portal/login" className="flex items-center justify-between rounded-xl border border-slate-200 hover:border-brand-gold hover:bg-brand-gold/5 px-5 py-4 transition-colors">
            <div>
              <p className="font-semibold text-slate-900">{t.portalSelector.ownerTitle}</p>
              <p className="text-xs text-slate-500">{t.portalSelector.ownerSubtitle}</p>
            </div>
            <span className="text-slate-300">→</span>
          </Link>
        </div>
      </div>
    </div>
  );
}
