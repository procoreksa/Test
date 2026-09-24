"use client";

import { useActionState } from "react";

interface State {
  error?: string;
}

/**
 * Wraps a plain `deleteX(id)` server action with useActionState so a
 * business-rule error (e.g. "this record has related history, archive it
 * instead") is shown inline instead of an uncaught throw falling through to
 * Next.js's generic crash page.
 *
 * The action must RETURN `{ error }` for known/expected failures rather
 * than throw: Next.js redacts the message of anything thrown from a Server
 * Action invoked as a plain async call (as opposed to a <form>'s own
 * native `action`) once running a genuine production build - confirmed via
 * real production-build UAT (Prompt 24, real-user Finding 5). The
 * try/catch below only remains as a fallback for a genuinely unexpected
 * error, which in production will surface as React's generic redacted
 * digest message rather than a raw stack trace - the page itself still
 * stays usable either way.
 */
export function DeleteEntityButton({ id, action, label, confirmMessage }: { id: string; action: (id: string) => Promise<{ error?: string }>; label: string; confirmMessage?: string }) {
  const [state, formAction, pending] = useActionState<State, FormData>(async () => {
    try {
      const result = await action(id);
      return result.error ? { error: result.error } : {};
    } catch (err) {
      return { error: err instanceof Error ? err.message : String(err) };
    }
  }, {});

  return (
    <div className="inline-block">
      <form
        action={formAction}
        onSubmit={(e) => {
          if (confirmMessage && !confirm(confirmMessage)) e.preventDefault();
        }}
      >
        <button disabled={pending} className="text-red-500 hover:underline text-xs disabled:opacity-50">
          {label}
        </button>
      </form>
      {state.error && <p className="mt-1 bg-red-50 border border-red-200 text-red-700 text-xs rounded-lg px-2 py-1 max-w-xs">{state.error}</p>}
    </div>
  );
}
