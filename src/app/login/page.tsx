import Image from "next/image";
import Link from "next/link";
import { signIn } from "@/lib/auth";
import { AuthError } from "next-auth";
import { redirect } from "next/navigation";
import { getLocale, getDictionary } from "@/lib/i18n";
import { LanguageSwitcher } from "@/components/language-switcher";

async function loginAction(formData: FormData) {
  "use server";
  try {
    await signIn("credentials", {
      email: formData.get("email"),
      password: formData.get("password"),
      redirectTo: "/dashboard",
    });
  } catch (error) {
    if (error instanceof AuthError) {
      redirect("/login?error=1");
    }
    throw error;
  }
}

export default async function LoginPage({
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
            <Image src="/logo.jpg" alt="Pro Core" width={64} height={64} className="w-full h-full object-cover" />
          </div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-wide">{t.login.title}</h1>
          <p className="text-brand-gold-dark text-xs font-medium tracking-[0.2em] uppercase mt-0.5">
            {t.login.tagline}
          </p>
          <p className="text-slate-500 text-sm mt-3">{t.login.subtitle}</p>
        </div>

        {error && (
          <div className="mb-4 rounded-lg bg-red-50 text-red-700 text-sm px-4 py-3 border border-red-200">
            {t.login.error}
          </div>
        )}

        <form action={loginAction} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">{t.login.email}</label>
            <input
              name="email"
              type="email"
              required
              className="w-full rounded-lg border border-slate-300 px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-brand-gold"
              placeholder="you@company.com"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">{t.login.password}</label>
            <input
              name="password"
              type="password"
              required
              className="w-full rounded-lg border border-slate-300 px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-brand-gold"
              placeholder="••••••••"
            />
          </div>
          <button
            type="submit"
            className="w-full bg-brand-gold hover:bg-brand-gold-dark text-brand-black font-semibold rounded-lg py-2.5 transition-colors"
          >
            {t.login.submit}
          </button>
        </form>

        <p className="text-xs text-slate-400 text-center mt-6">
          {t.login.seedHint.split("npm run db:seed")[0]}
          <code>npm run db:seed</code>
          {t.login.seedHint.split("npm run db:seed")[1]}
        </p>
        <p className="text-center mt-3">
          <Link href="/" className="text-xs text-brand-gold-dark hover:underline">
            ← {t.portalSelector.tenantTitle} / {t.portalSelector.ownerTitle}
          </Link>
        </p>
      </div>
    </div>
  );
}
