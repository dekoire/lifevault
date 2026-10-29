"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, Check, ChevronLeft, ChevronRight, FileText, FileUp, Files, Camera, Loader2, ScanLine, Send, Trash2, X } from "lucide-react";
import { PDFDocument } from "pdf-lib";
import { UploadTarget } from "@/components/ProjectSwitcher";
import { useDocs } from "@/lib/docs";
import { scanPhoto, type ScanQuality } from "@/lib/scan";

type Item = { id: string; file: File; url?: string; orig?: File; quality?: ScanQuality; scanning?: boolean };
const isImage = (f: File) => f.type.startsWith("image/");
const isPdf = (f: File) => f.type === "application/pdf" || /\.pdf$/i.test(f.name);

/** Bild für die PDF verkleinern und als JPEG (auch HEIC/WebP, soweit der Browser sie anzeigen kann) */
async function toJpeg(file: File, max = 2200): Promise<Uint8Array> {
  const bmp = await createImageBitmap(file).catch(() => null);
  if (!bmp) return new Uint8Array(await file.arrayBuffer());
  const scale = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const c = document.createElement("canvas");
  c.width = Math.round(bmp.width * scale); c.height = Math.round(bmp.height * scale);
  c.getContext("2d")!.drawImage(bmp, 0, 0, c.width, c.height);
  const blob = await new Promise<Blob | null>((r) => c.toBlob(r, "image/jpeg", 0.85));
  return new Uint8Array(await (blob ?? file).arrayBuffer());
}

/** Fotos und PDFs zu einer PDF zusammenfügen – eine Seite pro Foto, PDF-Seiten werden übernommen */
async function combine(items: Item[]): Promise<File> {
  const pdf = await PDFDocument.create();
  for (const { file } of items) {
    if (isPdf(file)) {
      const src = await PDFDocument.load(await file.arrayBuffer(), { ignoreEncryption: true });
      for (const p of await pdf.copyPages(src, src.getPageIndices())) pdf.addPage(p);
    } else {
      const img = await pdf.embedJpg(await toJpeg(file));
      const page = pdf.addPage([img.width, img.height]);
      page.drawImage(img, { x: 0, y: 0, width: img.width, height: img.height });
    }
  }
  const bytes = await pdf.save();
  const day = new Date().toLocaleDateString("de-DE");
  return new File([bytes as BlobPart], `Scan ${day} (${pdf.getPageCount()} Seiten).pdf`, { type: "application/pdf" });
}

/**
 * Sammelmappe: mehrere Fotos/Dateien erst einsammeln, ordnen, dann auf einmal absenden –
 * wahlweise als EIN Dokument (zusammengehörige Seiten) oder einzeln.
 */
export function useCaptureTray() {
  const { upload } = useDocs();
  const [items, setItems] = useState<Item[]>([]);
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"one" | "single">("one");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const cam = useRef<HTMLInputElement>(null);
  const files = useRef<HTMLInputElement>(null);

  // Vorschaubilder wieder freigeben
  useEffect(() => () => items.forEach((i) => i.url && URL.revokeObjectURL(i.url)), []); // eslint-disable-line react-hooks/exhaustive-deps

  // Scan-Modus: Fotos geradeziehen und als Schwarz-Weiß-Scan aufhellen (gemerkt)
  const [scan, setScan] = useState(true);
  useEffect(() => { try { setScan(localStorage.getItem("lifevault:scan") !== "0"); } catch { /* egal */ } }, []);
  const process = (it: Item) => {
    setItems((cur) => cur.map((x) => (x.id === it.id ? { ...x, scanning: true } : x)));
    void scanPhoto(it.orig ?? it.file).then((r) => setItems((cur) => cur.map((x) => (x.id === it.id ? { ...x, orig: x.orig ?? x.file, file: r.file, url: r.url, quality: r.quality, scanning: false } : x))))
      .catch(() => setItems((cur) => cur.map((x) => (x.id === it.id ? { ...x, scanning: false } : x))));
  };
  const toggleScan = () => {
    const on = !scan;
    setScan(on);
    try { localStorage.setItem("lifevault:scan", on ? "1" : "0"); } catch { /* egal */ }
    if (on) items.filter((i) => isImage(i.orig ?? i.file)).forEach(process);
    else setItems((cur) => cur.map((x) => (x.orig ? { ...x, file: x.orig, url: URL.createObjectURL(x.orig), orig: undefined } : x)));
  };
  const add = (list: File[]) => {
    if (!list.length) return;
    const fresh = list.map((file) => ({ id: crypto.randomUUID(), file, url: isImage(file) ? URL.createObjectURL(file) : undefined }));
    setItems((cur) => [...cur, ...fresh]);
    if (scan) fresh.filter((i) => isImage(i.file)).forEach(process);
    setError(undefined);
    setOpen(true);
  };
  const onPick = (e: React.ChangeEvent<HTMLInputElement>) => { const list = [...(e.target.files ?? [])]; e.target.value = ""; add(list); };
  const remove = (id: string) => setItems((cur) => { const it = cur.find((i) => i.id === id); if (it?.url) URL.revokeObjectURL(it.url); return cur.filter((i) => i.id !== id); });
  const move = (i: number, d: -1 | 1) => setItems((cur) => { const n = [...cur]; const j = i + d; if (j < 0 || j >= n.length) return cur; [n[i], n[j]] = [n[j], n[i]]; return n; });
  const clear = () => { items.forEach((i) => i.url && URL.revokeObjectURL(i.url)); setItems([]); setOpen(false); setError(undefined); };

  // Zusammenfügen geht nur mit Fotos und PDFs; Office-Dateien gehen immer einzeln
  const combinable = items.filter((i) => isImage(i.file) || isPdf(i.file));
  const others = items.filter((i) => !combinable.includes(i));
  const canCombine = combinable.length >= 2;
  const effectiveMode = canCombine ? mode : "single";

  const send = async () => {
    if (!items.length || busy) return;
    setBusy(true); setError(undefined);
    try {
      const out = effectiveMode === "one" ? [await combine(combinable), ...others.map((i) => i.file)] : items.map((i) => i.file);
      const big = out.find((f) => f.size > 20 * 1024 * 1024);
      if (big) throw new Error(`„${big.name}“ ist größer als 20 MB. Bitte weniger Seiten auf einmal oder einzeln senden.`);
      clear();
      void upload(out);
    } catch (e) {
      setError((e as Error).message || "Zusammenfügen hat nicht geklappt. Versuch es mit „Einzeln“.");
    } finally {
      setBusy(false);
    }
  };

  const pages = useMemo(() => items.length, [items]);
  const ui = (
    <>
      <input ref={cam} type="file" accept="image/*" capture="environment" className="hidden" onChange={onPick} />
      <input ref={files} type="file" accept="image/*,application/pdf,.pptx,.docx,.xlsx" multiple className="hidden" onChange={onPick} />
      {/* minimiert: kleine Leiste „3 gesammelt“ */}
      {!open && pages > 0 && (
        <button type="button" onClick={() => setOpen(true)} className="sheet-up fixed right-4 bottom-24 z-40 inline-flex h-12 items-center gap-2 rounded-full bg-fg pr-5 pl-4 text-[14px] font-semibold text-canvas shadow-[0_8px_24px_rgba(16,24,40,.25)] lg:bottom-6">
          <Files size={18} /> {pages} gesammelt – weiter
        </button>
      )}
      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center" role="dialog" aria-modal="true" aria-label="Seiten sammeln">
          <div className="sheet-up pb-safe flex max-h-[92dvh] w-full max-w-xl flex-col rounded-t-3xl bg-surface sm:rounded-3xl">
            <div className="flex items-start justify-between gap-4 px-6 pt-6 pb-3 sm:px-8 sm:pt-7">
              <div>
                <h2 className="text-[18px] font-semibold">{pages ? `${pages} ${pages === 1 ? "Seite" : "Seiten"} gesammelt` : "Seiten sammeln"}</h2>
                <p className="mt-1 text-[13px] text-muted">Fotografiere alle Seiten, die zusammengehören – dann einmal absenden.</p>
              </div>
              <button type="button" onClick={() => setOpen(false)} aria-label="Minimieren" className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-surface-3"><X size={18} /></button>
            </div>

            <div className="flex-1 overflow-y-auto px-6 pb-4 sm:px-8">
              <ol className="grid grid-cols-3 gap-2.5 sm:grid-cols-4">
                {items.map((it, i) => (
                  <li key={it.id} className="group relative aspect-[3/4] overflow-hidden rounded-xl border border-card-line bg-surface-2">
                    {it.url ? <img src={it.url} alt={`Seite ${i + 1}`} className="h-full w-full object-cover" /> : (
                      <span className="flex h-full flex-col items-center justify-center gap-1.5 p-2 text-center"><FileText size={26} className="text-soft" /><span className="line-clamp-3 text-[11px] font-medium break-all text-soft">{it.file.name}</span></span>
                    )}
                    <span className="absolute top-1.5 left-1.5 grid h-6 min-w-6 place-items-center rounded-full bg-fg px-1.5 text-[11.5px] font-bold text-canvas">{i + 1}</span>
                    {it.scanning && <span className="absolute inset-0 grid place-items-center bg-black/30 text-white"><Loader2 size={22} className="animate-spin" /></span>}
                    {it.quality && !it.scanning && (
                      <span title={it.quality.note} className={`absolute inset-x-1.5 top-9 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10.5px] font-semibold text-white ${it.quality.ok ? "bg-positive" : "bg-amber"}`}>
                        {it.quality.ok ? <Check size={11} strokeWidth={3} /> : <AlertTriangle size={11} />}<span className="truncate">{it.quality.ok ? "Gut eingerahmt" : it.quality.note}</span>
                      </span>
                    )}
                    <button type="button" onClick={() => remove(it.id)} aria-label={`Seite ${i + 1} entfernen`} className="absolute top-1.5 right-1.5 grid h-7 w-7 place-items-center rounded-full bg-surface/90 text-fg shadow-sm"><Trash2 size={14} /></button>
                    {items.length > 1 && (
                      <span className="absolute inset-x-1.5 bottom-1.5 flex justify-between">
                        <button type="button" onClick={() => move(i, -1)} disabled={i === 0} aria-label="Nach vorne" className="grid h-7 w-7 place-items-center rounded-full bg-surface/90 shadow-sm disabled:opacity-0"><ChevronLeft size={15} /></button>
                        <button type="button" onClick={() => move(i, 1)} disabled={i === items.length - 1} aria-label="Nach hinten" className="grid h-7 w-7 place-items-center rounded-full bg-surface/90 shadow-sm disabled:opacity-0"><ChevronRight size={15} /></button>
                      </span>
                    )}
                  </li>
                ))}
                {/* nächste Seite */}
                <li>
                  <button type="button" onClick={() => cam.current?.click()} className="flex aspect-[3/4] w-full flex-col items-center justify-center gap-1.5 rounded-xl border-2 border-dashed border-brand-500/40 bg-lavender text-[12.5px] font-semibold text-brand-600 active:scale-[.98]">
                    <Camera size={24} /> {pages ? "Nächste Seite" : "Fotografieren"}
                  </button>
                </li>
              </ol>

              <div className="mt-3 flex flex-wrap items-center gap-2">
                <button type="button" onClick={() => files.current?.click()} className="inline-flex h-10 items-center gap-2 rounded-full border border-card-line px-4 text-[13.5px] font-semibold hover:bg-surface-2"><FileUp size={16} /> Fotos oder PDFs auswählen</button>
                <button type="button" role="switch" aria-checked={scan} onClick={toggleScan} title="Fotos geradeziehen und als Schwarz-Weiß-Scan aufhellen" className={`inline-flex h-10 items-center gap-2 rounded-full px-4 text-[13.5px] font-semibold ${scan ? "bg-brand-500 text-white" : "border border-card-line text-soft hover:bg-surface-2"}`}><ScanLine size={16} /> Scan-Modus {scan ? "an" : "aus"}</button>
              </div>
              {scan && <p className="mt-1.5 text-[12px] text-muted">Fotos werden geradegezogen und wie ein Scan aufgehellt (schwarz-weiß, gut zum Drucken). Tipp: Blatt auf dunklen Untergrund legen.</p>}

              {canCombine && (
                <fieldset className="mt-5">
                  <legend className="mb-2 text-[13px] font-semibold text-soft">Wie ablegen?</legend>
                  <div className="grid grid-cols-2 gap-2">
                    {([["one", "Ein Dokument", `${combinable.length} Seiten in einer PDF – für Briefe, Verträge, Befunde`], ["single", "Einzeln", `${items.length} getrennte Dokumente`]] as const).map(([k, l, d]) => (
                      <button key={k} type="button" role="radio" aria-checked={mode === k} onClick={() => setMode(k)} className={`rounded-2xl border p-3 text-left ${mode === k ? "border-fg bg-surface-2 ring-1 ring-fg" : "border-card-line"}`}>
                        <b className="block text-[14px]">{l}</b><span className="mt-0.5 block text-[12px] leading-4 text-muted">{d}</span>
                      </button>
                    ))}
                  </div>
                  {mode === "one" && others.length > 0 && <p className="mt-2 text-[12px] text-muted">{others.length} Office-Datei{others.length === 1 ? " geht" : "en gehen"} einzeln mit.</p>}
                </fieldset>
              )}
              <div className="mt-4"><UploadTarget /></div>
              {error && <p role="alert" className="mt-2 rounded-xl bg-negative/10 px-3.5 py-2.5 text-[13px] text-negative-text">{error}</p>}
            </div>

            <div className="flex gap-2.5 border-t border-line px-6 pt-4 pb-6 sm:px-8 sm:pb-7">
              <button type="button" onClick={() => { if (!pages || confirm("Gesammelte Seiten verwerfen?")) clear(); }} className="h-12 rounded-full px-4 text-[14px] font-semibold text-soft hover:bg-surface-2">Verwerfen</button>
              <button type="button" onClick={() => void send()} disabled={!pages || busy} className="inline-flex h-12 flex-1 items-center justify-center gap-2 rounded-full bg-brand-500 text-[15px] font-semibold text-white disabled:opacity-40">
                {busy ? <><Loader2 size={17} className="animate-spin" /> Wird vorbereitet …</> : <><Send size={17} /> {effectiveMode === "one" && canCombine ? `Als 1 Dokument absenden` : `${pages || ""} absenden`}</>}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
  return { ui, openCamera: () => { setOpen(true); cam.current?.click(); }, openFiles: () => files.current?.click(), openTray: () => setOpen(true), add };
}
