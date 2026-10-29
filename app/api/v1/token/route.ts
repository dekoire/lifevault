import { ApiError, fail, ok, rpc } from "@/lib/api";

/** OAuth2 Client Credentials: client_id + client_secret → Zugriffstoken (1 Stunde) */
export async function POST(req: Request) {
  try {
    let id = "", secret = "";
    const basic = /^Basic\s+(.+)$/i.exec(req.headers.get("authorization") ?? "")?.[1];
    if (basic) [id, secret] = Buffer.from(basic, "base64").toString("utf8").split(":");
    else {
      const type = req.headers.get("content-type") ?? "";
      const body = type.includes("application/x-www-form-urlencoded") ? Object.fromEntries(new URLSearchParams(await req.text())) : await req.json().catch(() => ({}));
      if (body.grant_type && body.grant_type !== "client_credentials") throw new ApiError(400, "unsupported_grant_type", "Nur grant_type=client_credentials.");
      id = String(body.client_id ?? ""); secret = String(body.client_secret ?? "");
    }
    if (!id || !secret) throw new ApiError(401, "unauthorized", "client_id und client_secret fehlen.");
    return ok(await rpc("api_token", { p_client_id: id.slice(0, 100), p_client_secret: secret.slice(0, 200) }));
  } catch (e) {
    return fail(e);
  }
}
