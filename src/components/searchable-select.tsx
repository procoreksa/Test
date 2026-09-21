"use client";

import { useMemo, useRef, useState } from "react";

export interface SearchableSelectOption {
  id: string;
  label: string;
  searchText: string;
}

/**
 * A text-filterable dropdown for choosing one option from a potentially long
 * list (e.g. every renter or unit in the org). Renders a hidden input so it
 * drops into an existing <form method="get"> exactly like a <select> would.
 */
export function SearchableSelect({
  name,
  options,
  defaultValue,
  defaultLabel,
  placeholder,
  noResultsText,
}: {
  name: string;
  options: SearchableSelectOption[];
  defaultValue?: string;
  defaultLabel?: string;
  placeholder: string;
  noResultsText: string;
}) {
  const [query, setQuery] = useState(defaultLabel ?? "");
  const [selectedId, setSelectedId] = useState(defaultValue ?? "");
  const [open, setOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const pool = q ? options.filter((o) => o.searchText.toLowerCase().includes(q)) : options;
    return pool.slice(0, 50);
  }, [query, options]);

  function selectOption(option: SearchableSelectOption) {
    setSelectedId(option.id);
    setQuery(option.label);
    setOpen(false);
  }

  return (
    <div className="relative">
      <input type="hidden" name={name} value={selectedId} />
      <input
        ref={inputRef}
        type="text"
        value={query}
        placeholder={placeholder}
        onChange={(e) => {
          setQuery(e.target.value);
          setSelectedId("");
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            setOpen(false);
            inputRef.current?.blur();
          } else if (e.key === "Enter") {
            e.preventDefault();
            if (filtered.length > 0) selectOption(filtered[0]);
          }
        }}
        className="w-full rounded-lg border border-slate-300 px-3 py-2"
        autoComplete="off"
      />
      {open && (
        <ul className="absolute z-10 mt-1 max-h-64 w-full overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-lg">
          {filtered.length === 0 ? (
            <li className="px-3 py-2 text-sm text-slate-400">{noResultsText}</li>
          ) : (
            filtered.map((option) => (
              <li key={option.id}>
                <button
                  type="button"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    selectOption(option);
                  }}
                  className="block w-full px-3 py-2 text-start text-sm hover:bg-slate-50"
                >
                  {option.label}
                </button>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}
