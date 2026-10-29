/**
 * Tags je Dokument aus einem festen Katalog – in Typen mit eigener Farbe.
 * Zum Suchen, Filtern, Exportieren und später zum gezielten Freigeben („Zugriff auf Gesundheitsdaten“).
 * Sichtbar nur im Dokument und im Filter, nicht in Listen.
 */
export type LabelGroup = { id: string; label: string; color: string; tags: string[] };

export const LABEL_GROUPS: LabelGroup[] = [
  { id: "relevant", label: "Relevant für", color: "#2563eb", tags: ["Steuererklärung", "Arztbesuch", "Krankenkasse", "Versicherungsfall", "Bewerbung", "Wohnungssuche", "Kredit & Bank", "Rente & Vorsorge", "Kindergeld & Elterngeld", "Anwalt & Gericht", "Aufenthalt & Visum", "Arbeitgeber", "Vermieter", "Reise"] },
  { id: "behoerde", label: "Behörde", color: "#7c3aed", tags: ["Finanzamt", "Bürgeramt", "Ausländerbehörde", "Agentur für Arbeit", "Jobcenter", "Familienkasse", "Rentenversicherung", "Zulassungsstelle", "Bußgeldstelle", "Gericht", "Beitragsservice", "Gesundheitsamt", "Standesamt"] },
  { id: "vorgang", label: "Vorgang", color: "#ea580c", tags: ["Rechnung", "Mahnung", "Nachzahlung", "Erstattung", "Frist", "Kündigung", "Widerspruch möglich", "Preiserhöhung", "Vertragsänderung", "Bestätigung", "Werbung"] },
  { id: "datenschutz", label: "Datenschutz", color: "#dc2626", tags: ["Personenbezogen", "Gesundheitsdaten", "Finanzdaten", "Ausweisdaten", "Steuer-ID & SV-Nummer", "Daten von Kindern", "Unterschrift"] },
  { id: "aufbewahren", label: "Aufbewahren", color: "#16a34a", tags: ["10 Jahre (Steuer)", "Garantie", "Dauerhaft", "Kann weg"] },
];

const BY_NAME = new Map(LABEL_GROUPS.flatMap((g) => g.tags.map((t) => [t.toLowerCase(), { tag: t, group: g }] as const)));
export const groupOf = (tag: string) => BY_NAME.get(tag.toLowerCase())?.group;

/** Nur Tags aus dem Katalog, ohne Doppelte, in Katalog-Reihenfolge */
export function cleanLabels(list: unknown): string[] {
  if (!Array.isArray(list)) return [];
  const got = new Set(list.map((t) => BY_NAME.get(String(t).trim().toLowerCase())?.tag).filter((t): t is string => !!t));
  return LABEL_GROUPS.flatMap((g) => g.tags.filter((t) => got.has(t)));
}

/** Text für Prompts */
export const LABEL_PROMPT = `Tags (labels) – wähle 2–8 passende aus diesem Katalog, exakt so geschrieben:
${LABEL_GROUPS.map((g) => `- ${g.label}: ${g.tags.join(" | ")}`).join("\n")}
Regeln: Datenschutz-Tags immer setzen, wenn das Dokument solche Daten enthält (Name+Adresse/Geburtsdatum = Personenbezogen; Diagnosen/Befunde = Gesundheitsdaten; IBAN/Gehalt/Kontostand = Finanzdaten; Ausweis-/Passnummer = Ausweisdaten).
Behörde nur, wenn Absender oder Empfänger diese Behörde ist. „Relevant für“: wofür man das Dokument später braucht. „Kann weg“ nur für reine Werbung/Infos ohne Wert.`;
