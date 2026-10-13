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

// Group-chat name colours (WhatsApp style): each person keeps one colour,
// readable on both the light and dark bubble.
const NAME_COLORS = [
  "text-emerald-700 dark:text-emerald-400",
  "text-sky-700 dark:text-sky-400",
  "text-violet-700 dark:text-violet-400",
  "text-rose-700 dark:text-rose-400",
  "text-amber-700 dark:text-amber-400",
  "text-teal-700 dark:text-teal-400",
  "text-fuchsia-700 dark:text-fuchsia-400",
  "text-orange-700 dark:text-orange-400",
] as const;

const AVATAR_COLORS = [
  "bg-emerald-600",
  "bg-sky-600",
  "bg-violet-600",
  "bg-rose-600",
  "bg-amber-600",
  "bg-teal-600",
  "bg-fuchsia-600",
  "bg-orange-600",
] as const;

function hash(value: string): number {
  let total = 0;
  for (const character of value) total = (total * 31 + character.charCodeAt(0)) >>> 0;
  return total;
}

/** The same person always gets the same name colour. */
export function senderColor(personId: string | null, name: string): string {
  return NAME_COLORS[hash(personId ?? name) % NAME_COLORS.length];
}

/** A chat's avatar background, steady per project. */
export function chatAvatarColor(projectId: string): string {
  return AVATAR_COLORS[hash(projectId) % AVATAR_COLORS.length];
}

// A Basecamp @mention, as stored after sanitizing: a figure holding the
// person's 20×20 avatar and their name as the caption. Pictures people post
// are figures too, but never 20×20.
const MENTION = /<figure>\s*(<img\b[^>]*\bwidth="20"[^>]*>)\s*<figcaption>([\s\S]*?)<\/figcaption>\s*<\/figure>/g;

/** Turns mention figures into "@Name" in the mention colour (WhatsApp style). */
export function markMentions(html: string): string {
  return html.replace(MENTION, (_match, _image: string, name: string) => `<span class="bc-mention">@${name.trim()}</span>`);
}

/**
 * Whether the message ends in a line of text (plain, or a closing div/p), so
 * the time can sit at the end of that last line as in WhatsApp. Lists,
 * pictures and quotes end on their own, and the time gets its own line.
 */
export function endsInTextLine(html: string): "block" | "inline" | null {
  const tail = html.trimEnd();
  if (!tail) return null;
  if (/<\/(div|p)>$/i.test(tail)) return /<\/(ul|ol|figure|blockquote|pre)>\s*<\/(div|p)>$/i.test(tail) ? null : "block";
  if (/<\/[a-z-]+>$/i.test(tail) && !/<\/(span|strong|b|em|i|u|s|a|code)>$/i.test(tail)) return null;
  return "inline";
}

/** Mentions as plain "@Name", for previews. */
export function mentionsAsText(html: string): string {
  return html.replace(MENTION, (_match, _image: string, name: string) => ` @${name.trim()} `);
}
