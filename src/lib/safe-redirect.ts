/**
 * A same-site path to send someone after sign-in, or "/" when the value
 * isn't one. Rejects absolute and protocol-relative URLs (open redirect).
 */
export function safeCallbackPath(value: unknown): string {
  if (typeof value !== "string") return "/";
  if (!value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\"))
    return "/";
  if (/[\r\n]/.test(value)) return "/";
  return value;
}
