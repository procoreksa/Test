"use client";

import { useActionState } from "react";
import { updateStaffUserRole, setStaffUserActive, resetStaffUserPassword } from "@/lib/actions/staff-users";

type UserRole = "OWNER" | "ADMIN" | "MANAGER" | "ACCOUNTANT" | "VIEWER";

interface StaffUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  isActive: boolean;
}

interface Labels {
  statusActive: string;
  statusInactive: string;
  activate: string;
  deactivate: string;
  resetPassword: string;
  temporaryPasswordTitle: string;
  temporaryPasswordNotice: string;
  you: string;
}

interface RowState {
  error?: string;
}
interface ResetState {
  temporaryPassword?: string;
  error?: string;
}

const ROLES: UserRole[] = ["OWNER", "ADMIN", "MANAGER", "ACCOUNTANT", "VIEWER"];

export function StaffUserRow({
  user,
  isSelf,
  roleLabels,
  perms,
  t,
}: {
  user: StaffUser;
  isSelf: boolean;
  roleLabels: Record<UserRole, string>;
  perms: { canUpdateRole: boolean; canActivate: boolean; canDeactivate: boolean; canResetPassword: boolean };
  t: Labels;
}) {
  const [roleState, roleFormAction, rolePending] = useActionState<RowState, FormData>(async (_prev, formData) => {
    try {
      await updateStaffUserRole(formData);
      return {};
    } catch (err) {
      return { error: err instanceof Error ? err.message : String(err) };
    }
  }, {});

  const [activeState, activeFormAction, activePending] = useActionState<RowState, FormData>(async (_prev, formData) => {
    try {
      const result = await setStaffUserActive(formData);
      return result.error ? { error: result.error } : {};
    } catch (err) {
      return { error: err instanceof Error ? err.message : String(err) };
    }
  }, {});

  const [resetState, resetFormAction, resetPending] = useActionState<ResetState, FormData>(async (_prev, formData) => {
    try {
      const result = await resetStaffUserPassword(formData);
      return { temporaryPassword: result.temporaryPassword };
    } catch (err) {
      return { error: err instanceof Error ? err.message : String(err) };
    }
  }, {});

  const rowError = roleState.error ?? activeState.error ?? resetState.error;

  return (
    <>
      <tr className="border-t border-slate-100">
        <td className="py-2 px-3 text-sm text-slate-800">
          {user.name} {isSelf && <span className="text-slate-400">{t.you}</span>}
        </td>
        <td className="py-2 px-3 text-sm text-slate-600">{user.email}</td>
        <td className="py-2 px-3 text-sm">
          {perms.canUpdateRole ? (
            <form action={roleFormAction} className="inline-flex items-center gap-1">
              <input type="hidden" name="userId" value={user.id} />
              <select name="role" defaultValue={user.role} disabled={rolePending} className="rounded-lg border border-slate-300 px-2 py-1 text-xs">
                {ROLES.map((r) => (
                  <option key={r} value={r}>
                    {roleLabels[r]}
                  </option>
                ))}
              </select>
              <button disabled={rolePending} className="text-xs bg-slate-100 hover:bg-slate-200 rounded-lg px-2 py-1">
                ↻
              </button>
            </form>
          ) : (
            roleLabels[user.role]
          )}
        </td>
        <td className="py-2 px-3 text-sm">
          <span className={user.isActive ? "text-emerald-700 font-medium" : "text-slate-400"}>{user.isActive ? t.statusActive : t.statusInactive}</span>
        </td>
        <td className="py-2 px-3 text-sm">
          <div className="flex flex-wrap gap-2">
            {user.isActive
              ? perms.canDeactivate &&
                !isSelf && (
                  <form action={activeFormAction}>
                    <input type="hidden" name="userId" value={user.id} />
                    <input type="hidden" name="active" value="false" />
                    <button disabled={activePending} className="text-xs bg-amber-500 hover:bg-amber-600 text-white rounded-lg px-2 py-1 disabled:opacity-50">
                      {t.deactivate}
                    </button>
                  </form>
                )
              : perms.canActivate && (
                  <form action={activeFormAction}>
                    <input type="hidden" name="userId" value={user.id} />
                    <input type="hidden" name="active" value="true" />
                    <button disabled={activePending} className="text-xs bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg px-2 py-1 disabled:opacity-50">
                      {t.activate}
                    </button>
                  </form>
                )}
            {perms.canResetPassword && (
              <form action={resetFormAction}>
                <input type="hidden" name="userId" value={user.id} />
                <button disabled={resetPending} className="text-xs bg-slate-700 hover:bg-slate-800 text-white rounded-lg px-2 py-1 disabled:opacity-50">
                  {t.resetPassword}
                </button>
              </form>
            )}
          </div>
        </td>
      </tr>
      {(rowError || resetState.temporaryPassword) && (
        <tr>
          <td colSpan={5} className="px-3 pb-2">
            {rowError && <p className="bg-red-50 border border-red-200 text-red-700 text-xs rounded-lg px-3 py-2">{rowError}</p>}
            {resetState.temporaryPassword && (
              <div className="bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">
                <p className="text-xs text-emerald-800">{t.temporaryPasswordNotice}</p>
                <p className="text-xs text-emerald-700 mt-0.5">{t.temporaryPasswordTitle}</p>
                <p className="font-mono text-sm font-bold text-emerald-900 mt-0.5 select-all">{resetState.temporaryPassword}</p>
              </div>
            )}
          </td>
        </tr>
      )}
    </>
  );
}
