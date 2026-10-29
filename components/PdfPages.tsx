"use client";
import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";

/**
 * Alle Seiten eines PDFs als Bilder – das iPhone zeigt im iframe nur Seite 1.
 * Bei Karten/Ausweisen (2 Seiten) mit „Vorderseite“/„Rückseite“ beschriftet.
 */
const MAX = 30;
export function PdfPages({ url, card = false, compact = false }: { url: string; card?: boolean; compact?: boolean }) {
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

  if (failed) return <iframe src={`${url}#toolbar=0&view=FitH`} title="Vorschau" className={`w-full ${compact ? "h-80" : "h-[60vh]"}`} />;
  const label = (i: number) => (card && total === 2 ? (i === 0 ? "Vorderseite" : "Rückseite") : `Seite ${i + 1} von ${total}`);
  const two = card && total === 2;
  return (
    <div className={`${compact ? "max-h-[28rem]" : "max-h-[75vh]"} overflow-y-auto p-2`}>
      <div className={two ? "grid gap-2 sm:grid-cols-2" : "space-y-2"}>
        {pages.map((u, i) => (
          <figure key={u} className="overflow-hidden rounded-lg border border-card-line bg-white">
            <img src={u} alt={label(i)} className={`mx-auto block w-full object-contain ${two ? "" : compact ? "max-h-80" : ""}`} />
            {total > 1 && <figcaption className="border-t border-line bg-surface px-2.5 py-1 text-[11.5px] font-semibold text-soft">{label(i)}</figcaption>}
          </figure>
        ))}
      </div>
      {pages.length < Math.min(total || 1, MAX) && <p className="flex items-center justify-center gap-2 py-6 text-[12.5px] text-muted"><Loader2 size={14} className="animate-spin" /> {total ? `Seite ${pages.length + 1} von ${total} …` : "Lade Seiten …"}</p>}
      {total > MAX && <p className="py-2 text-center text-[12px] text-muted">Weitere {total - MAX} Seiten im Original.</p>}
    </div>
  );
}

const CARD_RE = /ausweis|führerschein|fuehrerschein|reisepass|karte|aufenthaltstitel/i;
export const isCardDoc = (d: { doc_type?: string | null; title?: string | null }) => CARD_RE.test(`${d.doc_type ?? ""} ${d.title ?? ""}`);
