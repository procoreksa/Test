"use client";

import { useActionState } from "react";
import { createServiceCatalogItem } from "@/lib/actions/service-invoices";

interface Labels {
  catalogName: string;
  catalogNameAr: string;
  catalogDefaultPrice: string;
  catalogVatRate: string;
  catalogAdd: string;
}

export function ServiceCatalogForm({ t }: { t: Labels }) {
  const [state, formAction, pending] = useActionState<{ error?: string; key: number }, FormData>(
    async (prev, formData) => {
      try {
        const result = await createServiceCatalogItem(formData);
        // Bumping the key remounts the form, clearing it after a successful add.
        return result.error ? { error: result.error, key: prev.key } : { key: prev.key + 1 };
      } catch (err) {
        return { error: err instanceof Error ? err.message : String(err), key: prev.key };
      }
    },
    { key: 0 }
  );

  const inputClass = "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm";
  const labelClass = "block text-xs font-medium text-slate-600 mb-1";

  return (
    <div>
      {state.error && <p className="mb-3 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-2">{state.error}</p>}
      <form key={state.key} action={formAction} className="grid grid-cols-1 sm:grid-cols-5 gap-3 items-end">
        <div>
          <label className={labelClass}>{t.catalogNameAr}</label>
          <input name="nameAr" className={inputClass} />
        </div>
        <div>
          <label className={labelClass}>{t.catalogName}</label>
          <input name="name" required className={inputClass} />
        </div>
        <div>
          <label className={labelClass}>{t.catalogDefaultPrice}</label>
          <input name="defaultPrice" type="number" min="0" step="0.01" className={inputClass} />
        </div>
        <div>
          <label className={labelClass}>{t.catalogVatRate}</label>
          <input name="vatRate" type="number" min="0" max="100" step="0.01" defaultValue="15" className={inputClass} />
        </div>
        <button disabled={pending} className="bg-slate-800 hover:bg-slate-900 text-white rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-50">
          {t.catalogAdd}
        </button>
      </form>
    </div>
  );
}
