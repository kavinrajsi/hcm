// Vocabulary for Assignment Intelligence (docs/assignment-intelligence).
// Kinds of design job and the categories a comment can fall into. Both are
// plain strings in the database so the lists can change without a migration.

export const JOB_KINDS = [
  "social-post",
  "banner-ad",
  "website",
  "print",
  "branding",
  "video",
  "presentation",
  "packaging",
  "illustration",
  "other",
] as const;

export type JobKind = (typeof JOB_KINDS)[number];

export const JOB_KIND_LABELS: Record<JobKind, string> = {
  "social-post": "Social media post",
  "banner-ad": "Banner / digital ad",
  website: "Website / landing page",
  print: "Print (brochure, flyer, poster)",
  branding: "Logo / branding",
  video: "Video / motion",
  presentation: "Presentation / deck",
  packaging: "Packaging",
  illustration: "Illustration",
  other: "Other",
};

export const JOB_KIND_HINTS: Record<JobKind, string> = {
  "social-post":
    "Instagram, Facebook, LinkedIn posts, stories, reels covers, carousels, festival wishes",
  "banner-ad": "Meta/Google ad banners, display ads, web banners, emailers",
  website: "website pages, landing pages, UI screens, app screens, layouts",
  print:
    "brochures, flyers, posters, standees, hoardings, newspaper ads, business cards",
  branding: "logos, brand identity, style guides, letterheads",
  video: "videos, reels, motion graphics, animations, storyboards",
  presentation: "pitch decks, PPTs, proposals, credentials",
  packaging: "labels, boxes, pouches, product packaging",
  illustration: "illustrations, characters, icons, mascots",
  other: "anything that doesn't fit the above",
};

export function isJobKind(value: unknown): value is JobKind {
  return typeof value === "string" && (JOB_KINDS as readonly string[]).includes(value);
}

/**
 * What a comment on a job is doing. A comment may carry several; a
 * CORRECTION is what counts as rework the designer owns.
 */
export const COMMENT_CATEGORIES = [
  "CORRECTION",
  "CLIENT_CHANGE",
  "TIMING",
  "HANDOFF",
  "OTHER",
] as const;

export type CommentCategory = (typeof COMMENT_CATEGORIES)[number];

export const COMMENT_CATEGORY_LABELS: Record<CommentCategory, string> = {
  CORRECTION: "Correction",
  CLIENT_CHANGE: "Client change",
  TIMING: "Timing",
  HANDOFF: "Handoff",
  OTHER: "Other",
};

export const COMMENT_CATEGORY_HINTS: Record<CommentCategory, string> = {
  CORRECTION:
    "Something in the design was wrong or below the brief and has to be redone: typos, wrong logo, off-brand colours, missed an element, alignment, wrong size.",
  CLIENT_CHANGE:
    "The client (or coordinator on their behalf) changed their mind or asked for something new that wasn't in the brief.",
  TIMING: "About when: deadlines, delays, 'need this by', reminders.",
  HANDOFF:
    "Delivery or process only: sharing files/links, approvals, 'done', 'closing this', assigning.",
  OTHER: "Anything else: questions, thanks, unclear.",
};

export function isCommentCategory(value: unknown): value is CommentCategory {
  return (
    typeof value === "string" &&
    (COMMENT_CATEGORIES as readonly string[]).includes(value)
  );
}

/** Keeps only known categories, in canonical order, without duplicates. */
export function normalizeCategories(values: unknown): CommentCategory[] {
  const set = new Set(
    Array.isArray(values) ? values.filter(isCommentCategory) : [],
  );
  return COMMENT_CATEGORIES.filter((category) => set.has(category));
}

export const BELIEF_LEVELS = ["strong", "ok", "weak", "unknown"] as const;
export type BeliefLevel = (typeof BELIEF_LEVELS)[number];
export const BELIEF_LEVEL_LABELS: Record<BeliefLevel, string> = {
  strong: "Good at this",
  ok: "Can do it",
  weak: "Not their thing",
  unknown: "Don't know",
};
export function isBeliefLevel(value: unknown): value is BeliefLevel {
  return (
    typeof value === "string" &&
    (BELIEF_LEVELS as readonly string[]).includes(value)
  );
}

/** Basecamp job titles that mark someone as a designer. */
export function isDesignerTitle(title: string | null | undefined): boolean {
  return /design|illustrat|ui\/ux|ui-ux|visual|art director|motion/i.test(
    title ?? "",
  );
}
