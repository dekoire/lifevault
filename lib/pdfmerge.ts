"use client";
import { supabase } from "@/lib/supabase";
import type { Doc } from "@/lib/types";

/** Mehrere Dokumente (Fotos/PDFs) in dieser Reihenfolge zu einem PDF – im Browser, A4-Breite */
export async function toPdf(docs: Doc[]) {
  const { PDFDocument } = await import("pdf-lib");
  const pdf = await PDFDocument.create();
  for (const d of docs) {
    const { data, error } = await supabase.storage.from("documents").download(d.file_path);
    if (error || !data) throw new Error(`„${d.title ?? d.file_name}“ konnte nicht geladen werden.`);
    if (d.mime_type === "application/pdf") {
      const src = await PDFDocument.load(await data.arrayBuffer(), { ignoreEncryption: true });
      for (const p of await pdf.copyPages(src, src.getPageIndices())) pdf.addPage(p);
      continue;
    }
    // Bild: JPG/PNG direkt, alles andere (HEIC, WebP) über Canvas als JPG; auf A4-Breite skaliert
    let bytes = await data.arrayBuffer(), jpg = d.mime_type === "image/jpeg";
    if (!jpg && d.mime_type !== "image/png") {
      const bmp = await createImageBitmap(data);
      const c = document.createElement("canvas"); c.width = bmp.width; c.height = bmp.height;
      c.getContext("2d")!.drawImage(bmp, 0, 0);
      bytes = await (await new Promise<Blob>((ok) => c.toBlob((b) => ok(b!), "image/jpeg", 0.9))).arrayBuffer();
      jpg = true;
    }
    const img = jpg ? await pdf.embedJpg(bytes) : await pdf.embedPng(bytes);
    const W = 595, scale = W / img.width, H = img.height * scale;
    pdf.addPage([W, H]).drawImage(img, { x: 0, y: 0, width: W, height: H });
  }
  return new Blob([await pdf.save() as BlobPart], { type: "application/pdf" });
}
