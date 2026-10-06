// Resume score bands, shared by the server and the browser (no imports).

export const SCORE_BANDS = {
  strong: { label: "Strong (75+)", min: 75, max: 100 },
  fair: { label: "Fair (50–74)", min: 50, max: 74 },
  weak: { label: "Weak (below 50)", min: 0, max: 49 },
} as const;
export type ScoreBand = keyof typeof SCORE_BANDS;

export function scoreBand(score: number | null | undefined): ScoreBand | null {
  if (score === null || score === undefined) return null;
  return score >= 75 ? "strong" : score >= 50 ? "fair" : "weak";
}

export const roleKey = (role: string) => role.trim().toLowerCase();
