"use client";

import { useActionState } from "react";
import { createStaffUser } from "@/lib/actions/staff-users";

type UserRole = "OWNER" | "ADMIN" | "MANAGER" | "ACCOUNTANT" | "VIEWER";

interface Labels {
  createTitle: string;
  fieldName: string;
  fieldEmail: string;
  fieldRole: string;
  createSubmit: string;
  temporaryPasswordTitle: string;
  temporaryPasswordNotice: string;
}

interface CreateState {
  temporaryPassword?: string;
  error?: string;
}

const ROLES: UserRole[] = ["OWNER", "ADMIN", "MANAGER", "ACCOUNTANT", "VIEWER"];

export function StaffUserCreateForm({ t, roleLabels }: { t: Labels; roleLabels: Record<UserRole, string> }) {
  const [state, formAction, pending] = useActionState<CreateState, FormData>(async (_prev, formData) => {
    try {
      const result = await createStaffUser(formData);
      return result.error ? { error: result.error } : { temporaryPassword: result.temporaryPassword };
    } catch (err) {
      return { error: err instanceof Error ? err.message : String(err) };
    }
  }, {});

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
      <h2 className="font-semibold text-slate-800 mb-3">{t.createTitle}</h2>

      {state.temporaryPassword && (
        <div className="mb-4 bg-emerald-50 border border-emerald-200 rounded-lg px-4 py-3">
          <p className="text-sm text-emerald-800">{t.temporaryPasswordNotice}</p>
          <p className="text-xs text-emerald-700 mt-1">{t.temporaryPasswordTitle}</p>
          <p className="font-mono text-base font-bold text-emerald-900 mt-1 select-all">{state.temporaryPassword}</p>
        </div>
      )}
      {state.error && <p className="mb-4 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3">{state.error}</p>}

      <form action={formAction} className="grid grid-cols-1 sm:grid-cols-4 gap-3 items-end">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">{t.fieldName}</label>
          <input name="name" required className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">{t.fieldEmail}</label>
          <input name="email" type="email" required className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">{t.fieldRole}</label>
          <select name="role" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {roleLabels[r]}
              </option>
            ))}
          </select>
        </div>
        <button disabled={pending} className="bg-brand-gold hover:bg-brand-gold-dark text-brand-black rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-50">
          {t.createSubmit}
        </button>
      </form>
    </div>
  );
}
