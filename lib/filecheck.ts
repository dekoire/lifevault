import { inflate } from "@/lib/inflate";

/**
 * Sicherheitsprüfung für jede Datei, die in den Tresor kommt (Hochladen, Mail-Import, verbundene Apps) – am Inhalt, nicht
 * am Namen. Abgelehnt wird, was beim Öffnen auf dem Gerät Schaden anrichten könnte:
 * - PDFs mit aktiven Inhalten (Skripte, Startbefehle, eingebettete Dateien, Formular-Übertragung) – auch in komprimierten
 *   Objekt-Bereichen (/ObjStm), die im Rohtext nicht zu sehen sind
 * - Office-Dateien mit Makros, ActiveX oder eingebetteten Objekten; alte Formate (.doc/.xls/.ppt) gar nicht
 * - Dateien, deren Inhalt nicht zum angegebenen Typ passt (z. B. ein Programm, das sich „Rechnung.pdf“ nennt)
 * Gleiche Prüfung im Browser (vor dem Hochladen) und auf dem Server (vor dem Auslesen). Ein Virenscanner ist das nicht.
 */
const latin1 = (b: Uint8Array, max = b.length) => {
  let s = "";
  for (let i = 0; i < Math.min(b.length, max); i += 0x8000) s += String.fromCharCode(...b.subarray(i, Math.min(i + 0x8000, max)));
  return s;
};
const at = (b: Uint8Array, i: number, ...xs: number[]) => xs.every((x, k) => b[i + k] === x);

const PDF_ACTIVE = /\/(JavaScript|JS|Launch|EmbeddedFile|EmbeddedFiles|RichMedia|XFA|SubmitForm|ImportData|GoToR|GoToE)\b/;
const activeName = (raw: string) => PDF_ACTIVE.exec(raw.replace(/\/[^\s/<>[\]()]+/g, (n) => n.replace(/#([0-9a-fA-F]{2})/g, (_, h) => String.fromCharCode(parseInt(h, 16)))))?.[1];
const OBJSTM = /<<((?:(?!>>\s*stream)[\s\S]){0,2000}?\/Type\s*\/ObjStm(?:(?!>>\s*stream)[\s\S]){0,2000}?)>>\s*stream\r?\n/g;

/** Aktive Inhalte im PDF (auch hex-verschleiert wie /J#61vaScript und in komprimierten Objekt-Bereichen) */
export function pdfActiveContent(raw: string): string | undefined {
  const direct = activeName(raw);
  if (direct) return direct;
  let budget = 32 * 1024 * 1024;
  let unread = 0;
  for (const m of raw.matchAll(OBJSTM)) {
    const dict = m[1];
    const start = (m.index ?? 0) + m[0].length;
    const lenMatch = /\/Length\s+(\d+)(?!\s+\d+\s+R)/.exec(dict);
    const end = lenMatch ? start + Number(lenMatch[1]) : raw.indexOf("endstream", start);
    if (end <= start || end > raw.length) { unread++; continue; }
    const chunk = raw.slice(start, end);
    let text: string | undefined;
    if (!/\/Filter/.test(dict)) text = chunk;
    else if (/\/Filter\s*(?:\[\s*)?\/FlateDecode\s*\]?\s*(?:\/|$)/.test(dict + "/") && !/\/DecodeParms\s*<<[^>]*\/Predictor/.test(dict)) {
      const bytes = new Uint8Array(chunk.length);
      for (let i = 0; i < chunk.length; i++) bytes[i] = chunk.charCodeAt(i);
      const out = inflate(bytes, Math.min(budget, 8 * 1024 * 1024));
      if (out) { budget -= out.length; text = latin1(out); }
    }
    if (text === undefined) { unread++; continue; }
    const hit = activeName(text);
    if (hit) return hit;
    if (budget <= 0) return "zu viele komprimierte Bereiche";
  }
  // nicht lesbare Objekt-Bereiche in einem unverschlüsselten PDF: nicht prüfbar, also nicht annehmen
  if (unread && !/\/Encrypt\b/.test(raw)) return "nicht prüfbare komprimierte Bereiche";
  return undefined;
}

/** Office (docx/xlsx/pptx = ZIP): Makros, ActiveX und eingebettete Objekte erkennen (Dateinamen stehen unkomprimiert im ZIP) */
function officeProblem(b: Uint8Array): string | undefined {
  if (!at(b, 0, 0x50, 0x4b, 0x03, 0x04)) return "Die Office-Datei ist beschädigt oder kein Word/Excel/PowerPoint-Dokument.";
  const names = latin1(b);
  if (/vbaProject|vbaData|macrosheets|\/macros\//i.test(names)) return "Die Datei enthält Makros und wird aus Sicherheitsgründen nicht übernommen. Speichere sie ohne Makros (.docx/.xlsx/.pptx) oder als PDF.";
  if (/activeX|\/embeddings\/[^/]*\.(bin|exe|dll|js|vbs|ps1|bat|cmd|scr)|oleObject\d*\.bin/i.test(names)) return "Die Datei enthält eingebettete Programme oder Objekte und wird aus Sicherheitsgründen nicht übernommen. Speichere sie am besten als PDF.";
  return undefined;
}

const OFFICE = /^application\/vnd\.openxmlformats-officedocument\./;
const LEGACY = /^application\/(msword|vnd\.ms-(excel|powerpoint|word)[\w.-]*|x-msdownload)|macroenabled/i;

/** Grund, warum die Datei nicht in den Tresor darf – sonst undefined */
export function fileProblem(b: Uint8Array, mime: string): string | undefined {
  const m = mime.toLowerCase().split(";")[0].trim();
  if (!b.length) return "Die Datei ist leer.";
  if (LEGACY.test(m)) return "Alte Office-Formate (.doc, .xls, .ppt) und Dateien mit Makros werden aus Sicherheitsgründen nicht übernommen. Speichere sie als .docx/.xlsx/.pptx oder PDF.";
  // Programme erkennen, egal wie sie heißen
  if (at(b, 0, 0x4d, 0x5a) || at(b, 0, 0x7f, 0x45, 0x4c, 0x46) || at(b, 0, 0xca, 0xfe, 0xba, 0xbe) || at(b, 0, 0xcf, 0xfa, 0xed, 0xfe) || at(b, 0, 0xd0, 0xcf, 0x11, 0xe0))
    return "Das ist kein Dokument, sondern ein Programm oder eine alte Office-Datei – aus Sicherheitsgründen nicht übernommen.";
  if (m === "application/pdf") {
    if (!latin1(b, 1024).includes("%PDF-")) return "Die Datei ist kein echtes PDF.";
    const active = pdfActiveContent(latin1(b));
    return active ? `Dieses PDF enthält aktive Inhalte (${active}) und wird aus Sicherheitsgründen nicht übernommen. Drucke es als neues PDF oder mach einen Screenshot.` : undefined;
  }
  if (m === "image/jpeg") return at(b, 0, 0xff, 0xd8, 0xff) ? undefined : "Die Datei ist kein echtes JPG-Bild.";
  if (m === "image/png") return at(b, 0, 0x89, 0x50, 0x4e, 0x47) ? undefined : "Die Datei ist kein echtes PNG-Bild.";
  if (m === "image/webp") return at(b, 0, 0x52, 0x49, 0x46, 0x46) && at(b, 8, 0x57, 0x45, 0x42, 0x50) ? undefined : "Die Datei ist kein echtes WebP-Bild.";
  if (OFFICE.test(m)) return officeProblem(b);
  if (m.startsWith("text/")) return b.subarray(0, 8192).includes(0) ? "Die Datei ist keine Textdatei." : undefined;
  return undefined;
}
