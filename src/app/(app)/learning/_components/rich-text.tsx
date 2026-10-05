import { sanitizeNotes } from "@/lib/learning/notes";
import { cn } from "@/lib/utils";

/** Lesson notes / announcement body (sanitized again on the way out). */
export function RichText({ html, className }: { html: string; className?: string }) {
  return (
    <div
      className={cn(
        "max-w-none text-sm leading-relaxed text-zinc-700 dark:text-zinc-300",
        "[&_a]:underline [&_a]:underline-offset-4 [&_blockquote]:border-l-2 [&_blockquote]:pl-3 [&_blockquote]:text-zinc-500",
        "[&_h2]:mt-4 [&_h2]:text-base [&_h2]:font-semibold [&_h3]:mt-3 [&_h3]:font-semibold",
        "[&_li]:my-0.5 [&_ol]:list-decimal [&_ol]:pl-5 [&_p]:my-2 [&_ul]:list-disc [&_ul]:pl-5",
        "[&_code]:rounded [&_code]:bg-muted [&_code]:px-1 [&_pre]:overflow-x-auto [&_pre]:rounded-md [&_pre]:bg-muted [&_pre]:p-3",
        className,
      )}
      dangerouslySetInnerHTML={{ __html: sanitizeNotes(html) }}
    />
  );
}
