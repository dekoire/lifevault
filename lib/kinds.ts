import type { Doc } from "@/lib/types";

/**
 * Dokumentart grob zusammengefasst („Mitgliedsvertrag“, „Arbeitsvertrag“ → Vertrag; „AGB“, „Widerrufsbelehrung“ → Bedingungen & Infos),
 * damit man in Listen sofort sieht, was etwas ist, und danach filtern kann. Reihenfolge zählt: das Erste, was passt.
 */
export const KINDS = [
  { id: "mahnung", label: "Mahnung & Forderung", short: "Mahnung", color: "#dc2626", re: /mahnung|zahlungsaufforderung|vollstreck|zahlungsverzug|verwarnung|bußgeld|anhörung|inkasso|zahlschein/ },
  { id: "gehalt", label: "Gehalt & Lohn", short: "Gehalt", color: "#0f766e", re: /gehalt|entgelt|arbeitslohn|lohnabrechnung|lohnsteuerbescheinigung|lohnzettel|bezüge|vergütungsabrechnung|verdienstabrechnung|sozialversicherungsnachweis|dienstzeit/ },
  { id: "medizin", label: "Arztbrief & Befund", short: "Medizinisch", color: "#0891b2", re: /arzt|befund|kranken(akte|haus)|entlass|operation|labor|überweisungsschein|rezept|attest|krankmeldung|arbeitsunfähig/ },
  { id: "ausweis", label: "Ausweis & Karte", short: "Ausweis/Karte", color: "#7c3aed", re: /ausweis|reisepass|führerschein|\bkarte\b|karte\b|chipkarte|gesundheitskarte|debitkarte|kreditkarte/ },
  { id: "angebot", label: "Angebot", short: "Angebot", color: "#0d9488", re: /angebot|kostenvoranschlag|offerte/ },
  { id: "bescheid", label: "Bescheid", short: "Bescheid", color: "#ea580c", re: /bescheid|bescheinigung|meldebescheinigung|festsetzung/ },
  { id: "formular", label: "Formular", short: "Formular", color: "#a16207", re: /formular|fragebogen|verzicht|verpflichtungserklärung|zählerstand|personalunterlage|onboarding/ },
  { id: "bedingungen", label: "Bedingungen & Infos", short: "AGB/Info", color: "#64748b", re: /agb|geschäftsbedingung|bedingungen|belehrung|widerruf|datenschutz|merkblatt|information|hinweis|preisliste|preis- und leistung|leistungsbeschreibung|leistungsverzeichnis|erstinformation|ipid|vorvertraglich|broschüre|hausordnung|arbeitsordnung|richtlinie|stichwortverzeichnis|deckblatt|grundriss|mitteilung/ },
  { id: "rechnung", label: "Rechnung & Abrechnung", short: "Rechnung", color: "#16a34a", re: /(?<!an)rechnung|abrechnung|kassenbon|quittung|beleg|kontoauszug|umsatz|lohnsteuer|zahlungstermin|gutschrift/ },
  { id: "bestaetigung", label: "Bestätigung & Kündigung", short: "Bestätigung", color: "#2563eb", re: /bestätigung|kündigung|eingangs/ },
  { id: "vertrag", label: "Vertrag & Police", short: "Vertrag", color: "#111827", re: /vertrag|police|versicherungsschein|mandat|antrag|eintrittserklärung|nachtrag|aufnahme/ },
  { id: "schreiben", label: "Schreiben & Sonstiges", short: "Schreiben", color: "#6b7280", re: /./ },
] as const;
export type KindId = (typeof KINDS)[number]["id"];

export function kindOf(d: Pick<Doc, "doc_type" | "title">) {
  const t = (d.doc_type ?? "").toLowerCase();
  // erst die Dokumentart, dann (falls leer/unklar) der Titel
  return KINDS.slice(0, -1).find((k) => k.re.test(t)) ?? KINDS.slice(0, -1).find((k) => k.re.test((d.title ?? "").toLowerCase())) ?? KINDS[KINDS.length - 1];
}
