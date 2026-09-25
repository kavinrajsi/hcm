import Link from "next/link";
import { cn } from "@/lib/utils";

/** Pill-style link group (filters, view switches). Scrolls sideways if tight. */
export function Segmented({
  label,
  items,
}: {
  label: string;
  items: {
    key: string;
    href: string;
    label: React.ReactNode;
    active: boolean;
  }[];
}) {
  return (
    <nav
      aria-label={label}
      className="inline-flex max-w-full overflow-x-auto rounded-lg border border-zinc-200 p-0.5 text-sm dark:border-zinc-800"
    >
      {items.map((i) => (
        <Link
          key={i.key}
          href={i.href}
          aria-current={i.active ? "page" : undefined}
          className={cn(
            "flex min-h-9 shrink-0 items-center rounded-md px-3 whitespace-nowrap md:min-h-7",
            i.active
              ? "bg-muted font-medium"
              : "text-zinc-500 hover:text-foreground",
          )}
        >
          {i.label}
        </Link>
      ))}
    </nav>
  );
}
