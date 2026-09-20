import Link from "next/link";
import { PrintButton } from "@/components/print-button";

export function ReportHeader({ backLabel, printLabel }: { backLabel: string; printLabel: string }) {
  return (
    <div className="flex items-center justify-between no-print">
      <Link href="/reports" className="text-sm text-slate-500 hover:text-slate-800">
        {backLabel}
      </Link>
      <PrintButton label={printLabel} />
    </div>
  );
}
