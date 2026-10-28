import { generateText, Output } from "ai";
import { z } from "zod";
import { aiFor } from "@/lib/ai";
import { CLUSTER_IDS, CLUSTERS } from "@/lib/clusters";
import { unauthorized, userClient } from "@/lib/server";

export const maxDuration = 300;

const MAX_BYTES = 20 * 1024 * 1024;
const TYPES = ["image/jpeg", "image/png", "image/webp", "application/pdf"];

const Schema = z.object({
  cluster: z.enum(CLUSTER_IDS).describe("Überkategorie"),
  title: z.string().describe("kurzer, sprechender Titel, z. B. „Arbeitsvertrag Bosch“, „Rechnung Telekom März 2026“, „Blutbild Dr. Meier“"),
  docType: z.string().describe("Art des Dokuments, z. B. Vertrag, Rechnung, Mahnung, Kassenbon, Arztbrief, Befund, Angebot, Bescheid, Brief"),
  sender: z.string().nullable().describe("Absender bzw. Vertragspartner, Händler, Praxis"),
  docDate: z.string().nullable().describe("Datum des Dokuments als YYYY-MM-DD, sonst null"),
  summary: z.string().describe("Zusammenfassung in 2–3 Sätzen: worum geht es, was ist wichtig, was ist zu tun"),
  keyFacts: z.array(z.object({ label: z.string(), value: z.string() })).describe("alle wichtigen Fakten, die du findest – je Dokument so viele wie sinnvoll (z. B. Urlaub: 30 Tage, Kündigungsfrist: 3 Monate, Diagnose, Tarif, Kundennummer, Positionen)"),
  deadlines: z.array(z.object({ date: z.string().describe("YYYY-MM-DD"), what: z.string() })).describe("Fristen und Termine (Zahlungsziel, Kündigung, Termin, Ablauf)"),
  amounts: z.array(z.object({ label: z.string(), value: z.number(), currency: z.string() })).describe("Beträge, z. B. Gesamtbetrag, offen, monatlich"),
  tags: z.array(z.string()).describe("3–8 Schlagworte zum Wiederfinden"),
  fullText: z.string().describe("der vollständige Text des Dokuments, wortgetreu ausgelesen (bei Fotos per Texterkennung), Absätze erhalten"),
});

const SYSTEM = `Du liest Dokumente für einen persönlichen Dokumenten-Tresor aus (Deutsch).
Lies das Dokument vollständig. Gib den gesamten Text wortgetreu zurück – nichts weglassen, nichts erfinden.
Ordne es genau einer Überkategorie zu:
${CLUSTERS.map((c) => `- ${c.id}: ${c.label} (${c.hint})`).join("\n")}
Schreibe alle wichtigen Fakten heraus, die du findest – ohne festes Schema. Datumsangaben immer als YYYY-MM-DD.
Was nicht im Dokument steht, lässt du leer bzw. null. Antworte ausschließlich mit den geforderten Feldern.`;

/** Liest ein hochgeladenes Dokument aus, ordnet es ein und speichert Struktur, Key-Fakten und Volltext. */
export async function POST(req: Request) {
  const auth = await userClient(req);
  if (!auth) return unauthorized();
  const { sb } = auth;
  const body = (await req.json().catch(() => null)) as { id?: unknown } | null;
  const id = typeof body?.id === "string" ? body.id : "";
  if (!/^[0-9a-f-]{36}$/i.test(id)) return Response.json({ error: "Ungültige Anfrage." }, { status: 400 });

  // nur eigene Dokumente (RLS)
  const { data: doc } = await sb.from("documents").select("id,file_path,mime_type,size_bytes").eq("id", id).maybeSingle();
  if (!doc) return Response.json({ error: "Nicht gefunden." }, { status: 404 });
  const fail = async (msg: string) => {
    await sb.from("documents").update({ status: "error", error: msg }).eq("id", id);
    return Response.json({ error: msg }, { status: 422 });
  };
  if (!TYPES.includes(doc.mime_type)) return fail("Dieser Dateityp wird noch nicht unterstützt (Foto oder PDF).");
  if (doc.size_bytes > MAX_BYTES) return fail("Die Datei ist größer als 20 MB.");

  await sb.from("documents").update({ status: "processing", error: null }).eq("id", id);
  const { data: file, error: dlErr } = await sb.storage.from("documents").download(doc.file_path);
  if (dlErr || !file) return fail("Die Datei konnte nicht geladen werden.");
  const data = new Uint8Array(await file.arrayBuffer());
  const mediaType = doc.mime_type;

  try {
    const r = await generateText({
      ...aiFor("read"),
      system: SYSTEM,
      maxOutputTokens: 32000,
      messages: [{ role: "user", content: [{ type: "file", data, mediaType }, { type: "text", text: "Lies dieses Dokument vollständig aus und strukturiere es." }] }],
      output: Output.object({ schema: Schema, name: "document" }),
    });
    const o = r.output;
    if (!o) return fail("Das Dokument konnte nicht gelesen werden.");
    const isDate = (s?: string | null) => (s && /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null);
    await sb.from("documents").update({
      status: "ready",
      error: null,
      cluster: o.cluster,
      title: o.title.slice(0, 200),
      doc_type: o.docType.slice(0, 80),
      sender: o.sender?.slice(0, 200) ?? null,
      doc_date: isDate(o.docDate),
      summary: o.summary.slice(0, 2000),
      key_facts: o.keyFacts.slice(0, 80),
      deadlines: o.deadlines.filter((d) => isDate(d.date)).slice(0, 30),
      amounts: o.amounts.slice(0, 30),
      tags: o.tags.slice(0, 12).map((t) => t.slice(0, 40)),
      full_text: o.fullText,
    }).eq("id", id);
    return Response.json({ ok: true });
  } catch (e) {
    console.error("process", (e as Error).message);
    return fail("Das Auslesen hat nicht geklappt. Bitte später erneut versuchen.");
  }
}
