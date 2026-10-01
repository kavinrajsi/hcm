import { issuer, json, preflight } from "@/lib/oauth/http";

// RFC 8414 authorization server metadata for HCM's MCP sign-in.
export function GET(request: Request) {
  const base = issuer(request);
  return json({
    issuer: base,
    authorization_endpoint: `${base}/oauth/authorize`,
    token_endpoint: `${base}/oauth/token`,
    registration_endpoint: `${base}/oauth/register`,
    revocation_endpoint: `${base}/oauth/revoke`,
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    code_challenge_methods_supported: ["S256"],
    token_endpoint_auth_methods_supported: ["none", "client_secret_post", "client_secret_basic"],
    scopes_supported: ["hcm"],
    client_id_metadata_document_supported: true,
    service_documentation: `${base}/mcp/instructions`,
  });
}

export const OPTIONS = preflight;
