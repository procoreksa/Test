"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import clsx from "clsx";
import { setLocale } from "@/lib/actions/locale";
import type { Locale } from "@/lib/i18n/config";

export function LanguageSwitcher({
  locale,
  labels,
  tone = "dark",
}: {
  locale: Locale;
  labels: { ar: string; en: string };
  tone?: "dark" | "light";
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function switchTo(next: Locale) {
    if (next === locale || isPending) return;
    startTransition(async () => {
      await setLocale(next);
      router.refresh();
    });
  }

  const options: Array<{ value: Locale; label: string }> = [
    { value: "ar", label: labels.ar },
    { value: "en", label: labels.en },
  ];

  return (
    <div
      className={clsx(
        "inline-flex items-center gap-0.5 rounded-lg p-0.5 text-xs",
        tone === "dark" ? "bg-white/5" : "bg-slate-100"
      )}
    >
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => switchTo(opt.value)}
          disabled={isPending}
          className={clsx(
            "px-2.5 py-1 rounded-md font-medium transition-colors",
            opt.value === locale
              ? "bg-brand-gold text-brand-black"
              : tone === "dark"
                ? "text-white/50 hover:text-white/80"
                : "text-slate-500 hover:text-slate-800"
          )}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}
