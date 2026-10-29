import { paymentOf } from "@/lib/actions";
import { caseIds } from "@/lib/dupes";
import type { Doc } from "@/lib/types";

const REF_ID = /kunden-?\s?(nummer|nr)|vertrags-?\s?(nummer|nr)|mitglieds-?\s?(nummer|nr)|versicherungs(schein)?-?\s?(nummer|nr)|vertragskonto|zählpunkt/i;
const flat = (s: string) => s.replace(/\s/g, "").toLowerCase();

/**
 * Verwendungszweck für die Überweisung:
 * 1. steht im Schreiben → genau den
 * 2. der von der letzten Zahlung kommt auch in diesem Schreiben vor (z. B. Vertragskonto) → den
 * 3. sonst Vorschlag aus Name + Kunden-/Vertrags-/Rechnungsnummer
 */
export function purposeFor(d: Doc, name: string, lastRef?: string): { text: string; given: boolean; note?: string } {
  const p = paymentOf(d);
  if (p?.reference) return { text: p.reference, given: true };
  if (lastRef && flat(lastRef).length >= 5 && flat(`${d.full_text ?? ""} ${(d.key_facts ?? []).map((f) => f.value).join(" ")}`).includes(flat(lastRef)))
    return { text: lastRef, given: true, note: "wie zuletzt – steht auch in diesem Schreiben" };
  const parts = [name, ...caseIds(d).slice(0, 2).map((c) => `${c.label} ${c.value}`), ...(d.key_facts ?? []).filter((f) => REF_ID.test(f.label)).slice(0, 1).map((f) => `${f.label} ${f.value}`)].filter(Boolean);
  return { text: [...new Set(parts)].join(", ").slice(0, 140), given: false };
}
