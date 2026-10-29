"use client";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowLeftRight, Check, ChevronLeft, ChevronRight, Combine, FileText, Loader2, X } from "lucide-react";
import { toPdf } from "@/lib/pdfmerge";
import { cardKind } from "@/lib/cards";
import { fmtDate, useDocs } from "@/lib/docs";
import { supabase } from "@/lib/supabase";
import type { Doc } from "@/lib/types";

/** Große Vorschau: Foto direkt, PDF als gerenderte erste Seite */
export function PagePreview({ d, className = "" }: { d: Doc; className?: string }) {
  const [src, setSrc] = useState<string>();
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let url: string | undefined, off = false;
    if (d.encrypted) { setFailed(true); return; }
    (async () => {
      const { data } = await supabase.storage.from("documents").download(d.file_path);
      if (!data) throw new Error("nicht geladen");
      if (d.mime_type.startsWith("image/")) { url = URL.createObjectURL(data); if (!off) setSrc(url); return; }
      if (d.mime_type === "application/pdf") {
        const { getDocumentProxy } = await import("unpdf");
        const pdf = await getDocumentProxy(new Uint8Array(await data.arrayBuffer()));
        const page = await pdf.getPage(1);
        const vp = page.getViewport({ scale: 1.4 });
        const c = document.createElement("canvas"); c.width = vp.width; c.height = vp.height;
        await page.render({ canvasContext: c.getContext("2d")!, viewport: vp, canvas: c } as Parameters<typeof page.render>[0]).promise;
        if (!off) setSrc(c.toDataURL("image/jpeg", 0.85));
        return;
      }
      throw new Error("keine Vorschau");
    })().catch(() => !off && setFailed(true));
    return () => { off = true; if (url) URL.revokeObjectURL(url); };
  }, [d]);
  if (src) return <img src={src} alt={d.title ?? d.file_name} draggable={false} className={`h-full w-full object-contain select-none ${className}`} />;
  return <span className={`grid h-full w-full place-items-center text-muted ${className}`}>{failed ? <span className="flex flex-col items-center gap-1 text-[12px]"><FileText size={26} /> keine Vorschau</span> : <Loader2 size={20} className="animate-spin" />}</span>;
}

/**
 * Zusammenführen prüfen: Seiten groß und wischbar nebeneinander, Reihenfolge ändern (Vorder-/Rückseite tauschen),
 * einzelne Fotos abwählen (z. B. doppelt fotografiert) – erst „Zusammenführen“ ändert etwas.
 */
export function MergeReview({ docs, title, reason, skip: preSkip = [], onDone, onCancel, onNotSame }: { docs: Doc[]; title: string; reason?: string; skip?: string[]; onDone?: () => void; onCancel?: () => void; onNotSame?: () => void }) {
  const { upload, remove } = useDocs();
  const [order, setOrder] = useState(docs.map((d) => d.id));
  const [skip, setSkip] = useState<string[]>(preSkip);
  const [dropSkipped, setDropSkipped] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [at, setAt] = useState(0);
  const strip = useRef<HTMLDivElement>(null);
  const byId = new Map(docs.map((d) => [d.id, d]));
  const list = order.map((id) => byId.get(id)!).filter(Boolean);
  const used = list.filter((d) => !skip.includes(d.id));
  const isCard = list.some((d) => cardKind(d));
  // Rolle aus der Position: bei Karten Vorder-/Rückseite, sonst Seitenzahl
  const role = (d: Doc) => {
    if (skip.includes(d.id)) return "nicht übernehmen";
    const i = used.indexOf(d);
    return isCard && used.length === 2 ? (i === 0 ? "Vorderseite" : "Rückseite") : `Seite ${i + 1}`;
  };
  const move = (id: string, by: number) => setOrder((o) => { const i = o.indexOf(id), j = i + by; if (j < 0 || j >= o.length) return o; const n = [...o]; [n[i], n[j]] = [n[j], n[i]]; return n; });
  const swap = () => { const [a, b] = used; if (a && b) setOrder((o) => o.map((x) => (x === a.id ? b.id : x === b.id ? a.id : x))); };
  const go = (i: number) => { const el = strip.current; if (!el) return; const k = Math.max(0, Math.min(list.length - 1, i)); el.scrollTo({ left: k * el.clientWidth, behavior: "smooth" }); };

  const merge = async () => {
    setBusy(true); setError(undefined);
    try {
      const pdf = await toPdf(used);
      const name = `${title.replace(/[\\/:*?"<>|]/g, "").slice(0, 120) || "Dokument"}.pdf`;
      const ids = await upload([new File([pdf], name, { type: "application/pdf" })], { projectId: used[0].project_id });
      if (!ids.length) throw new Error("Hochladen hat nicht geklappt – die Einzelteile bleiben erhalten.");
      for (const d of [...used, ...(dropSkipped ? list.filter((x) => skip.includes(x.id)) : [])]) await remove(d);
      onDone?.();
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  };

  return (
    <div className="space-y-3">
      <div>
        <b className="block text-[15px] leading-5">{title}</b>
        <span className="text-[12.5px] text-muted">{reason ? `${reason} · ` : ""}{list.length} Teile – wischen zum Vergleichen</span>
      </div>
      {/* große Seiten zum Wischen */}
      <div className="relative">
        <div ref={strip} onScroll={(e) => setAt(Math.round(e.currentTarget.scrollLeft / Math.max(1, e.currentTarget.clientWidth)))} className="flex snap-x snap-mandatory overflow-x-auto rounded-2xl bg-surface-2 [scrollbar-width:none]">
          {list.map((d) => {
            const off = skip.includes(d.id);
            return (
              <figure key={d.id} className="relative w-full shrink-0 snap-center">
                <div className={`h-72 p-3 sm:h-96 ${off ? "opacity-35" : ""}`}><PagePreview d={d} className="rounded-lg" /></div>
                <span className={`absolute top-3 left-3 rounded-full px-2.5 py-1 text-[12px] font-semibold shadow-card ${off ? "bg-surface text-muted line-through" : "bg-fg text-canvas"}`}>{role(d)}</span>
                <button type="button" onClick={() => setSkip((s) => (s.includes(d.id) ? s.filter((x) => x !== d.id) : [...s, d.id]))} className={`absolute top-3 right-3 inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-[12px] font-semibold shadow-card ${off ? "bg-surface text-fg" : "bg-surface/95 text-fg"}`}>
                  {off ? <><Check size={13} /> doch übernehmen</> : <><X size={13} /> nicht übernehmen</>}
                </button>
                <figcaption className="flex items-center gap-2 border-t border-line bg-surface px-3 py-2 text-[12px]">
                  <span className="min-w-0 flex-1 truncate"><b className="font-semibold">{d.title ?? d.file_name}</b><span className="text-muted"> · {fmtDate(d.doc_date ?? d.received_at)}</span></span>
                  <button type="button" aria-label="Nach vorne" onClick={() => move(d.id, -1)} className="grid h-7 w-7 place-items-center rounded-full border border-card-line hover:bg-surface-2"><ChevronLeft size={14} /></button>
                  <button type="button" aria-label="Nach hinten" onClick={() => move(d.id, 1)} className="grid h-7 w-7 place-items-center rounded-full border border-card-line hover:bg-surface-2"><ChevronRight size={14} /></button>
                </figcaption>
              </figure>
            );
          })}
        </div>
        {list.length > 1 && <>
          <button type="button" aria-label="Vorherige" onClick={() => go(at - 1)} className="absolute top-[45%] left-2 hidden h-9 w-9 -translate-y-1/2 place-items-center rounded-full bg-surface/95 shadow-card sm:grid"><ChevronLeft size={18} /></button>
          <button type="button" aria-label="Nächste" onClick={() => go(at + 1)} className="absolute top-[45%] right-2 hidden h-9 w-9 -translate-y-1/2 place-items-center rounded-full bg-surface/95 shadow-card sm:grid"><ChevronRight size={18} /></button>
        </>}
      </div>
      <div className="flex justify-center gap-1.5">{list.map((d, i) => <button key={d.id} type="button" aria-label={`Teil ${i + 1}`} onClick={() => go(i)} className={`h-1.5 rounded-full transition-all ${i === at ? "w-5 bg-fg" : "w-1.5 bg-line-strong"}`} />)}</div>

      <div className="flex flex-wrap items-center gap-2">
        {used.length === 2 && <button type="button" onClick={swap} className="inline-flex h-9 items-center gap-1.5 rounded-full border border-card-line px-3.5 text-[12.5px] font-semibold hover:bg-surface-2"><ArrowLeftRight size={14} /> {isCard ? "Vorder- & Rückseite tauschen" : "Reihenfolge tauschen"}</button>}
        {skip.length > 0 && <label className="flex items-center gap-2 text-[12.5px] text-soft"><input type="checkbox" checked={dropSkipped} onChange={(e) => setDropSkipped(e.target.checked)} className="h-4 w-4 accent-brand-500" /> abgewählte Fotos löschen (doppelt)</label>}
      </div>
      {error && <p role="alert" className="text-[13px] text-negative-text">{error}</p>}
      <div className="flex flex-wrap gap-2">
        <button type="button" disabled={busy || used.length < 2} onClick={() => void merge()} className="inline-flex h-10 items-center gap-1.5 rounded-full bg-fg px-4 text-[13.5px] font-semibold text-canvas disabled:opacity-50">{busy ? <Loader2 size={15} className="animate-spin" /> : <Combine size={15} />} Zusammenführen ({used.length} {used.length === 1 ? "Seite" : "Seiten"})</button>
        {onNotSame && <button type="button" disabled={busy} onClick={onNotSame} className="inline-flex h-10 items-center gap-1.5 rounded-full border border-card-line px-4 text-[13.5px] font-semibold hover:bg-surface-2"><X size={15} /> Nicht dasselbe</button>}
        {onCancel && <button type="button" disabled={busy} onClick={onCancel} className="inline-flex h-10 items-center px-3 text-[13.5px] font-semibold text-muted hover:text-fg">Abbrechen</button>}
      </div>
    </div>
  );
}

/** Als Seitenpanel (Handy: von unten) */
export function MergeSheet(props: Parameters<typeof MergeReview>[0] & { onClose: () => void }) {
  const [closing, setClosing] = useState(false);
  const close = () => { setClosing(true); setTimeout(props.onClose, 190); };
  useEffect(() => { const k = (e: KeyboardEvent) => e.key === "Escape" && close(); window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);
  return createPortal(
    <div data-closing={closing || undefined} className="sheet-backdrop fixed inset-0 z-50 flex items-end bg-black/35 lg:items-stretch lg:justify-end" onClick={close}>
      <aside role="dialog" aria-modal="true" aria-label="Zusammenführen" data-closing={closing || undefined} onClick={(e) => e.stopPropagation()} className="sheet-panel pb-safe max-h-[94dvh] w-full overflow-y-auto rounded-t-3xl bg-canvas p-4 shadow-lg sm:p-5 lg:h-full lg:max-h-none lg:w-[560px] lg:rounded-none">
        <MergeReview {...props} onDone={() => { props.onDone?.(); close(); }} onCancel={close} onNotSame={props.onNotSame ? () => { props.onNotSame?.(); close(); } : undefined} />
      </aside>
    </div>,
    document.body,
  );
}
