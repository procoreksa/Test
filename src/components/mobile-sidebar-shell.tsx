"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import clsx from "clsx";

export function MobileSidebarShell({
  children,
  brand,
  openLabel,
  closeLabel,
}: {
  children: React.ReactNode;
  brand: React.ReactNode;
  openLabel: string;
  closeLabel: string;
}) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const [lastPathname, setLastPathname] = useState(pathname);

  // Close the drawer whenever navigation happens. Adjusting state during
  // render (rather than in a useEffect) avoids an extra render pass.
  if (pathname !== lastPathname) {
    setLastPathname(pathname);
    setOpen(false);
  }

  return (
    <>
      <div className="no-print md:hidden sticky top-0 z-30 flex items-center justify-between bg-brand-black px-4 py-3">
        {brand}
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label={openLabel}
          className="text-white p-2 -me-2"
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M4 6h16M4 12h16M4 18h16" strokeLinecap="round" />
          </svg>
        </button>
      </div>

      {open && (
        <div
          className="no-print fixed inset-0 bg-black/50 z-40 md:hidden"
          onClick={() => setOpen(false)}
          aria-hidden="true"
        />
      )}

      <aside
        className={clsx(
          "no-print fixed md:static inset-y-0 start-0 z-50 w-72 md:w-64 shrink-0 flex flex-col bg-brand-black p-4",
          "transition-transform duration-200 md:!translate-x-0",
          open ? "translate-x-0" : "ltr:-translate-x-full rtl:translate-x-full"
        )}
      >
        <button
          type="button"
          onClick={() => setOpen(false)}
          aria-label={closeLabel}
          className="md:hidden self-end text-white/60 p-2 -mt-2 -me-2 mb-2"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
          </svg>
        </button>
        {children}
      </aside>
    </>
  );
}
