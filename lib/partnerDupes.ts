import { contactOf } from "@/lib/actions";
import { DISTINCT, type Partner } from "@/lib/partners";

/** Gleiche Partner unter verschiedenen Namen (Umbenennung, Rebranding, Schreibweisen) – nach Kennungen, Kontakt, Webadresse und Namen */
export type PartnerGroup = { key: string; partners: Partner[]; sure: boolean; reasons: string[] };

// Wörter, die nichts über die Identität sagen (Orte, Rechtsformen, Abteilungen)
const GENERIC = new Set(["stuttgart", "klinikum", "klinik", "kliniken", "zentrum", "praxis", "gmbh", "group", "gruppe", "services", "service", "team", "bezirk", "landeshauptstadt", "abteilung", "facharzt", "fachärztin", "urologie", "kinderklinik", "kinderchirurgische", "pädiatrie", "pädiatrisches", "kinderheilkunde", "jugendmedizin", "medizin", "universitätsklinikum", "baden", "württemberg", "deutschland", "energie", "diagnostics", "partg", "mvz", "evangelische", "allgemeinmedizin", "chirurgie", "heilkunde"]);
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

function compare(a: Partner, b: Partner, sa: Sig, sb: Sig): { sure: boolean; reasons: string[] } | null {
  // BKK ≠ Arbeitgeber, Betriebsrat ≠ Firma: eigenständige Stellen nie vorschlagen
  if (distinct(a.name) !== distinct(b.name)) return null;
  const reasons: string[] = [];
  const sharedId = [...sa.ids].find((v) => sb.ids.has(v));
  if (sharedId) reasons.push(`gleiche Kennung (${a.ids.find((i) => norm(i.value) === sharedId)?.label ?? "Nummer"})`);
  const sharedContact = [...sa.contact].find((v) => sb.contact.has(v));
  if (sharedContact) reasons.push(sharedContact.startsWith("adr:") ? "gleiche Adresse" : sharedContact.startsWith("tel:") ? "gleiche Telefonnummer" : "gleiche E-Mail");
  const sameDomain = !!sa.domain && sa.domain === sb.domain;
  if (sameDomain) reasons.push(`gleiche Webadresse (${sa.domain})`);
  const word = [...sa.tokens].find((w) => sb.tokens.has(w));
  if (word) reasons.push(`Name enthält „${word[0].toUpperCase()}${word.slice(1)}“`);
  const sure = !!sharedId || !!sharedContact || (sameDomain && !!word);
  if (sure || (word && (sameDomain || a.cluster === b.cluster))) return { sure, reasons };
  return null;
}

export function findPartnerDuplicates(partners: Partner[], dismissed: string[] = []): PartnerGroup[] {
  const sigs = new Map(partners.map((p) => [p.key, signature(p)]));
  const parent = new Map<string, string>();
  const find = (x: string): string => { const p = parent.get(x) ?? x; if (p === x) return x; const r = find(p); parent.set(x, r); return r; };
  const info = new Map<string, { sure: boolean; reasons: string[] }>();
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
    return { key: g.map((p) => p.key).sort().join("|"), partners: [...g].sort((x, y) => y.docs.length - x.docs.length), sure: rs.some((r) => r.sure), reasons: [...new Set(rs.flatMap((r) => r.reasons))].slice(0, 4) };
  }).sort((a, b) => Number(b.sure) - Number(a.sure));
}

export const partnerPairKeys = (g: PartnerGroup) => g.partners.flatMap((a, i) => g.partners.slice(i + 1).map((b) => [a.key, b.key].sort().join("|")));
