/** Cluster (Überkategorien): jedes Dokument landet in genau einem – die Feinheiten stehen in Schlagworten und Key-Fakten. */
export const CLUSTERS = [
  { id: "gesundheit", label: "Gesundheit", hint: "Befunde, Arztbriefe, Rezepte, Krankenkasse", color: "#e3173e" },
  { id: "rechnungen", label: "Rechnungen & Mahnungen", hint: "offene Rechnungen, Mahnungen, Zahlungsaufforderungen", color: "#d97706" },
  { id: "belege", label: "Kaufbelege", hint: "Kassenbons, Quittungen, Tankbelege, Bestellungen", color: "#1f9688" },
  { id: "vertraege", label: "Verträge", hint: "Handy, Internet, Strom, Abos, Mitgliedschaften", color: "#6d4aff" },
  { id: "arbeit", label: "Arbeit & Gehalt", hint: "Arbeitsvertrag, Gehaltsabrechnungen, Zeugnisse", color: "#2563eb" },
  { id: "versicherungen", label: "Versicherungen", hint: "Policen, Beitragsrechnungen, Schadensfälle", color: "#0891b2" },
  { id: "wohnen", label: "Wohnen", hint: "Mietvertrag, Nebenkosten, Handwerker", color: "#65a30d" },
  { id: "steuer", label: "Steuer & Behörden", hint: "Steuerbescheide, Ämter, Rundfunkbeitrag", color: "#475569" },
  { id: "mobilitaet", label: "Auto & Mobilität", hint: "Fahrzeugschein, Werkstatt, Tickets, Strafzettel", color: "#7c3aed" },
  { id: "finanzen", label: "Bank & Finanzen", hint: "Kontoauszüge, Kredite, Depot, Sparen", color: "#0f766e" },
  { id: "angebote", label: "Angebote", hint: "Kostenvoranschläge, Angebote, Preislisten", color: "#c026d3" },
  { id: "persoenlich", label: "Ausweise & Persönliches", hint: "Ausweis, Urkunden, Zeugnisse, Bescheinigungen", color: "#be185d" },
  { id: "sonstiges", label: "Sonstiges", hint: "alles andere", color: "#767676" },
] as const;

export type ClusterId = (typeof CLUSTERS)[number]["id"];
export const CLUSTER_IDS = CLUSTERS.map((c) => c.id) as [ClusterId, ...ClusterId[]];
export const clusterOf = (id?: string | null) => CLUSTERS.find((c) => c.id === id) ?? CLUSTERS[CLUSTERS.length - 1];
