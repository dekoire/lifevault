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
  title: z.string().describe("kurzer, sprechender Titel, z. B. „Arbeitsvertrag Bosch“, „Gehaltsabrechnung März 2026“, „Rechnung Telekom Oktober 2026“"),
  docType: z.string().describe("Art, z. B. Vertrag, Gehaltsabrechnung, Rechnung, Mahnung, Kassenbon, Arztbrief, Befund, Angebot, Bescheid, Police"),
  sender: z.string().nullable().describe("Absender bzw. Vertragspartner, Arbeitgeber, Händler, Praxis (Firmenname ohne Rechtsform-Zusätze, wenn eindeutig)"),
  senderDomain: z.string().nullable().describe("Webadresse des Absenders ohne https, z. B. vodafone.de, o2online.de, telekom.de – nur wenn sicher bekannt, sonst null"),
  docDate: z.string().nullable().describe("Datum des Dokuments als YYYY-MM-DD, sonst null"),
  summary: z.string().describe("Zusammenfassung in 2–3 Sätzen: worum geht es, was ist wichtig, was ist zu tun"),
  keyFacts: z.array(z.object({
    group: z.string().describe("Gruppe, z. B. „Persönliche Daten“, „Bezüge“, „Abzüge“, „Auszahlung“, „Steuer & Sozialversicherung“, „Gültigkeit & Zeitraum“, „Vertragsdaten“, „Leistungen“, „Kosten“, „Medizinisches“, „Kontakt“"),
    label: z.string(),
    value: z.string(),
  })).describe("alle wichtigen Fakten, die du findest, je in eine sinnvolle Gruppe sortiert – bei Gehaltsabrechnungen jede Position einzeln (Brutto, Steuern, SV-Beiträge, Netto, Auszahlung, Steuerklasse, Zeitraum …)"),
  deadlines: z.array(z.object({ date: z.string().describe("YYYY-MM-DD"), what: z.string() })).describe("Fristen und Termine (Zahlungsziel, Kündigung, Termin, Ablauf, gültig bis)"),
  amounts: z.array(z.object({ label: z.string(), value: z.number(), currency: z.string() })).describe("wichtigste Beträge, z. B. Gesamtbetrag, offen, monatlich, Netto"),
  tags: z.array(z.string()).describe("3–8 Schlagworte zum Wiederfinden"),
  fullText: z.string().describe("der vollständige Text des Dokuments, wortgetreu ausgelesen (bei Fotos per Texterkennung), Absätze erhalten"),
});
type Extracted = z.infer<typeof Schema>;

const SYSTEM = `Du liest Dokumente für einen persönlichen Dokumenten-Tresor aus (Deutsch).
Lies das Dokument vollständig. Gib den gesamten Text wortgetreu zurück – nichts weglassen, nichts erfinden.
Ordne es genau einer Überkategorie zu:
${CLUSTERS.map((c) => `- ${c.id}: ${c.label} (${c.hint})`).join("\n")}
Gehaltsabrechnungen, Arbeitsverträge, Zeugnisse → arbeit. Arztbriefe, Befunde, Rezepte, Krankenkasse → gesundheit.
Schreibe alle wichtigen Fakten heraus und sortiere sie in Gruppen (personenbezogene Daten getrennt von Beträgen und von Metadaten wie Zeitraum/Gültigkeit).
Datumsangaben immer als YYYY-MM-DD. Was nicht im Dokument steht, lässt du leer bzw. null.`;

const Archive = z.object({
  newIsOutdated: z.boolean().describe("true, wenn das NEUE Dokument selbst schon überholt ist (z. B. alter Vertrag, früherer Arbeitgeber, abgelaufene Police)"),
  newReason: z.string().nullable(),
  outdated: z.array(z.object({ id: z.string(), reason: z.string() })).describe("bestehende Dokumente, die durch das neue überholt sind"),
});

/** Prüft, ob das neue Dokument ältere ersetzt (Anbieterwechsel, neuer Arbeitgeber, neue Police) oder selbst veraltet ist */
async function archiveCheck(sb: NonNullable<Awaited<ReturnType<typeof userClient>>>["sb"], id: string, o: Extracted) {
  const { data: others } = await sb.from("documents").select("id,title,doc_type,sender,doc_date,received_at,cluster,archived").eq("status", "ready").eq("cluster", o.cluster).neq("id", id).order("received_at", { ascending: false }).limit(40);
  if (!others?.length || !["vertraege", "arbeit", "versicherungen", "wohnen", "mobilitaet", "finanzen"].includes(o.cluster)) return;
  const list = others.map((d) => `- ${d.id} | ${d.title} | ${d.doc_type ?? ""} | ${d.sender ?? ""} | ${d.doc_date ?? d.received_at.slice(0, 10)}${d.archived ? " | bereits archiviert" : ""}`).join("\n");
  const r = await generateText({
    ...aiFor("classify"),
    system: `Du hältst einen Dokumenten-Tresor aktuell. Heute ist ${new Date().toISOString().slice(0, 10)}. Archiviert wird, was nicht mehr gilt: z. B. Mobilfunkvertrag O2, wenn ein neuerer Vodafone-Mobilfunkvertrag da ist; Arbeitsvertrag beim früheren Arbeitgeber, wenn ein neuerer Arbeitsvertrag/Gehaltsabrechnung eines anderen Arbeitgebers da ist; abgelaufene Policen. Gleicher Anbieter mit neuer Rechnung ersetzt nicht den Vertrag. Rechnungen und Belege werden nie archiviert, nur weil sie alt sind. Sei vorsichtig: im Zweifel nichts archivieren.`,
    prompt: `Neues Dokument: ${o.title} | ${o.docType} | ${o.sender ?? ""} | ${o.docDate ?? ""}\nZusammenfassung: ${o.summary}\n\nBestehende Dokumente im selben Bereich:\n${list}`,
    output: Output.object({ schema: Archive, name: "archive" }),
  }).catch(() => undefined);
  const a = r?.output;
  if (!a) return;
  if (a.newIsOutdated) await sb.from("documents").update({ archived: true, archived_reason: a.newReason?.slice(0, 300) ?? "veraltet" }).eq("id", id);
  const ids = new Set(others.filter((d) => !d.archived).map((d) => d.id));
  for (const x of a.outdated.filter((x) => ids.has(x.id)).slice(0, 10)) await sb.from("documents").update({ archived: true, archived_reason: x.reason.slice(0, 300) }).eq("id", x.id);
}

/**
 * Liest ein Dokument aus, ordnet es ein und speichert Struktur, Key-Fakten und Volltext.
 * Verschlüsselte Dokumente: Der Browser schickt die entschlüsselte Datei mit (data, Base64) – das Ergebnis geht nur zurück
 * an den Browser (inline), der es verschlüsselt speichert. Auf dem Server bleibt davon nichts liegen.
 */
export async function POST(req: Request) {
  const auth = await userClient(req);
  if (!auth) return unauthorized();
  const { sb } = auth;
  const body = (await req.json().catch(() => null)) as { id?: unknown; data?: unknown; mediaType?: unknown } | null;
  const id = typeof body?.id === "string" ? body.id : "";
  if (!/^[0-9a-f-]{36}$/i.test(id)) return Response.json({ error: "Ungültige Anfrage." }, { status: 400 });
  const inline = typeof body?.data === "string";

  const { data: doc } = await sb.from("documents").select("id,file_path,mime_type,size_bytes").eq("id", id).maybeSingle();
  if (!doc) return Response.json({ error: "Nicht gefunden." }, { status: 404 });
  const fail = async (msg: string) => {
    await sb.from("documents").update({ status: "error", error: msg }).eq("id", id);
    return Response.json({ error: msg }, { status: 422 });
  };
  const mediaType = inline && typeof body?.mediaType === "string" ? body.mediaType : doc.mime_type;
  if (!TYPES.includes(mediaType)) return fail("Dieser Dateityp wird noch nicht unterstützt (Foto oder PDF).");

  let data: Uint8Array;
  if (inline) {
    data = Uint8Array.from(Buffer.from(body!.data as string, "base64"));
  } else {
    if (doc.size_bytes > MAX_BYTES) return fail("Die Datei ist größer als 20 MB.");
    await sb.from("documents").update({ status: "processing", error: null }).eq("id", id);
    const { data: file, error: dlErr } = await sb.storage.from("documents").download(doc.file_path);
    if (dlErr || !file) return fail("Die Datei konnte nicht geladen werden.");
    data = new Uint8Array(await file.arrayBuffer());
  }

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
    const domain = o.senderDomain?.toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0] ?? null;
    const meta = {
      cluster: o.cluster,
      title: o.title.slice(0, 200),
      doc_type: o.docType.slice(0, 80),
      sender: o.sender?.slice(0, 200) ?? null,
      sender_domain: domain && /^[a-z0-9.-]+\.[a-z]{2,}$/.test(domain) ? domain : null,
      doc_date: isDate(o.docDate),
      tags: o.tags.slice(0, 12).map((t) => t.slice(0, 40)),
    };
    const content = {
      summary: o.summary.slice(0, 2000),
      key_facts: o.keyFacts.slice(0, 120),
      deadlines: o.deadlines.filter((d) => isDate(d.date)).slice(0, 30),
      amounts: o.amounts.slice(0, 30),
      full_text: o.fullText,
    };
    if (inline) {
      // nur Metadaten speichern, Inhalt verschlüsselt der Browser
      await sb.from("documents").update({ ...meta, status: "ready", error: null }).eq("id", id);
      return Response.json({ ok: true, meta, content });
    }
    await sb.from("documents").update({ ...meta, ...content, status: "ready", error: null }).eq("id", id);
    await archiveCheck(sb, id, o).catch((e) => console.error("archive", (e as Error).message));
    return Response.json({ ok: true });
  } catch (e) {
    console.error("process", (e as Error).message);
    return fail("Das Auslesen hat nicht geklappt. Bitte später erneut versuchen.");
  }
}
