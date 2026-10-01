import { resolveClient } from "@/lib/oauth/clients";
import { clientAuthenticated, exchangeCode, refreshTokens } from "@/lib/oauth/grants";
import { basicCredentials, json, preflight, readParams } from "@/lib/oauth/http";

// Token endpoint: authorization_code (with PKCE) and refresh_token.
export async function POST(request: Request) {
  const params = await readParams(request);
  const basic = basicCredentials(request);
  const clientId = basic?.id ?? params.client_id;
  const client = clientId ? await resolveClient(clientId) : null;
  if (!client || !clientAuthenticated(client, basic?.secret ?? params.client_secret ?? null))
    return json({ error: "invalid_client", error_description: "Unknown client or bad credentials" }, 401);

  const result =
    params.grant_type === "authorization_code"
      ? await exchangeCode({
          client,
          code: params.code ?? "",
          redirectUri: params.redirect_uri ?? "",
          codeVerifier: params.code_verifier ?? null,
        })
      : params.grant_type === "refresh_token"
        ? await refreshTokens({ client, refreshToken: params.refresh_token ?? "" })
        : { error: "unsupported_grant_type", error_description: "Use authorization_code or refresh_token" };

  return "error" in result ? json(result, 400) : json(result);
}

export const OPTIONS = preflight;
