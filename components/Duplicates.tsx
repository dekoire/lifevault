"use client";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ChevronRight, Copy, FileImage, FileText, GitMerge, Loader2, X } from "lucide-react";
import { useDetail } from "@/components/DetailPanel";
import { Thumb } from "@/components/ChatWidgets";
import { CARD } from "@/components/ui";
import { usePartnerDuplicates } from "@/components/PartnerDupes";
import { caseIds, explain, findDuplicates, pairKeys, type DupGroup } from "@/lib/dupes";
import { clusterOf } from "@/lib/clusters";
import { fmtDate, useDocs } from "@/lib/docs";
import type { Doc } from "@/lib/types";

const KEY = "lifevault:not-dupes";
const load = (): string[] => { try { return JSON.parse(localStorage.getItem(KEY) ?? "[]"); } catch { return []; } };
const size = (b: number) => (b > 1024 * 1024 ? `${(b / 1024 / 1024).toFixed(1).replace(".", ",")} MB` : `${Math.round(b / 1024)} KB`);

/** gemerkte „sind verschieden“-Paare + gefundene Gruppen */
export function useDuplicates(docs: Doc[]) {
  const [dismissed, setDismissed] = useState<string[]>([]);
  useEffect(() => setDismissed(load()), []);
  const groups = useMemo(() => findDuplicates(docs, dismissed), [docs, dismissed]);
  const notDupes = (g: DupGroup) => setDismissed((cur) => { const n = [...new Set([...cur, ...pairKeys(g)])]; try { localStorage.setItem(KEY, JSON.stringify(n)); } catch { /* egal */ } return n; });
  return { groups, notDupes };
}

/** Ein Satz, wo und wie es doppelt ist: Absender · Briefdatum · Dateien · Bereich */
function where(g: DupGroup) {
  const e = explain(g);
  const areas = [...new Set(g.docs.map((d) => clusterOf(d.cluster).label))].join(" / ");
  return [e.sender, e.date ? (e.date === "ohne Datum" ? "ohne Briefdatum" : `Briefdatum ${fmtDate(e.date)}`) : `Daten ${e.dates.map((d) => (d === "ohne Datum" ? "ohne" : fmtDate(d))).join(" / ")}`, e.amount ? `${Number(e.amount).toLocaleString("de-DE", { minimumFractionDigits: 2 })} €` : null, `${g.docs.length}× (${e.files})`, areas].filter(Boolean).join(" · ");
}

/** Startseite: nur ein Hinweis mit kurzer Erklärung, zusammengeführt wird auf /doppelt */
export function DuplicateHint({ docs }: { docs: Doc[] }) {
  const { groups } = useDuplicates(docs);
  const { groups: partnerGroups } = usePartnerDuplicates(docs);
  if (!groups.length && !partnerGroups.length) return null;
  return (
    <section className={`${CARD} overflow-hidden`}>
      <Link href="/doppelt" className="flex items-center gap-3 px-4 pt-4 pb-2 hover:opacity-80">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-surface-2"><Copy size={16} /></span>
        <span className="min-w-0 flex-1">
          <b className="block text-[15px]">{[groups.length ? (groups.length === 1 ? "1 Dokument wohl doppelt" : `${groups.length} Dokumente wohl doppelt`) : null, partnerGroups.length ? (partnerGroups.length === 1 ? "1 Partner unter mehreren Namen" : `${partnerGroups.length} Partner unter mehreren Namen`) : null].filter(Boolean).join(" · ")}</b>
          <span className="block text-[12.5px] text-muted">Prüfen und zusammenführen</span>
        </span>
        <span className="inline-flex shrink-0 items-center gap-1 text-[13px] font-semibold text-selected">Prüfen <ChevronRight size={15} /></span>
      </Link>
      <ul className="px-4 pb-3">
        {partnerGroups.slice(0, 2).map((g) => (
          <li key={g.key} className="flex items-start gap-2 py-1 text-[12.5px]">
            <span className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${g.sure ? "bg-fg" : "bg-line-strong"}`} />
            <span className="min-w-0"><b className="font-semibold">{g.partners.map((p) => p.name).slice(0, 3).join(" · ")}{g.partners.length > 3 ? ` +${g.partners.length - 3}` : ""}</b><span className="block text-muted">{g.reasons.join(" · ")}</span></span>
          </li>
        ))}
        {groups.slice(0, 3).map((g) => (
          <li key={g.key} className="flex items-start gap-2 py-1 text-[12.5px]">
            <span className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${g.sure ? "bg-fg" : "bg-line-strong"}`} />
            <span className="min-w-0"><b className="font-semibold">{g.docs[0].title ?? g.docs[0].file_name}</b><span className="block text-muted">{where(g)} – {g.why}</span></span>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Seite „Doppelte“: alle Gruppen, eines behalten, Rest löschen – oder als verschieden markieren */
export function DuplicateManager({ docs }: { docs: Doc[] }) {
  const { remove } = useDocs();
  const { groups, notDupes } = useDuplicates(docs);
  if (!groups.length) return <p className={`${CARD} p-6 text-center text-[14px] text-muted`}>Keine doppelten Dokumente gefunden. 👍</p>;
  return (
    <div className="space-y-3">
      {groups.map((g) => (
        <section key={g.key} className={`${CARD} overflow-hidden`}>
          <p className="px-4 pt-3.5 text-[12.5px] text-soft">{where(g)}</p>
          <Group g={g} onMerge={async (keep) => { for (const d of g.docs) if (d.id !== keep) await remove(d); }} onDismiss={() => notDupes(g)} />
        </section>
      ))}
    </div>
  );
}

/** Angaben vergleichen: Feldnamen ohne Klammerzusätze, Werte normalisiert; nur Abweichungen zeigen */
// „Abschlag (fällig 20.07.2026)“ = „Abschlag fällig 20.07.2026“; Nachname/Name (Feld 1) gleich behandeln
const lbl = (l: string) => l.toLowerCase().replace(/\bnachname\b/g, "name").replace(/[^a-z0-9äöüß]+/g, " ").trim();
// Datumsangaben vereinheitlichen (2023-12-04 = 04.12.2023), dann nur Buchstaben/Ziffern vergleichen
const iso = (v: string) => v.replace(/\b(\d{1,2})\.(\d{1,2})\.(\d{4})\b/g, (_, d, m, y) => `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`);
const val = (v: string) => iso(v).toLowerCase().replace(/[^a-z0-9äöüß]/g, "");
function diffRows(docs: Doc[]) {
  const labels = new Map<string, string>();
  for (const d of docs) for (const f of d.key_facts ?? []) if (!labels.has(lbl(f.label))) labels.set(lbl(f.label), f.label);
  const rows = [...labels.entries()].map(([k, label]) => ({ label, values: docs.map((d) => d.key_facts?.find((f) => lbl(f.label) === k)?.value) }));
  const differs = (r: { values: (string | undefined)[] }) => new Set(r.values.map((v) => (v ? val(v) : "–"))).size > 1;
  // Briefdatum immer zeigen, wenn verschieden
  const date = { label: "Briefdatum", values: docs.map((d) => (d.doc_date ? fmtDate(d.doc_date) : undefined)) };
  const diff = [...(differs(date) ? [date] : []), ...rows.filter(differs)];
  return { diff, same: rows.length - rows.filter(differs).length };
}

function Group({ g, onMerge, onDismiss }: { g: DupGroup; onMerge: (keep: string) => Promise<void>; onDismiss: () => void }) {
  const open = useDetail();
  const [keep, setKeep] = useState(g.docs[0].id);
  const [busy, setBusy] = useState(false);
  const [all, setAll] = useState(false);
  const { diff, same } = useMemo(() => diffRows(g.docs), [g.docs]);
  const cols = g.docs.length >= 3 ? "md:grid-cols-3" : "grid-cols-2";
  return (
    <div className="px-4 py-3.5">
      <p className="mb-3 flex flex-wrap items-center gap-1.5 text-[12px] font-semibold text-soft">
        <span className={`rounded-full px-2 py-px text-[11px] ${g.sure ? "bg-fg text-canvas" : "border border-card-line"}`}>{g.sure ? "sicher doppelt" : "vielleicht doppelt"}</span>{g.why}
      </p>
      {/* nebeneinander: Vorschau, Eckdaten, behalten */}
      <div className={`grid gap-2.5 ${cols}`}>
        {g.docs.map((d) => {
          const on = keep === d.id;
          return (
            <div key={d.id} className={`flex min-w-0 flex-col overflow-hidden rounded-xl border ${on ? "border-fg ring-1 ring-fg" : "border-card-line"}`}>
              <button type="button" onClick={() => open?.({ kind: "doc", id: d.id })} className="block h-36 w-full overflow-hidden bg-surface-2 sm:h-44" aria-label="Öffnen"><Thumb d={d} /></button>
              <div className="flex flex-1 flex-col gap-1 p-2.5">
                <button type="button" onClick={() => open?.({ kind: "doc", id: d.id })} className="line-clamp-2 text-left text-[13px] leading-4 font-semibold hover:underline">{d.title ?? d.file_name}</button>
                <span className="flex flex-wrap items-center gap-1 text-[11.5px] text-muted">
                  {d.mime_type.startsWith("image/") ? <FileImage size={11} /> : <FileText size={11} />}
                  {d.mime_type.startsWith("image/") ? "Foto" : "PDF"} · {size(d.size_bytes)} · {d.doc_date ? fmtDate(d.doc_date) : "ohne Datum"} · {d.key_facts?.length ?? 0} Angaben
                </span>
                {caseIds(d).length > 0 && <span className="flex flex-wrap gap-1">{caseIds(d).slice(0, 2).map((c) => <span key={c.kind + c.value} className="max-w-full truncate rounded-full border border-card-line px-2 py-px text-[10.5px] text-soft">{c.label}: <b className="font-semibold text-fg">{c.value}</b></span>)}</span>}
                <button type="button" role="radio" aria-checked={on} onClick={() => setKeep(d.id)} className={`mt-auto inline-flex h-8 items-center justify-center gap-1.5 rounded-full text-[12px] font-semibold ${on ? "bg-fg text-canvas" : "border border-card-line hover:bg-surface-2"}`}>{on ? "✓ Behalten" : "Dieses behalten"}</button>
              </div>
            </div>
          );
        })}
      </div>
      {/* Unterschiede */}
      <div className="mt-3 overflow-hidden rounded-xl border border-card-line">
        <p className="flex items-center justify-between bg-surface-2 px-3 py-2 text-[12px] font-semibold">{diff.length ? `${diff.length} ${diff.length === 1 ? "Unterschied" : "Unterschiede"}` : "Keine Unterschiede in den Angaben"}<span className="font-normal text-muted">{same} Angaben gleich</span></p>
        {diff.length > 0 && (
          <table className="w-full table-fixed text-[12px]">
            <tbody className="divide-y divide-line">
              {(all ? diff : diff.slice(0, 6)).map((r) => (
                <tr key={r.label}>
                  <td className="w-[28%] truncate px-3 py-1.5 text-muted">{r.label}</td>
                  {r.values.map((v, i) => <td key={i} className={`truncate px-2 py-1.5 ${v ? "font-semibold" : "text-muted"}`} title={v}>{v ?? "–"}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {diff.length > 6 && <button type="button" onClick={() => setAll(!all)} className="w-full border-t border-line px-3 py-1.5 text-left text-[12px] font-semibold text-selected">{all ? "Weniger" : `Alle ${diff.length} zeigen`}</button>}
      </div>
      <div className="mt-2.5 flex flex-wrap gap-2">
        <button type="button" disabled={busy} onClick={() => { if (!confirm(`${g.docs.length - 1} ${g.docs.length === 2 ? "Dokument" : "Dokumente"} löschen und nur das ausgewählte behalten?`)) return; setBusy(true); void onMerge(keep).finally(() => setBusy(false)); }} className="inline-flex h-9 items-center gap-1.5 rounded-full bg-fg px-4 text-[13px] font-semibold text-canvas disabled:opacity-50">
          {busy ? <Loader2 size={14} className="animate-spin" /> : <GitMerge size={14} />} Zusammenführen
        </button>
        <button type="button" onClick={onDismiss} className="inline-flex h-9 items-center gap-1.5 rounded-full border border-card-line px-4 text-[13px] font-semibold hover:bg-surface-2"><X size={14} /> Sind verschieden</button>
      </div>
    </div>
  );
}
