import { registerClient } from "@/lib/oauth/clients";
import { json, preflight } from "@/lib/oauth/http";

// RFC 7591 dynamic client registration (AI apps register themselves).
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const result = await registerClient(body);
  return result.ok
    ? json(result.body, 201)
    : json(
        { error: result.error, error_description: result.description },
        result.error === "temporarily_unavailable" ? 429 : 400,
      );
}

export const OPTIONS = preflight;
