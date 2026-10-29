import { caseIds } from "@/lib/dupes";
import { partnerKey } from "@/lib/partners";
import type { Doc } from "@/lib/types";

const PAYDOC = /rechnung|mahnung|zahlungserinnerung|forderung|abschlag|bescheid|kosten|zahlschein/i;
const dOf = (x: Doc) => Date.parse(x.doc_date ?? x.received_at);

/**
 * Andere Schreiben zum selben Zahlungs-Vorgang: gleicher Absender, Rechnung/Mahnung/Forderung,
 * nah beieinander (≤ 200 Tage); ein anderes Aktenzeichen/eine andere Rechnungsnummer = anderer Vorgang.
 * Neueste zuerst.
 */
export function relatedPayDocs(doc: Doc, all: Doc[]): Doc[] {
  if (!doc.sender || !PAYDOC.test(`${doc.doc_type} ${doc.title}`)) return [];
  const mine = caseIds(doc);
  const otherCase = (x: Doc) => caseIds(x).some((c) => mine.some((m) => m.kind === c.kind && m.value.replace(/\W/g, "") !== c.value.replace(/\W/g, "")));
  return all
    .filter((x) => x.id !== doc.id && !x.archived && x.sender && partnerKey(x.sender) === partnerKey(doc.sender!) && PAYDOC.test(`${x.doc_type} ${x.title}`) && Math.abs(dOf(x) - dOf(doc)) < 200 * 86_400_000 && !otherCase(x))
    .sort((a, b) => dOf(b) - dOf(a));
}
