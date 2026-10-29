import type { Doc } from "@/lib/types";

/**
 * Karten & Ausweise aus Fotos: Bankkarte, Personalausweis, Führerschein, Gesundheitskarte, Fahrkarte, Mitarbeiterausweis …
 * Mehrere Fotos derselben Karte (vorne/hinten, doppelt) werden zu einer Karte zusammengefasst.
 */
export type CardKind = "bank" | "id" | "drive" | "health" | "transit" | "work" | "other";
export type WalletCard = { key: string; kind: CardKind; label: string; issuer: string | null; domain: string | null; cluster: string | null; holder?: string; number?: string; valid?: string; validDate?: Date; docs: Doc[]; main: Doc; check?: string };

const KINDS: [CardKind, RegExp, string][] = [
  ["id", /personalausweis|reisepass|aufenthaltstitel|identity card/i, "Ausweis"],
  ["drive", /führerschein/i, "Führerschein"],
  ["health", /gesundheitskarte|krankenversicherungskarte|versichertenkarte|ehic/i, "Gesundheitskarte"],
  ["bank", /debitkarte|kreditkarte|girocard|bankkarte|visa|mastercard|maestro|amex/i, "Bankkarte"],
  ["transit", /fahrkarte|polygo|bahncard|deutschlandticket|abo-?karte|chipkarte/i, "Fahrkarte"],
  ["work", /mitarbeiterausweis|werksausweis|dienstausweis|betriebsausweis|firmenausweis/i, "Mitarbeiterausweis"],
  ["other", /\bkarte\b|kundenkarte|mitgliedskarte|mitgliedsausweis|card\b|gutscheinkarte|bibliotheksausweis|studierendenausweis/i, "Karte"],
];
export const KIND_BG: Record<CardKind, string> = {
  bank: "linear-gradient(125deg,#1b2130 0%,#2d3550 100%)",
  id: "linear-gradient(125deg,#2b5fe6 0%,#5b86f5 100%)",
  drive: "linear-gradient(125deg,#c2410c 0%,#e2702f 100%)",
  health: "linear-gradient(125deg,#1f9688 0%,#38b6a6 100%)",
  transit: "linear-gradient(125deg,#c46d06 0%,#e5a020 100%)",
  work: "linear-gradient(125deg,#5530c9 0%,#7650e6 100%)",
  other: "linear-gradient(125deg,#4a5568 0%,#718096 100%)",
};
// gleiche Art = dieselbe Karte (nur ein Ausweis, ein Führerschein, eine Gesundheitskarte)
const SINGLE: CardKind[] = ["id", "drive", "health"];
// keine Karte, auch wenn „Karte“ im Text steht
const NOT_CARD = /rechnung|mahnung|brief|informationsschreiben|zahlschein|vertrag|bescheid|merkblatt|broschüre|formular/i;

/** Rückseite? (die EHIC ist die Rückseite der Gesundheitskarte) */
export const isBack = (d: Pick<Doc, "title" | "doc_type">) => /rückseite|ehic|europäische krankenversicherungskarte/i.test(`${d.title ?? ""} ${d.doc_type ?? ""}`);
/** Reihenfolge fürs Zusammenführen: Vorderseite, Rückseite; weitere Fotos derselben Seite vorab abwählen (doppelt) */
export function cardOrder(c: Pick<WalletCard, "docs" | "main">) {
  const fronts = [c.main, ...c.docs.filter((d) => d !== c.main && !isBack(d))], backs = c.docs.filter((d) => d !== c.main && isBack(d));
  const keep = [fronts[0], backs[0]].filter((d): d is Doc => !!d);
  const rest = [...fronts.slice(1), ...backs.slice(1)];
  return { ids: [...keep, ...rest].map((d) => d.id), skip: keep.length >= 2 ? rest.map((d) => d.id) : [] };
}
const fact = (d: Doc, re: RegExp) => d.key_facts?.find((f) => re.test(f.label))?.value?.trim();
const holderOf = (d: Doc) => fact(d, /karteninhaber|name auf/i) ?? ([fact(d, /vorname/i), fact(d, /nachname|^name\b/i)].filter(Boolean).join(" ") || undefined);

export function cardKind(d: Pick<Doc, "doc_type" | "title">): CardKind | null {
  const t = `${d.doc_type ?? ""} ${d.title ?? ""}`;
  if (NOT_CARD.test(d.doc_type ?? "")) return null;
  return KINDS.find(([, re]) => re.test(t))?.[0] ?? null;
}

/** „12/30“, „11/27 (November 2027)“, „2032-08-21“, „03.12.2038“ → Datum (Monatsende bei MM/JJ) */
export function parseValid(v?: string): Date | undefined {
  if (!v) return undefined;
  let m = v.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (m) return new Date(+m[1], +m[2] - 1, +m[3]);
  m = v.match(/(\d{1,2})\.(\d{1,2})\.(\d{2,4})/);
  if (m) return new Date(+m[3] < 100 ? 2000 + +m[3] : +m[3], +m[2] - 1, +m[1]);
  m = v.match(/\b(\d{1,2})\s*\/\s*(\d{2,4})\b/);
  if (m) return new Date(+m[2] < 100 ? 2000 + +m[2] : +m[2], +m[1], 0);
  return undefined;
}
const mask = (n?: string) => {
  if (!n) return undefined;
  const clean = n.replace(/\s/g, "");
  return clean.length > 6 ? `•••• ${clean.slice(-4)}` : clean;
};

export function walletCards(docs: Doc[]): WalletCard[] {
  const map = new Map<string, WalletCard>();
  for (const d of docs) {
    if (d.archived || d.status !== "ready" || d.encrypted) continue;
    const kind = cardKind(d);
    if (!kind) continue;
    const number = fact(d, /kartennummer|ausweisnummer|seriennummer|führerscheinnummer|versichertennummer|kennnummer der karte/i);
    const key = SINGLE.includes(kind) ? kind : `${kind}:${(d.sender ?? "").toLowerCase().split(/\s+/)[0]}:${number?.replace(/\s/g, "").slice(-4) ?? ""}`;
    const valid = fact(d, /gültig bis|ablaufdatum|gültigkeit/i);
    const cur = map.get(key);
    // Titel = was es ist (Personalausweis, Debitkarte …), Aussteller nur darunter
    const t = `${d.doc_type ?? ""} ${d.title ?? ""}`;
    const label = kind === "id" ? (/reisepass/i.test(t) ? "Reisepass" : /aufenthalt/i.test(t) ? "Aufenthaltstitel" : "Personalausweis")
      : kind === "bank" ? (/kreditkarte/i.test(t) ? "Kreditkarte" : /girocard/i.test(t) && !/visa|master/i.test(t) ? "girocard" : "Debitkarte")
      : kind === "health" ? "Gesundheitskarte" : kind === "other" ? (d.doc_type?.replace(/\s*\(.*\)/, "") ?? "Karte") : KINDS.find(([k]) => k === kind)![2];
    const side = isBack(d);
    if (!cur) {
      map.set(key, { key, kind, label, issuer: d.sender, domain: kind === "id" ? "bund.de" : d.sender_domain, cluster: d.cluster, holder: holderOf(d), number: mask(number), valid, validDate: parseValid(valid), docs: [d], main: d });
      continue;
    }
    cur.docs.push(d);
    // Vorderseite / Dokument mit mehr Angaben als Hauptbild, fehlende Angaben ergänzen
    if (!side && isBack(cur.main)) cur.main = d;
    cur.issuer ??= d.sender; if (kind !== "id") cur.domain ??= d.sender_domain;
    cur.number ??= mask(number);
    if (!cur.validDate && valid) { cur.valid = valid; cur.validDate = parseValid(valid); }
    cur.holder ??= holderOf(d);
  }
  // Logo: die Webadresse, die der Absender in deinen Dokumenten am häufigsten hat (eine abweichende Adresse hat oft kein Logo)
  const domains = new Map<string, Map<string, number>>();
  for (const d of docs) if (d.sender && d.sender_domain) {
    const m = domains.get(d.sender.toLowerCase()) ?? new Map<string, number>();
    m.set(d.sender_domain, (m.get(d.sender_domain) ?? 0) + 1); domains.set(d.sender.toLowerCase(), m);
  }
  for (const c of map.values()) {
    const m = c.kind !== "id" && c.issuer ? domains.get(c.issuer.toLowerCase()) : undefined;
    if (m) c.domain = [...m.entries()].sort((a, b) => b[1] - a[1])[0][0];
  }
  const now = Date.now();
  return [...map.values()].map((c) => {
    // Hinweis zum Prüfen: mehrere Einzelfotos, nur Rückseite, unklarer Aussteller, abgelaufen
    const onlyBack = c.docs.every(isBack);
    const check = c.validDate && c.validDate.getTime() < now ? "abgelaufen"
      : onlyBack ? "nur Rückseite – Vorderseite fehlt?"
      : c.docs.length > 2 ? `${c.docs.length} Fotos – doppelt? zusammenführen`
      : c.docs.length === 2 ? "Vorder- & Rückseite als 2 Fotos – zusammenführen?"
      : !c.issuer ? "Aussteller unklar" : undefined;
    return { ...c, check };
  }).sort((a, b) => ["id", "drive", "health", "bank", "work", "transit", "other"].indexOf(a.kind) - ["id", "drive", "health", "bank", "work", "transit", "other"].indexOf(b.kind));
}
