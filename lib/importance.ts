import type { Doc } from "@/lib/types";

/** Wichtigkeit 1–5: wie schlimm wäre es, das Dokument zu verlieren bzw. zu übersehen */
export const IMPORTANCE: { value: number; label: string; hint: string }[] = [
  { value: 5, label: "Unverzichtbar", hint: "Ausweis, Urkunde, Zeugnis, Testament, Grundbuch, Rentenbescheid" },
  { value: 4, label: "Sehr wichtig", hint: "Vertrag, Police, Arbeitsvertrag, Bescheid, Befund, Mahnung" },
  { value: 3, label: "Wichtig", hint: "Abrechnung, Rechnung mit Garantie, steuerrelevant, Nachtrag" },
  { value: 2, label: "Nützlich", hint: "einfache Rechnung, Kassenbon, Bestätigung, Schriftverkehr" },
  { value: 1, label: "Unwichtig", hint: "Werbung, Newsletter, Infoblatt, Datenschutzhinweis" },
];
export const importanceLabel = (n?: number | null) => IMPORTANCE.find((x) => x.value === n)?.label ?? "Nicht bewertet";

/** Rolle eines Dokuments innerhalb seines Partners (Firma, Kasse, Arbeitgeber …) */
export type PartnerRole = "grundlage" | "aenderung" | "laufend" | "schriftverkehr" | "nebensache";
export const ROLES: { id: PartnerRole; label: string; hint: string }[] = [
  { id: "grundlage", label: "Grundlage", hint: "begründet die Beziehung: Vertrag, Police, Arbeitsvertrag, Mitgliedschaft, Kontoeröffnung" },
  { id: "aenderung", label: "Änderung", hint: "ändert oder beendet die Grundlage: Nachtrag, Tarif-/Beitragsänderung, Gehaltserhöhung, Kündigung, Vertragsbestätigung" },
  { id: "laufend", label: "Laufend", hint: "wiederkehrend aus der Grundlage: Rechnung, Abrechnung, Gehaltsabrechnung, Kontoauszug, Beitragsrechnung" },
  { id: "schriftverkehr", label: "Schriftverkehr", hint: "einzelner Vorgang: Brief, Mahnung, Rückfrage, Antrag, Befund, Bescheid" },
  { id: "nebensache", label: "Nebensache", hint: "Werbung, Infoblatt, AGB, Datenschutzhinweis" },
];
export const roleLabel = (r?: string | null) => ROLES.find((x) => x.id === r)?.label;

export const cleanImportance = (n: unknown): number | null => {
  const v = Math.round(Number(n));
  return v >= 1 && v <= 5 ? v : null;
};
export const cleanRole = (r: unknown): PartnerRole | null => (ROLES.some((x) => x.id === r) ? (r as PartnerRole) : null);

/** Text für Prompts */
export const IMPORTANCE_PROMPT = `Wichtigkeit (importance, 1–5) – wie schlimm wäre es, das Dokument zu verlieren oder zu übersehen:
${IMPORTANCE.map((x) => `- ${x.value} ${x.label}: ${x.hint}`).join("\n")}
Offene Fristen, Zahlungen und gültige Verträge zählen mehr; Archiviertes/Überholtes höchstens 2 (außer Urkunden, Zeugnisse, Nachweise für Rente/Steuer).
Grund (reason): ein kurzer Halbsatz, warum – ohne Namen, Adressen oder Nummern.
Rolle beim Partner (role):
${ROLES.map((x) => `- ${x.id}: ${x.hint}`).join("\n")}
Bezug (basisId): ID des Grundlage-Dokuments DESSELBEN Partners, aus dem dieses Dokument folgt (z. B. Rechnung → Mobilfunkvertrag, Gehaltsabrechnung → Arbeitsvertrag, Beitragsänderung → Police). Gibt es mehrere Grundlagen (z. B. zwei Verträge), die passende wählen; bei Grundlagen selbst und ohne passende Grundlage null.`;

/** Ersatz ohne KI: grob aus Art/Titel */
export function guessImportance(d: Pick<Doc, "doc_type" | "title" | "archived">): number {
  const t = `${d.doc_type ?? ""} ${d.title ?? ""}`;
  if (/ausweis|urkunde|zeugnis|testament|grundbuch|reisepass|führerschein|rentenbescheid|sozialversicherungsausweis/i.test(t)) return 5;
  if (/werbung|newsletter|broschüre|infoblatt|merkblatt|datenschutz|agb/i.test(t)) return 1;
  if (d.archived) return 2;
  if (/vertrag|police|versicherungsschein|bescheid|befund|arztbrief|mahnung|kündigung/i.test(t)) return 4;
  if (/abrechnung|nachtrag|steuer|garantie/i.test(t)) return 3;
  return 2;
}
export const importanceOf = (d: Pick<Doc, "importance" | "doc_type" | "title" | "archived">) => d.importance ?? guessImportance(d);
