"use client";
import { supabase } from "@/lib/supabase";
import type { Doc } from "@/lib/types";

/**
 * Vorschaubilder statt Originale: Fotos haben oft 1–3 MB, eine Kachel braucht ~30 KB.
 * Einmal im Browser verkleinert (Foto direkt, PDF = erste Seite), als JPG im eigenen Ordner abgelegt
 * (<user>/thumbs/<id>-<breite>.jpg) und danach nur noch das kleine Bild geladen. Verschlüsseltes bekommt keine Vorschau.
 */
export const SMALL = 320, MEDIUM = 900, LARGE = 1800; // LARGE: zum Zoomen im Vollbild
const mem = new Map<string, Promise<string | undefined>>();

// höchstens 2 gleichzeitig erzeugen, damit das Handy nicht hängt
let running = 0;
const waiting: (() => void)[] = [];
async function slot<T>(fn: () => Promise<T>): Promise<T> {
  if (running >= 2) await new Promise<void>((ok) => waiting.push(ok));
  running++;
  try { return await fn(); } finally { running--; waiting.shift()?.(); }
}

export const thumbPath = (d: Pick<Doc, "id" | "file_path">, w: number) => `${d.file_path.split("/")[0]}/thumbs/${d.id}-${w}.jpg`;

async function render(d: Doc, w: number): Promise<Blob | undefined> {
  const { data } = await supabase.storage.from("documents").download(d.file_path);
  if (!data) return undefined;
  let canvas: HTMLCanvasElement;
  if (d.mime_type.startsWith("image/")) {
    const bmp = await createImageBitmap(data);
    const s = Math.min(1, w / bmp.width);
    canvas = document.createElement("canvas"); canvas.width = Math.round(bmp.width * s); canvas.height = Math.round(bmp.height * s);
    canvas.getContext("2d")!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
  } else if (d.mime_type === "application/pdf") {
    const { getDocumentProxy } = await import("unpdf");
    const pdf = await getDocumentProxy(new Uint8Array(await data.arrayBuffer()));
    const page = await pdf.getPage(1);
    const base = page.getViewport({ scale: 1 });
    const vp = page.getViewport({ scale: Math.min(2, w / base.width) });
    canvas = document.createElement("canvas"); canvas.width = vp.width; canvas.height = vp.height;
    const ctx = canvas.getContext("2d")!; ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, vp.width, vp.height);
    await page.render({ canvasContext: ctx, viewport: vp, canvas } as Parameters<typeof page.render>[0]).promise;
  } else return undefined;
  return await new Promise<Blob | undefined>((ok) => canvas.toBlob((b) => ok(b ?? undefined), "image/jpeg", w <= SMALL ? 0.7 : 0.8));
}

/** URL eines kleinen Bildes (vorhanden → signierter Link, sonst erzeugen und ablegen) */
export function thumbUrl(d: Doc, w = SMALL): Promise<string | undefined> {
  if (d.encrypted || d.file_path.startsWith("inbox/") || !(d.mime_type.startsWith("image/") || d.mime_type === "application/pdf")) return Promise.resolve(undefined);
  const key = `${d.id}-${w}`;
  const hit = mem.get(key);
  if (hit) return hit;
  const p = (async () => {
    const path = thumbPath(d, w);
    const { data } = await supabase.storage.from("documents").createSignedUrl(path, 3600);
    if (data?.signedUrl) return data.signedUrl;
    return slot(async () => {
      const blob = await render(d, w).catch(() => undefined);
      if (!blob) return undefined;
      // ablegen (ohne Überschreiben); klappt es nicht, trotzdem anzeigen
      void supabase.storage.from("documents").upload(path, blob, { contentType: "image/jpeg", upsert: false }).catch(() => undefined);
      return URL.createObjectURL(blob);
    });
  })();
  mem.set(key, p);
  p.then((u) => { if (!u) mem.delete(key); }).catch(() => mem.delete(key));
  return p;
}

/** beim Löschen eines Dokuments die Vorschaubilder mit entfernen */
export async function removeThumbs(d: Pick<Doc, "id" | "file_path">) {
  await supabase.storage.from("documents").remove([thumbPath(d, SMALL), thumbPath(d, MEDIUM), thumbPath(d, LARGE)]).catch(() => undefined);
}
