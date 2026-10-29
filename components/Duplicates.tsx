"use client";
import { useEffect, useMemo, useState } from "react";
import { Copy, FileImage, FileText, GitMerge, Loader2, X } from "lucide-react";
import { useDetail } from "@/components/DetailPanel";
import { SenderLogo } from "@/components/SenderLogo";
import { CARD } from "@/components/ui";
import { findDuplicates, pairKeys, type DupGroup } from "@/lib/dupes";
import { fmtDate, useDocs } from "@/lib/docs";
import type { Doc } from "@/lib/types";

const KEY = "lifevault:not-dupes";
const load = (): string[] => { try { return JSON.parse(localStorage.getItem(KEY) ?? "[]"); } catch { return []; } };
const size = (b: number) => (b > 1024 * 1024 ? `${(b / 1024 / 1024).toFixed(1).replace(".", ",")} MB` : `${Math.round(b / 1024)} KB`);

/** Doppelte Briefe: anzeigen, eines behalten, Rest löschen – oder als verschieden markieren */
export function Duplicates({ docs }: { docs: Doc[] }) {
  const { remove } = useDocs();
  const [dismissed, setDismissed] = useState<string[]>([]);
  useEffect(() => setDismissed(load()), []);
  const groups = useMemo(() => findDuplicates(docs, dismissed), [docs, dismissed]);
  const notDupes = (g: DupGroup) => setDismissed((cur) => { const n = [...new Set([...cur, ...pairKeys(g)])]; try { localStorage.setItem(KEY, JSON.stringify(n)); } catch { /* egal */ } return n; });
  if (!groups.length) return null;
  return (
    <section className={`${CARD} overflow-hidden`}>
      <h2 className="flex items-center gap-2 px-4 pt-4 pb-1 text-[16px] font-semibold"><Copy size={17} /> Doppelt abgelegt?
        <span className="tnum rounded-full border border-card-line bg-surface-2 px-2 py-px text-[12px] font-bold">{groups.length}</span>
      </h2>
      <p className="px-4 pb-2 text-[12.5px] text-muted">Diese Dokumente sehen gleich aus. Wähle, welches du behältst – die anderen werden gelöscht.</p>
      <div className="divide-y divide-line border-t border-line">
        {groups.map((g) => <Group key={g.key} g={g} onMerge={async (keep) => { for (const d of g.docs) if (d.id !== keep) await remove(d); }} onDismiss={() => notDupes(g)} />)}
      </div>
    </section>
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
