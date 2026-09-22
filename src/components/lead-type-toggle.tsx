"use client";

/**
 * Shows/hides the "Corporate Housing Details" section based on the Lead
 * Type dropdown, via plain DOM (no client/server children-composition
 * needed) - the corporate section itself stays a normal server-rendered
 * block with a fixed id. All corporate fields are optional at the schema
 * level, so submitting them while hidden (always empty in that case) is
 * harmless; this is a display-only toggle, not conditional field removal.
 */
export function LeadTypeSelect({ label, labels }: { label: string; labels: Record<string, string> }) {
  return (
    <div>
      <label className="block text-sm font-medium text-slate-700 mb-1">{label}</label>
      <select
        name="leadType"
        defaultValue="INDIVIDUAL"
        onChange={(e) => {
          const section = document.getElementById("crm-corporate-section");
          if (section) section.style.display = e.target.value === "CORPORATE" ? "" : "none";
        }}
        className="w-full rounded-lg border border-slate-300 px-3 py-2"
      >
        {Object.entries(labels).map(([value, text]) => (
          <option key={value} value={value}>
            {text}
          </option>
        ))}
      </select>
    </div>
  );
}
