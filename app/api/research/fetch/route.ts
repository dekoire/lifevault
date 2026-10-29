import { unauthorized, userClient } from "@/lib/server";

export const maxDuration = 60;
const MAX = 10 * 1024 * 1024;

/** Nur öffentliche https-Adressen (keine IPs, kein localhost) */
function safeUrl(raw: string) {
  try {
    const u = new URL(raw);
    if (u.protocol !== "https:" || u.username || u.password || u.port) return undefined;
    const h = u.hostname.toLowerCase();
    if (h === "localhost" || h.endsWith(".local") || h.endsWith(".internal") || /^[\d.]+$/.test(h) || h.includes(":") || !h.includes(".")) return undefined;
    return u;
  } catch {
    return undefined;
  }
}

/** Gefundene PDF für den Nutzer herunterladen (max. 10 MB), damit der Browser sie im Tresor ablegen kann */
export async function POST(req: Request) {
  const auth = await userClient(req);
  if (!auth) return unauthorized();
  const body = (await req.json().catch(() => null)) as { url?: string } | null;
  const url = safeUrl(body?.url ?? "");
  if (!url) return Response.json({ error: "Ungültige Adresse." }, { status: 400 });
  try {
    const res = await fetch(url, { redirect: "follow", signal: AbortSignal.timeout(20000), headers: { "User-Agent": "Lifevault/1.0 (Dokumenten-Tresor)" } });
    if (!res.ok || !safeUrl(res.url)) return Response.json({ error: "Die Datei ließ sich nicht laden." }, { status: 502 });
    if (Number(res.headers.get("content-length") ?? 0) > MAX) return Response.json({ error: "Die Datei ist zu groß." }, { status: 413 });
    const buf = new Uint8Array(await res.arrayBuffer());
    const isPdf = buf.length > 4 && buf[0] === 0x25 && buf[1] === 0x50 && buf[2] === 0x44 && buf[3] === 0x46; // %PDF
    if (!isPdf) return Response.json({ error: "Unter der Adresse liegt keine PDF." }, { status: 415 });
    if (buf.length > MAX) return Response.json({ error: "Die Datei ist zu groß." }, { status: 413 });
    return new Response(buf, { headers: { "Content-Type": "application/pdf", "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ error: "Die Datei ließ sich nicht laden." }, { status: 502 });
  }
}
