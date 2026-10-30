import { rpc } from "@/lib/api";
import { oauthBody, oauthFail } from "@/lib/oauth";

/** App trennt die Verbindung (RFC 7009): token = Zugriffs- oder Erneuerungstoken. Antwortet immer 200, auch bei unbekanntem Token. */
export async function POST(req: Request) {
  try {
    const { id, secret, body } = await oauthBody(req);
    await rpc("oauth_revoke", { p_client_id: id, p_secret: secret, p_token: body.token });
    return new Response(null, { status: 200, headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return oauthFail(e);
  }
}
