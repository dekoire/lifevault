import { CLUSTERS } from "@/lib/clusters";
import { KINDS, kindOf } from "@/lib/kinds";
import { partnerKey } from "@/lib/partners";

/**
 * Welche Dokumente braucht eine Frage? Ohne KI (sofort, kostenlos): Bereich, Dokumentart und genannte Partner aus der Frage.
 * Ergebnis steuert, welche Dokumente der Chat ausführlich sieht – alle anderen bekommt er nur als Kurzliste (Titel), damit nichts verloren geht.
 */
const CLUSTER_WORDS: Record<string, RegExp> = {
  gesundheit: /arzt|ärzt|befund|krank|klinik|praxis|rezept|diagnos|therap|medikament|impf|zahn|operation|blut|labor|gesund/,
  rechnungen: /rechnung|mahnung|offen|bezahl|zahlung|forderung|inkasso|fällig|schuld/,
  belege: /beleg|kassenbon|quittung|gekauft|einkauf|bestellung|garantie|gewährleistung|tank/,
  vertraege: /vertrag|verträge|abo|kündig|handy|mobilfunk|internet|strom|gas|mitglied|fitness|tarif|laufzeit/,
  arbeit: /arbeit|gehalt|lohn|urlaub|arbeitgeber|zeugnis|überstunden|tarif|kündigungsfrist|probezeit|bonus|betriebszugehörig|personal/,
  versicherungen: /versicher|police|schaden|haftpflicht|rechtsschutz|beitrag|krankenkasse|kasko/,
  wohnen: /wohnung|miete|vermieter|nebenkosten|heizung|wohnen|hausverwaltung|kaution|handwerker|weg\b/,
  steuer: /steuer|finanzamt|behörde|amt\b|bescheid|rundfunk|elster|lohnsteuer|bußgeld/,
  mobilitaet: /auto|fahrzeug|kfz|werkstatt|tüv|führerschein|ticket|bahn|strafzettel|blitzer|leasing|parken/,
  finanzen: /bank|konto|kredit|depot|sparen|girokonto|überweisung|iban|zinsen|karte/,
  angebote: /angebot|kostenvoranschlag|preisliste/,
  persoenlich: /ausweis|pass\b|reisepass|urkunde|geburt|heirat|meldebescheinigung|zeugnis|aufenthalt/,
};

type D = { id: string; cluster: string | null; doc_type: string | null; title: string | null; sender: string | null };

export function routeQuestion(question: string, docs: D[]) {
  const q = question.toLowerCase();
  const clusters = new Set(CLUSTERS.filter((c) => CLUSTER_WORDS[c.id]?.test(q)).map((c) => c.id as string));
  // Dokumentarten nur bei klaren Wörtern (sonst passt „Schreiben“ immer)
  const kinds = new Set(KINDS.slice(0, -1).filter((k) => k.re.test(q)).map((k) => k.id as string));
  // Partner, deren Name (ein markantes Wort) in der Frage steht
  const words = new Set(q.split(/[^\p{L}\p{N}]+/u).filter((w) => w.length >= 2));
  const partners = new Set(docs.filter((d) => d.sender && partnerKey(d.sender).split("-").some((w) => (w.length >= 3 || /\d/.test(w)) && words.has(w))).map((d) => partnerKey(d.sender!)));
  const matched = docs.filter((d) => (d.cluster && clusters.has(d.cluster)) || kinds.has(kindOf(d).id) || (d.sender && partners.has(partnerKey(d.sender))));
  return { clusters: [...clusters], kinds: [...kinds], partners: [...partners], ids: new Set(matched.map((d) => d.id)), general: !clusters.size && !kinds.size && !partners.size };
}
