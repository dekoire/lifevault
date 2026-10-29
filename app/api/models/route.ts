import { MODELS } from "@/lib/ai";
import { unauthorized, userClient } from "@/lib/server";

type GatewayModel = { id: string; name?: string; type?: string; pricing?: { input?: string; output?: string } };
let cache: { at: number; models: { id: string; name: string; input: number | null; output: number | null }[] } | null = null;

/** Sprachmodelle des AI Gateway mit Preisen (pro 1 Mio. Tokens, USD) + Standard je Aufgabe – für die Admin-Auswahl */
export async function GET(req: Request) {
  const auth = await userClient(req);
  if (!auth) return unauthorized();
  if (!cache || Date.now() - cache.at > 3_600_000) {
    const res = await fetch("https://ai-gateway.vercel.sh/v1/models").catch(() => undefined);
    const json = (await res?.json().catch(() => null)) as { data?: GatewayModel[] } | null;
    const per1m = (v?: string) => (v ? Math.round(Number(v) * 1e6 * 1000) / 1000 : null);
    if (json?.data) cache = { at: Date.now(), models: json.data.filter((m) => m.type === "language" && !/-batch$/.test(m.id)).map((m) => ({ id: m.id, name: m.name ?? m.id, input: per1m(m.pricing?.input), output: per1m(m.pricing?.output) })) };
  }
  return Response.json({ defaults: Object.fromEntries(Object.entries(MODELS).map(([k, v]) => [k, v.model])), models: cache?.models ?? [] });
}
