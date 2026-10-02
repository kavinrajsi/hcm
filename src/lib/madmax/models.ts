// Models MadMax may use, all through Vercel AI Gateway. The client picks by
// key; anything else is rejected server-side. `note` shows in the picker.

export const MADMAX_MODELS: readonly {
  key: "gemini" | "haiku" | "sonnet";
  label: string;
  id: string;
  note?: string;
}[] = [
  { key: "gemini", label: "Gemini 2.5 Flash", id: "google/gemini-2.5-flash" },
  { key: "haiku", label: "Haiku 4.5", id: "anthropic/claude-haiku-4.5" },
  {
    key: "sonnet",
    label: "Sonnet 5",
    id: "anthropic/claude-sonnet-5",
    note: "needs paid credits",
  },
];

export type MadmaxModelKey = (typeof MADMAX_MODELS)[number]["key"];

// Sonnet 5 needs paid Gateway credits; on the free tier every request fails.
export const DEFAULT_MODEL: MadmaxModelKey = "gemini";

export function modelByKey(key: unknown) {
  return MADMAX_MODELS.find((model) => model.key === key) ?? null;
}
