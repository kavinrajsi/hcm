// Models MadMax may use, all through Vercel AI Gateway. The client picks by
// key; anything else is rejected server-side.

export const MADMAX_MODELS = [
  { key: "sonnet", label: "Sonnet 5", id: "anthropic/claude-sonnet-5" },
  { key: "haiku", label: "Haiku 4.5", id: "anthropic/claude-haiku-4.5" },
  { key: "gemini", label: "Gemini 2.5 Flash", id: "google/gemini-2.5-flash" },
] as const;

export type MadmaxModelKey = (typeof MADMAX_MODELS)[number]["key"];

export const DEFAULT_MODEL: MadmaxModelKey = "sonnet";

export function modelByKey(key: unknown) {
  return MADMAX_MODELS.find((model) => model.key === key) ?? null;
}
