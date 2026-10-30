/**
 * E-Mail-Import: Was aus Mails behalten wird. Lifevault ist der Ort für Dokumente, die man aufheben muss – Rechnungen,
 * Mahnungen, Bescheide, Verträge, Gehaltsnachweise. Bezahlte Käufe (Bestellbestätigung, Kassenbon, Zahlungsbeleg, z. B.
 * IKEA, Google, Apple) braucht man dort meist nicht: standardmäßig werden sie nach dem Auslesen wieder entfernt.
 * Einstellbar unter Einstellungen › E-Mail (mail_inbox.keep_rules). Gilt nur für Dokumente aus Mails (documents.from_mail).
 */
import { kindOf } from "@/lib/kinds";

export type KeepRules = { kauf: boolean; rechnung: boolean; mahnung: boolean; bescheid: boolean; vertrag: boolean; gehalt: boolean; sonstiges: boolean };
export const DEFAULT_KEEP: KeepRules = { kauf: false, rechnung: true, mahnung: true, bescheid: true, vertrag: true, gehalt: true, sonstiges: true };
export const KEEP_ROWS: { id: keyof KeepRules; label: string; hint: string }[] = [
  { id: "rechnung", label: "Rechnungen", hint: "mit offenem Betrag oder Zahlungsziel" },
  { id: "mahnung", label: "Mahnungen & Forderungen", hint: "Mahnung, Inkasso, Bußgeld" },
  { id: "bescheid", label: "Bescheide", hint: "Steuer, Rundfunkbeitrag, Gebühren" },
  { id: "vertrag", label: "Verträge & Policen", hint: "Vertragsbestätigung, Versicherungsschein" },
  { id: "gehalt", label: "Gehaltsnachweise", hint: "Lohn- und Gehaltsabrechnung" },
  { id: "kauf", label: "Bezahlte Käufe", hint: "Bestellbestätigung, Kassenbon, Zahlungsbeleg (z. B. IKEA, Google, Apple)" },
  { id: "sonstiges", label: "Alles andere", hint: "Schreiben, Bestätigungen, Angebote, Infos" },
];

export function normalizeKeep(x: unknown): KeepRules {
  const o = (x && typeof x === "object" ? x : {}) as Partial<Record<keyof KeepRules, unknown>>;
  return Object.fromEntries((Object.keys(DEFAULT_KEEP) as (keyof KeepRules)[]).map((k) => [k, typeof o[k] === "boolean" ? o[k] : DEFAULT_KEEP[k]])) as KeepRules;
}

type DocLike = { doc_type?: string | null; title?: string | null; summary?: string | null; deadlines?: { date: string; what: string }[] | null };
const PURCHASE = /kassenbon|quittung|kaufbeleg|bestellbestätigung|bestellung|auftragsbestätigung|zahlungsbestätigung|zahlungsbeleg|lieferschein|order|receipt|kaufquittung|e-?bon/i;
const PAID = /bezahlt|beglichen|abgebucht|belastet|paypal|kreditkarte|apple pay|google pay|zahlung erhalten|vielen dank für (ihre|deine) (zahlung|bestellung)/i;
const OPEN = /zahlbar|zahlungsziel|bitte überweisen|fällig|offen|lastschrift erfolgt am|wird .* eingezogen/i;

/** Art für die Regel: Kaufbeleg (bezahlt), Rechnung, Mahnung … – aus der Dokumentart und der Zusammenfassung */
export function keepClass(d: DocLike, today = new Date().toISOString().slice(0, 10)): keyof KeepRules {
  const kind = kindOf({ doc_type: d.doc_type ?? null, title: d.title ?? null } as Parameters<typeof kindOf>[0]).id;
  if (kind === "mahnung") return "mahnung";
  if (kind === "gehalt") return "gehalt";
  if (kind === "bescheid") return "bescheid";
  if (kind === "vertrag") return "vertrag";
  const text = `${d.doc_type ?? ""} ${d.title ?? ""} ${d.summary ?? ""}`;
  const futurePay = (d.deadlines ?? []).some((x) => x.date >= today && /zahl|fällig|überweis|abbuch|einzug|lastschrift/i.test(x.what));
  if (kind === "rechnung" || kind === "bestaetigung") {
    if (futurePay || OPEN.test(text)) return "rechnung";
    if (PURCHASE.test(text) || PAID.test(text)) return "kauf";
    return kind === "rechnung" ? "rechnung" : "sonstiges";
  }
  return "sonstiges";
}

export const keepDoc = (rules: KeepRules, d: DocLike) => rules[keepClass(d)];
