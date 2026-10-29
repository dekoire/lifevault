import type { Doc } from "@/lib/types";

/** Wie heikel ist ein Dokument? Gesundheit, Ausweis, Steuer-/Sozialversicherungsnummer, Bankdaten, Gehalt */
const RULES: [RegExp, string][] = [
  [/diagnose|befund|arztbrief|therapie|medikament|krankenhaus|klinik|op-bericht|laborwert|icd/i, "Gesundheitsdaten"],
  [/ausweis|reisepass|personalausweis|führerschein|aufenthalt/i, "Ausweisdaten"],
  [/steuer-?id|identifikationsnummer|steuernummer/i, "Steuer-ID"],
  [/sozialversicherung|sv-?nummer|rentenversicherungsnummer|versichertennummer|kvnr/i, "Versicherungsnummer"],
  [/\biban\b|kontonummer|kreditkarte/i, "Bankdaten"],
  [/gehalt|brutto|netto|entgelt|lohn/i, "Gehalt"],
  [/geburtsdatum|geburtsort/i, "Geburtsdaten"],
];
const CLUSTER: Record<string, string> = { gesundheit: "Gesundheitsdaten", persoenlich: "Persönliche Dokumente", steuer: "Steuerdaten" };

export function sensitivity(d: Pick<Doc, "cluster" | "doc_type" | "title" | "key_facts">) {
  const found = new Set<string>();
  if (d.cluster && CLUSTER[d.cluster]) found.add(CLUSTER[d.cluster]);
  const text = [d.doc_type, d.title, ...(d.key_facts ?? []).map((f) => f.label)].join(" ");
  for (const [re, label] of RULES) if (re.test(text)) found.add(label);
  const reasons = [...found];
  const level = reasons.some((r) => /Gesundheit|Ausweis|Steuer-ID|Versicherungsnummer/.test(r)) || reasons.length >= 3 ? "hoch" : reasons.length ? "mittel" : "gering";
  return { level, reasons } as { level: "hoch" | "mittel" | "gering"; reasons: string[] };
}
