import { Skeleton } from "@/components/ui/skeleton";
import { PageShell } from "@/components/page";
import { cn } from "@/lib/utils";

// Loading skeletons for the (app) routes' loading.tsx files. They mirror the
// real page scaffolding (PageShell, PageHeader, filters, DesktopTable /
// MobileList) so content swaps in without the layout jumping.

function Loading({
  width,
  children,
}: {
  width?: "sm" | "md" | "lg";
  children: React.ReactNode;
}) {
  return (
    <PageShell width={width}>
      <div role="status" aria-busy="true" aria-live="polite">
        <span className="sr-only">Loading…</span>
        {children}
      </div>
    </PageShell>
  );
}

export function HeaderSkeleton({
  description = false,
  action = false,
}: {
  description?: boolean;
  action?: boolean;
}) {
  return (
    <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
      <div className="min-w-0 space-y-2">
        <Skeleton className="h-7 w-48 md:h-8" />
        {description && <Skeleton className="h-4 w-72 max-w-full" />}
      </div>
      {action && <Skeleton className="h-9 w-32" />}
    </div>
  );
}

export function FiltersSkeleton({ tabs = false }: { tabs?: boolean }) {
  return (
    <div className="mt-5 flex flex-col gap-3 md:mt-6 md:flex-row md:items-center md:justify-between">
      <div className="flex items-center gap-2">
        <Skeleton className="h-10 flex-1 md:h-8 md:w-56 md:flex-none" />
        <Skeleton className="h-10 w-24 md:hidden" />
        <div className="hidden items-center gap-2 md:flex">
          <Skeleton className="h-9 w-16" />
          <Skeleton className="h-9 w-20" />
          <Skeleton className="h-9 w-16" />
          <Skeleton className="h-9 w-28" />
        </div>
      </div>
      {tabs && <Skeleton className="h-9 w-40" />}
    </div>
  );
}

export function TableSkeleton({
  rows = 8,
  cols = 5,
}: {
  rows?: number;
  cols?: number;
}) {
  return (
    <div className="mt-4 hidden overflow-hidden rounded-lg border border-zinc-200 md:block dark:border-zinc-800">
      <div className="flex gap-6 border-b border-zinc-200 px-3 py-3 dark:border-zinc-800">
        {Array.from({ length: cols }, (_, colIndex) => (
          <Skeleton key={colIndex} className="h-3 flex-1" />
        ))}
      </div>
      {Array.from({ length: rows }, (_, rowIndex) => (
        <div
          key={rowIndex}
          className="flex gap-6 border-b border-zinc-200 px-3 py-3.5 last:border-b-0 dark:border-zinc-800"
        >
          {Array.from({ length: cols }, (_, colIndex) => (
            <Skeleton
              key={colIndex}
              className={cn("h-4 flex-1", colIndex === 0 && "max-w-24")}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

export function CardListSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <ul className="mt-4 flex flex-col gap-2 md:hidden">
      {Array.from({ length: rows }, (_, index) => (
        <li
          key={index}
          className="rounded-xl border border-zinc-200 p-4 dark:border-zinc-800"
        >
          <div className="flex items-center justify-between gap-3">
            <Skeleton className="h-5 w-40" />
            <Skeleton className="h-5 w-16" />
          </div>
          <Skeleton className="mt-2 h-4 w-3/4" />
          <div className="mt-3 flex gap-3">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-3 w-24" />
          </div>
        </li>
      ))}
    </ul>
  );
}

/** Mirrors CollapsibleForm: inline form bar on desktop, one button on phones. */
export function AddFormSkeleton() {
  return (
    <div className="mt-5 md:mt-6">
      <Skeleton className="h-11 w-full md:hidden" />
      <div className="hidden items-end gap-3 rounded-lg border border-zinc-200 p-4 md:flex dark:border-zinc-800">
        {[40, 32, 44].map((width) => (
          <div key={width} className="space-y-1.5">
            <Skeleton className="h-3 w-16" />
            <Skeleton className="h-9" style={{ width: `${width * 4}px` }} />
          </div>
        ))}
        <Skeleton className="h-9 w-28" />
      </div>
    </div>
  );
}

export function ListPageSkeleton({
  addForm = false,
  tabs = false,
  description = false,
}: {
  addForm?: boolean;
  tabs?: boolean;
  description?: boolean;
}) {
  return (
    <Loading>
      <HeaderSkeleton description={description} action={tabs} />
      {addForm && <AddFormSkeleton />}
      <FiltersSkeleton tabs={tabs} />
      <TableSkeleton />
      <CardListSkeleton />
    </Loading>
  );
}

/** Mirrors the dashboard: stat tiles, then module cards. */
export function DashboardSkeleton() {
  return (
    <Loading>
      <Skeleton className="h-8 w-56" />
      <Skeleton className="mt-3 h-4 w-80 max-w-full" />
      <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
        {Array.from({ length: 7 }, (_, index) => (
          <div
            key={index}
            className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800"
          >
            <Skeleton className="h-7 w-10" />
            <Skeleton className="mt-2 h-3 w-20" />
          </div>
        ))}
      </div>
      <Skeleton className="mt-12 h-6 w-24" />
      <div className="mt-4 grid gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {Array.from({ length: 12 }, (_, index) => (
          <div
            key={index}
            className="rounded-lg border border-zinc-200 px-4 py-3 dark:border-zinc-800"
          >
            <Skeleton className="h-4 w-28" />
          </div>
        ))}
      </div>
    </Loading>
  );
}

/** Employee view/new, Me, Profile: title, info card, form fields. */
export function DetailPageSkeleton() {
  return (
    <Loading width="md">
      <div className="space-y-2">
        <Skeleton className="h-7 w-56 md:h-8" />
        <Skeleton className="h-4 w-40" />
      </div>
      <div className="mt-6 grid grid-cols-2 gap-4 rounded-lg border border-zinc-200 p-5 sm:grid-cols-4 dark:border-zinc-800">
        {Array.from({ length: 4 }, (_, index) => (
          <div key={index} className="space-y-1.5">
            <Skeleton className="h-3 w-16" />
            <Skeleton className="h-4 w-24" />
          </div>
        ))}
      </div>
      <div className="mt-8 grid gap-4 md:grid-cols-3">
        {Array.from({ length: 12 }, (_, index) => (
          <div key={index} className="space-y-1.5">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-10 w-full md:h-9" />
          </div>
        ))}
      </div>
      <Skeleton className="mt-6 h-10 w-32" />
    </Loading>
  );
}

/** Leave: phone day strip + day cards, desktop table. */
export function LeaveSkeleton() {
  return (
    <Loading>
      <HeaderSkeleton description action />
      <Skeleton className="mt-6 h-4 w-60" />
      <div className="mt-2 flex gap-2 overflow-hidden">
        {Array.from({ length: 6 }, (_, index) => (
          <Skeleton key={index} className="h-10 w-28 shrink-0 md:h-8" />
        ))}
      </div>
      <div className="mt-6 flex items-center justify-between gap-3">
        <Skeleton className="hidden h-8 w-[28rem] md:block" />
        <Skeleton className="h-9 w-40" />
      </div>

      {/* Phone: grey day-strip band, then the selected day's cards. */}
      <div className="-mx-4 mt-4 border-y border-zinc-200 bg-muted/50 px-4 pt-3 pb-3 md:hidden dark:border-zinc-800">
        <div className="flex items-center justify-between">
          <Skeleton className="h-6 w-36 bg-zinc-200 dark:bg-zinc-800" />
          <Skeleton className="h-8 w-28 bg-zinc-200 dark:bg-zinc-800" />
        </div>
        <div className="mt-3 flex justify-between">
          {Array.from({ length: 7 }, (_, index) => (
            <div key={index} className="flex flex-col items-center gap-2">
              <Skeleton className="h-3 w-3 bg-zinc-200 dark:bg-zinc-800" />
              <Skeleton className="size-11 rounded-full bg-zinc-200 dark:bg-zinc-800" />
            </div>
          ))}
        </div>
        <Skeleton className="mt-4 h-4 w-40 bg-zinc-200 dark:bg-zinc-800" />
      </div>
      <Skeleton className="mt-5 h-5 w-32 md:hidden" />
      <CardListSkeleton rows={3} />

      <TableSkeleton cols={6} />
    </Loading>
  );
}
