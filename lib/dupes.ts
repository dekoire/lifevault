import { partnerKey } from "@/lib/partners";
import type { Doc } from "@/lib/types";

/** Doppelte Briefe finden: gleiche Datei, oder gleicher Absender + Datum + fast gleicher Titel, oder gleicher Absender + Art + Betrag */
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

function pair(a: Doc, b: Doc): { sure: boolean; why: string } | null {
  if (a.status !== "ready" || b.status !== "ready" || a.encrypted || b.encrypted) return null;
  if (a.split_from && a.split_from === b.split_from) return null; // Teile derselben getrennten PDF
  const ta = a.title ?? a.file_name, tb = b.title ?? b.file_name;
  if (a.size_bytes === b.size_bytes && a.mime_type === b.mime_type && a.size_bytes > 0) return { sure: true, why: "gleiche Datei" };
  if (!a.sender || !b.sender || partnerKey(a.sender) !== partnerKey(b.sender)) return null;
  const s = sim(ta, tb);
  if (a.doc_date && a.doc_date === b.doc_date && s >= 0.6) return { sure: true, why: "gleicher Absender, gleiches Datum, gleicher Titel" };
  const shared = [...amountsOf(a)].some((v) => amountsOf(b).has(v));
  const sameType = (a.doc_type ?? "").toLowerCase() === (b.doc_type ?? "").toLowerCase();
  const near = a.doc_date && b.doc_date ? days(a.doc_date, b.doc_date) <= 14 : days(a.received_at, b.received_at) <= 30;
  if (sameType && shared && near) return { sure: false, why: "gleicher Absender und Betrag" };
  if (a.doc_date && a.doc_date === b.doc_date && sameType && s >= 0.4) return { sure: false, why: "gleicher Absender, gleiches Datum" };
  return null;
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
