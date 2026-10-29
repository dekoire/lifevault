"use client";
import { useEffect, useState } from "react";
import { ExternalLink, Loader2, Presentation } from "lucide-react";
import { officeKind, readOffice, type OfficeContent } from "@/lib/office";

/**
 * Vorschau für PowerPoint, Word, Excel direkt im Browser: Vorschaubild (falls in der Datei) und Text je Folie/Seite.
 * Optional: Original-Ansicht über Microsoft – nur nach Rückfrage, weil die Datei dafür kurz an Microsoft geht.
 */
export function OfficePreview({ url, mime, name, compact = false }: { url: string; mime: string; name: string; compact?: boolean }) {
  const [c, setC] = useState<OfficeContent | null>();
  const [thumb, setThumb] = useState<string>();
  const kind = officeKind(mime, name);
  useEffect(() => {
    if (!kind) return;
    let objectUrl: string | undefined;
    void fetch(url).then((r) => r.arrayBuffer()).then((buf) => {
      const content = readOffice(new Uint8Array(buf), kind);
      if (content.thumbnail) { objectUrl = URL.createObjectURL(new Blob([content.thumbnail as BlobPart])); setThumb(objectUrl); }
      setC(content);
    }).catch(() => setC(null));
    return () => { if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [url, kind]);
  if (!kind) return null;
  const openMs = () => {
    if (confirm("Für die Original-Ansicht wird die Datei kurz über einen zeitlich begrenzten Link an den Microsoft-Office-Viewer übergeben. Fortfahren?")) window.open(`https://view.officeapps.live.com/op/view.aspx?src=${encodeURIComponent(url)}`, "_blank", "noopener");
  };
  const label = kind === "pptx" ? "Folien" : kind === "xlsx" ? "Tabellen" : "Inhalt";
  return (
    <div className="space-y-3 p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 text-[13px] font-semibold"><Presentation size={15} /> {kind === "pptx" ? "PowerPoint" : kind === "docx" ? "Word" : "Excel"}{c ? ` · ${c.parts.length} ${label}` : ""}</span>
        <button type="button" onClick={openMs} className="inline-flex h-8 items-center gap-1.5 rounded-full border border-card-line bg-surface px-3 text-[12px] font-semibold hover:bg-surface-2"><ExternalLink size={13} /> Original-Ansicht</button>
      </div>
      {c === undefined && <p className="flex items-center gap-2 text-[13px] text-muted"><Loader2 size={14} className="animate-spin" /> Lade Vorschau …</p>}
      {c === null && <p className="text-[13px] text-muted">Vorschau nicht möglich – „Original-Ansicht“ nutzen oder herunterladen.</p>}
      {thumb && <img src={thumb} alt="Vorschaubild" className="w-full rounded-xl border border-card-line bg-white object-contain" />}
      {c && (
        <ol className={`space-y-2 overflow-y-auto ${compact ? "max-h-72" : "max-h-[60vh]"}`}>
          {c.parts.map((p, i) => (
            <li key={i} className="rounded-xl border border-card-line bg-surface p-3">
              <b className="text-[12px] text-muted">{p.title}</b>
              <p className="mt-1 line-clamp-6 text-[13px] leading-5 whitespace-pre-line">{p.text || "– ohne Text –"}</p>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
