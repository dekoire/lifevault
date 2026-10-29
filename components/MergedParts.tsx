"use client";
import { useState } from "react";
import { Layers, Loader2, Scissors } from "lucide-react";
import { Thumb } from "@/components/ChatWidgets";
import { CARD } from "@/components/ui";
import { isBack } from "@/lib/cards";
import { useDocs } from "@/lib/docs";
import type { Doc } from "@/lib/types";

const when = (iso: string) => new Date(iso).toLocaleString("de-DE", { dateStyle: "medium", timeStyle: "short" });

/** Zusammengeführtes Dokument: aus welchen Teilen es besteht (wann hochgeladen, was es ist) – und wieder trennen */
export function MergedParts({ doc, onSplit }: { doc: Doc; onSplit?: () => void }) {
  const { partsOf, remove } = useDocs();
  const parts = partsOf(doc.id);
  const [ask, setAsk] = useState(false);
  const [busy, setBusy] = useState(false);
  if (!parts.length) return null;
  const card = parts.length === 2 && parts.some(isBack);
  // Trennen = das Ganze löschen; die Teile werden dadurch automatisch wieder einzeln sichtbar
  const split = async () => { setBusy(true); try { await remove(doc); onSplit?.(); } finally { setBusy(false); } };
  return (
    <section className={`${CARD} overflow-hidden`}>
      <h2 className="flex items-center gap-2 px-4 pt-3.5 pb-2 text-[14px] font-semibold"><Layers size={15} /> Zusammengeführt aus {parts.length} Teilen</h2>
      <ul className="divide-y divide-line border-t border-line">
        {parts.map((p, i) => (
          <li key={p.id} className="flex items-center gap-3 px-4 py-2.5">
            <span className="h-14 w-11 shrink-0 overflow-hidden rounded-md border border-card-line bg-surface-2"><Thumb d={p} /></span>
            <span className="min-w-0 flex-1">
              <b className="block text-[11.5px] font-semibold tracking-wide text-muted uppercase">{card ? (isBack(p) ? "Rückseite" : "Vorderseite") : `Seite ${i + 1}`}</b>
              <span className="block truncate text-[13px] font-semibold">{p.title ?? p.file_name}</span>
              <span className="block truncate text-[11.5px] text-muted">hochgeladen {when(p.received_at)} · {p.file_name}</span>
            </span>
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap items-center gap-2 border-t border-line px-4 py-3">
        {ask ? (
          <>
            <span className="w-full text-[12.5px] text-soft">Das zusammengeführte PDF wird gelöscht, die {parts.length} Teile sind danach wieder einzeln da.</span>
            <button type="button" disabled={busy} onClick={() => void split()} className="inline-flex h-9 items-center gap-1.5 rounded-full bg-fg px-4 text-[13px] font-semibold text-canvas disabled:opacity-60">{busy ? <Loader2 size={14} className="animate-spin" /> : <Scissors size={14} />} Ja, wieder trennen</button>
            <button type="button" disabled={busy} onClick={() => setAsk(false)} className="inline-flex h-9 items-center px-3 text-[13px] font-semibold text-muted hover:text-fg">Abbrechen</button>
          </>
        ) : (
          <button type="button" onClick={() => setAsk(true)} className="inline-flex h-9 items-center gap-1.5 rounded-full border border-card-line px-4 text-[13px] font-semibold hover:bg-surface-2"><Scissors size={14} /> Wieder trennen</button>
        )}
      </div>
    </section>
  );
}
