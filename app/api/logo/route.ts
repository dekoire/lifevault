/**
 * Firmenlogo zur Absender-Domain (z. B. vodafone.de). Abruf über unseren Server, damit Logo-Dienste
 * weder deine IP noch deine Absender-Liste sehen. Zwischengespeichert für 30 Tage.
 */
export async function GET(req: Request) {
  const d = new URL(req.url).searchParams.get("d")?.toLowerCase() ?? "";
  if (!/^[a-z0-9.-]{3,80}\.[a-z]{2,}$/.test(d)) return new Response("bad domain", { status: 400 });
  const sources = [`https://www.google.com/s2/favicons?domain=${d}&sz=128`, `https://icons.duckduckgo.com/ip3/${d}.ico`];
  for (const url of sources) {
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(4000) });
      const type = r.headers.get("content-type") ?? "";
      if (!r.ok || !type.startsWith("image/")) continue;
      const buf = await r.arrayBuffer();
      if (buf.byteLength < 200 || buf.byteLength > 300_000) continue;
      return new Response(buf, { headers: { "content-type": type, "cache-control": "public, max-age=2592000, immutable", "x-content-type-options": "nosniff" } });
    } catch { /* nächste Quelle */ }
  }
  return new Response("not found", { status: 404, headers: { "cache-control": "public, max-age=86400" } });
}
