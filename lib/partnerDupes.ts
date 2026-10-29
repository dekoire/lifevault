import { contactOf } from "@/lib/actions";
import { DISTINCT, type Partner } from "@/lib/partners";

/** Gleiche Partner unter verschiedenen Namen (Umbenennung, Rebranding, Schreibweisen) – nach Kennungen, Kontakt, Webadresse und Namen */
export type PartnerGroup = { key: string; partners: Partner[]; sure: boolean; reasons: string[]; score: number };

/**
 * Wahrscheinlichkeit, dass zwei Namen derselbe Partner sind (0…1). Ab ASK fragen wir, ab AUTO wird ohne Rückfrage zusammengeführt.
 * Eine gleiche Nummer allein reicht nicht (z. B. eine Kundennummer, die zufällig in zwei Briefen steht).
 */
export const ASK = 0.5;
export const AUTO = 0.85;

// Wörter, die nichts über die Identität sagen (Orte, Rechtsformen, Abteilungen)
const GENERIC = new Set(["stuttgart", "klinikum", "klinik", "kliniken", "zentrum", "praxis", "gmbh", "group", "gruppe", "services", "service", "team", "bezirk", "landeshauptstadt", "abteilung", "facharzt", "fachärztin", "urologie", "kinderklinik", "kinderchirurgische", "pädiatrie", "pädiatrisches", "kinderheilkunde", "jugendmedizin", "medizin", "bank", "versicherung", "versicherungen", "krankenkasse", "stadtwerke", "universitätsklinikum", "baden", "württemberg", "deutschland", "energie", "diagnostics", "partg", "mvz", "evangelische", "allgemeinmedizin", "chirurgie", "heilkunde"]);
const tokens = (name: string) => new Set(name.toLowerCase().replace(/\(.*?\)/g, " ").replace(/\b(dr|med|prof|pd)\b\.?/g, " ").split(/[^\p{L}\p{N}]+/u).filter((w) => w.length >= 4 && !GENERIC.has(w)));
const NOT_PARTNER_ID = /\b(bic|swift|iban|blz|bankleitzahl)\b|ausweis|reisepass|pass-?nummer|führerschein|seriennummer|steuer-?id|identifikationsnummer|sozialversicherung|rentenversicherungsnummer|geburts/i;
const norm = (v: string) => v.toLowerCase().replace(/[\s.\-/]/g, "");
const distinct = (name: string) => name.toLowerCase().split(/[^\p{L}]+/u).filter((w) => DISTINCT.test(w)).sort().join(",");

type Sig = { ids: Set<string>; contact: Set<string>; domain: string | null; tokens: Set<string> };
function signature(p: Partner): Sig {
  const contact = new Set<string>();
  for (const d of p.docs) {
    const c = contactOf(d);
    for (const a of c.addresses) contact.add(`adr:${norm(a)}`);
    for (const t of c.phones) { const n = t.replace(/\D/g, ""); if (n.length >= 7) contact.add(`tel:${n}`); }
    for (const e of c.emails) contact.add(`mail:${e.toLowerCase()}`);
  }
  return {
    // Kunden-/Vertrags-/Mitgliedsnummern: mindestens 5 Zeichen, damit kurze Werte nicht zufällig treffen
    // ohne Bank- und eigene Ausweisnummern: BIC/IBAN gehören zur Bank, Ausweis-/Führerscheinnummer zu dir – nicht zum Partner
    ids: new Set(p.ids.filter((i) => !NOT_PARTNER_ID.test(i.label)).map((i) => norm(i.value)).filter((v) => v.length >= 5 && /\d/.test(v))),
    contact, domain: p.domain?.replace(/^www\./, "") ?? null, tokens: tokens(p.name),
  };
}

function compare(a: Partner, b: Partner, sa: Sig, sb: Sig): { score: number; reasons: string[] } | null {
  // BKK ≠ Arbeitgeber, Betriebsrat ≠ Firma: eigenständige Stellen nie vorschlagen
  if (distinct(a.name) !== distinct(b.name)) return null;
  const reasons: string[] = [];
  let score = 0;
  const sharedIds = [...sa.ids].filter((v) => sb.ids.has(v));
  if (sharedIds.length) { score += Math.min(0.45, 0.25 + 0.1 * (sharedIds.length - 1)); reasons.push(`${sharedIds.length > 1 ? `${sharedIds.length} gleiche Kennungen` : `gleiche Kennung (${a.ids.find((i) => norm(i.value) === sharedIds[0])?.label ?? "Nummer"})`}`); }
  const sharedContact = [...sa.contact].filter((v) => sb.contact.has(v));
  if (sharedContact.length) { score += sharedContact.length > 1 ? 0.4 : 0.25; reasons.push(sharedContact[0].startsWith("adr:") ? "gleiche Adresse" : sharedContact[0].startsWith("tel:") ? "gleiche Telefonnummer" : "gleiche E-Mail"); }
  const sameDomain = !!sa.domain && sa.domain === sb.domain;
  if (sameDomain) { score += 0.45; reasons.push(`gleiche Webadresse (${sa.domain})`); }
  const words = [...sa.tokens].filter((w) => sb.tokens.has(w));
  if (words.length) { score += words.length > 1 ? 0.55 : 0.45; reasons.push(`Name enthält „${words[0][0].toUpperCase()}${words[0].slice(1)}“`); }
  if (a.cluster === b.cluster) score += 0.1;
  score = Math.min(1, score);
  return score >= ASK ? { score, reasons } : null;
}

export function findPartnerDuplicates(partners: Partner[], dismissed: string[] = []): PartnerGroup[] {
  const sigs = new Map(partners.map((p) => [p.key, signature(p)]));
  const parent = new Map<string, string>();
  const find = (x: string): string => { const p = parent.get(x) ?? x; if (p === x) return x; const r = find(p); parent.set(x, r); return r; };
  const info = new Map<string, { score: number; reasons: string[] }>();
  for (let i = 0; i < partners.length; i++) for (let j = i + 1; j < partners.length; j++) {
    const a = partners[i], b = partners[j];
    const k = [a.key, b.key].sort().join("|");
    if (dismissed.includes(k)) continue;
    const r = compare(a, b, sigs.get(a.key)!, sigs.get(b.key)!);
    if (!r) continue;
    parent.set(find(a.key), find(b.key));
    info.set(k, r);
  }
  const groups = new Map<string, Partner[]>();
  for (const p of partners) if (parent.has(p.key) || [...parent.values()].includes(p.key)) { const r = find(p.key); groups.set(r, [...(groups.get(r) ?? []), p]); }
  return [...groups.values()].filter((g) => g.length > 1).map((g) => {
    const rs = [...info.entries()].filter(([k]) => { const [x, y] = k.split("|"); return g.some((p) => p.key === x) && g.some((p) => p.key === y); }).map(([, r]) => r);
        // schwächste Verbindung zählt: eine Gruppe ist nur so sicher wie ihr unsicherstes Paar
    const score = rs.length ? Math.min(...rs.map((r) => r.score)) : 0;
    return { key: g.map((p) => p.key).sort().join("|"), partners: [...g].sort((x, y) => y.docs.length - x.docs.length), sure: score >= AUTO, score, reasons: [...new Set(rs.flatMap((r) => r.reasons))].slice(0, 4) };
  }).sort((a, b) => b.score - a.score);
}

export const partnerPairKeys = (g: PartnerGroup) => g.partners.flatMap((a, i) => g.partners.slice(i + 1).map((b) => [a.key, b.key].sort().join("|")));
