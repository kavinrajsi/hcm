// Public: the logo in every email's signature. Mail clients fetch it without
// signing in, so this serves only the one image HR uploaded on Email
// templates (from private Blob), or sends them to the bundled default.

import { readDocument } from "@/lib/blob";
import { DEFAULT_LOGO_PATH, getSignature } from "@/lib/email-signature";
import { appUrl } from "@/lib/email-template";

const CACHE = "public, max-age=86400";

export async function GET() {
  const { logoPathname } = await getSignature();
  const result = logoPathname ? await readDocument(logoPathname).catch(() => null) : null;
  if (!result) return Response.redirect(appUrl(DEFAULT_LOGO_PATH), 302);
  return new Response(result.stream, {
    headers: {
      "Content-Type": result.headers.get("content-type") ?? "image/png",
      "Cache-Control": CACHE,
    },
  });
}
