/** Kurze Erklärung, was für ein Dokument das ist und wofür man es braucht (für die Dokumentansicht) */
const TYPES: [RegExp, string][] = [
  [/gehalt|entgelt|lohnabrechnung|bezüge/i, "Gehaltsabrechnung: zeigt, was du im Monat brutto verdient hast, was für Steuer und Sozialversicherung abgezogen wurde und was auf dein Konto kam."],
  [/lohnsteuerbescheinigung/i, "Lohnsteuerbescheinigung: Jahreswerte deines Arbeitgebers für die Steuererklärung – Bruttolohn und einbehaltene Steuern."],
  [/arbeitsvertrag/i, "Arbeitsvertrag: regelt Tätigkeit, Gehalt, Arbeitszeit, Urlaub und Kündigungsfristen."],
  [/zeugnis/i, "Arbeitszeugnis: Bewertung deiner Arbeit – wichtig für Bewerbungen."],
  [/mahnung/i, "Mahnung: eine Zahlung ist überfällig. Bis zur Frist zahlen oder widersprechen, sonst drohen Gebühren."],
  [/rechnung/i, "Rechnung: Forderung über einen Betrag – wichtig sind Betrag, Zahlungsziel und ob sie steuerlich absetzbar ist."],
  [/kassenbon|beleg|quittung/i, "Kaufbeleg: Nachweis für Garantie, Umtausch und Steuer."],
  [/angebot|kostenvoranschlag/i, "Angebot: noch unverbindlich – achte auf Gültigkeit und Preis."],
  [/mietvertrag/i, "Mietvertrag: Miete, Nebenkosten, Kaution und Kündigungsfristen deiner Wohnung."],
  [/nebenkosten/i, "Nebenkostenabrechnung: jährliche Abrechnung der Betriebskosten – prüfen, Nachzahlung oder Guthaben."],
  [/versicherungsschein|police|versicherung/i, "Versicherung: was versichert ist, Beitrag, Laufzeit und wann du kündigen kannst."],
  [/arztbrief|befund|labor/i, "Befund: Ergebnis einer Untersuchung – Diagnose, Werte und Empfehlungen."],
  [/rezept/i, "Rezept: verordnetes Medikament mit Dosierung."],
  [/steuerbescheid/i, "Steuerbescheid: Ergebnis deiner Steuererklärung – Erstattung oder Nachzahlung, Einspruch innerhalb eines Monats."],
  [/vertrag|abo|mitglied/i, "Vertrag: Leistung, Kosten, Laufzeit und Kündigungsfrist."],
  [/bußgeld|verwarnung|strafzettel/i, "Bußgeld: Verstoß mit Betrag und Zahlungsfrist – fristgerecht zahlen oder Einspruch einlegen."],
  [/kredit|darlehen/i, "Kredit: Betrag, Rate, Laufzeit und Restschuld."],
  [/ausweis|pass/i, "Ausweisdokument: Nummer und Gültigkeit."],
];

export function explainDoc(docType?: string | null, title?: string | null) {
  const s = `${docType ?? ""} ${title ?? ""}`;
  return TYPES.find(([re]) => re.test(s))?.[1];
}

/** Persönliche Daten und Kennungen ans Ende, Inhalte (Beträge, Leistungen, Fristen) nach vorn */
export const groupRank = (g: string) => (/persönlich|personal|kontakt/i.test(g) ? 3 : /kennung|nummer/i.test(g) ? 2 : 0);
