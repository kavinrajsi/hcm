import Link from "next/link";

export const PAGE_SIZE = 25;

export function TablePagination({
  page,
  total,
  searchParams,
  pathname,
}: {
  page: number;
  total: number;
  searchParams: Record<string, string | string[] | undefined>;
  pathname: string;
}) {
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  function pageHref(p: number) {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(searchParams)) {
      if (typeof value === "string" && key !== "page") params.set(key, value);
    }
    params.set("page", String(p));
    return `${pathname}?${params.toString()}`;
  }

  const linkClass =
    "rounded-md border border-zinc-200 px-3 py-1.5 text-sm transition-colors hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-900";
  const disabledClass =
    "rounded-md border border-zinc-100 px-3 py-1.5 text-sm text-zinc-300 dark:border-zinc-900 dark:text-zinc-700";

  return (
    <div className="flex items-center justify-between text-sm text-zinc-500">
      <span>
        {total} record{total === 1 ? "" : "s"} · page {page} of {totalPages}
      </span>
      <div className="flex gap-2">
        {page > 1 ? (
          <Link href={pageHref(page - 1)} className={linkClass}>
            Previous
          </Link>
        ) : (
          <span className={disabledClass}>Previous</span>
        )}
        {page < totalPages ? (
          <Link href={pageHref(page + 1)} className={linkClass}>
            Next
          </Link>
        ) : (
          <span className={disabledClass}>Next</span>
        )}
      </div>
    </div>
  );
}
