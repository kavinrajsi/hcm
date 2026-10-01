import { issuer, json, preflight } from "@/lib/oauth/http";

// RFC 9728 protected resource metadata for /api/mcp (served at the root and
// at the path-suffixed URL, /.well-known/oauth-protected-resource/api/mcp).
export function GET(request: Request) {
  const base = issuer(request);
  return json({
    resource: `${base}/api/mcp`,
    authorization_servers: [base],
    scopes_supported: ["hcm"],
    bearer_methods_supported: ["header"],
    resource_name: "HCM (Madarth)",
    resource_documentation: `${base}/mcp/instructions`,
  });
}

export const OPTIONS = preflight;
