import type { Doc, Fact } from "@/lib/types";

/** Bekannte Firmen → Webadresse, falls die KI keine Domain geliefert hat (für das Logo) */
const KNOWN: [RegExp, string][] = [
  [/mercedes|daimler/i, "mercedes-benz.de"], [/\bbmw\b/i, "bmw.de"], [/\bbosch\b/i, "bosch.de"], [/porsche/i, "porsche.com"], [/volkswagen|\bvw\b/i, "volkswagen.de"], [/\baudi\b/i, "audi.de"], [/\bsap\b/i, "sap.com"], [/siemens/i, "siemens.com"],
  [/telekom/i, "telekom.de"], [/vodafone/i, "vodafone.de"], [/\bo2\b|telef[oó]nica/i, "o2online.de"], [/1\s?&\s?1/i, "1und1.de"], [/congstar/i, "congstar.de"],
  [/huk/i, "huk.de"], [/allianz/i, "allianz.de"], [/\baxa\b/i, "axa.de"], [/ergo/i, "ergo.de"], [/debeka/i, "debeka.de"], [/generali/i, "generali.de"], [/signal iduna/i, "signal-iduna.de"], [/w[uü]rttembergische/i, "wuerttembergische.de"], [/r\+v|r und v/i, "ruv.de"], [/devk/i, "devk.de"], [/check24/i, "check24.de"],
  [/techniker|\btk\b/i, "tk.de"], [/\baok\b/i, "aok.de"], [/barmer/i, "barmer.de"], [/\bdak\b/i, "dak.de"], [/ikk/i, "ikk-classic.de"],
  [/sparkasse/i, "sparkasse.de"], [/volksbank|raiffeisen/i, "vr.de"], [/\bing\b|ing-diba/i, "ing.de"], [/\bdkb\b/i, "dkb.de"], [/comdirect/i, "comdirect.de"], [/commerzbank/i, "commerzbank.de"], [/deutsche bank/i, "deutsche-bank.de"], [/postbank/i, "postbank.de"], [/\bn26\b/i, "n26.com"], [/paypal/i, "paypal.com"], [/bw.?bank/i, "bw-bank.de"],
  [/\bdm\b|dm-drogerie/i, "dm.de"], [/rossmann/i, "rossmann.de"], [/\brewe\b/i, "rewe.de"], [/edeka/i, "edeka.de"], [/\baldi\b/i, "aldi-sued.de"], [/\blidl\b/i, "lidl.de"], [/kaufland/i, "kaufland.de"], [/netto/i, "netto-online.de"], [/penny/i, "penny.de"],
  [/media ?markt/i, "mediamarkt.de"], [/saturn/i, "saturn.de"], [/amazon/i, "amazon.de"], [/ikea/i, "ikea.com"], [/zalando/i, "zalando.de"], [/otto\b/i, "otto.de"], [/apple/i, "apple.com"],
  [/\baral\b/i, "aral.de"], [/shell/i, "shell.de"], [/\besso\b/i, "esso.de"], [/deutsche bahn|\bdb\b/i, "bahn.de"], [/lufthansa/i, "lufthansa.com"], [/adac/i, "adac.de"],
  [/enbw/i, "enbw.com"], [/\beon\b|e\.on/i, "eon.de"], [/vattenfall/i, "vattenfall.de"], [/stadtwerke stuttgart/i, "stadtwerke-stuttgart.de"],
  [/finanzamt/i, "elster.de"], [/rundfunk|beitragsservice/i, "rundfunkbeitrag.de"], [/ig metall/i, "igmetall.de"], [/netflix/i, "netflix.com"], [/spotify/i, "spotify.com"],
];

export function domainFor(sender?: string | null, domain?: string | null) {
  if (domain) return domain;
  if (!sender) return null;
  return KNOWN.find(([re]) => re.test(sender))?.[1] ?? null;
}

/** Absender vereinheitlichen: „Telekom Deutschland GmbH“ und „Telekom“ → gleicher Partner */
export function partnerKey(sender: string) {
  return sender.toLowerCase()
    .replace(/\b(gmbh|ag|se|kg|ohg|mbh|co|e\.?\s?v\.?|& co\.?|deutschland|germany|vertriebs|niederlassung)\b/g, " ")
    .replace(/\(.*?\)/g, " ")
    .replace(/[^a-z0-9äöüß]+/g, " ").trim().split(" ").slice(0, 2).join("-") || "unbekannt";
}

/** Kennungen: Kunden-, Vertrags-, Versicherungs-, Rufnummer, IBAN, Zählernummer, Login … */
const ID_LABEL = /(nummer|\bnr\b|\bnr\.|kennung|kennwort|\bid\b|iban|\bbic\b|kunden|vertrags|versicherungs|police|versicherungsschein|rufnummer|zähler|mitglied|aktenzeichen|referenz|benutzer|login|tarif-?id|steuernummer|identifikation|personal|kontonummer|kennzeichen|fahrgestell|fin\b)/i;
export const isIdFact = (f: Fact) => ID_LABEL.test(f.label) || /kennung|nummer/i.test(f.group ?? "");

export type PartnerId = { label: string; value: string; docId: string; docTitle: string; date: string };
export type Partner = {
  key: string; name: string; domain: string | null; cluster: string | null; docs: Doc[];
  ids: PartnerId[]; first: string; last: string; active: boolean; isShop: boolean;
};

const dateOf = (d: Doc) => d.doc_date ?? d.received_at.slice(0, 10);

/** Alle Absender mit ihren Dokumenten und gesammelten Kennungen */
export function buildPartners(docs: Doc[]): Partner[] {
  const map = new Map<string, Partner>();
  for (const d of docs) {
    if (d.status !== "ready" || !d.sender) continue;
    const key = partnerKey(d.sender);
    const p = map.get(key) ?? { key, name: d.sender, domain: null, cluster: d.cluster, docs: [], ids: [], first: dateOf(d), last: dateOf(d), active: false, isShop: false };
    p.docs.push(d);
    if (dateOf(d) < p.first) p.first = dateOf(d);
    if (dateOf(d) >= p.last) { p.last = dateOf(d); p.cluster = d.cluster; if (d.sender.length < p.name.length || !p.name) p.name = d.sender; }
    p.domain ??= domainFor(d.sender, d.sender_domain);
    if (!d.archived) p.active = true;
    map.set(key, p);
  }
  for (const p of map.values()) {
    p.docs.sort((a, b) => dateOf(b).localeCompare(dateOf(a)));
    p.isShop = p.docs.every((d) => d.cluster === "belege" || d.cluster === "mobilitaet" && /beleg|bon|quittung/i.test(d.doc_type ?? ""));
    const seen = new Set<string>();
    for (const d of p.docs) for (const f of d.key_facts ?? []) {
      if (!isIdFact(f) || !f.value?.trim()) continue;
      const k = `${f.label.toLowerCase()}|${f.value.replace(/\s/g, "")}`;
      if (seen.has(k)) continue;
      seen.add(k);
      p.ids.push({ label: f.label, value: f.value, docId: d.id, docTitle: d.title ?? d.file_name, date: dateOf(d) });
    }
  }
  return [...map.values()].sort((a, b) => Number(b.active) - Number(a.active) || b.last.localeCompare(a.last));
}
