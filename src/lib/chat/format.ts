// Chat page: IST labels for day separators, message times and the chat
// list ("Today", "Yesterday", DD/MM/YYYY). Pure, so the browser uses it too.

import { formatDay, formatTime, istDayKey } from "@/lib/format-date";

const DAY_MS = 86_400_000;

function relativeDay(value: Date, now: Date): "today" | "yesterday" | null {
  const day = istDayKey(value);
  if (day === istDayKey(now)) return "today";
  if (day === istDayKey(new Date(now.getTime() - DAY_MS))) return "yesterday";
  return null;
}

/** The separator above a day's messages. */
export function chatDayLabel(value: Date, now = new Date()): string {
  const relative = relativeDay(value, now);
  if (relative === "today") return "Today";
  if (relative === "yesterday") return "Yesterday";
  return formatDay(istDayKey(value));
}

/** The chat list's time: today's time, "Yesterday", or the date. */
export function chatListTime(value: Date | null, now = new Date()): string {
  if (!value) return "";
  const relative = relativeDay(value, now);
  if (relative === "today") return formatTime(value);
  if (relative === "yesterday") return "Yesterday";
  return formatDay(istDayKey(value));
}

export { formatTime as chatTime };
