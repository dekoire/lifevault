import type { Doc } from "@/lib/types";

/**
 * Wie heikel ist ein Dokument? Maßstab: Schadet es mir, wenn ein Fremder es liest?
 * - hoch: Befunde/Diagnosen über mich, Zugangsdaten zu Bank/Behörde/Gesundheitsakte, Ausweiskopien
 * - mittel: Gehalt, Steuer-ID, Sozialversicherungsnummer
 * Nicht heikel: IBAN, Rechnungen, Mahnungen, Bußgelder, Datenschutz-Hinweise – auch wenn darin „Gesundheit“ vorkommt,
 * und Zugangscodes für harmlose Portale (z. B. Online-Anhörung der Bußgeldstelle).
 */
type Rule = { re: RegExp; label: string; level: "hoch" | "mittel"; where: "type" | "facts" | "all" };
const RULES: Rule[] = [
  // Befunde über mich – nur am Dokumenttyp/Titel, nicht an einzelnen Wörtern im Text
  { re: /arztbrief|befund|krankenakte|anamnese|schlaf(frage)?bogen|epworth|diagnose|entlass|op-?bericht|operationsbericht|labor|spermiogramm|attest|therapie(plan|bericht)|psycho|gutachten.*(medizin|ärzt)|(medizin|ärzt).*gutachten|impfpass|medikationsplan|rezept|arbeitsunfähigkeit|au-bescheinigung|krankmeldung|gesundheitsfragen|schwerbehinder/i, label: "Gesundheitsdaten über dich", level: "hoch", where: "type" },
  { re: /personalausweis|reisepass|ausweiskopie|aufenthaltstitel|führerschein(kopie)?$/i, label: "Ausweisdaten", level: "hoch", where: "type" },
  { re: /kreditkarte.*(prüfnummer|cvc|cvv)|kartenprüfnummer/i, label: "Kreditkartendaten", level: "hoch", where: "facts" },
  { re: /gehalt|entgelt|lohnabrechnung|bezüge|verdienstbescheinigung/i, label: "Gehalt", level: "mittel", where: "type" },
  { re: /steuer-?id|identifikationsnummer/i, label: "Steuer-ID", level: "mittel", where: "facts" },
  { re: /sozialversicherungsnummer|sv-?nummer|rentenversicherungsnummer/i, label: "Sozialversicherungsnummer", level: "mittel", where: "facts" },
];
// Zugangsdaten zählen nur, wenn sie zu etwas Wichtigem gehören (Bank, Behörden-Login, Gesundheitsakte, E-Mail …)
const SECRET = /\b(pin|puk|tan|passwort|kennwort|zugangsdaten|aktivierungscode|freischaltcode|zugangscode|initialpasswort)\b/i;
const VALUABLE = /bank|sparkasse|volksbank|konto|kredit|depot|broker|paypal|elster|finanzamt|online-?ausweis|eid|personalausweis|e-?patientenakte|\bepa\b|krankenkasse|e-?mail|versicherung|rentenversicherung/i;
// Schreiben, bei denen „Gesundheit“ o. ä. nur am Rand vorkommt
const HARMLESS = /\b(rechnung|mahnung|kostenbescheid|bußgeld|anhörung|datenschutz|datenverarbeitung|einwilligung|information|hinweis|newsletter|werbung|angebot|beitrags|mitgliedschaft|kündigung|terminbestätigung|termin(erinnerung)?$)/i;

export function sensitivity(d: Pick<Doc, "cluster" | "doc_type" | "title" | "key_facts"> & Partial<Pick<Doc, "sender">>) {
  const type = [d.doc_type, d.title].filter(Boolean).join(" ");
  // Gläubiger-ID im SEPA-Mandat ist keine Steuer-ID
  const facts = (d.key_facts ?? []).map((f) => f.label).filter((l) => !/gläubiger|mandat/i.test(l)).join(" ");
  const harmless = HARMLESS.test(d.doc_type ?? "");
  const found = new Map<string, "hoch" | "mittel">();
  for (const r of RULES) {
    const text = r.where === "type" ? type : r.where === "facts" ? facts : `${type} ${facts}`;
    if (!r.re.test(text)) continue;
    if (harmless && r.where === "type") continue;
    found.set(r.label, r.level);
  }
  if (SECRET.test(`${facts} ${type}`) && VALUABLE.test(`${type} ${d.sender ?? ""} ${facts}`) && !/bußgeld|anhörung|ordnungsamt|parkraum/i.test(`${type} ${d.sender ?? ""}`)) found.set("Zugangsdaten (PIN/Passwort)", "hoch");
  const reasons = [...found.keys()];
  const level = [...found.values()].includes("hoch") ? "hoch" : reasons.length ? "mittel" : "gering";
  return { level, reasons } as { level: "hoch" | "mittel" | "gering"; reasons: string[] };
}
