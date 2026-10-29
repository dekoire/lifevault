import { paymentOf, type Payment } from "@/lib/actions";
import { partnerKey } from "@/lib/partners";
import type { Doc } from "@/lib/types";

/**
 * Steht in einem Schreiben keine IBAN (z. B. Mahnung ohne Bankdaten), die zuletzt bekannte Bankverbindung
 * desselben Absenders – mit dem Dokument, aus dem sie stammt, damit man es wiederfindet.
 */
export function lastPayment(doc: Doc, all: Doc[]): { payment: Payment; source: Doc } | undefined {
  if (!doc.sender) return undefined;
  const key = partnerKey(doc.sender);
  // gleicher Absender: gleicher Schlüssel oder gleiche Web-Domain („EnBW“ = „EnBW Energie Baden-Württemberg AG“, beide enbw.com)
  const same = (d: Doc) => partnerKey(d.sender!) === key || (!!doc.sender_domain && d.sender_domain === doc.sender_domain);
  const date = (d: Doc) => d.doc_date ?? d.received_at.slice(0, 10);
  return all
    .filter((d) => d.id !== doc.id && d.status === "ready" && !d.encrypted && d.sender && same(d))
    .map((d) => ({ payment: paymentOf(d), source: d }))
    .filter((x): x is { payment: Payment; source: Doc } => !!x.payment)
    .sort((a, b) => date(b.source).localeCompare(date(a.source)))[0];
}
