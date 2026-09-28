import { cn } from "@/lib/utils";

/** Basecamp profile picture, or initials when there isn't one. */
export function EmployeeAvatar({
  name,
  avatarKey,
  size = "sm",
  className,
}: {
  name: string;
  avatarKey: string | null | undefined;
  size?: "sm" | "lg";
  className?: string;
}) {
  const box = size === "lg" ? "size-14 text-lg" : "size-8 text-xs";
  if (avatarKey) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- private blob via the files route
      <img
        src={`/api/files/${avatarKey}`}
        alt=""
        loading="lazy"
        className={cn("shrink-0 rounded-full object-cover", box, className)}
      />
    );
  }
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
  return (
    <span
      aria-hidden="true"
      className={cn(
        "flex shrink-0 items-center justify-center rounded-full bg-muted font-medium text-zinc-500",
        box,
        className,
      )}
    >
      {initials || "?"}
    </span>
  );
}
