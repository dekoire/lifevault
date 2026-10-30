"use client";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AlertTriangle, ArrowLeftRight, Check, ChevronLeft, ChevronRight, Combine, FileText, Loader2, Maximize2, Minus, Plus, X } from "lucide-react";
import { toPdf } from "@/lib/pdfmerge";
import { cardKind } from "@/lib/cards";
import { fmtDate, useDocs } from "@/lib/docs";
import { authFetch, supabase } from "@/lib/supabase";
import { LARGE, MEDIUM, thumbUrl } from "@/lib/thumbs";
import type { Doc } from "@/lib/types";

type OrderCheck = { order: string[]; pages: { id: string; label: string }[]; missing: string[]; notBelonging: { id: string; reason: string }[]; summary: string };
// Ergebnisse merken, damit Öffnen/Schließen nicht jedes Mal neu prüft
const checks = new Map<string, Promise<OrderCheck>>();

/** Große Vorschau: Foto direkt, PDF als gerenderte erste Seite */
export function PagePreview({ d, className = "", width = MEDIUM }: { d: Doc; className?: string; width?: number }) {
  const [src, setSrc] = useState<string>();
  const [failed, setFailed] = useState(false);
  // mittelgroßes Vorschaubild (einmal erzeugt, danach schnell) statt Original
  useEffect(() => {
    let off = false;
    setSrc(undefined); setFailed(false);
    void thumbUrl(d, width).then((u) => { if (off) return; if (u) setSrc(u); else setFailed(true); }).catch(() => !off && setFailed(true));
    return () => { off = true; };
  }, [d, width]);
  if (src) return <img src={src} alt={d.title ?? d.file_name} draggable={false} className={`h-full w-full object-contain select-none ${className}`} />;
  return <span className={`grid h-full w-full place-items-center text-muted ${className}`}>{failed ? <span className="flex flex-col items-center gap-1 text-[12px]"><FileText size={26} /> keine Vorschau</span> : <Loader2 size={20} className="animate-spin" />}</span>;
}

/**
 * Zusammenführen prüfen: Seiten groß und wischbar nebeneinander, Reihenfolge ändern (Vorder-/Rückseite tauschen),
 * einzelne Fotos abwählen (z. B. doppelt fotografiert) – erst „Zusammenführen“ ändert etwas.
 */
export function MergeReview({ docs, title, reason, skip: preSkip = [], onDone, onCancel, onNotSame, sheet = false }: { docs: Doc[]; title: string; reason?: string; skip?: string[]; onDone?: () => void; onCancel?: () => void; onNotSame?: () => void; sheet?: boolean }) {
  const { upload, remove, refresh } = useDocs();
  const [order, setOrder] = useState(docs.map((d) => d.id));
  const [skip, setSkip] = useState<string[]>(preSkip);
  const [dropSkipped, setDropSkipped] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [at, setAt] = useState(0);
  const [zoom, setZoom] = useState<number>();
  const strip = useRef<HTMLDivElement>(null);
  // KI prüft Seite für Seite: Reihenfolge, fehlende Seiten, unpassende Teile
  const [check, setCheck] = useState<OrderCheck | "loading" | "error">("loading");
  const [reordered, setReordered] = useState(false);
  useEffect(() => {
    let off = false;
    const key = [...docs.map((d) => d.id)].sort().join(",");
    const cached = checks.get(key);
    const p = cached ?? authFetch("/api/order", { method: "POST", body: JSON.stringify({ ids: docs.map((d) => d.id) }) }).then(async (r) => { const j = await r.json(); if (!r.ok || j.error) throw new Error(j.error); return j as OrderCheck; });
    checks.set(key, p);
    p.then((c) => {
      if (off) return;
      setCheck(c);
      if (c.order.join() !== docs.map((d) => d.id).join()) { setOrder(c.order); setReordered(true); }
      if (c.notBelonging.length) setSkip((s) => [...new Set([...s, ...c.notBelonging.map((n) => n.id)])]);
    }).catch(() => { checks.delete(key); if (!off) setCheck("error"); });
    return () => { off = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const label = (id: string) => (typeof check === "object" ? check.pages.find((p) => p.id === id)?.label : undefined);
  const odd = (id: string) => (typeof check === "object" ? check.notBelonging.find((n) => n.id === id)?.reason : undefined);
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
      const ids = await upload([new File([pdf], name, { type: "application/pdf" })], { projectId: used[0].project_id, noSplit: true });
      if (!ids.length) throw new Error("Hochladen hat nicht geklappt – die Einzelteile bleiben erhalten.");
      // Teile nicht löschen, sondern dem Ganzen zuordnen (ausgeblendet) – so lässt es sich wieder trennen
      const { error } = await supabase.from("documents").update({ merged_into: ids[0] }).in("id", used.map((d) => d.id));
      if (error) throw new Error("Die Teile konnten nicht zugeordnet werden – bitte erneut versuchen.");
      for (const d of dropSkipped ? list.filter((x) => skip.includes(x.id)) : []) await remove(d);
      await refresh();
      onDone?.();
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  };

  return (
    <div className="space-y-3">
      <div>
        <b className="block text-[15px] leading-5">{title}</b>
        <span className="text-[13px] text-muted">{reason ? `${reason} · ` : ""}{list.length} Teile – wischen zum Vergleichen</span>
      </div>
      {/* Ergebnis der Seitenprüfung */}
      {check === "loading" ? (
        <p className="flex items-center gap-2 rounded-xl bg-surface-2 px-3 py-2.5 text-[13px] text-soft"><Loader2 size={14} className="animate-spin" /> KI prüft Seite für Seite: Reihenfolge, fehlende Seiten, passt alles zusammen?</p>
      ) : check === "error" ? (
        <p className="rounded-xl bg-surface-2 px-3 py-2.5 text-[13px] text-muted">Automatische Prüfung gerade nicht möglich – bitte selbst durchwischen.</p>
      ) : (
        <div className="space-y-1.5">
          <p className="flex items-start gap-2 rounded-xl bg-surface-2 px-3 py-2.5 text-[13px]"><Check size={14} className="mt-0.5 shrink-0 text-positive-text" /><span><b className="font-semibold">{check.summary}</b>{reordered && <span className="block text-muted">Reihenfolge angepasst – bitte kurz durchwischen.</span>}</span></p>
          {check.missing.map((m) => <p key={m} className="flex items-start gap-2 rounded-xl bg-[#fff7e6] px-3 py-2 text-[13px] font-semibold text-[#7a4a00] dark:bg-[#3a2a0a] dark:text-[#f5c46b]"><AlertTriangle size={14} className="mt-0.5 shrink-0" /> {m}</p>)}
          {check.notBelonging.map((n) => <p key={n.id} className="flex items-start gap-2 rounded-xl bg-negative/10 px-3 py-2 text-[13px] text-negative-text"><AlertTriangle size={14} className="mt-0.5 shrink-0" /><span><b>Passt wohl nicht dazu:</b> {byId.get(n.id)?.title ?? "ein Teil"} – {n.reason} (abgewählt)</span></p>)}
        </div>
      )}

      {/* große Seiten zum Wischen */}
      <div className="relative">
        <div ref={strip} onScroll={(e) => setAt(Math.round(e.currentTarget.scrollLeft / Math.max(1, e.currentTarget.clientWidth)))} className="flex snap-x snap-mandatory overflow-x-auto rounded-2xl bg-surface-2 [scrollbar-width:none]">
          {list.map((d) => {
            const off = skip.includes(d.id);
            return (
              <figure key={d.id} className="relative w-full shrink-0 snap-center">
                {/* antippen: Vollbild zum Zoomen und Vergleichen */}
                <button type="button" onClick={() => setZoom(list.indexOf(d))} aria-label="Groß ansehen" className={`block h-80 w-full p-3 sm:h-96 ${off ? "opacity-35" : ""}`}><PagePreview d={d} className="rounded-lg" /></button>
                <span className="pointer-events-none absolute right-3 bottom-14 inline-flex items-center gap-1 rounded-full bg-fg/85 px-3.5 py-2 text-[12px] leading-4 font-semibold text-canvas"><Maximize2 size={12} /> Groß ansehen</span>
                <span className={`absolute top-3 left-3 rounded-full px-3.5 py-2 text-[12px] leading-4 font-semibold shadow-card ${off ? "bg-surface text-muted line-through" : "bg-fg text-canvas"}`}>{role(d)}</span>
                {odd(d.id) && <span className="absolute bottom-3 left-3 inline-flex max-w-[85%] items-center gap-1 rounded-full bg-negative px-2.5 py-1 text-[12px] font-semibold text-white shadow-card"><AlertTriangle size={12} /> passt wohl nicht dazu</span>}
                <button type="button" onClick={() => setSkip((s) => (s.includes(d.id) ? s.filter((x) => x !== d.id) : [...s, d.id]))} className={`absolute top-3 right-3 inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-[12px] font-semibold shadow-card ${off ? "bg-surface text-fg" : "bg-surface/95 text-fg"}`}>
                  {off ? <><Check size={13} /> doch übernehmen</> : <><X size={13} /> nicht übernehmen</>}
                </button>
                <figcaption className="flex items-center gap-2 border-t border-line bg-surface px-3 py-2 text-[12px]">
                  <span className="min-w-0 flex-1"><b className="block truncate font-semibold">{label(d.id) ?? d.title ?? d.file_name}</b><span className="block truncate text-muted">{label(d.id) ? `${d.title ?? d.file_name} · ` : ""}hochgeladen {fmtDate(d.received_at)}</span></span>
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
      {/* Punkte mittig, Tauschen klein rechts daneben */}
      <div className="flex items-center gap-2">
        <span className="flex-1" />
        <span className="flex justify-center gap-1.5">{list.map((d, i) => <button key={d.id} type="button" aria-label={`Teil ${i + 1}`} onClick={() => go(i)} className={`h-1.5 rounded-full transition-all ${i === at ? "w-5 bg-fg" : "w-1.5 bg-line-strong"}`} />)}</span>
        <span className="flex flex-1 justify-end">{used.length === 2 && <button type="button" onClick={swap} className="inline-flex h-8 items-center gap-1.5 rounded-full px-3.5 text-[13px] font-semibold text-soft hover:bg-surface-2 hover:text-fg"><ArrowLeftRight size={14} /> {isCard ? "Seiten tauschen" : "Tauschen"}</button>}</span>
      </div>
      {skip.length > 0 && <label className="flex items-center gap-2 text-[13px] text-soft"><input type="checkbox" checked={dropSkipped} onChange={(e) => setDropSkipped(e.target.checked)} className="h-4 w-4 accent-brand-500" /> abgewählte Fotos löschen (doppelt)</label>}
      {error && <p role="alert" className="text-[13px] text-negative-text">{error}</p>}
      {/* Knöpfe: oben der eine Hauptschritt über die ganze Breite, darunter zwei gleich breite */}
      <div className={`space-y-2 ${sheet ? "sticky bottom-0 -mx-4 border-t border-line bg-canvas px-4 pt-3 pb-1 sm:-mx-5 sm:px-5" : "pt-1"}`}>
        <button type="button" disabled={busy || used.length < 2} onClick={() => void merge()} className="flex h-12 w-full items-center justify-center gap-2 whitespace-nowrap rounded-full bg-fg text-[15px] font-semibold text-canvas disabled:opacity-50">{busy ? <Loader2 size={16} className="animate-spin" /> : <Combine size={16} />} Zusammenfügen ({used.length} {used.length === 1 ? "Seite" : "Seiten"})</button>
        {(onNotSame || onCancel) && (
          <div className="grid grid-cols-2 gap-2">
            {onNotSame ? <button type="button" disabled={busy} onClick={onNotSame} className="flex h-11 items-center justify-center gap-1.5 rounded-full border border-card-line text-[14px] font-semibold hover:bg-surface-2"><X size={15} /> Nicht zusammen</button> : <span />}
            {onCancel && <button type="button" disabled={busy} onClick={onCancel} className="flex h-11 items-center justify-center rounded-full border border-card-line bg-surface-2 text-[14px] font-semibold text-fg hover:bg-surface-3">Später</button>}
          </div>
        )}
      </div>
      {zoom !== undefined && <Compare docs={list} start={zoom} role={role} onClose={() => setZoom(undefined)} />}
    </div>
  );
}

/**
 * Vollbild zum Vergleichen: Teile nebeneinander zum Wischen, je Teil zoomen (Doppeltippen oder +/−) und mit dem Finger
 * verschieben; schärferes Bild (1800 px) als die Vorschau.
 */
function Compare({ docs, start, role, onClose }: { docs: Doc[]; start: number; role: (d: Doc) => string; onClose: () => void }) {
  const [at, setAt] = useState(start);
  const [z, setZ] = useState(1);
  const strip = useRef<HTMLDivElement>(null);
  useEffect(() => { const el = strip.current; if (el) el.scrollLeft = start * el.clientWidth; /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);
  useEffect(() => { const k = (e: KeyboardEvent) => e.key === "Escape" && onClose(); addEventListener("keydown", k); return () => removeEventListener("keydown", k); }, [onClose]);
  const go = (i: number) => { const el = strip.current; if (!el) return; setZ(1); el.scrollTo({ left: Math.max(0, Math.min(docs.length - 1, i)) * el.clientWidth, behavior: "smooth" }); };
  const d = docs[at];
  return createPortal(
    <div className="fixed inset-0 z-[90] flex flex-col bg-black text-white" role="dialog" aria-label="Vergleichen">
      <div className="flex items-center gap-2 px-3 pt-[max(0.75rem,env(safe-area-inset-top))] pb-2">
        <span className="min-w-0 flex-1"><b className="block truncate text-[14px]">{d ? role(d) : ""} · Teil {at + 1} von {docs.length}</b><span className="block truncate text-[12px] text-white/60">{d?.title ?? d?.file_name}</span></span>
        <button type="button" onClick={onClose} aria-label="Schließen" className="grid h-10 w-10 place-items-center rounded-full bg-white/15"><X size={18} /></button>
      </div>
      <div ref={strip} onScroll={(e) => { const i = Math.round(e.currentTarget.scrollLeft / Math.max(1, e.currentTarget.clientWidth)); if (i !== at) { setAt(i); setZ(1); } }} className={`flex min-h-0 flex-1 snap-x snap-mandatory [scrollbar-width:none] ${z > 1 ? "overflow-x-hidden" : "overflow-x-auto"}`}>
        {docs.map((x, i) => (
          <div key={x.id} className="h-full w-full shrink-0 snap-center overflow-auto">
            <div onDoubleClick={() => setZ(z > 1 ? 1 : 2.5)} className="flex h-full items-center justify-center p-2" style={i === at && z > 1 ? { width: `${z * 100}%`, height: `${z * 100}%` } : undefined}>
              <PagePreview d={x} width={LARGE} className="rounded" />
            </div>
          </div>
        ))}
      </div>
      <div className="flex items-center justify-center gap-2 px-3 pt-2 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <button type="button" disabled={at === 0} onClick={() => go(at - 1)} aria-label="Vorheriger Teil" className="grid h-11 w-11 place-items-center rounded-full bg-white/15 disabled:opacity-30"><ChevronLeft size={20} /></button>
        <span className="inline-flex items-center rounded-full bg-white/15">
          <button type="button" disabled={z <= 1} onClick={() => setZ(Math.max(1, z - 0.75))} aria-label="Verkleinern" className="grid h-11 w-11 place-items-center disabled:opacity-30"><Minus size={18} /></button>
          <span className="tnum w-12 text-center text-[13px] font-semibold">{Math.round(z * 100)} %</span>
          <button type="button" disabled={z >= 4} onClick={() => setZ(Math.min(4, z + 0.75))} aria-label="Vergrößern" className="grid h-11 w-11 place-items-center disabled:opacity-30"><Plus size={18} /></button>
        </span>
        <button type="button" disabled={at >= docs.length - 1} onClick={() => go(at + 1)} aria-label="Nächster Teil" className="grid h-11 w-11 place-items-center rounded-full bg-white/15 disabled:opacity-30"><ChevronRight size={20} /></button>
      </div>
    </div>,
    document.body,
  );
}

/** Als Seitenpanel (Handy: von unten) */
export function MergeSheet(props: Parameters<typeof MergeReview>[0] & { onClose: () => void }) {
  const [closing, setClosing] = useState(false);
  const close = () => { setClosing(true); setTimeout(props.onClose, 190); };
  useEffect(() => { const k = (e: KeyboardEvent) => e.key === "Escape" && close(); window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);
  return createPortal(
    <div data-closing={closing || undefined} className="sheet-backdrop fixed inset-0 z-50 flex items-end bg-black/35 lg:items-stretch lg:justify-end" onClick={close}>
      <aside role="dialog" aria-modal="true" aria-label="Zusammenführen" data-closing={closing || undefined} onClick={(e) => e.stopPropagation()} className="sheet-panel max-h-[94dvh] w-full overflow-y-auto rounded-t-3xl bg-canvas p-4 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-lg sm:p-5 sm:pb-[max(1.25rem,env(safe-area-inset-bottom))] lg:h-full lg:max-h-none lg:w-[560px] lg:rounded-none">
        <MergeReview {...props} sheet onDone={() => { props.onDone?.(); close(); }} onCancel={close} onNotSame={props.onNotSame ? () => { props.onNotSame?.(); close(); } : undefined} />
      </aside>
    </div>,
    document.body,
  );
}
