import type { Doc } from "@/lib/types";

/**
 * Unterkategorien je Bereich („Thema“) und Zweck – damit Bereiche nach dem sortiert werden können,
 * wonach man sucht (z. B. Gesundheit → Urologie). Die KI wählt aus diesen festen Listen.
 */
export const TOPICS: Record<string, string[]> = {
  gesundheit: ["Hausarzt", "Urologie", "Endokrinologie", "HNO", "Schlafmedizin", "Kinderheilkunde", "Zahnarzt", "Augenarzt", "Hautarzt", "Orthopädie", "Psychotherapie", "Klinik & OP", "Krankenkasse", "Rezepte & Medikamente", "Pflege"],
  arbeit: ["Vertrag & Regeln", "Gehalt", "Benefits & Kantine", "Werksausweis & Zugang", "Formulare", "Betriebsrat", "Bewerbung & Zeugnis"],
  rechnungen: ["Strom & Energie", "Telefon & Internet", "Öffentlicher Verkehr", "Bußgelder & Behörden", "Gesundheit", "Einkauf & Online", "Sonstige Rechnungen"],
  versicherungen: ["Krankenversicherung", "Berufsunfähigkeit", "Haftpflicht", "Hausrat", "Kfz", "Leben & Rente", "Rechtsschutz", "Reise"],
  vertraege: ["Handy & Internet", "Strom & Gas", "Abos & Streaming", "Mitgliedschaften", "Miete", "Sonstige Verträge"],
  wohnen: ["Mietvertrag", "Nebenkosten", "Handwerker", "Umzug", "Wohnungsdokumente"],
  steuer: ["Steuerbescheid", "Steuererklärung", "Rundfunkbeitrag", "Ämter & Behörden", "Bußgeld"],
  mobilitaet: ["Fahrzeug", "Führerschein", "Tickets & ÖPNV", "Werkstatt", "Strafzettel & Bußgeld"],
  finanzen: ["Konto & Karten", "Kredit", "Depot & Sparen", "Kontoauszüge"],
  belege: ["Lebensmittel", "Drogerie", "Elektronik", "Kleidung", "Tanken", "Online-Bestellung", "Sonstige Belege"],
  angebote: ["Handwerk", "Versicherung", "Technik", "Sonstige Angebote"],
  persoenlich: ["Ausweise", "Urkunden", "Zeugnisse & Bildung", "Bescheinigungen"],
  sonstiges: ["Sonstiges"],
};
export const topicsFor = (cluster: string | null | undefined) => TOPICS[cluster ?? "sonstiges"] ?? TOPICS.sonstiges;

export type Purpose = "zu_erledigen" | "wichtig" | "info";
export const PURPOSES: { id: Purpose | "erledigt"; label: string; hint: string }[] = [
  { id: "zu_erledigen", label: "Zu erledigen", hint: "Zahlung, Frist, Formular" },
  { id: "wichtig", label: "Wichtig", hint: "Befund, Vertrag, Bescheid, Nachweis" },
  { id: "info", label: "Nur Info", hint: "Broschüre, Infoblatt, Datenschutz" },
  { id: "erledigt", label: "Erledigt", hint: "bezahlt, abgelaufen, abgehakt" },
];

/** Text für Prompts: Themenliste je Bereich */
export const TOPIC_PROMPT = Object.entries(TOPICS).map(([c, t]) => `- ${c}: ${t.join(" | ")}`).join("\n");

/** Thema prüfen: nur Werte aus der Liste des Bereichs, sonst das letzte („Sonstige …“) */
export function cleanTopic(cluster: string | null | undefined, topic: string | null | undefined) {
  const list = topicsFor(cluster);
  const hit = list.find((t) => t.toLowerCase() === (topic ?? "").trim().toLowerCase());
  return hit ?? list[list.length - 1];
}
export const cleanPurpose = (p: string | null | undefined): Purpose => (p === "zu_erledigen" || p === "wichtig" || p === "info" ? p : "wichtig");

/** Ersatz ohne KI (bis die Einordnung nachgeholt ist): grob aus Art/Titel */
export function guessPurpose(d: Pick<Doc, "doc_type" | "title">): Purpose {
  const t = `${d.doc_type ?? ""} ${d.title ?? ""}`;
  if (/mahnung|rechnung|forderung|zahlschein|zahlungsaufforderung|bescheid über|fragebogen|antrag|formular|zählerstand/i.test(t)) return "zu_erledigen";
  if (/broschüre|info(rmation|blatt)?|datenschutz|hinweis|merkblatt|willkommen|newsletter|werbung/i.test(t)) return "info";
  return "wichtig";
}
