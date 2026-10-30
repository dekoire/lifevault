import { partnerKey } from "@/lib/partners";

/**
 * Alterung: Was ist nicht mehr relevant? Feste, nachvollziehbare Regeln (ohne KI), laufen auf dem Server
 * (Mail-Job alle 15 Min., /api/age beim Öffnen der App, nach „Alle neu bewerten“):
 * 1. Rechnung, Mahnung, Abrechnung älter als 12 Monate ohne offene Frist → erledigt (vermutlich bezahlt)
 * 2. Kassenbon/Kaufbeleg älter als 24 Monate → Garantie abgelaufen
 * 3. Änderung (z. B. Beitragsanpassung), die durch eine neuere Änderung derselben Grundlage überholt ist
 * 4. Reine Info/Werbung (Nebensache) älter als 3 Monate – Versicherungsbedingungen/AGB bleiben (darin steht, was gilt)
 * 5. Früherer Arbeitgeber: letzte Post älter als 18 Monate und es gibt einen neueren Arbeitgeber – auch der
 *    Arbeitsvertrag (Zeugnis, Lohnsteuerbescheinigung, Renten-/SV-Nachweise bleiben). Arbeitgeber ist nur, wer
 *    Vertrag, Gehalt oder Personalunterlagen geschickt hat – Gewerkschaft, Tarifverträge, Betriebsvereinbarungen nie
 * Nie: Medizinisches (Historie), Urkunden/Ausweise/Zeugnisse, Steuer- und Rentenbescheide, von dir selbst (ent)archivierte.
 */
export type AgingDoc = {
  id: string; title: string | null; doc_type: string | null; sender: string | null; cluster: string | null;
  doc_date: string | null; received_at: string; archived: boolean; archive_manual?: boolean | null;
  deadlines: { date: string }[] | null; partner_role?: string | null; basis_id?: string | null; importance?: number | null;
};
export type Verdict = { reason: string; cap: number };

const DAY = 86_400_000;
const INVOICE = /(?<!an)rechnung|mahnung|zahlungserinnerung|zahlungsaufforderung|abrechnung|forderung|lastschriftankündigung|beitragsrechnung/i;
const RECEIPT = /kassenbon|kaufbeleg|quittung|\bbeleg\b|bon\b/i;
const KEEP = /urkunde|ausweis|pass\b|zeugnis|testament|grundbuch|bescheid|steuer|lohnsteuer|rente|renten|sozialversicherung|police|versicherungsschein|vertrag\b|arbeitsvertrag|mietvertrag/i;
const PAYSLIP = /gehalt|entgelt|lohn|bezüge/i;
/** woran man einen Arbeitgeber erkennt – und was nie „früherer Arbeitgeber“ ist (gilt für den aktuellen Job weiter) */
const EMPLOYER = /arbeitsvertrag|anstellung|entgelt|gehalt|lohnabrechnung|verdienst|personal|arbeitszeugnis|kündigung des arbeitsverhältnis/i;
const COLLECTIVE = /tarifvertrag|manteltarif|entgelttarif|betriebsvereinbarung|gewerkschaft|ig metall|verdi|ver\.di/i;
export const FORMER_EMPLOYER = "Früherer Arbeitgeber – nicht mehr aktuell";
const AGE_OF = (d: AgingDoc) => d.doc_date ?? d.received_at.slice(0, 10);

export function agingVerdicts(docs: AgingDoc[], today = new Date().toISOString().slice(0, 10)): Map<string, Verdict> {
  const out = new Map<string, Verdict>();
  const ageDays = (d: AgingDoc) => Math.round((Date.parse(today) - Date.parse(AGE_OF(d))) / DAY);
  const open = (d: AgingDoc) => (d.deadlines ?? []).some((x) => x.date >= today);
  const text = (d: AgingDoc) => `${d.doc_type ?? ""} ${d.title ?? ""}`;
  // neueste Arbeitgeber-Post je Partner (Regel 5)
  const lastWork = new Map<string, string>();
  const employers = new Set(docs.filter((d) => d.cluster === "arbeit" && d.sender && EMPLOYER.test(text(d)) && !COLLECTIVE.test(`${text(d)} ${d.sender}`)).map((d) => partnerKey(d.sender!)));
  for (const d of docs) if (d.cluster === "arbeit" && d.sender && employers.has(partnerKey(d.sender))) { const k = partnerKey(d.sender); if (AGE_OF(d) > (lastWork.get(k) ?? "")) lastWork.set(k, AGE_OF(d)); }
  const newestWork = [...lastWork.values()].sort().pop() ?? "";
  for (const d of docs) {
    if (d.archived || d.archive_manual || d.cluster === "gesundheit") continue;
    const t = text(d);
    const age = ageDays(d);
    // 5. früherer Arbeitgeber (auch der Arbeitsvertrag; Zeugnis, Lohnsteuer- und Rentennachweise bleiben)
    if (d.cluster === "arbeit" && d.sender && employers.has(partnerKey(d.sender)) && !COLLECTIVE.test(t) && !/zeugnis|lohnsteuer|rente|bescheinigung|sozialversicherung/i.test(t)) {
      const last = lastWork.get(partnerKey(d.sender)) ?? "";
      if (last && newestWork > last && (Date.parse(today) - Date.parse(last)) / DAY > 548) { out.set(d.id, { reason: FORMER_EMPLOYER, cap: 2 }); continue; }
    }
    // 4. reine Info/Werbung (Bedingungen, AGB, Tarifinfos bleiben – darin steht, was gilt)
    if ((d.partner_role === "nebensache" || d.importance === 1) && age > 90 && !/bedingung|avb|agb|tarif|produktinformation|leistungsbeschreibung/i.test(t)) { out.set(d.id, { reason: "Nur zur Info – älter als 3 Monate", cap: 1 }); continue; }
    if (KEEP.test(t) && !INVOICE.test(t)) continue;
    // 1. alte Rechnungen
    if (INVOICE.test(t) && !PAYSLIP.test(t) && age > 365 && !open(d)) { out.set(d.id, { reason: "Rechnung älter als 1 Jahr – erledigt (vermutlich bezahlt)", cap: 2 }); continue; }
    // 2. alte Kaufbelege
    if (RECEIPT.test(t) && age > 730) { out.set(d.id, { reason: "Kaufbeleg älter als 2 Jahre – Garantie abgelaufen", cap: 1 }); continue; }
    // 3. überholte Änderung derselben Grundlage
    if (d.partner_role === "aenderung" && d.sender) {
      const k = partnerKey(d.sender);
      const newer = docs.find((x) => x.id !== d.id && x.partner_role === "aenderung" && x.sender && partnerKey(x.sender) === k && (x.basis_id ?? "") === (d.basis_id ?? "") && AGE_OF(x) > AGE_OF(d));
      if (newer && !open(d)) { out.set(d.id, { reason: `Überholt durch neuere Änderung vom ${AGE_OF(newer).split("-").reverse().join(".")}`, cap: 2 }); continue; }
    }
  }
  return out;
}
