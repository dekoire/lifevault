/**
 * Firmenlogo zur Absender-Domain (z. B. vodafone.de). Abruf über unseren Server, damit Logo-Dienste
 * weder deine IP noch deine Absender-Liste sehen. Zwischengespeichert für 30 Tage.
 * Kennen Google/DuckDuckGo kein Icon, lesen wir es von der Startseite der Firma (<link rel="icon">) –
 * nur Bilder vom selben Webauftritt, damit niemand über die Seite beliebige Adressen abrufen lässt.
 */
const ok = (type: string, url: string) => type.startsWith("image/") || (/\.ico(\?|$)/i.test(url) && /octet-stream|icon/.test(type));
async function fromSite(d: string): Promise<Response | null> {
  try {
    const page = await fetch(`https://${d}/`, { signal: AbortSignal.timeout(4000), headers: { "user-agent": "Mozilla/5.0 (Lifevault Logo)" } });
    if (!page.ok) return null;
    const html = (await page.text()).slice(0, 400_000);
    const base = new URL(page.url);
    const root = d.replace(/^www\./, "");
    const links = [...html.matchAll(/<link\b[^>]*>/gi)].map((m) => m[0]).filter((t) => /rel=["'][^"']*icon/i.test(t));
    // bevorzugt: großes Apple-Icon, dann Icons mit Größenangabe, dann das übliche favicon
    const score = (t: string) => (/apple-touch/i.test(t) ? 1000 : 0) + Number(/sizes=["'](\d+)/i.exec(t)?.[1] ?? 16);
    const hrefs = links.sort((a, b) => score(b) - score(a)).map((t) => /href=["']([^"']+)["']/i.exec(t)?.[1]).filter((h): h is string => !!h);
    for (const h of [...hrefs, "/favicon.ico"]) {
      const u = new URL(h, base);
      if (!/^https?:$/.test(u.protocol) || !(u.hostname === root || u.hostname.endsWith(`.${root}`))) continue;
      const r = await fetch(u, { signal: AbortSignal.timeout(4000) });
      const type = r.headers.get("content-type") ?? "";
      if (!r.ok || !ok(type, u.pathname)) continue;
      const buf = await r.arrayBuffer();
      if (buf.byteLength < 200 || buf.byteLength > 300_000) continue;
      return new Response(buf, { headers: { "content-type": type.startsWith("image/") ? type : "image/x-icon", "cache-control": "public, max-age=2592000, immutable", "x-content-type-options": "nosniff" } });
    }
  } catch { /* kein Icon */ }
  return null;
}

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
  const own = await fromSite(d);
  if (own) return own;
  return new Response("not found", { status: 404, headers: { "cache-control": "public, max-age=86400" } });
}
