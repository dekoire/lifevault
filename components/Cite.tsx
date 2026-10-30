"use client";
import { useDetail } from "@/components/DetailPanel";

/**
 * Quellenverweis als lila [S. 3]: öffnet das Dokument rechts im Panel, springt auf die Seite und markiert die Stelle.
 * Im Chat-Text als `[[q:<Dokument-ID>|<Seite>|<wörtliches Zitat>]]`, in Karten über die Felder id/seite/zitat.
 */
export function Cite({ id, page, quote }: { id: string; page?: number; quote?: string }) {
  const open = useDetail();
  if (!id) return null;
  return (
    <button type="button" onClick={(e) => { e.stopPropagation(); open?.({ kind: "doc", id, page, quote }); }} title={quote ? `„${quote}“` : "Im Dokument ansehen"}
      className="tnum mx-0.5 inline-flex items-center rounded-md bg-brand-500/10 px-1 align-baseline text-[0.8em] leading-[1.5] font-semibold whitespace-nowrap text-brand-600 hover:bg-brand-500 hover:text-white">
      [{page ? `S. ${page}` : "Quelle"}]
    </button>
  );
}

/** `ID|Seite|Zitat` → Felder (Seite optional, auch „S. 3“) */
export function parseCite(raw: string): { id: string; page?: number; quote?: string } {
  const [id = "", p = "", ...rest] = raw.split("|").map((x) => x.trim());
  // drei Teile: ID|Seite|Zitat (Seite darf leer sein); zwei Teile: ID|Seite oder ID|Zitat
  const pageSlot = rest.length > 0 || /^(s\.?\s*)?\d+$/i.test(p);
  const page = pageSlot ? Number(/\d+/.exec(p)?.[0]) : NaN;
  const quote = (pageSlot ? rest.join("|") : p).trim().slice(0, 300);
  return { id, page: page > 0 ? page : undefined, quote: quote || undefined };
}

/** Quelle aus einem Karten-Objekt: {id, seite, zitat} */
export const citeOf = (x: Record<string, unknown>, fallbackId?: string) => {
  const id = typeof x.id === "string" ? x.id : fallbackId ?? "";
  const page = Number(x.seite);
  const quote = typeof x.zitat === "string" ? x.zitat.trim().slice(0, 300) : undefined;
  return { id, page: page > 0 ? page : undefined, quote: quote || undefined };
};
