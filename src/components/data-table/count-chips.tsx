import { cn } from "@/lib/utils";

// Row of "Label count" chips above a list: one swipeable row on phones,
// wrapping on desktop.
export function CountChips({
  items,
}: {
  items: { key: string; label: string; count: number; className?: string }[];
}) {
  return (
    <div className="-mx-4 mt-5 flex gap-2 overflow-x-auto px-4 md:mx-0 md:mt-6 md:flex-wrap md:px-0">
      {items.map((item) => (
        <span
          key={item.key}
          className={cn(
            "shrink-0 rounded-md px-2.5 py-1 text-sm",
            item.className ?? "bg-muted",
          )}
        >
          {item.label}{" "}
          <span className="font-medium tabular-nums">{item.count}</span>
        </span>
      ))}
    </div>
  );
}
