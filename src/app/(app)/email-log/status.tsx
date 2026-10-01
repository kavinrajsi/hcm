import type { EmailDelivery, EmailStatus } from "@/generated/prisma/enums";

export const STATUS_LABELS: Record<EmailStatus, string> = { SENT: "Sent", FAILED: "Failed", NOT_SENT: "Not sent" };
export const DELIVERY_LABELS: Record<EmailDelivery, string> = { DELIVERED: "Delivered", OPENED: "Opened", BOUNCED: "Bounced" };

/** The one word to show: delivery when known, else the send result. */
export function EmailStatusBadge({ status, delivery }: { status: EmailStatus; delivery: EmailDelivery | null }) {
  const label = status === "SENT" && delivery ? DELIVERY_LABELS[delivery] : STATUS_LABELS[status];
  const tone =
    status === "FAILED" || delivery === "BOUNCED"
      ? "text-red-600 dark:text-red-400"
      : status === "NOT_SENT"
        ? "text-amber-600 dark:text-amber-400"
        : delivery === "OPENED"
          ? "text-emerald-600 dark:text-emerald-400"
          : "text-zinc-600 dark:text-zinc-400";
  return <span className={`text-sm ${tone}`}>{label}</span>;
}
