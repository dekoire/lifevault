"use client";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Loader2, X } from "lucide-react";

/**
 * Alle Seiten eines PDFs als Bilder – das iPhone zeigt im iframe nur Seite 1.
 * Bei Karten/Ausweisen (2 Seiten) mit „Vorderseite“/„Rückseite“ beschriftet.
 */
const MAX = 30;

/** nur Buchstaben und Ziffern, klein – so stören Zeilenumbrüche, Trennstriche und Satzzeichen nicht beim Suchen */
const keyOf = (t: string) => t.toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
type TextItem = { str: string; transform: number[]; width: number };
type Viewport = { scale: number; convertToViewportPoint: (x: number, y: number) => number[] };

/** Rechtecke (in Canvas-Pixeln) der Textstücke, die das Zitat enthalten; bei Abweichungen reicht der Anfang */
function quoteRects(items: TextItem[], quote: string, vp: Viewport): number[][] {
  let hay = "";
  const owner: number[] = [];
  items.forEach((it, i) => { const k = keyOf(it.str); hay += k; for (let j = 0; j < k.length; j++) owner.push(i); });
  const q = keyOf(quote);
  if (q.length < 6) return [];
  let at = -1, len = 0;
  for (const n of [q.length, 60, 40, 24]) { if (n > q.length) continue; at = hay.indexOf(q.slice(0, n)); if (at >= 0) { len = n; break; } }
  if (at < 0) return [];
  const hit = new Set(owner.slice(at, at + len));
  return [...hit].map((i) => {
    const t = items[i].transform;
    const [x, y] = vp.convertToViewportPoint(t[4], t[5]);
    const h = Math.hypot(t[2], t[3]) * vp.scale;
    return [x - 2, y - h * 1.05, items[i].width * vp.scale + 4, h * 1.35];
  });
}

export function PdfPages({ url, card = false, compact = false, bare = false, focus }: { url: string; card?: boolean; compact?: boolean; bare?: boolean; focus?: { page?: number; quote?: string } }) {
  const [pages, setPages] = useState<string[]>([]);
  const [jump, setJump] = useState<{ page: number; marked: boolean }>();
  const strip = useRef<HTMLDivElement>(null);
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
        const n = Math.min(pdf.numPages, MAX);
        const quote = focus?.quote ?? "";
        const textOf = async (i: number) => ((await (await pdf.getPage(i)).getTextContent()).items as unknown[]).filter((x): x is TextItem => typeof (x as TextItem).str === "string");
        // Zielseite: die genannte, wenn das Zitat dort steht; sonst die erste Seite mit dem Zitat; sonst die genannte
        let target = 0;
        if (focus?.page && focus.page <= n) {
          const pg = await pdf.getPage(focus.page);
          if (!quote || quoteRects(await textOf(focus.page), quote, pg.getViewport({ scale: 1 })).length) target = focus.page;
        }
        for (let i = 1; i <= n && !stop; i++) {
          const page = await pdf.getPage(i);
          const base = page.getViewport({ scale: 1 });
          const vp = page.getViewport({ scale: Math.min(2.5, 1100 / base.width) });
          const canvas = document.createElement("canvas"); canvas.width = vp.width; canvas.height = vp.height;
          const ctx = canvas.getContext("2d")!; ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, vp.width, vp.height);
          await page.render({ canvasContext: ctx, viewport: vp, canvas } as Parameters<typeof page.render>[0]).promise;
          // Fundstelle lila markieren (wie mit dem Textmarker)
          const rects = quote && (!target || target === i) ? quoteRects(await textOf(i), quote, vp as unknown as Viewport) : [];
          if (rects.length) {
            ctx.globalCompositeOperation = "multiply"; ctx.fillStyle = "rgba(109,74,255,0.28)";
            for (const [x, y, w, h] of rects) ctx.fillRect(x, y, w, h);
            ctx.globalCompositeOperation = "source-over"; ctx.fillStyle = "#6d4aff";
            const top = Math.min(...rects.map((r) => r[1])), bottom = Math.max(...rects.map((r) => r[1] + r[3]));
            ctx.fillRect(Math.max(4, Math.min(...rects.map((r) => r[0])) - 14), top, 5, bottom - top);
            if (!target) target = i;
          }
          const blob = await new Promise<Blob | null>((ok) => canvas.toBlob(ok, "image/jpeg", 0.85));
          if (!blob || stop) break;
          const u = URL.createObjectURL(blob); made.push(u);
          setPages((p) => [...p, u]);
          if (target === i) setJump({ page: i, marked: rects.length > 0 });
        }
        if (!target && focus?.page && focus.page <= n && !stop) setJump({ page: focus.page, marked: false });
      } catch { if (!stop) setFailed(true); }
    })();
    return () => { stop = true; made.forEach((u) => URL.revokeObjectURL(u)); };
  }, [url]); // eslint-disable-line react-hooks/exhaustive-deps -- focus wechselt nur mit neuem Panel

  // zur Fundstelle wischen, sobald die Seite da ist
  const jumped = useRef(false);
  useEffect(() => {
    const el = jump && strip.current?.children[jump.page - 1] as HTMLElement | undefined;
    if (!el || !strip.current || jumped.current) return;
    jumped.current = true;
    strip.current.scrollTo({ left: el.offsetLeft, behavior: "smooth" });
    el.scrollIntoView({ block: "nearest" });
  }, [jump, pages.length]);

  const [zoom, setZoom] = useState<number>();
  const [at, setAt] = useState(0);
  if (failed) return <iframe src={`${url}#toolbar=0&view=FitH`} title="Vorschau" className={`w-full ${compact ? "h-80" : "h-[60vh]"}`} />;
  const label = (i: number) => (card && total === 2 ? (i === 0 ? "Vorderseite" : "Rückseite") : `Seite ${i + 1} von ${total}`);
  const loading = pages.length < Math.min(total || 1, MAX);
  return (
    <div className={bare ? "" : "p-2"}>
      {/* zum Wischen: jede Seite passt ganz ins Bild, Tippen öffnet sie groß */}
      {focus && jump && <p className="flex items-center justify-center gap-1.5 bg-brand-500/10 px-3 py-1.5 text-[12px] font-semibold text-brand-600">{jump.marked ? `Fundstelle auf Seite ${jump.page} markiert` : `Seite ${jump.page} – Stelle nicht genau gefunden`}</p>}
      <div ref={strip} onScroll={(e) => { const el = e.currentTarget; setAt(Math.round(el.scrollLeft / Math.max(1, el.clientWidth))); }} className="relative flex snap-x snap-mandatory gap-2 overflow-x-auto [scrollbar-width:none]">
        {pages.map((u, i) => (
          <figure key={u} className={`w-full shrink-0 snap-center overflow-hidden ${bare ? "" : "rounded-lg border border-card-line bg-white"}`}>
            {/* ohne Rahmen: Seite wie ein Blatt Papier auf hellem Grund (statt schwarzer Balken links und rechts) */}
            <button type="button" onClick={() => setZoom(i)} className={`flex w-full items-center justify-center ${bare ? `bg-surface-2 px-4 py-4 ${compact ? "h-72" : "h-[60vh]"}` : ""}`} aria-label={`${label(i)} groß ansehen`}>
              <img src={u} alt={label(i)} className={bare ? "block max-h-full max-w-full rounded-[3px] bg-white object-contain shadow-[0_1px_3px_rgba(16,24,40,.12),0_8px_24px_rgba(16,24,40,.10)]" : `mx-auto block w-full object-contain ${compact ? "h-64" : "h-[55vh]"}`} />
            </button>
            {total > 1 && <figcaption className={`px-2.5 py-1 text-[12px] font-semibold text-soft ${bare ? "bg-surface-2 pb-2 text-center" : "border-t border-line bg-surface"}`}>{label(i)}</figcaption>}
          </figure>
        ))}
        {loading && <p className={`flex w-full shrink-0 items-center justify-center gap-2 text-[13px] text-muted ${compact ? "h-64" : "h-[55vh]"}`}><Loader2 size={14} className="animate-spin" /> {total ? `Seite ${pages.length + 1} von ${total} …` : "Lade Seiten …"}</p>}
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
