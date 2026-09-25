import Link from "next/link";
import { ChevronRightIcon } from "@/components/icons";

/**
 * One row of a phone list. With `href` (link) or `onSelect` (button) the main
 * area is a single tap target with a chevron; `actions` render below it as
 * separate buttons so there are never nested interactive elements.
 */
export function ListCard({
  href,
  onSelect,
  title,
  subtitle,
  badge,
  meta,
  actions,
}: {
  href?: string;
  onSelect?: () => void;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  badge?: React.ReactNode;
  meta?: React.ReactNode;
  actions?: React.ReactNode;
}) {
  const body = (
    <>
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <span className="min-w-0 font-medium leading-snug break-words">
            {title}
          </span>
          {badge && <span className="shrink-0">{badge}</span>}
        </div>
        {subtitle && (
          <div className="mt-0.5 text-sm text-zinc-500 break-words">
            {subtitle}
          </div>
        )}
        {meta && (
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-zinc-500">
            {meta}
          </div>
        )}
      </div>
      {(href || onSelect) && (
        <ChevronRightIcon className="size-5 shrink-0 self-center text-zinc-400" />
      )}
    </>
  );

  return (
    <li className="rounded-xl border border-zinc-200 bg-background dark:border-zinc-800">
      {href ? (
        <Link
          href={href}
          className="flex min-h-14 items-start gap-3 rounded-xl p-3 active:bg-muted"
        >
          {body}
        </Link>
      ) : onSelect ? (
        <button
          type="button"
          onClick={onSelect}
          className="flex min-h-14 w-full items-start gap-3 rounded-xl p-3 text-left active:bg-muted"
        >
          {body}
        </button>
      ) : (
        <div className="flex min-h-14 items-start gap-3 p-3">{body}</div>
      )}
      {actions && (
        <div className="flex flex-wrap items-center gap-2 border-t border-zinc-200 px-3 py-2 dark:border-zinc-800">
          {actions}
        </div>
      )}
    </li>
  );
}
