// LinkedIn IDs are stored as the bare profile ID ("kavinrajsi"). People
// often paste the whole link, so the form and CSV import accept either and
// keep just the ID.

const PROFILE_PATH = /linkedin\.com\/(?:in|pub)\/([^/?#\s]+)/i;

/** "https://www.linkedin.com/in/kavinrajsi/?x=1" → "kavinrajsi"; IDs pass through. */
export function linkedinIdFrom(value: string): string {
  const trimmed = value.trim();
  const fromLink = PROFILE_PATH.exec(trimmed)?.[1];
  const id = fromLink ?? trimmed.replace(/^@/, "").replace(/\/+$/, "");
  try {
    return decodeURIComponent(id);
  } catch {
    return id;
  }
}

/** What a LinkedIn profile ID may contain (letters in any script, digits, - and _). */
export const LINKEDIN_ID = /^[\p{L}\p{N}_-]{3,100}$/u;

export function linkedinUrl(id: string): string {
  return `https://www.linkedin.com/in/${encodeURIComponent(id)}`;
}
