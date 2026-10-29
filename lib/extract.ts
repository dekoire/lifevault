import { generateText, Output, type ModelMessage } from "ai";
import { PDFDocument } from "pdf-lib";
import { extractText, getDocumentProxy } from "unpdf";
import { z } from "zod";
import { aiFor } from "@/lib/ai";
import { CLUSTER_IDS, CLUSTERS } from "@/lib/clusters";
import { cleanLabels, LABEL_PROMPT } from "@/lib/labels";
import { cleanPurpose, cleanTopic, TOPIC_PROMPT } from "@/lib/topics";
import { OFFICE_TYPES, officeAsText, readOffice } from "@/lib/office";

export const FILE_TYPES = ["image/jpeg", "image/png", "image/webp", "application/pdf"];
export const TEXT_TYPES = ["text/plain", "text/markdown"];

const Schema = z.object({
  cluster: z.enum(CLUSTER_IDS).describe("Überkategorie"),
  title: z.string().describe("kurzer, sprechender Titel, z. B. „Arbeitsvertrag Bosch“, „Gehaltsabrechnung März 2026“, „Rechnung Telekom Oktober 2026“"),
  topic: z.string().describe("Thema/Unterkategorie – genau ein Wert aus der Liste des gewählten Bereichs (siehe Systemtext)"),
  labels: z.array(z.string()).describe("2–8 Tags exakt aus dem Tag-Katalog im Systemtext"),
  purpose: z.enum(["zu_erledigen", "wichtig", "info"]).describe("zu_erledigen: Zahlung, Frist, Formular ausfüllen, Antwort nötig; wichtig: aufbewahren (Befund, Vertrag, Bescheid, Nachweis, Ausweis, Abrechnung); info: reine Information (Broschüre, Infoblatt, Datenschutzhinweis, Werbung)"),
  docType: z.string().describe("Art, z. B. Vertrag, Gehaltsabrechnung, Rechnung, Mahnung, Kassenbon, Arztbrief, Befund, Angebot, Bescheid, Police"),
  sender: z.string().nullable().describe("Absender bzw. Vertragspartner, Arbeitgeber, Händler, Praxis (Firmenname ohne Rechtsform-Zusätze, wenn eindeutig)"),
  senderDomain: z.string().nullable().describe("Hauptwebadresse des Absenders ohne https, z. B. vodafone.de, o2online.de, telekom.de, huk.de, mercedes-benz.de, dm.de – bei bekannten Firmen immer angeben (auch wenn sie nicht im Dokument steht), bei unbekannten nur, wenn sie im Dokument steht, sonst null"),
  docDate: z.string().nullable().describe("Datum des Dokuments als YYYY-MM-DD, sonst null"),
  summary: z.string().describe("Zusammenfassung in 2–3 Sätzen: worum geht es, was ist wichtig, was ist zu tun – OHNE Namen von Privatpersonen, Adressen, Geburtsdaten, Kontonummern oder Kennnummern"),
  keyFacts: z.array(z.object({
    group: z.string().describe("Gruppe, z. B. „Persönliche Daten“, „Bezüge“, „Abzüge“, „Auszahlung“, „Steuer & Sozialversicherung“, „Gültigkeit & Zeitraum“, „Vertragsdaten“, „Leistungen“, „Kosten“, „Medizinisches“, „Kontakt“"),
    label: z.string(),
    value: z.string(),
    personal: z.boolean().describe("true, wenn der Wert eine Person identifiziert: Name einer Privatperson, Adresse, Geburtsdatum, IBAN/Kontonummer, Steuer-ID, SV-Nummer, Personal-/Kunden-/Versichertennummer, Telefon, E-Mail"),
  })).describe("alle wichtigen Fakten, die du findest, je in eine sinnvolle Gruppe sortiert – bei Gehaltsabrechnungen jede Position einzeln (Brutto, Steuern, SV-Beiträge, Netto, Auszahlung, Steuerklasse, Zeitraum …)"),
  deadlines: z.array(z.object({ date: z.string().describe("YYYY-MM-DD"), what: z.string() })).describe("Fristen und Termine (Zahlungsziel, Kündigung, Termin, Ablauf, gültig bis)"),
  amounts: z.array(z.object({ label: z.string(), value: z.number(), currency: z.string() })).describe("wichtigste Beträge, z. B. Gesamtbetrag, offen, monatlich, Netto"),
  tags: z.array(z.string()).describe("3–8 Schlagworte zum Wiederfinden"),
  fullText: z.string().describe("der vollständige Text des Dokuments, wortgetreu ausgelesen (bei Fotos per Texterkennung), Absätze erhalten"),
});
export type Extracted = z.infer<typeof Schema>;

const SYSTEM = `Du liest Dokumente für einen persönlichen Dokumenten-Tresor aus (Deutsch).
Lies das Dokument vollständig. Gib den gesamten Text wortgetreu zurück – nichts weglassen, nichts erfinden.
Ordne es genau einer Überkategorie zu:
${CLUSTERS.map((c) => `- ${c.id}: ${c.label} (${c.hint})`).join("\n")}
Gehaltsabrechnungen, Arbeitsverträge, Zeugnisse → arbeit. Arztbriefe, Befunde, Rezepte, Krankenkasse → gesundheit.
Alle Kennungen gegenüber dem Absender (Kundennummer, Vertragsnummer, Versicherungsschein-/Policennummer, Rufnummer, Zählernummer, Mitgliedsnummer, Personalnummer, Benutzername/Login, Rechnungsnummer, Aktenzeichen, Kassenzeichen, Geschäftszeichen, Beleg-/Vorgangs-/Bestell-/Buchungsnummer, Ticket-/Schadennummer, IBAN, Kfz-Kennzeichen) einzeln in die Gruppe „Kennungen & Nummern“ – mit klarem Label.
Schreibe alle wichtigen Fakten heraus und sortiere sie in Gruppen (personenbezogene Daten getrennt von Beträgen und von Metadaten wie Zeitraum/Gültigkeit). Markiere personenbezogene Fakten mit personal = true.
Datumsangaben immer als YYYY-MM-DD. Was nicht im Dokument steht, lässt du leer bzw. null.
Thema (topic) – wähle genau einen Wert aus der Liste des Bereichs (bei Gesundheit das Fachgebiet der Praxis/Klinik, Krankenkasse für Kassenpost):
${TOPIC_PROMPT}
${LABEL_PROMPT}`;

/** Textebene einer PDF lesen (ohne KI); leer bei gescannten PDFs ohne Text */
export async function pdfText(data: Uint8Array): Promise<string> {
  try {
    const pdf = await getDocumentProxy(new Uint8Array(data));
    const { text } = await extractText(pdf, { mergePages: false });
    return (text as string[]).map((t, i) => `--- Seite ${i + 1} ---\n${t.trim()}`).join("\n\n").trim();
  } catch {
    return "";
  }
}

// ohne Volltext: die KI liefert nur die Struktur, den Text nehmen wir direkt aus der PDF
const MetaSchema = Schema.omit({ fullText: true });

/** Dokument (Datei oder Text) mit der KI auslesen */
export async function extract(input: { data: Uint8Array; mediaType: string }): Promise<Extracted | undefined> {
  // PDFs mit Textebene: Volltext direkt lesen – die KI muss ihn nicht abschreiben (lange Dokumente sprengten sonst das Ausgabelimit)
  if (input.mediaType === "application/pdf") {
    const raw = await pdfText(input.data);
    const letters = raw.replace(/--- Seite \d+ ---/g, "").replace(/\s+/g, "").length;
    if (letters > 400) {
      const pages = await PDFDocument.load(input.data, { ignoreEncryption: true }).then((p) => p.getPageCount()).catch(() => 0);
      // kurze PDFs sieht die KI selbst (Tabellen, Layout); längere nur als Text – Seitenbilder kosten ein Vielfaches
      const content: ModelMessage["content"] = pages > 0 && pages <= 6
        ? [{ type: "file", data: input.data, mediaType: "application/pdf" }, { type: "text", text: "Lies dieses Dokument aus und strukturiere es. Den Volltext brauchst du nicht zurückzugeben." }]
        : [{ type: "text", text: `Lies dieses Dokument aus und strukturiere es. Den Volltext brauchst du nicht zurückzugeben.\n\n---\n${raw.slice(0, 120_000)}` }];
      const r = await generateText({
        ...aiFor("read"),
        system: SYSTEM.replace("Gib den gesamten Text wortgetreu zurück – nichts weglassen, nichts erfinden.", "Nichts erfinden."),
        maxOutputTokens: 16000,
        messages: [{ role: "user", content } as ModelMessage],
        output: Output.object({ schema: MetaSchema, name: "document" }),
      });
      return r.output ? { ...r.output, fullText: raw } : undefined;
    }
  }
  // PowerPoint, Word, Excel: Text herauslesen und als Text auswerten
  const office = OFFICE_TYPES[input.mediaType];
  if (office) input = { data: new TextEncoder().encode(officeAsText(readOffice(input.data, office))), mediaType: "text/plain" };
  const text = TEXT_TYPES.includes(input.mediaType);
  const content: ModelMessage["content"] = text
    ? [{ type: "text", text: `Lies dieses Dokument vollständig aus und strukturiere es.\n\n---\n${new TextDecoder().decode(input.data).slice(0, 200_000)}` }]
    : [{ type: "file", data: input.data, mediaType: input.mediaType }, { type: "text", text: "Lies dieses Dokument vollständig aus und strukturiere es." }];
  const r = await generateText({
    ...aiFor("read"),
    system: SYSTEM,
    maxOutputTokens: 32000,
    messages: [{ role: "user", content } as ModelMessage],
    output: Output.object({ schema: Schema, name: "document" }),
  });
  return r.output ?? undefined;
}

const isDate = (s?: string | null) => (s && /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null);

/** Ergebnis in Spalten der Tabelle documents übersetzen (gekürzt, geprüft) */
export function toColumns(o: Extracted) {
  const domain = o.senderDomain?.toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0] ?? null;
  const meta = {
    cluster: o.cluster,
    title: o.title.slice(0, 200),
    doc_type: o.docType.slice(0, 80),
    topic: cleanTopic(o.cluster, o.topic),
    purpose: cleanPurpose(o.purpose),
    labels: cleanLabels(o.labels),
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
  return { meta, content };
}

const Starts = z.object({
  starts: z.array(z.object({
    page: z.number().int().describe("Seitennummer im Ausschnitt (ab 1), auf der ein NEUES eigenständiges Dokument beginnt"),
    what: z.string().describe("kurz: was für ein Dokument, z. B. „Arztbrief Dr. Weber 03.02.2025“"),
  })).describe("leer, wenn im Ausschnitt kein neues Dokument beginnt"),
});

const CHUNK = 20;

/** In einem Ausschnitt die Seiten finden, auf denen ein neues Dokument beginnt (erste Seite ggf. nur Kontext) */
async function startsIn(data: Uint8Array, from: number, to: number, contextPage: boolean) {
  const bytes = from === 1 && to === Number.MAX_SAFE_INTEGER ? data : await slicePdf(data, from, to);
  const r = await generateText({
    ...aiFor("read"),
    system: `Du prüfst einen Ausschnitt aus einer PDF eines Dokumenten-Tresors. Oft sind viele Briefe, Befunde oder Berichte hintereinander eingescannt (z. B. eine Krankenakte).
Finde jede Seite, auf der ein NEUES eigenständiges Dokument beginnt: neuer Briefkopf, anderes Datum, anderer Absender oder andere Praxis/Klinik, neue Anrede, neuer Berichtstitel.
Folgeseiten desselben Briefs, Anlagen zu einem Vertrag und Rechnungen mit Folgeseiten gehören NICHT zu einem neuen Dokument.${contextPage ? "\nDie erste Seite des Ausschnitts ist nur Kontext (Ende des vorherigen Teils) – gib sie nicht an, prüfe ab Seite 2." : ""}`,
    messages: [{ role: "user", content: [{ type: "file", data: bytes, mediaType: "application/pdf" }, { type: "text", text: "Auf welchen Seiten beginnt ein neues eigenständiges Dokument?" }] }],
    output: Output.object({ schema: Starts, name: "starts" }),
  });
  const offset = from - 1;
  return (r.output?.starts ?? [])
    .filter((x) => x.page >= (contextPage ? 2 : 1) && x.page <= to - from + 1)
    .map((x) => ({ page: offset + x.page, what: x.what }));
}

/**
 * Enthält eine PDF mehrere eigenständige Dokumente (z. B. eine Krankenakte mit vielen Arztbriefen)?
 * Lange PDFs werden in Abschnitten zu 20 Seiten geprüft (je mit der letzten Seite davor als Kontext).
 * Gibt die Seitenbereiche zurück, wenn es mindestens zwei sind – sonst undefined.
 */
export async function splitPlan(data: Uint8Array, force = false): Promise<{ fromPage: number; toPage: number; what: string }[] | undefined> {
  let pages = 0;
  try { pages = (await PDFDocument.load(data, { ignoreEncryption: true })).getPageCount(); } catch { return undefined; }
  if (pages < 2 || pages > 400) return undefined;
  // PDFs mit Textebene (Mail-Anhänge, Downloads) sind fast immer ein einziges Dokument – nur Scans prüfen (spart einen ganzen KI-Durchlauf)
  const letters = (await pdfText(data)).replace(/--- Seite \d+ ---/g, "").replace(/\s+/g, "").length;
  if (!force && letters > pages * 300) return undefined;
  const chunks: { from: number; to: number; ctx: boolean }[] = [];
  for (let a = 1; a <= pages; a += CHUNK) chunks.push({ from: a === 1 ? 1 : a - 1, to: Math.min(pages, a + CHUNK - 1), ctx: a > 1 });
  const found: { page: number; what: string }[] = [];
  // bis zu 4 Abschnitte gleichzeitig
  for (let i = 0; i < chunks.length; i += 4) {
    const res = await Promise.all(chunks.slice(i, i + 4).map((c) => startsIn(data, c.from, c.to, c.ctx).catch((e) => { console.error("split chunk", (e as Error).message); return null; })));
    if (res.some((x) => x === null)) return undefined; // lieber nicht trennen als falsch trennen
    for (const r of res) found.push(...r!);
  }
  const starts = [...new Map([{ page: 1, what: found.find((f) => f.page === 1)?.what ?? "Teil 1" }, ...found].map((f) => [f.page, f])).values()].sort((a, b) => a.page - b.page);
  if (starts.length < 2 || starts.length > 80) return undefined;
  return starts.map((st, i) => ({ fromPage: st.page, toPage: (starts[i + 1]?.page ?? pages + 1) - 1, what: st.what }));
}

/** Seiten from..to (ab 1) als eigene PDF */
export async function slicePdf(data: Uint8Array, from: number, to: number) {
  const src = await PDFDocument.load(data, { ignoreEncryption: true });
  const out = await PDFDocument.create();
  const pages = await out.copyPages(src, Array.from({ length: to - from + 1 }, (_, i) => from - 1 + i));
  pages.forEach((p) => out.addPage(p));
  return out.save();
}
