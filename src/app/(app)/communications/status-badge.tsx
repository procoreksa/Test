export function StatusBadge({ status, label }: { status: string; label: string }) {
  const toneClass =
    status === "SENT" || status === "DELIVERED" || status === "READ"
      ? "bg-emerald-100 text-emerald-700"
      : status === "FAILED"
        ? "bg-red-100 text-red-700"
        : status === "CANCELLED"
          ? "bg-slate-100 text-slate-500"
          : status === "PROCESSING"
            ? "bg-sky-100 text-sky-700"
            : "bg-amber-100 text-amber-700";
  return <span className={`px-2 py-1 rounded-full text-xs font-medium whitespace-nowrap ${toneClass}`}>{label}</span>;
}
