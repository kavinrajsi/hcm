import { createMcpHandler, withMcpAuth } from "mcp-handler";
import { verifyAccessToken, type AccessGrant } from "@/lib/oauth/grants";
import { CORS_HEADERS, preflight } from "@/lib/oauth/http";
import { MCP_INSTRUCTIONS, registerHcmTools } from "@/lib/mcp/server";

export const maxDuration = 60;

// HCM's MCP endpoint. Every request must carry an OAuth access token issued
// by HCM (see /oauth/*); without one the client gets a 401 pointing at the
// protected resource metadata, which starts the "Login with HCM" flow.

const authed = withMcpAuth(
  async (request: Request) => {
    const grant = request.auth?.extra as AccessGrant | undefined;
    if (!grant) return new Response("Unauthorized", { status: 401 });
    const handler = createMcpHandler((server) => registerHcmTools(server, grant), {
      serverInfo: { name: "hcm", version: "1.0.0" },
      instructions: MCP_INSTRUCTIONS,
    });
    return handler(request);
  },
  async (_request, token) => {
    const grant = await verifyAccessToken(token);
    if (!grant) return undefined;
    return {
      token: token!,
      clientId: grant.clientId,
      scopes: ["hcm"],
      expiresAt: Math.floor(grant.expiresAt.getTime() / 1000),
      extra: grant,
    };
  },
  { required: true, resourceMetadataPath: "/.well-known/oauth-protected-resource/api/mcp" },
);

async function handle(request: Request) {
  const response = await authed(request);
  const headers = new Headers(response.headers);
  for (const [key, value] of Object.entries(CORS_HEADERS)) headers.set(key, value);
  headers.set("Access-Control-Expose-Headers", "WWW-Authenticate, Mcp-Session-Id, MCP-Protocol-Version");
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

export { handle as GET, handle as POST, handle as DELETE };
export const OPTIONS = preflight;
