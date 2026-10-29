import type { Doc, Fact } from "@/lib/types";

/** Was aus einem Dokument direkt nutzbar ist: Überweisung, Kontakt, Links – aus Key-Fakten und Volltext */
export type Payment = { recipient?: string; iban: string; bic?: string; bank?: string; reference?: string; amount?: number; currency: string };
export type Contact = { addresses: string[]; phones: string[]; emails: string[]; links: string[] };

const IBAN = /\b[A-Z]{2}\d{2}(?:\s?[A-Z0-9]{4}){3,7}(?:\s?[A-Z0-9]{1,3})?\b/;
const BIC = /\b[A-Z]{6}[A-Z0-9]{2}(?:[A-Z0-9]{3})?\b/;
const money = (v: string) => {
  const m = /(-?\d{1,3}(?:\.\d{3})*(?:,\d{1,2})|-?\d+(?:[.,]\d{1,2})?)\s*(€|EUR)?/.exec(v);
  if (!m) return undefined;
  const n = Number(m[1].includes(",") ? m[1].replace(/\./g, "").replace(",", ".") : m[1]);
  return Number.isFinite(n) && n > 0 ? n : undefined;
};
const payGroup = (f: Fact) => /zahl|bank|überweis|konto/i.test(f.group ?? "");

/** Überweisungsdaten – nur fremde Konten (nicht die eigene IBAN aus Gehaltsabrechnungen) */
export function paymentOf(d: Doc): Payment | undefined {
  const facts = d.key_facts ?? [];
  const ibanFact = facts.find((f) => /iban/i.test(f.label) && IBAN.test(f.value.toUpperCase()) && (payGroup(f) || !f.personal) && !/arbeitnehmer|mitarbeiter|dein|ihr konto|auszahlung/i.test(f.label));
  if (!ibanFact) return undefined;
  const near = facts.filter((f) => f.group === ibanFact.group || payGroup(f));
  const bicSrc = near.find((f) => /bic|swift|bank/i.test(f.label) && BIC.test(f.value.toUpperCase()));
  const bankF = near.find((f) => /bank|kreditinstitut/i.test(f.label));
  const recipient = near.find((f) => /empfänger|kontoinhaber|begünstigt/i.test(f.label) && !f.personal)?.value ?? d.sender ?? undefined;
  const reference = near.find((f) => /verwendungszweck|referenz|zahlungsreferenz|bei zahlung/i.test(f.label))?.value;
  const amount = openTotal(d);
  return {
    recipient: recipient?.slice(0, 70),
    iban: IBAN.exec(ibanFact.value.toUpperCase())![0].replace(/\s/g, ""),
    bic: bicSrc ? BIC.exec(bicSrc.value.toUpperCase())?.[0] : undefined,
    bank: bankF?.value.replace(BIC, "").replace(/[,/:]*\s*(BIC)?\s*$/i, "").trim() || undefined,
    reference: reference?.slice(0, 140),
    amount,
    currency: "EUR",
  };
}

/** Was ist insgesamt offen? Bevorzugt „offener Gesamtbetrag / Rückstand / zu zahlen“ (größter Wert), nicht einzelne Posten oder Gebühren */
const TOTAL = /offen|rückstand|gesamtbetrag|gesamtforderung|zu zahlen|zahlbetrag|gesamt.*zahl|endbetrag|rechnungsbetrag|forderung/i;
const NOT_TOTAL = /kosten (der )?unterbrechung|wiederherstellung|einsatz|gebühr|zins|ratenhöhe|abschlag fällig|mwst|ust|netto/i;
export function openTotal(d: Pick<Doc, "key_facts" | "amounts">): number | undefined {
  const cands: number[] = [];
  for (const a of d.amounts ?? []) if (TOTAL.test(a.label) && !NOT_TOTAL.test(a.label) && a.value > 0) cands.push(a.value);
  for (const f of d.key_facts ?? []) { const v = money(f.value); if (v && TOTAL.test(f.label) && !NOT_TOTAL.test(f.label)) cands.push(v); }
  if (cands.length) return Math.max(...cands);
  const any = (d.key_facts ?? []).find((f) => /betrag/i.test(f.label) && !NOT_TOTAL.test(f.label) && money(f.value));
  return any ? money(any.value) : undefined;
}
const PAY_ITEM = /zahl|fällig|überweis|abschlag|rechnung|gebühr|beitrag|forderung|mahn/i;

/** IBAN in Vierergruppen */
export const fmtIban = (iban: string) => iban.replace(/(.{4})/g, "$1 ").trim();

/** GiroCode (EPC-QR): Banking-Apps füllen damit die Überweisung aus */
export function epcPayload(p: Payment) {
  return ["BCD", "002", "1", "SCT", p.bic ?? "", (p.recipient ?? "").slice(0, 70), p.iban, p.amount ? `EUR${p.amount.toFixed(2)}` : "", "", "", (p.reference ?? "").slice(0, 140)].join("\n");
}

/** Kontakt und Links (nur Angaben der Gegenseite, keine eigenen Daten) */
export function contactOf(d: Doc, fullText?: string | null): Contact {
  const facts = (d.key_facts ?? []).filter((f) => !f.personal);
  const uniq = (a: string[]) => [...new Set(a.map((x) => x.trim()).filter(Boolean))];
  const text = [d.summary ?? "", ...facts.map((f) => f.value), fullText ?? ""].join("\n");
  const links = uniq([...text.matchAll(/\b(?:https?:\/\/|www\.)[^\s<>"'()\]]+[^\s<>"'().,;:\]]/gi)].map((m) => (m[0].startsWith("http") ? m[0] : `https://${m[0]}`)));
  return {
    addresses: uniq(facts.filter((f) => /adresse|anschrift|sitz|standort/i.test(f.label) && /\d{5}/.test(f.value)).map((f) => f.value)).slice(0, 3),
    phones: uniq(facts.filter((f) => /telefon|tel\b|hotline|mobil|fon/i.test(f.label) && !/fax/i.test(f.label) && /\d{3}/.test(f.value)).map((f) => f.value)).slice(0, 4),
    emails: uniq(text.match(/[\w.+-]+@[\w-]+\.[\w.-]+/g) ?? []).filter((e) => facts.some((f) => f.value.includes(e))).slice(0, 3),
    links: links.slice(0, 8),
  };
}

/** Aufgaben: Fristen, bei denen man etwas tun muss (zahlen, zurücksenden, Termin …) – nicht reine Infos wie „Inkrafttreten“ */
const ACTION = /zahl|fällig|überweis|rücksend|zurücksend|einreich|kündig|widerspruch|termin|vorstellung|kontrolle|untersuchung|anmeld|abmeld|melden|antrag|vorlegen|beantragen|verlängern|erneuern|abgeben|frist/i;
const INFO = /inkrafttreten|beginn der|gültig(keit)? ab|gültigkeit|in kraft|tätigkeit|ausgestellt|erstellt am/i;

export type Todo = { doc: Doc; date: string; what: string; more: number; days: number; payment?: Payment; total?: number; items?: { date: string; what: string }[]; letters?: Doc[] };

export function todos(docs: Doc[], today: string, opts: { pastDays?: number; aheadDays?: number } = {}): Todo[] {
  const past = opts.pastDays ?? 730, ahead = opts.aheadDays ?? 120;
  const day = (iso: string) => Math.round((Date.parse(iso) - Date.parse(today)) / 86_400_000);
  const out: Todo[] = [];
  for (const d of docs) {
    if (d.archived || d.status !== "ready") continue;
    const list = (d.deadlines ?? []).filter((x) => /^\d{4}-\d{2}-\d{2}$/.test(x.date) && ACTION.test(x.what) && !INFO.test(x.what) && day(x.date) >= -past && day(x.date) <= ahead);
    if (!list.length) continue;
    // je Dokument eine Zeile: die nächste anstehende Frist, sonst die zuletzt verpasste
    const upcoming = list.filter((x) => day(x.date) >= 0).sort((a, b) => a.date.localeCompare(b.date));
    const pick = upcoming[0] ?? [...list].sort((a, b) => b.date.localeCompare(a.date))[0];
    const total = openTotal(d);
    const payItems = list.filter((x) => PAY_ITEM.test(x.what));
    // mehrere Zahlungsposten mit Gesamtbetrag (z. B. Mahnung): eine Zeile „offen insgesamt“ statt der letzten Einzelgebühr
    if (total && payItems.length >= 2) {
      const due = payItems.filter((x) => day(x.date) >= 0).sort((a, b) => a.date.localeCompare(b.date))[0] ?? [...payItems].sort((a, b) => b.date.localeCompare(a.date))[0];
      out.push({ doc: d, date: due.date, what: `Offen insgesamt ${total.toLocaleString("de-DE", { style: "currency", currency: "EUR" })} zahlen`, more: list.length - payItems.length, days: day(due.date), payment: paymentOf(d), total, items: payItems });
      continue;
    }
    out.push({ doc: d, date: pick.date, what: pick.what, more: list.length - 1, days: day(pick.date), payment: paymentOf(d), total: PAY_ITEM.test(pick.what) ? total : undefined });
  }
  // gleiche Sache, mehrere Schreiben (Rechnung → Erinnerung → Mahnung): nur das neueste zeigen, die älteren hängen daran
  const key = (t: Todo) => (t.doc.sender ? `${t.doc.sender.toLowerCase().replace(/[^a-z0-9äöü]+/g, " ").trim().split(" ").slice(0, 2).join(" ")}` : t.doc.id);
  const isPay = (t: Todo) => !!(t.total || t.payment) && PAY_ITEM.test(`${t.what} ${t.doc.doc_type ?? ""} ${t.doc.title ?? ""}`);
  const groups = new Map<string, Todo[]>();
  for (const t of out) if (isPay(t)) groups.set(key(t), [...(groups.get(key(t)) ?? []), t]);
  const drop = new Set<Todo>();
  for (const g of groups.values()) {
    if (g.length < 2) continue;
    const dateOf = (t: Todo) => t.doc.doc_date ?? t.doc.received_at.slice(0, 10);
    const dates = g.map(dateOf).sort();
    if (day(dates[dates.length - 1]) - day(dates[0]) > 200) continue; // weit auseinander: verschiedene Vorgänge
    const [latest, ...older] = [...g].sort((a, b) => dateOf(b).localeCompare(dateOf(a)));
    latest.letters = older.map((t) => t.doc);
    if (latest.total === undefined) latest.total = older.map((t) => t.total ?? t.payment?.amount ?? 0).reduce((a, b) => a + b, latest.payment?.amount ?? 0) || undefined;
    for (const t of older) drop.add(t);
  }
  out.splice(0, out.length, ...out.filter((t) => !drop.has(t)));
  // überfällige zuerst (die jüngsten oben), dann nach Datum
  return out.sort((a, b) => (a.days < 0) !== (b.days < 0) ? (a.days < 0 ? -1 : 1) : a.days < 0 ? b.days - a.days : a.days - b.days);
}

/** „überfällig seit 2 Tagen“, „heute“, „morgen“, „in 5 Tagen“ */
export function dueLabel(days: number) {
  if (days < 0) { const n = -days; return n >= 60 ? `überfällig seit ${Math.round(n / 30)} Monaten` : `überfällig seit ${n} ${n === 1 ? "Tag" : "Tagen"}`; }
  return days === 0 ? "heute fällig" : days === 1 ? "morgen" : `in ${days} Tagen`;
}

/** Art einer Aufgabe – bestimmt Farbe und Symbol in „Zu erledigen“ */
export type TodoKind = "widerspruch" | "angebot" | "formular" | "zahlung" | "vertrag" | "termin" | "frist";
export function todoKind(t: Pick<Todo, "what" | "doc" | "payment">): TodoKind {
  const what = t.what.toLowerCase();
  const all = `${what} ${(t.doc.doc_type ?? "").toLowerCase()} ${(t.doc.title ?? "").toLowerCase()}`;
  if (/widerspruch|einspruch|gerichtliche entscheidung|anfecht|rechtsbehelf|anhörung/.test(what)) return "widerspruch";
  if (/angebot|kostenvoranschlag|bindefrist|annahmefrist/.test(all) && !/mahnung|rechnung/.test(all)) return "angebot";
  if (/ausfüll|zurücksend|rücksend|einreich|unterschreib|unterzeichn|formular|fragebogen|antrag|nachweis|vorlegen|melden|anmeld/.test(what)) return "formular";
  if (/zahl|überweis|fällig|gebühr|mahn|rechnung|beitrag|betrag|forderung|abschlag/.test(what) || (t.payment && /zahl|fällig|bis/.test(what))) return "zahlung";
  if (/vertrag|kündig|verlänger|änderung|police|laufzeit/.test(what)) return "vertrag";
  if (/termin|untersuchung|vorstellung|kontrolle|sprechstunde/.test(what)) return "termin";
  return "frist";
}
