import { cn } from "@/lib/utils";

// Page scaffolding shared by every (app) route: phone-first padding, a title
// row whose actions wrap under the title on small screens, and the
// table-on-desktop / cards-on-phone list pair.

const WIDTHS = {
  sm: "max-w-2xl",
  md: "max-w-4xl",
  lg: "max-w-6xl",
  full: "",
} as const;

export function PageShell({
  width = "lg",
  className,
  children,
}: {
  width?: keyof typeof WIDTHS;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <main
      className={cn(
        "mx-auto w-full min-w-0 flex-1 px-4 py-5 md:px-6 md:py-8",
        WIDTHS[width],
        className,
      )}
    >
      {children}
    </main>
  );
}

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
      <div className="min-w-0">
        <h1 className="text-xl font-semibold tracking-tight md:text-2xl">
          {title}
        </h1>
        {description && (
          <p className="mt-1 text-sm text-zinc-500">{description}</p>
        )}
      </div>
      {actions && (
        <div className="flex flex-wrap items-center gap-2">{actions}</div>
      )}
    </div>
  );
}

/** Desktop-only table frame (the card list replaces it on phones). */
export function DesktopTable({ children }: { children: React.ReactNode }) {
  return (
    <div className="hidden rounded-lg border border-zinc-200 md:block dark:border-zinc-800">
      {children}
    </div>
  );
}

/** Phone-only card list; shows `empty` when there are no rows. */
export function MobileList({
  empty,
  isEmpty,
  children,
}: {
  empty: React.ReactNode;
  isEmpty: boolean;
  children: React.ReactNode;
}) {
  return isEmpty ? (
    <p className="rounded-xl border border-dashed border-zinc-200 px-4 py-10 text-center text-sm text-zinc-500 md:hidden dark:border-zinc-800">
      {empty}
    </p>
  ) : (
    <ul className="flex flex-col gap-2 md:hidden">{children}</ul>
  );
}
