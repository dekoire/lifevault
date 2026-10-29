import { generateText, Output, type ModelMessage } from "ai";
import { PDFDocument } from "pdf-lib";
import { z } from "zod";
import { aiFor } from "@/lib/ai";
import { CLUSTER_IDS, CLUSTERS } from "@/lib/clusters";

export const FILE_TYPES = ["image/jpeg", "image/png", "image/webp", "application/pdf"];
export const TEXT_TYPES = ["text/plain", "text/markdown"];

const Schema = z.object({
  cluster: z.enum(CLUSTER_IDS).describe("Überkategorie"),
  title: z.string().describe("kurzer, sprechender Titel, z. B. „Arbeitsvertrag Bosch“, „Gehaltsabrechnung März 2026“, „Rechnung Telekom Oktober 2026“"),
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
Alle Kennungen gegenüber dem Absender (Kundennummer, Vertragsnummer, Versicherungsschein-/Policennummer, Rufnummer, Zählernummer, Mitgliedsnummer, Personalnummer, Benutzername/Login, Rechnungsnummer, Aktenzeichen, IBAN, Kfz-Kennzeichen) einzeln in die Gruppe „Kennungen & Nummern“ – mit klarem Label.
Schreibe alle wichtigen Fakten heraus und sortiere sie in Gruppen (personenbezogene Daten getrennt von Beträgen und von Metadaten wie Zeitraum/Gültigkeit). Markiere personenbezogene Fakten mit personal = true.
Datumsangaben immer als YYYY-MM-DD. Was nicht im Dokument steht, lässt du leer bzw. null.`;

/** Dokument (Datei oder Text) mit der KI auslesen */
export async function extract(input: { data: Uint8Array; mediaType: string }): Promise<Extracted | undefined> {
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

const Parts = z.object({
  parts: z.array(z.object({
    fromPage: z.number().int().describe("erste Seite (ab 1)"),
    toPage: z.number().int().describe("letzte Seite"),
    what: z.string().describe("kurz: was für ein Dokument, z. B. „Arztbrief Dr. Weber 03.02.2025“"),
  })).describe("eigenständige Dokumente in Seitenreihenfolge, lückenlos; nur 1 Eintrag, wenn alles zusammengehört"),
});

/**
 * Enthält eine PDF mehrere eigenständige Dokumente (z. B. mehrere Arztbriefe mit verschiedenen Daten)?
 * Gibt die Seitenbereiche zurück, wenn es mindestens zwei sind – sonst undefined.
 */
export async function splitPlan(data: Uint8Array): Promise<{ fromPage: number; toPage: number; what: string }[] | undefined> {
  let pages = 0;
  try { pages = (await PDFDocument.load(data, { ignoreEncryption: true })).getPageCount(); } catch { return undefined; }
  if (pages < 2 || pages > 150) return undefined;
  const r = await generateText({
    ...aiFor("classify"),
    system: `Du prüfst eine PDF mit ${pages} Seiten aus einem Dokumenten-Tresor. Oft sind mehrere Briefe zusammen eingescannt.
Trenne nur, wenn eindeutig verschiedene Dokumente vorliegen: anderes Datum, anderer Absender, neuer Briefkopf, neue Anrede. Mehrseitige Briefe, Verträge mit Anlagen und Rechnungen mit Folgeseiten bleiben zusammen.`,
    messages: [{ role: "user", content: [{ type: "file", data, mediaType: "application/pdf" }, { type: "text", text: "Welche Seiten gehören jeweils zu einem eigenständigen Dokument?" }] }],
    output: Output.object({ schema: Parts, name: "parts" }),
  }).catch(() => undefined);
  const parts = r?.output?.parts;
  if (!parts || parts.length < 2) return undefined;
  // nur übernehmen, wenn die Bereiche lückenlos 1..pages abdecken
  let next = 1;
  for (const p of parts) {
    if (p.fromPage !== next || p.toPage < p.fromPage) return undefined;
    next = p.toPage + 1;
  }
  return next === pages + 1 ? parts : undefined;
}

/** Seiten from..to (ab 1) als eigene PDF */
export async function slicePdf(data: Uint8Array, from: number, to: number) {
  const src = await PDFDocument.load(data, { ignoreEncryption: true });
  const out = await PDFDocument.create();
  const pages = await out.copyPages(src, Array.from({ length: to - from + 1 }, (_, i) => from - 1 + i));
  pages.forEach((p) => out.addPage(p));
  return out.save();
}
