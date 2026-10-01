import { revokeToken } from "@/lib/oauth/grants";
import { json, preflight, readParams } from "@/lib/oauth/http";

// RFC 7009 token revocation. Always 200, even for unknown tokens.
export async function POST(request: Request) {
  const params = await readParams(request);
  if (params.token) await revokeToken(params.token);
  return json({});
}

export const OPTIONS = preflight;
