import { ApiError, rpc } from "@/lib/api";
import { oauthBody, oauthFail } from "@/lib/oauth";

/**
 * Token-Endpunkt (OAuth 2.1). Nur vom Server der App aufrufen – nie aus dem Browser, das Geheimnis gehört nicht dorthin.
 * - grant_type=authorization_code: code, code_verifier (PKCE), redirect_uri → Zugriffs- + Erneuerungstoken
 * - grant_type=refresh_token: refresh_token → neues Paar (das alte Erneuerungstoken ist danach ungültig)
 * - grant_type=client_credentials: für selbst angelegte Zugänge (wie /api/v1/token)
 */
export async function POST(req: Request) {
  try {
    const { id, secret, body } = await oauthBody(req);
    const g = body.grant_type;
    let out: unknown;
    if (g === "authorization_code") out = await rpc("oauth_exchange", { p_client_id: id, p_secret: secret, p_code: body.code, p_verifier: body.code_verifier, p_redirect: body.redirect_uri });
    else if (g === "refresh_token") out = await rpc("oauth_refresh_token", { p_client_id: id, p_secret: secret, p_refresh: body.refresh_token });
    else if (g === "client_credentials") out = await rpc("api_token", { p_client_id: id, p_client_secret: secret });
    else throw new ApiError(400, "unsupported_grant_type", "grant_type: authorization_code, refresh_token oder client_credentials.");
    // Wiederverwendung erkannt: die Datenbank hat die Verbindung schon gesperrt und meldet den Fehler als Ergebnis
    if ((out as { error?: string } | null)?.error) throw new ApiError(400, "invalid_grant", "Code bzw. Token wurde schon benutzt – Verbindung aus Sicherheitsgründen getrennt.");
    return Response.json(out, { headers: { "Cache-Control": "no-store", Pragma: "no-cache" } });
  } catch (e) {
    return oauthFail(e);
  }
}
