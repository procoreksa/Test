import Link from "next/link";

/** Shared prev/next pager for server-paginated report pages (Corporate Housing reports, Step 44-51). */
export function ReportPager({
  page,
  totalPages,
  hrefFor,
  previousLabel,
  nextLabel,
}: {
  page: number;
  totalPages: number;
  hrefFor: (page: number) => string;
  previousLabel: string;
  nextLabel: string;
}) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-sm text-slate-500">
        {page} / {totalPages}
      </span>
      <div className="flex gap-2">
        {page > 1 && (
          <Link href={hrefFor(page - 1)} className="text-sm text-brand-gold-dark hover:underline">
            {previousLabel}
          </Link>
        )}
        {page < totalPages && (
          <Link href={hrefFor(page + 1)} className="text-sm text-brand-gold-dark hover:underline">
            {nextLabel}
          </Link>
        )}
      </div>
    </div>
  );
}
