"use client";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ChevronRight, Copy, FileImage, FileText, GitMerge, Loader2, X } from "lucide-react";
import { useDetail } from "@/components/DetailPanel";
import { SenderLogo } from "@/components/SenderLogo";
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

function Group({ g, onMerge, onDismiss }: { g: DupGroup; onMerge: (keep: string) => Promise<void>; onDismiss: () => void }) {
  const open = useDetail();
  const [keep, setKeep] = useState(g.docs[0].id);
  const [busy, setBusy] = useState(false);
  return (
    <div className="px-4 py-3.5">
      <p className="mb-2 flex items-center gap-1.5 text-[12px] font-semibold text-soft">
        <span className={`rounded-full px-2 py-px text-[11px] ${g.sure ? "bg-fg text-canvas" : "border border-card-line"}`}>{g.sure ? "sicher doppelt" : "vielleicht doppelt"}</span>{g.why}
      </p>
      <ul className="space-y-1.5">
        {g.docs.map((d) => {
          const on = keep === d.id;
          return (
            <li key={d.id} className={`flex items-center gap-3 rounded-xl border px-3 py-2.5 ${on ? "border-fg bg-surface-2" : "border-card-line"}`}>
              <button type="button" role="radio" aria-checked={on} onClick={() => setKeep(d.id)} aria-label="Dieses behalten" className={`grid h-5 w-5 shrink-0 place-items-center rounded-full border-2 ${on ? "border-fg" : "border-line-strong"}`}>{on && <span className="h-2.5 w-2.5 rounded-full bg-fg" />}</button>
              <SenderLogo domain={d.sender_domain} sender={d.sender} cluster={d.cluster} size={34} />
              <button type="button" onClick={() => open?.({ kind: "doc", id: d.id })} className="min-w-0 flex-1 text-left">
                <span className="block truncate text-[13.5px] font-semibold hover:underline">{d.title ?? d.file_name}</span>
                <span className="flex items-center gap-1.5 text-[12px] text-muted">
                  {d.mime_type.startsWith("image/") ? <FileImage size={12} /> : <FileText size={12} />}
                  {d.mime_type.startsWith("image/") ? "Foto" : "PDF"} · {size(d.size_bytes)} · {fmtDate(d.doc_date ?? d.received_at)} · {d.key_facts?.length ?? 0} Angaben
                </span>
                {caseIds(d).length > 0 && <span className="mt-1 flex flex-wrap gap-1">{caseIds(d).slice(0, 3).map((c) => <span key={c.kind + c.value} className="rounded-full border border-card-line px-2 py-px text-[11px] text-soft">{c.label}: <b className="font-semibold text-fg">{c.value}</b></span>)}</span>}
              </button>
              {on && <span className="shrink-0 text-[11.5px] font-semibold text-positive-text">behalten</span>}
            </li>
          );
        })}
      </ul>
      <div className="mt-2.5 flex flex-wrap gap-2">
        <button type="button" disabled={busy} onClick={() => { if (!confirm(`${g.docs.length - 1} ${g.docs.length === 2 ? "Dokument" : "Dokumente"} löschen und nur das ausgewählte behalten?`)) return; setBusy(true); void onMerge(keep).finally(() => setBusy(false)); }} className="inline-flex h-9 items-center gap-1.5 rounded-full bg-fg px-4 text-[13px] font-semibold text-canvas disabled:opacity-50">
          {busy ? <Loader2 size={14} className="animate-spin" /> : <GitMerge size={14} />} Zusammenführen
        </button>
        <button type="button" onClick={onDismiss} className="inline-flex h-9 items-center gap-1.5 rounded-full border border-card-line px-4 text-[13px] font-semibold hover:bg-surface-2"><X size={14} /> Sind verschieden</button>
      </div>
    </div>
  );
}
