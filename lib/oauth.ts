import { ApiError } from "@/lib/api";

/** Client-Zugangsdaten aus Basic-Auth oder Formular/JSON (RFC 6749 §2.3.1) und der restliche Body */
export async function oauthBody(req: Request): Promise<{ id: string; secret: string; body: Record<string, string> }> {
  const type = req.headers.get("content-type") ?? "";
  const raw = type.includes("application/x-www-form-urlencoded") ? Object.fromEntries(new URLSearchParams(await req.text())) : ((await req.json().catch(() => ({}))) as Record<string, unknown>);
  const body = Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, String(v ?? "").slice(0, 300)]));
  let id = body.client_id ?? "", secret = body.client_secret ?? "";
  const basic = /^Basic\s+(.+)$/i.exec(req.headers.get("authorization") ?? "")?.[1];
  if (basic) {
    const s = Buffer.from(basic, "base64").toString("utf8");
    const i = s.indexOf(":");
    id = decodeURIComponent(s.slice(0, i)); secret = decodeURIComponent(s.slice(i + 1));
  }
  if (!id || !secret) throw new ApiError(401, "invalid_client", "client_id und client_secret fehlen.");
  return { id, secret, body };
}

/** Fehler im OAuth-Format: { error, error_description } */
export function oauthFail(e: unknown) {
  const err = e instanceof ApiError ? e : new ApiError(500, "server_error", "Interner Fehler.");
  if (!(e instanceof ApiError)) console.error("oauth", (e as Error)?.message);
  return Response.json({ error: err.code, error_description: err.message }, { status: err.status, headers: { "Cache-Control": "no-store", Pragma: "no-cache" } });
}
