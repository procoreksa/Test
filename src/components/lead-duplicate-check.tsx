"use client";

import { useState, useTransition } from "react";
import { findPossibleDuplicateLeads } from "@/lib/actions/leads";
import type { DuplicateMatch } from "@/lib/crm/lead-rules";

/**
 * Non-blocking duplicate warning (Step 12): renders the Mobile/Email inputs
 * for the new-lead form and checks for possible duplicates on blur. Never
 * prevents submission - it only informs the user, who can continue
 * regardless (a legitimate second enquiry from the same person is common
 * in leasing and must not be silently blocked).
 */
export function LeadDuplicateCheck({
  mobileLabel,
  emailLabel,
  warningTitle,
  mobileMatchLabel,
  emailMatchLabel,
}: {
  mobileLabel: string;
  emailLabel: string;
  warningTitle: string;
  mobileMatchLabel: string;
  emailMatchLabel: string;
}) {
  const [mobile, setMobile] = useState("");
  const [email, setEmail] = useState("");
  const [matches, setMatches] = useState<DuplicateMatch[]>([]);
  const [isPending, startTransition] = useTransition();

  function check(nextMobile: string, nextEmail: string) {
    if (!nextMobile && !nextEmail) {
      setMatches([]);
      return;
    }
    startTransition(async () => {
      const result = await findPossibleDuplicateLeads(nextMobile, nextEmail || undefined);
      setMatches(result);
    });
  }

  return (
    <>
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1">{mobileLabel}</label>
        <input
          name="mobile"
          required
          value={mobile}
          onChange={(e) => setMobile(e.target.value)}
          onBlur={() => check(mobile, email)}
          className="w-full rounded-lg border border-slate-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-gold"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1">{emailLabel}</label>
        <input
          name="email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          onBlur={() => check(mobile, email)}
          className="w-full rounded-lg border border-slate-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-gold"
        />
      </div>
      {!isPending && matches.length > 0 && (
        <div className="md:col-span-2 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <p className="font-semibold">{warningTitle}</p>
          <ul className="mt-1 space-y-1">
            {matches.map((m) => (
              <li key={m.id}>
                {m.matchedOn === "mobile" ? mobileMatchLabel : emailMatchLabel}: {m.leadNumber} — {m.fullName} — {m.mobile} — {m.status}
              </li>
            ))}
          </ul>
        </div>
      )}
    </>
  );
}
