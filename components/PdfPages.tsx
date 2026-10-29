"use client";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Loader2, X } from "lucide-react";

/**
 * Alle Seiten eines PDFs als Bilder – das iPhone zeigt im iframe nur Seite 1.
 * Bei Karten/Ausweisen (2 Seiten) mit „Vorderseite“/„Rückseite“ beschriftet.
 */
const MAX = 30;
export function PdfPages({ url, card = false, compact = false, bare = false }: { url: string; card?: boolean; compact?: boolean; bare?: boolean }) {
  const [pages, setPages] = useState<string[]>([]);
  const [total, setTotal] = useState(0);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let stop = false;
    const made: string[] = [];
    setPages([]); setFailed(false);
    void (async () => {
      try {
        const buf = new Uint8Array(await (await fetch(url)).arrayBuffer());
        const { getDocumentProxy } = await import("unpdf");
        const pdf = await getDocumentProxy(buf);
        if (stop) return;
        setTotal(pdf.numPages);
        for (let i = 1; i <= Math.min(pdf.numPages, MAX) && !stop; i++) {
          const page = await pdf.getPage(i);
          const base = page.getViewport({ scale: 1 });
          const vp = page.getViewport({ scale: Math.min(2.5, 1100 / base.width) });
          const canvas = document.createElement("canvas"); canvas.width = vp.width; canvas.height = vp.height;
          const ctx = canvas.getContext("2d")!; ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, vp.width, vp.height);
          await page.render({ canvasContext: ctx, viewport: vp, canvas } as Parameters<typeof page.render>[0]).promise;
          const blob = await new Promise<Blob | null>((ok) => canvas.toBlob(ok, "image/jpeg", 0.85));
          if (!blob || stop) break;
          const u = URL.createObjectURL(blob); made.push(u);
          setPages((p) => [...p, u]);
        }
      } catch { if (!stop) setFailed(true); }
    })();
    return () => { stop = true; made.forEach((u) => URL.revokeObjectURL(u)); };
  }, [url]);

  const [zoom, setZoom] = useState<number>();
  const [at, setAt] = useState(0);
  if (failed) return <iframe src={`${url}#toolbar=0&view=FitH`} title="Vorschau" className={`w-full ${compact ? "h-80" : "h-[60vh]"}`} />;
  const label = (i: number) => (card && total === 2 ? (i === 0 ? "Vorderseite" : "Rückseite") : `Seite ${i + 1} von ${total}`);
  const loading = pages.length < Math.min(total || 1, MAX);
  return (
    <div className={bare ? "" : "p-2"}>
      {/* zum Wischen: jede Seite passt ganz ins Bild, Tippen öffnet sie groß */}
      <div onScroll={(e) => { const el = e.currentTarget; setAt(Math.round(el.scrollLeft / Math.max(1, el.clientWidth))); }} className="flex snap-x snap-mandatory gap-2 overflow-x-auto [scrollbar-width:none]">
        {pages.map((u, i) => (
          <figure key={u} className={`w-full shrink-0 snap-center overflow-hidden bg-white ${bare ? "" : "rounded-lg border border-card-line"}`}>
            <button type="button" onClick={() => setZoom(i)} className="block w-full" aria-label={`${label(i)} groß ansehen`}>
              <img src={u} alt={label(i)} className={`mx-auto block w-full object-contain ${compact ? "h-64" : "h-[55vh]"}`} />
            </button>
            {total > 1 && <figcaption className="border-t border-line bg-surface px-2.5 py-1 text-[11.5px] font-semibold text-soft">{label(i)}</figcaption>}
          </figure>
        ))}
        {loading && <p className={`flex w-full shrink-0 items-center justify-center gap-2 text-[12.5px] text-muted ${compact ? "h-64" : "h-[55vh]"}`}><Loader2 size={14} className="animate-spin" /> {total ? `Seite ${pages.length + 1} von ${total} …` : "Lade Seiten …"}</p>}
      </div>
      {total > 1 && (
        <p className={`flex items-center justify-center gap-1.5 ${bare ? "py-2.5" : "mt-2"}`}>
          {Array.from({ length: Math.min(total, MAX) }, (_, i) => <span key={i} className={`h-1.5 rounded-full transition-all ${i === at ? "w-4 bg-fg" : "w-1.5 bg-line-strong"}`} />)}
        </p>
      )}
      {total > MAX && <p className="py-2 text-center text-[12px] text-muted">Weitere {total - MAX} Seiten im Original.</p>}
      {zoom !== undefined && pages[zoom] && <Viewer src={pages[zoom]} label={label(zoom)} onClose={() => setZoom(undefined)} />}
    </div>
  );
}

/** Vollbild: erst ganz sichtbar, Tippen zoomt hinein (dann mit dem Finger verschieben), nochmal Tippen zoomt heraus */
function Viewer({ src, label, onClose }: { src: string; label: string; onClose: () => void }) {
  const [big, setBig] = useState(false);
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    addEventListener("keydown", k); return () => removeEventListener("keydown", k);
  }, [onClose]);
  return createPortal(
    <div className="fixed inset-0 z-[80] flex flex-col bg-black/95 text-white" role="dialog" aria-label={label}>
      <div className="flex items-center justify-between px-4 pt-[max(0.75rem,env(safe-area-inset-top))] pb-2">
        <span className="text-[13px] font-semibold">{label} · {big ? "Tippen zum Verkleinern" : "Tippen zum Vergrößern"}</span>
        <button type="button" onClick={onClose} className="grid h-10 w-10 place-items-center rounded-full bg-white/15" aria-label="Schließen"><X size={18} /></button>
      </div>
      <div className={`flex-1 overflow-auto ${big ? "" : "grid place-items-center"}`}>
        <img src={src} alt={label} onClick={() => setBig(!big)} className={big ? "block max-w-none w-[260%] cursor-zoom-out" : "block max-h-full max-w-full cursor-zoom-in object-contain"} />
      </div>
    </div>,
    document.body,
  );
}

const CARD_RE = /ausweis|führerschein|fuehrerschein|reisepass|karte|aufenthaltstitel/i;
export const isCardDoc = (d: { doc_type?: string | null; title?: string | null }) => CARD_RE.test(`${d.doc_type ?? ""} ${d.title ?? ""}`);
