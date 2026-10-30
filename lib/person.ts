import type { Doc } from "@/lib/types";

/** Feste Felder des Steckbriefs und woran man sie in den Fakten erkennt */
const FIELDS: { id: string; label: string; re: RegExp; personalOnly?: boolean; multi?: boolean }[] = [
  { id: "name", label: "Name", re: /^(name|vor-? ?und nachname|vollständiger name|mitarbeiter(in)?|arbeitnehmer(in)?|versicherte[rn]?|patient(in)?|kunde|kundin)$/i, personalOnly: true },
  { id: "birth", label: "Geburtsdatum", re: /geburts(datum|tag)|geb\.?$|geboren/i },
  { id: "address", label: "Adresse", re: /^(adresse|anschrift|wohnanschrift|wohnort|straße)/i, personalOnly: true },
  { id: "taxid", label: "Steuer-ID", re: /steuer-?id|steuerliche identifikationsnummer|identifikationsnummer|\bidnr\b/i },
  { id: "taxclass", label: "Steuerklasse", re: /^steuerklasse/i },
  { id: "sv", label: "SV-Nummer", re: /sv-?nummer|sozialversicherungs-?nummer|rentenversicherungs-?nummer|\brvnr\b/i },
  { id: "kk", label: "Krankenkasse", re: /^krankenkasse|^krankenversicherung$/i },
  { id: "kvnr", label: "Versichertennr.", re: /versichertennummer|krankenversichertennummer|kv-?nummer/i },
  { id: "employer", label: "Arbeitgeber", re: /^arbeitgeber$/i },
  { id: "staffno", label: "Personalnummer", re: /personalnummer|pers\.-?nr/i },
  { id: "church", label: "Konfession", re: /konfession|religion|kirchensteuermerkmal/i },
  { id: "marital", label: "Familienstand", re: /familienstand/i },
  { id: "phone", label: "Telefon", re: /^(telefon|handy|mobil(nummer)?|rufnummer)$/i, personalOnly: true, multi: true },
  { id: "email", label: "E-Mail", re: /^e-?mail/i, personalOnly: true, multi: true },
  { id: "iban", label: "IBAN", re: /\biban\b/i, multi: true },
];

export type PersonValue = { value: string; date: string; docId: string; docTitle: string };
export type PersonField = { id: string; label: string; current: PersonValue[]; earlier: PersonValue[] };

const dateOf = (d: Doc) => d.doc_date ?? d.received_at.slice(0, 10);
const norm = (v: string) => v.toLowerCase().replace(/\s+/g, "");

/** Steckbrief aus allen Dokumenten: jeweils der neueste Wert, ältere abweichende als „früher“ */
export function buildPerson(docs: Doc[]): PersonField[] {
  const ready = docs.filter((d) => d.status === "ready").sort((a, b) => dateOf(b).localeCompare(dateOf(a)));
  const out: PersonField[] = [];
  for (const f of FIELDS) {
    const vals: PersonValue[] = [];
    const seen = new Set<string>();
    for (const d of ready) for (const k of d.key_facts ?? []) {
      if (!f.re.test(k.label.trim()) || !k.value?.trim()) continue;
      // Steuer-ID hat 11 Ziffern – Gläubiger-ID (SEPA) und USt-IdNr. („DE…“) sind es nicht
      if (f.id === "taxid" && (/gläubiger|creditor|ust|umsatzsteuer/i.test(k.label) || k.value.replace(/\s/g, "").replace(/\D/g, "").length !== 11 || /[a-z]/i.test(k.value))) continue;
      // IBAN im Steckbrief nur deine eigene: Konten von Empfängern/Gläubigern gehören zum Partner, Platzhalter („noch nicht ausgefüllt“) raus
      if (f.id === "iban" && (/empf(ä|ae)nger|gl(ä|ae)ubiger|beg(ü|ue)nstigt|kreditor|stadtkasse|zahlungsziel/i.test(k.label) || !/^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$/.test(k.value.replace(/\s/g, "").toUpperCase()))) continue;
      // nur Angaben über DICH: von der KI als persönlich markiert (bzw. in der Gruppe „Persönliches“) – Kontaktdaten,
      // Konten und Nummern von Firmen, Ämtern oder anderen Personen gehören nicht in den Steckbrief
      const mine = k.personal === true || /^(persönlich|persönliche daten|personalien|zu deiner person|über dich)/i.test(k.group ?? "");
      if (!mine && f.id !== "employer" && f.id !== "kk") continue;
      if (f.personalOnly && !mine) continue;
      // Telefon/E-Mail des Absenders (Hotline, Service-Adresse) ist nie deine
      if (f.id === "email" && d.sender_domain && k.value.toLowerCase().includes(`@${d.sender_domain.toLowerCase().replace(/^www\./, "")}`)) continue;
      if (f.id === "email" && /^(info|service|kundenservice|support|kontakt|noreply|no-reply|hallo|hello|post|mail|office|team)@/i.test(k.value.trim())) continue;
      if ((f.id === "phone" || f.id === "email" || f.id === "iban") && /hotline|service|kundendienst|zentrale|fax|absender|empf(ä|ae)nger|firma|praxis|kanzlei|beh(ö|oe)rde/i.test(`${k.label} ${k.group ?? ""}`)) continue;
      if (seen.has(norm(k.value))) continue;
      seen.add(norm(k.value));
      const v = /^\d{4}-\d{2}-\d{2}$/.test(k.value.trim()) ? k.value.trim().split("-").reverse().join(".") : k.value.trim();
      vals.push({ value: v, date: dateOf(d), docId: d.id, docTitle: d.title ?? d.file_name });
    }
    // Arbeitgeber: auch aus Absender von Gehaltsabrechnungen/Arbeitsverträgen
    if (f.id === "employer") for (const d of ready.filter((x) => x.cluster === "arbeit" && x.sender)) {
      if (seen.has(norm(d.sender!))) continue;
      seen.add(norm(d.sender!));
      vals.push({ value: d.sender!, date: dateOf(d), docId: d.id, docTitle: d.title ?? d.file_name });
    }
    // Telefon, E-Mail, IBAN: deine eigenen stehen in Schreiben von mehreren Absendern – was nur bei einem
    // einzigen Absender vorkommt, ist meist dessen Nummer/Konto (Vermieter, Firma, andere Person)
    if (f.multi) {
      const senders = new Map<string, Set<string>>();
      for (const d of ready) for (const k of d.key_facts ?? []) {
        if (!f.re.test(k.label.trim()) || !k.value?.trim()) continue;
        const key = norm(k.value);
        senders.set(key, (senders.get(key) ?? new Set()).add((d.sender ?? d.id).toLowerCase()));
      }
      for (let i = vals.length - 1; i >= 0; i--) if ((senders.get(norm(vals[i].value))?.size ?? 0) < 2) vals.splice(i, 1);
    }
    if (!vals.length) continue;
    vals.sort((a, b) => b.date.localeCompare(a.date));
    out.push({ id: f.id, label: f.label, current: f.multi ? vals : vals.slice(0, 1), earlier: f.multi ? [] : vals.slice(1) });
  }
  return out;
}
