import { cn } from "@/lib/utils";

/** The course cover image, or a dark tile with the title's initials. */
export function CourseCover({
  title,
  coverKey,
  className,
}: {
  title: string;
  coverKey: string | null;
  className?: string;
}) {
  if (coverKey) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- private, signed per request
      <img
        src={`/api/learning/files/${coverKey}`}
        alt=""
        className={cn("aspect-video w-full rounded-lg bg-zinc-900 object-cover", className)}
      />
    );
  }
  const initials = title
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase())
    .join("");
  return (
    <div
      aria-hidden
      className={cn(
        "flex aspect-video w-full items-center justify-center rounded-lg bg-gradient-to-br from-zinc-900 via-zinc-800 to-zinc-700 text-3xl font-semibold tracking-tight text-white",
        className,
      )}
    >
      {initials || "•"}
    </div>
  );
}
