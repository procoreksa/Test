import Image from "next/image";
import { getLocale, getDictionary } from "@/lib/i18n";
import { LanguageSwitcher } from "@/components/language-switcher";
import { tenantLoginAction } from "@/lib/actions/portal/auth-actions";

export default async function TenantPortalLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const locale = await getLocale();
  const t = getDictionary(locale);

  return (
    <div className="min-h-screen flex items-center justify-center bg-brand-black px-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl p-8 border border-brand-gold/20">
        <div className="flex justify-center mb-6">
          <LanguageSwitcher locale={locale} labels={t.languageSwitcher} tone="light" />
        </div>

        <div className="text-center mb-8">
          <div className="mx-auto w-16 h-16 rounded-full overflow-hidden ring-2 ring-brand-gold mb-4">
            <Image src="/logo.jpg" alt="" width={64} height={64} className="w-full h-full object-cover" />
          </div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-wide">{t.tenantPortal.loginTitle}</h1>
          <p className="text-slate-500 text-sm mt-3">{t.tenantPortal.loginSubtitle}</p>
        </div>

        {error && <div className="mb-4 rounded-lg bg-red-50 text-red-700 text-sm px-4 py-3 border border-red-200">{t.tenantPortal.loginError}</div>}

        <form action={tenantLoginAction} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">{t.tenantPortal.loginEmail}</label>
            <input name="email" type="email" required className="w-full rounded-lg border border-slate-300 px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-brand-gold" placeholder="you@example.com" />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">{t.tenantPortal.loginPassword}</label>
            <input name="password" type="password" required className="w-full rounded-lg border border-slate-300 px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-brand-gold" placeholder="••••••••" />
          </div>
          <button type="submit" className="w-full bg-brand-gold hover:bg-brand-gold-dark text-brand-black font-semibold rounded-lg py-2.5 transition-colors">
            {t.tenantPortal.loginSubmit}
          </button>
        </form>
      </div>
    </div>
  );
}
