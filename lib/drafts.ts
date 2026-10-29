import type { Doc } from "@/lib/types";

/** Arten von Schreiben, die man zu einem Dokument vorformulieren lassen kann */
export const DRAFT_PURPOSES = [
  { id: "widerspruch", label: "Widerspruch", prompt: "Widerspruch gegen den Bescheid/die Forderung/Abrechnung einlegen, Begründung aus dem Dokument, Platzhalter für eigene Gründe" },
  { id: "widerruf", label: "Widerruf", prompt: "Widerruf des Vertrags innerhalb der Widerrufsfrist erklären" },
  { id: "kuendigung", label: "Kündigung", prompt: "Vertrag fristgerecht zum nächstmöglichen Zeitpunkt kündigen, Bestätigung mit Enddatum erbitten" },
  { id: "stundung", label: "Ratenzahlung / Aufschub", prompt: "um Ratenzahlung oder Zahlungsaufschub bitten, konkreten Vorschlag machen" },
  { id: "rueckfrage", label: "Rückfrage", prompt: "höflich um Erklärung/Aufschlüsselung bzw. fehlende Unterlagen bitten" },
  { id: "bestaetigung", label: "Bestätigung", prompt: "Erhalt bestätigen bzw. Zahlung/Erledigung mitteilen" },
] as const;
export type DraftPurpose = (typeof DRAFT_PURPOSES)[number]["id"];

/** Passende Vorschläge je Dokument (zuerst die wahrscheinlichsten) */
export function suggestedPurposes(d: Pick<Doc, "doc_type" | "title" | "labels">): DraftPurpose[] {
  const t = `${d.doc_type ?? ""} ${d.title ?? ""} ${(d.labels ?? []).join(" ")}`.toLowerCase();
  const out: DraftPurpose[] = [];
  if (/bescheid|widerspruch|mahnung|forderung|nachzahlung|abrechnung|bußgeld/.test(t)) out.push("widerspruch");
  if (/mahnung|rechnung|forderung|nachzahlung|zahlung/.test(t)) out.push("stundung");
  if (/vertrag|abo|mitgliedschaft|tarif|preiserhöhung|police|versicherung/.test(t)) out.push("kuendigung");
  if (/bestellung|vertragsbestätigung|auftragsbestätigung|widerruf/.test(t)) out.push("widerruf");
  out.push("rueckfrage", "bestaetigung");
  return [...new Set(out)];
}
