"use client";

import { useActionState } from "react";
import {
  createOwnerPortalAccount,
  activateOwnerPortalAccount,
  suspendOwnerPortalAccount,
  disableOwnerPortalAccount,
  resetOwnerPortalAccountPassword,
} from "@/lib/actions/owner-portal-account";

type AccountStatus = "INVITED" | "ACTIVE" | "SUSPENDED" | "DISABLED";

interface Account {
  id: string;
  email: string;
  phone: string | null;
  status: AccountStatus;
  lastLoginLabel: string | null;
}

interface Labels {
  sectionPortalAccess: string;
  noPortalAccountNotice: string;
  accountStatusLabel: string;
  lastLoginLabel: string;
  neverLoggedInValue: string;
  createAccountButton: string;
  activateAccountButton: string;
  suspendAccountButton: string;
  disableAccountButton: string;
  resetPasswordButton: string;
  temporaryPasswordNotice: string;
  temporaryPasswordLabel: string;
  copyOncePasswordWarning: string;
  closeButton: string;
  fieldEmail: string;
  fieldPhone: string;
  statusLabels: Record<AccountStatus, string>;
}

/** The transitions the internal `transitionAccount()` helper in src/lib/actions/owner-portal-account.ts actually permits, kept in sync so this panel never renders a button whose click would just throw `invalidAccountTransition`. Mirrors src/components/tenant-portal-account-panel.tsx's own Tenant Portal precedent exactly. */
const ALLOWED_TRANSITIONS: Record<AccountStatus, readonly AccountStatus[]> = {
  INVITED: ["ACTIVE"],
  ACTIVE: ["SUSPENDED", "DISABLED"],
  SUSPENDED: ["ACTIVE", "DISABLED"],
  DISABLED: [],
};

interface RevealState {
  temporaryPassword?: string;
  error?: string;
}

/** The one-time plaintext temporary password never touches the URL, a cookie, or storage: it lives only in this client component's in-memory state for the current render and is discarded the moment the admin closes the reveal box or navigates away. */
export function OwnerPortalAccountPanel({ ownerId, defaultEmail, account, perms, t }: { ownerId: string; defaultEmail: string; account: Account | null; perms: { canView: boolean; canCreate: boolean; canActivate: boolean; canSuspend: boolean; canDisable: boolean; canResetPassword: boolean }; t: Labels }) {
  const [createState, createFormAction, createPending] = useActionState<RevealState, FormData>(async (_prev, formData) => {
    try {
      const result = await createOwnerPortalAccount(formData);
      return { temporaryPassword: result.temporaryPassword };
    } catch (err) {
      return { error: err instanceof Error ? err.message : String(err) };
    }
  }, {});

  const [resetState, resetFormAction, resetPending] = useActionState<RevealState, FormData>(async (_prev, formData) => {
    try {
      const result = await resetOwnerPortalAccountPassword(formData);
      return { temporaryPassword: result.temporaryPassword };
    } catch (err) {
      return { error: err instanceof Error ? err.message : String(err) };
    }
  }, {});

  if (!perms.canView) return null;

  const revealed = createState.temporaryPassword ?? resetState.temporaryPassword;
  const revealError = createState.error ?? resetState.error;

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
      <h2 className="font-semibold text-slate-800 mb-3">{t.sectionPortalAccess}</h2>

      {revealed && (
        <div className="mb-4 bg-emerald-50 border border-emerald-200 rounded-lg px-4 py-3">
          <p className="text-sm text-emerald-800">{t.temporaryPasswordNotice}</p>
          <p className="text-xs text-emerald-700 mt-1">{t.temporaryPasswordLabel}</p>
          <p className="font-mono text-base font-bold text-emerald-900 mt-1 select-all">{revealed}</p>
          <p className="text-xs text-emerald-700 mt-2">{t.copyOncePasswordWarning}</p>
        </div>
      )}
      {revealError && <p className="mb-4 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3">{revealError}</p>}

      {!account ? (
        <>
          <p className="text-sm text-slate-600 mb-3">{t.noPortalAccountNotice}</p>
          {perms.canCreate && (
            <form action={createFormAction} className="flex flex-col sm:flex-row gap-3">
              <input type="hidden" name="ownerId" value={ownerId} />
              <input name="email" type="email" defaultValue={defaultEmail} placeholder={t.fieldEmail} required className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm" />
              <input name="phone" type="tel" placeholder={t.fieldPhone} className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm" />
              <button disabled={createPending} className="bg-brand-gold hover:bg-brand-gold-dark text-brand-black rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-50">
                {t.createAccountButton}
              </button>
            </form>
          )}
        </>
      ) : (
        <>
          <dl className="grid grid-cols-2 gap-y-2 text-sm">
            <dt className="text-slate-500">{t.fieldEmail}</dt>
            <dd className="text-slate-800 font-medium">{account.email}</dd>
            <dt className="text-slate-500">{t.accountStatusLabel}</dt>
            <dd className="text-slate-800 font-medium">{t.statusLabels[account.status]}</dd>
            <dt className="text-slate-500">{t.lastLoginLabel}</dt>
            <dd className="text-slate-800 font-medium">{account.lastLoginLabel ?? t.neverLoggedInValue}</dd>
          </dl>

          <div className="flex flex-wrap gap-2 mt-4">
            {perms.canActivate && ALLOWED_TRANSITIONS[account.status].includes("ACTIVE") && (
              <form action={activateOwnerPortalAccount}>
                <input type="hidden" name="accountId" value={account.id} />
                <button className="bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg px-3 py-1.5 text-sm font-medium">{t.activateAccountButton}</button>
              </form>
            )}
            {perms.canSuspend && ALLOWED_TRANSITIONS[account.status].includes("SUSPENDED") && (
              <form action={suspendOwnerPortalAccount}>
                <input type="hidden" name="accountId" value={account.id} />
                <button className="bg-amber-500 hover:bg-amber-600 text-white rounded-lg px-3 py-1.5 text-sm font-medium">{t.suspendAccountButton}</button>
              </form>
            )}
            {perms.canDisable && ALLOWED_TRANSITIONS[account.status].includes("DISABLED") && (
              <form action={disableOwnerPortalAccount}>
                <input type="hidden" name="accountId" value={account.id} />
                <button className="bg-red-600 hover:bg-red-700 text-white rounded-lg px-3 py-1.5 text-sm font-medium">{t.disableAccountButton}</button>
              </form>
            )}
            {perms.canResetPassword && (
              <form action={resetFormAction}>
                <input type="hidden" name="accountId" value={account.id} />
                <button disabled={resetPending} className="bg-slate-700 hover:bg-slate-800 text-white rounded-lg px-3 py-1.5 text-sm font-medium disabled:opacity-50">
                  {t.resetPasswordButton}
                </button>
              </form>
            )}
          </div>
        </>
      )}
    </div>
  );
}
