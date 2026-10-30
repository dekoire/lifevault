/** Selbstbeschreibung für Apps, die sich verbinden wollen (RFC 8414) */
export function GET(req: Request) {
  const base = new URL(req.url).origin;
  return Response.json({
    issuer: base,
    authorization_endpoint: `${base}/connect`,
    token_endpoint: `${base}/api/v1/oauth/token`,
    revocation_endpoint: `${base}/api/v1/oauth/revoke`,
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code", "refresh_token", "client_credentials"],
    code_challenge_methods_supported: ["S256"],
    token_endpoint_auth_methods_supported: ["client_secret_basic", "client_secret_post"],
    scopes_supported: ["read", "write", "kinds:<art,…>", "project:<name>"],
  }, { headers: { "Cache-Control": "public, max-age=3600" } });
}
