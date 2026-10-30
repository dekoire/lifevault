"use client";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Check, ChevronRight, Copy, FileImage, FileText, Loader2, Maximize2, Trash2 } from "lucide-react";
import { useDetail } from "@/components/DetailPanel";
import { Thumb } from "@/components/ChatWidgets";
import { CARD } from "@/components/ui";
import { usePartnerDuplicates } from "@/components/PartnerDupes";
import { addDecision, useDecisions } from "@/lib/decisions";
import { SenderLogo } from "@/components/SenderLogo";
import { caseIds, explain, findDuplicates, pairKeys, type DupGroup } from "@/lib/dupes";
import { clusterOf } from "@/lib/clusters";
import { fmtDate, useDocs } from "@/lib/docs";
import type { Doc } from "@/lib/types";

const size = (b: number) => (b > 1024 * 1024 ? `${(b / 1024 / 1024).toFixed(1).replace(".", ",")} MB` : `${Math.round(b / 1024)} KB`);

/** gemerkte „sind verschieden“-Paare + gefundene Gruppen */
export function useDuplicates(docs: Doc[]) {
  // Entscheidungen „nicht doppelt“ geräteübergreifend gespeichert – einmal entschieden, nie wieder gefragt
  const { pairs } = useDecisions();
  const groups = useMemo(() => findDuplicates(docs, pairs("distinct_docs")), [docs, pairs]);
  const notDupes = (g: DupGroup) => addDecision("distinct_docs", pairKeys(g), g.docs.map((d) => d.title ?? d.file_name).slice(0, 3).join(" ≠ "));
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
  const n = groups.length + partnerGroups.length;
  const btn = "inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full bg-fg px-3.5 text-[13px] font-semibold text-canvas";
  // gleicher Aufbau wie „Zu erledigen“ und „Gehören zusammen?“: schwarzes Symbol, Zahl, Zeilen mit Vorschau und Knopf
  return (
    <section className={`${CARD} overflow-hidden`}>
      <div className="px-4 pt-5 pb-3 md:px-6">
        <h2 className="flex items-center gap-2 text-[18px] leading-[26px] font-semibold">Doppeltes aufräumen <span className="tnum rounded-full border border-card-line px-2 py-px text-[12px] font-semibold text-soft">{n}</span></h2>
        <p className="mt-0.5 text-[13px] text-muted">Gleiches mehrfach abgelegt – eines behalten, den Rest löschen</p>
      </div>
      <ul className="divide-y divide-line border-t border-line">
        {partnerGroups.slice(0, 2).map((g) => (
          <li key={g.key} className="flex flex-wrap items-center gap-3 px-4 py-3.5 md:px-6 sm:flex-nowrap">
            <span className="flex shrink-0 -space-x-2">{g.partners.slice(0, 3).map((p) => <span key={p.name} className="rounded-full ring-2 ring-surface"><SenderLogo domain={p.domain} sender={p.name} cluster={p.cluster} size={32} /></span>)}</span>
            <span className="min-w-0 flex-1">
              <b className="block truncate text-[14px]">{g.partners.map((p) => p.name).slice(0, 3).join(" · ")}{g.partners.length > 3 ? ` +${g.partners.length - 3}` : ""}</b>
              <span className="line-clamp-2 block text-[12px] text-muted">Ein Partner, mehrere Namen · {g.reasons[0]}</span>
            </span>
            <Link href="/doppelt" className={btn}><Copy size={13} /> Ansehen & prüfen</Link>
          </li>
        ))}
        {groups.slice(0, 3).map((g) => (
          <li key={g.key} className="flex flex-wrap items-center gap-3 px-4 py-3.5 md:px-6 sm:flex-nowrap">
            <span className="flex shrink-0 -space-x-4">{g.docs.slice(0, 3).map((d, i) => <span key={d.id} className="h-14 w-11 overflow-hidden rounded-lg border-2 border-surface bg-surface-2 shadow-card" style={{ transform: `rotate(${(i - 1) * 4}deg)` }}><Thumb d={d} /></span>)}</span>
            <span className="min-w-0 flex-1">
              <b className="block truncate text-[14px]">{g.docs[0].title ?? g.docs[0].file_name}</b>
              <span className="line-clamp-2 block text-[12px] text-muted">{g.docs.length}× vorhanden · {g.why ? `${g.why} · ` : ""}{where(g)}</span>
            </span>
            <Link href="/doppelt" className={btn}><Copy size={13} /> Ansehen & prüfen</Link>
          </li>
        ))}
      </ul>
      {n > 5 && <Link href="/doppelt" className="flex items-center justify-center gap-1 border-t border-line py-2.5 text-[13px] font-semibold text-fg hover:bg-surface-2/60">Alle {n} ansehen <ChevronRight size={15} /></Link>}
    </section>
  );
}

/** Seite „Doppelte“: alle Gruppen, eines behalten, Rest löschen – oder als verschieden markieren */
export function DuplicateManager({ docs }: { docs: Doc[] }) {
  const { remove } = useDocs();
  const { groups, notDupes } = useDuplicates(docs);
  if (!groups.length) return <p className={`${CARD} p-6 text-center text-[14px] text-muted`}>Nichts doppelt – alles aufgeräumt.</p>;
  return (
    <div className="space-y-3">
      {groups.map((g) => (
        <section key={g.key} className={`${CARD} overflow-hidden`}>
          <p className="px-4 pt-3.5 text-[13px] text-soft">{where(g)}</p>
          <Group g={g} onApply={async (keep) => {
            for (const d of g.docs) if (!keep.includes(d.id)) await remove(d);
            // was bleibt, ist ausdrücklich verschieden – nicht mehr vorschlagen
            const kept = g.docs.filter((d) => keep.includes(d.id));
            if (kept.length > 1) await notDupes({ ...g, docs: kept });
          }} />
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

/**
 * Eine Gruppe ähnlicher Dokumente: du markierst, was bleiben soll (eins, mehrere oder alle).
 * Nicht Markiertes wird gelöscht; was du behältst, gilt danach als „verschieden“ und wird nicht mehr vorgeschlagen.
 */
function Group({ g, onApply }: { g: DupGroup; onApply: (keep: string[]) => Promise<void> }) {
  const open = useDetail();
  const [keep, setKeep] = useState<string[]>([g.docs[0].id]);
  const [busy, setBusy] = useState(false);
  const [all, setAll] = useState(false);
  const { diff, same } = useMemo(() => diffRows(g.docs), [g.docs]);
  const toggle = (id: string) => setKeep((k) => (k.includes(id) ? k.filter((x) => x !== id) : [...k, id]));
  const drop = g.docs.filter((d) => !keep.includes(d.id));
  const cols = g.docs.length >= 3 ? "sm:grid-cols-2 lg:grid-cols-3" : "sm:grid-cols-2";
  const label = !keep.length ? "Wähle mindestens eins zum Behalten" : drop.length ? `${keep.length === 1 ? "1 behalten" : `${keep.length} behalten`}, ${drop.length} löschen` : "Alle behalten – sind verschieden";
  const apply = () => {
    if (!keep.length) return;
    if (drop.length && !confirm(`${drop.length} ${drop.length === 1 ? "Dokument wird" : "Dokumente werden"} gelöscht:\n\n${drop.map((d) => `• ${d.title ?? d.file_name}`).join("\n")}\n\nBehalten: ${keep.length}. Fortfahren?`)) return;
    setBusy(true);
    void onApply(keep).finally(() => setBusy(false));
  };
  return (
    <div className="px-4 py-3.5">
      <p className="mb-1 flex flex-wrap items-center gap-1.5 text-[12px] font-semibold text-soft">
        <span className={`rounded-full px-2 py-px text-[11px] ${g.sure ? "bg-fg text-canvas" : "border border-card-line"}`}>{g.sure ? "sicher gleich" : "vielleicht gleich"}</span>{g.why}
      </p>
      <p className="mb-3 text-[13px] text-soft"><b className="text-fg">Was willst du behalten?</b> Tippe an, was bleiben soll – auch mehrere. Nicht Markiertes wird gelöscht.</p>
      <div className={`grid grid-cols-1 gap-2.5 ${cols}`}>
        {g.docs.map((d) => {
          const on = keep.includes(d.id);
          return (
            <div key={d.id} className={`flex min-w-0 flex-col overflow-hidden rounded-xl border ${on ? "border-fg ring-1 ring-fg" : "border-card-line opacity-80"}`}>
              {/* groß: Antippen öffnet das Dokument rechts (mobil im Vollbild) – dort Seiten wischen und zoomen */}
              <button type="button" onClick={() => open?.({ kind: "doc", id: d.id })} className="relative block h-56 w-full overflow-hidden bg-surface-2 sm:h-44" aria-label="Groß ansehen">
                <Thumb d={d} />
                <span className="absolute right-2 bottom-2 inline-flex items-center gap-1 rounded-full bg-fg/85 px-2.5 py-1 text-[12px] font-semibold text-canvas"><Maximize2 size={12} /> Groß ansehen</span>
              </button>
              <div className="flex flex-1 flex-col gap-1 p-2.5">
                <span className="line-clamp-2 text-[13px] leading-4 font-semibold">{d.title ?? d.file_name}</span>
                <span className="flex flex-wrap items-center gap-1 text-[12px] text-muted">
                  {d.mime_type.startsWith("image/") ? <FileImage size={11} /> : <FileText size={11} />}
                  {d.mime_type.startsWith("image/") ? "Foto" : "PDF"} · {size(d.size_bytes)} · {d.doc_date ? fmtDate(d.doc_date) : "ohne Datum"} · {d.key_facts?.length ?? 0} Angaben
                </span>
                {caseIds(d).length > 0 && <span className="flex flex-wrap gap-1">{caseIds(d).slice(0, 2).map((c) => <span key={c.kind + c.value} className="max-w-full truncate rounded-full border border-card-line px-2 py-px text-[11px] text-soft">{c.label}: <b className="font-semibold text-fg">{c.value}</b></span>)}</span>}
                <button type="button" role="checkbox" aria-checked={on} onClick={() => toggle(d.id)} className={`mt-auto inline-flex h-9 items-center justify-center gap-1.5 rounded-full text-[13px] font-semibold ${on ? "bg-fg text-canvas" : "border border-card-line text-soft hover:bg-surface-2"}`}>
                  {on ? <><Check size={14} strokeWidth={3} /> Behalten</> : <><Trash2 size={13} /> Wird gelöscht – antippen zum Behalten</>}
                </button>
              </div>
            </div>
          );
        })}
      </div>
      {/* Unterschiede */}
      <div className="mt-3 overflow-hidden rounded-xl border border-card-line">
        <p className="flex items-center justify-between bg-surface-2 px-3 py-2 text-[12px] font-semibold">{diff.length ? `Worin sie sich unterscheiden (${diff.length})` : "Keine Unterschiede in den Angaben"}<span className="font-normal text-muted">{same} Angaben gleich</span></p>
        {diff.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[28rem] table-fixed text-[12px]">
              <tbody className="divide-y divide-line">
                {(all ? diff : diff.slice(0, 6)).map((r) => (
                  <tr key={r.label}>
                    <td className="w-[28%] truncate px-3 py-1.5 text-muted">{r.label}</td>
                    {r.values.map((v, i) => <td key={i} className={`truncate px-2 py-1.5 ${v ? "font-semibold" : "text-muted"}`} title={v}>{v ?? "–"}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {diff.length > 6 && <button type="button" onClick={() => setAll(!all)} className="w-full border-t border-line bg-surface-2 px-3 py-1.5 text-center text-[12px] font-semibold text-fg transition-colors hover:bg-surface-3">{all ? "Weniger" : `Alle ${diff.length} zeigen`}</button>}
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button type="button" disabled={busy || !keep.length} onClick={apply} className="inline-flex h-10 items-center gap-1.5 rounded-full bg-fg px-4 text-[13px] font-semibold text-canvas disabled:opacity-40">
          {busy ? <Loader2 size={14} className="animate-spin" /> : drop.length ? <Trash2 size={14} /> : <Check size={14} />} {label}
        </button>
        {drop.length > 0 && keep.length > 0 && <button type="button" onClick={() => setKeep(g.docs.map((d) => d.id))} className="inline-flex h-10 items-center gap-1.5 rounded-full border border-card-line px-4 text-[13px] font-semibold hover:bg-surface-2">Alle behalten</button>}
      </div>
    </div>
  );
}
