"use client";

import Link from "next/link";
import { useEffect } from "react";

/**
 * By the time an error reaches this boundary it is never an authorization
 * denial - requirePermission() redirects to /access-denied instead of
 * throwing (see src/lib/session.ts), and redirect()'s own signal is
 * intercepted by Next's router before it ever gets here. So this only ever
 * renders for a genuine unexpected error, and always shows the same
 * generic, sanitized message - Next.js redacts the real error message and
 * stack in a production build regardless, but the full error is still
 * logged server-side (Next's default behavior), so it remains observable
 * for debugging without ever reaching the browser.
 */
export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="max-w-lg mx-auto text-center py-16">
      <div className="text-5xl mb-4">⚠️</div>
      <h1 className="text-2xl font-bold text-slate-900 mb-2">Something Went Wrong / حدث خطأ ما</h1>
      <p className="text-slate-500 mb-8">
        An unexpected error occurred. Please try again, or return to the dashboard.
        <br />
        حدث خطأ غير متوقع. يرجى المحاولة مرة أخرى، أو العودة إلى لوحة التحكم.
      </p>
      <div className="flex items-center justify-center gap-3">
        <button
          onClick={() => reset()}
          className="inline-block border border-slate-300 hover:bg-slate-50 text-slate-700 rounded-lg px-5 py-2.5 font-semibold"
        >
          Try Again / إعادة المحاولة
        </button>
        <Link
          href="/dashboard"
          className="inline-block bg-brand-gold hover:bg-brand-gold-dark text-brand-black rounded-lg px-5 py-2.5 font-semibold"
        >
          Back to Dashboard / العودة إلى لوحة التحكم
        </Link>
      </div>
    </div>
  );
}
