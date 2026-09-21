"use client";

import { useState, type ReactNode } from "react";

/**
 * Lets a form field switch between "pick an existing record" and "create a
 * new one inline" - only one side's inputs are ever in the DOM, so the
 * server action only ever sees one set of fields (plus the hidden flag).
 */
export function ToggleNewEntity({
  toggleLabel,
  existing,
  newFields,
  flagName,
}: {
  toggleLabel: string;
  existing: ReactNode;
  newFields: ReactNode;
  flagName: string;
}) {
  const [creatingNew, setCreatingNew] = useState(false);

  return (
    <div className="md:col-span-3 space-y-3">
      <label className="flex items-center gap-2 text-xs text-brand-gold-dark cursor-pointer w-fit">
        <input
          type="checkbox"
          checked={creatingNew}
          onChange={(e) => setCreatingNew(e.target.checked)}
          className="rounded border-slate-300"
        />
        {toggleLabel}
      </label>
      {creatingNew && <input type="hidden" name={flagName} value="true" />}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">{creatingNew ? newFields : existing}</div>
    </div>
  );
}
