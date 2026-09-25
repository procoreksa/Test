import Link from "next/link";
import { getLocale, getDictionary } from "@/lib/i18n";

export default async function AccessDeniedPage() {
  const t = getDictionary(await getLocale());

  return (
    <div className="max-w-lg mx-auto text-center py-16">
      <div className="text-5xl mb-4">🚫</div>
      <h1 className="text-2xl font-bold text-slate-900 mb-2">{t.accessDenied.title}</h1>
      <p className="text-slate-500 mb-8">{t.accessDenied.body}</p>
      <Link
        href="/dashboard"
        className="inline-block bg-brand-gold hover:bg-brand-gold-dark text-brand-black rounded-lg px-5 py-2.5 font-semibold"
      >
        {t.accessDenied.backToDashboard}
      </Link>
    </div>
  );
}
