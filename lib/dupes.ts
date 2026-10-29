import { partnerKey } from "@/lib/partners";
import type { Doc } from "@/lib/types";

/** Doppelte Briefe finden: gleiche Datei oder gleicher Inhalt (nicht nur gleiche Kennung) */
export type DupGroup = { key: string; docs: Doc[]; sure: boolean; why: string };

const words = (s: string) => new Set(s.toLowerCase().normalize("NFKD").replace(/[^\p{L}\p{N}\s]/gu, " ").split(/\s+/).filter((w) => w.length >= 3));
function sim(a: string, b: string) {
  const A = words(a), B = words(b);
  if (!A.size || !B.size) return 0;
  let n = 0; for (const w of A) if (B.has(w)) n++;
  return n / Math.min(A.size, B.size);
}
const amountsOf = (d: Doc) => new Set([...(d.amounts ?? []).map((a) => a.value.toFixed(2)), ...[...(d.title ?? "").matchAll(/(\d{1,3}(?:\.\d{3})*,\d{2})/g)].map((m) => Number(m[1].replace(/\./g, "").replace(",", ".")).toFixed(2))].filter((v) => Number(v) > 0));
const days = (a: string, b: string) => Math.abs(Date.parse(a) - Date.parse(b)) / 86_400_000;

/** Fall-Kennungen: was einen Vorgang eindeutig macht (Aktenzeichen, Rechnungsnummer, Kassenzeichen, Kennzeichen …) */
const CASE = /(akten|kassen|geschäfts|tat|verwarnungs)zeichen|rechnungs-?\s?(nummer|nr)|beleg-?\s?(nummer|nr)|vorgangs|bescheid-?\s?(nummer|nr)|fall-?\s?(nummer|nr)|mahn-?\s?(nummer|nr)|buchungs-?\s?(nummer|nr|code)|bestell-?\s?(nummer|nr)|auftrags-?\s?(nummer|nr)|ticket-?\s?(nummer|nr)|schaden-?\s?(nummer|nr)|kfz-?kennzeichen|amtliches kennzeichen/i;
const caseKind = (label: string) => label.toLowerCase().match(CASE)?.[0].replace(/[-\s]/g, "").replace(/nr$/, "nummer") ?? "";
const norm = (v: string) => v.toLowerCase().replace(/[^a-z0-9äöü]/g, "");
export function caseIds(d: Doc) {
  const out: { label: string; value: string; kind: string }[] = [];
  for (const f of d.key_facts ?? []) {
    const kind = caseKind(f.label);
    if (kind && norm(f.value).length >= 4 && !out.some((x) => x.kind === kind && norm(x.value) === norm(f.value))) out.push({ label: f.label, value: f.value.trim(), kind });
  }
  return out;
}

/**
 * Inhalt vergleichen statt nur Kennungen: Zahlen (Beträge, Nummern – ohne Datumsangaben) und die Zusammenfassung.
 * Gleicher Inhalt = doppelt, auch wenn nur das Datum abweicht (derselbe Brief erneut zugeschickt).
 */
const DATE_RE = /\b\d{4}-\d{2}-\d{2}\b|\b\d{1,2}\.\d{1,2}\.(\d{4}|\d{2})\b|\b\d{1,2}\/\d{2,4}\b/g;
/** Zahlen und Nummern aus Angaben und Zusammenfassung (Beträge, Kennungen) – Datumsangaben herausgenommen */
function numbersOf(d: Doc) {
  const text = [...(d.key_facts ?? []).map((f) => f.value), d.summary ?? ""].join(" ").replace(DATE_RE, " ");
  const out = new Set<string>();
  for (const t of text.match(/[A-Za-z0-9][A-Za-z0-9./-]*\d[A-Za-z0-9./,-]*/g) ?? []) {
    const v = t.toLowerCase().replace(/[.,-]$/, "").replace(/(\d)[.](?=\d{3}\b)/g, "$1").replace(",", ".");
    if (v.replace(/\D/g, "").length >= 2) out.add(v);
  }
  return out;
}
/** 0…1: wie gleich ist der Inhalt? overlap = Zahlen des kleineren im größeren (eines hat evtl. mehr Seiten) */
export function contentSim(a: Doc, b: Doc) {
  const A = numbersOf(a), B = numbersOf(b);
  let n = 0; for (const x of A) if (B.has(x)) n++;
  const enough = A.size >= 3 && B.size >= 3;
  return {
    overlap: enough ? n / Math.min(A.size, B.size) : undefined,
    jaccard: enough ? n / (A.size + B.size - n) : undefined,
    text: sim(a.summary ?? a.title ?? "", b.summary ?? b.title ?? ""),
  };
}

function pair(a: Doc, b: Doc): { sure: boolean; why: string } | null {
  if (a.status !== "ready" || b.status !== "ready" || a.encrypted || b.encrypted) return null;
  if (a.split_from && a.split_from === b.split_from) return null; // Teile derselben getrennten PDF
  // Fall-Kennungen: gleiche Art (z. B. Aktenzeichen), anderer Wert → anderer Vorgang, nie doppelt
  const ia = caseIds(a), ib = caseIds(b);
  const shared = ia.find((x) => ib.some((y) => norm(y.value) === norm(x.value)));
  const conflict = !shared && ia.some((x) => ib.some((y) => y.kind === x.kind && norm(y.value) !== norm(x.value)));
  if (conflict) return null;
  const sameDate = !!a.doc_date && a.doc_date === b.doc_date;
  const bothDated = !!a.doc_date && !!b.doc_date;
  if (a.size_bytes === b.size_bytes && a.mime_type === b.mime_type && a.size_bytes > 0) return { sure: true, why: "identische Datei zweimal hochgeladen" };
  if (!a.sender || !b.sender || (partnerKey(a.sender) !== partnerKey(b.sender) && !(a.sender_domain && a.sender_domain === b.sender_domain))) return null;
  const c = contentSim(a, b);
  const sameType = (a.doc_type ?? "").toLowerCase() === (b.doc_type ?? "").toLowerCase();
  const titleSim = sim(a.title ?? "", b.title ?? "");
  // 1) Inhalt gleich: (fast) alle Zahlen des einen stecken im anderen, Text passt grob – sonst bei wenig Zahlen Text + Titel + Art
  const equal = c.overlap !== undefined ? c.overlap >= 0.85 && c.text >= 0.25 : c.text >= 0.7 && titleSim >= 0.5 && sameType;
  if (equal) {
    const partial = c.jaccard !== undefined && c.jaccard < 0.8;
    if (!sameDate && bothDated) return { sure: false, why: `gleicher Inhalt, nur anderes Datum (${a.doc_date!.split("-").reverse().join(".")} / ${b.doc_date!.split("-").reverse().join(".")}) – wohl erneut zugeschickt` };
    return partial ? { sure: false, why: "gleicher Inhalt – eines enthält mehr Seiten/Angaben" } : { sure: true, why: "gleicher Inhalt (Beträge, Nummern, Text)" };
  }
  // 2) unsicher (ähnlich): dann entscheiden Kennung und Datum
  const similar = (c.overlap !== undefined && c.overlap >= 0.6) || c.text >= 0.6;
  if (similar && shared && (sameDate || !bothDated)) return { sure: false, why: `ähnlicher Inhalt, gleiche Kennung (${shared.label} ${shared.value})${sameDate ? " und gleiches Datum" : ""}` };
  // gleiche Kennung allein reicht nicht – z. B. Rechnung und Mahnung zum selben Vorgang
  return null;
}

/** Erklärung für eine Gruppe: was ist gleich, worin unterscheiden sie sich (Datei, Datum, Bereich) */
export function explain(g: DupGroup) {
  const d0 = g.docs[0];
  const dates = [...new Set(g.docs.map((d) => d.doc_date ?? "ohne Datum"))];
  const kinds = g.docs.map((d) => (d.mime_type.startsWith("image/") ? "Foto" : d.mime_type === "application/pdf" ? "PDF" : "Datei"));
  return {
    sender: d0.sender ?? "",
    date: dates.length === 1 ? dates[0] : null,
    dates,
    files: kinds.join(" + "),
    amount: [...amountsOf(d0)].find((v) => g.docs.every((d) => amountsOf(d).has(v))),
  };
}

export function findDuplicates(docs: Doc[], dismissed: string[] = []): DupGroup[] {
  const list = docs.filter((d) => !d.archived);
  const parent = new Map<string, string>();
  const find = (x: string): string => { const p = parent.get(x) ?? x; if (p === x) return x; const r = find(p); parent.set(x, r); return r; };
  const reasons = new Map<string, { sure: boolean; why: string }>();
  for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
    const a = list[i], b = list[j];
    const k = [a.id, b.id].sort().join("|");
    if (dismissed.includes(k)) continue;
    const r = pair(a, b);
    if (!r) continue;
    parent.set(find(a.id), find(b.id));
    reasons.set(k, r);
  }
  const groups = new Map<string, Doc[]>();
  for (const d of list) if (parent.has(d.id) || [...parent.values()].includes(d.id)) { const r = find(d.id); groups.set(r, [...(groups.get(r) ?? []), d]); }
  return [...groups.values()].filter((g) => g.length > 1).map((g) => {
    const rs = [...reasons.entries()].filter(([k]) => g.some((d) => k.includes(d.id))).map(([, r]) => r);
    return { key: g.map((d) => d.id).sort().join("|"), docs: [...g].sort((x, y) => keepScore(y) - keepScore(x)), sure: rs.some((r) => r.sure), why: rs.find((r) => r.sure)?.why ?? rs[0]?.why ?? "" };
  });
}

/** Welches Dokument behalten? Das mit den meisten Angaben, dann PDF vor Foto, dann das neuere */
export function keepScore(d: Doc) {
  return (d.key_facts?.length ?? 0) * 10 + (d.deadlines?.length ?? 0) * 3 + (d.mime_type === "application/pdf" ? 5 : 0) + (d.doc_date ? 2 : 0);
}

/** alle Paare einer Gruppe als „verschieden“ merken */
export const pairKeys = (g: DupGroup) => g.docs.flatMap((a, i) => g.docs.slice(i + 1).map((b) => [a.id, b.id].sort().join("|")));
