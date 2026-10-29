import { PDFDocument, StandardFonts, rgb, type PDFFont } from "pdf-lib";

/**
 * Mail-Bausteine ohne Browser (auch für den Mail-Job auf dem Server, lib/mailjob.ts):
 * Anhänge vorsortieren, HTML-Mail in Text, Mail als PDF.
 */

// ---------- Anhänge vorsortieren (ohne KI) ----------
const DOC_MIME = /^(application\/pdf|image\/(jpeg|png|heic|heif|webp)|application\/(msword|vnd\.openxmlformats-officedocument\.[a-z.]+|vnd\.ms-excel|vnd\.ms-powerpoint))$/i;
const DOC_EXT = /\.(pdf|jpe?g|png|heic|heif|webp|docx?|xlsx?|pptx?)$/i;
const JUNK = /^(image\d*|logo|banner|signature|unnamed|icon|spacer|facebook|twitter|instagram|linkedin|outlook)[\w-]*\.(png|jpe?g|gif)$/i;
const MIME_BY_EXT: Record<string, string> = { pdf: "application/pdf", jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", heic: "image/heic", heif: "image/heif", webp: "image/webp", doc: "application/msword", docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", xls: "application/vnd.ms-excel", xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", ppt: "application/vnd.ms-powerpoint", pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation" };

/** Kandidat: Dokument-Typ, nicht winzig (Logos/Signaturen), nicht offensichtlich Deko */
export function isCandidate(a: { name: string; mime: string; size: number; inline?: boolean }) {
  if (!DOC_MIME.test(a.mime) && !DOC_EXT.test(a.name)) return false;
  const image = /^image\//i.test(a.mime) || /\.(jpe?g|png|webp|heic|heif)$/i.test(a.name);
  if (image && (a.size < 40_000 || JUNK.test(a.name) || a.inline)) return false;
  return a.size > 2_000 && a.size < 20 * 1024 * 1024;
}
export const fixMime = (name: string, mime: string) => (mime && mime !== "application/octet-stream" ? mime : MIME_BY_EXT[name.split(".").pop()?.toLowerCase() ?? ""] ?? mime);

// ---------- HTML-Mail → Text (ohne DOM) ----------
const ENT: Record<string, string> = { nbsp: " ", amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", euro: "€", auml: "ä", ouml: "ö", uuml: "ü", Auml: "Ä", Ouml: "Ö", Uuml: "Ü", szlig: "ß", ndash: "–", mdash: "—", bull: "•", hellip: "…", laquo: "«", raquo: "»", bdquo: "„", ldquo: "“", rdquo: "”", copy: "©", reg: "®", trade: "™", shy: "" };
/** HTML-Mail in lesbaren Text: Blöcke und Tabellenzeilen werden Zeilen; Stil, Skripte, Kommentare und Unsichtbares fallen weg */
export function htmlToPlain(html: string): string {
  return html
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<(style|script|head|title|noscript)\b[\s\S]*?<\/\1>/gi, " ")
    // versteckter Vorschautext (display:none, Größe 0)
    .replace(/<(\w+)\b[^>]*style="[^"]*(?:display\s*:\s*none|max-height\s*:\s*0|font-size\s*:\s*0|opacity\s*:\s*0)[^"]*"[^>]*>[\s\S]*?<\/\1>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(td|th)>/gi, "   ")
    .replace(/<\/?(p|div|tr|li|h[1-6]|table|section|article|header|footer|blockquote)\b[^>]*>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&([a-z]+);/gi, (m, n) => ENT[n] ?? m)
    .replace(/[\u200b-\u200d\u2060\ufeff\u034f\u00ad]/g, "")
    .replace(/[ \t\u00a0]+/g, " ")
    .split("\n").map((l) => l.trim()).filter((l, i, a) => l || a[i - 1]).join("\n").trim();
}

// ---------- Beleg im Mailtext → PDF ----------
/** Zeichen, die die Standardschrift nicht kann, ersetzen (sonst bricht pdf-lib ab) */
function printable(font: PDFFont, s: string, cache: Map<string, string>) {
  const swap: Record<string, string> = { "\u2009": " ", "\u202f": " ", "\u2012": "-", "\u2013": "–", "\u2212": "-", "\u2192": "->", "\u2022": "•", "\u2026": "…" };
  return [...s].map((ch) => {
    if (cache.has(ch)) return cache.get(ch)!;
    let out = swap[ch] ?? ch;
    try { font.encodeText(out); } catch { out = ch.normalize("NFD").replace(/[\u0300-\u036f]/g, ""); try { font.encodeText(out); } catch { out = ""; } }
    cache.set(ch, out);
    return out;
  }).join("");
}

/** Mail (Absender, Betreff, Datum, Text) als PDF – damit Belege ohne Anhang wie jedes andere Dokument ausgelesen und abgelegt werden */
export async function mailBodyPdf(m: { from: string; subject: string; date: string; bodyText?: string }): Promise<File> {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const cache = new Map<string, string>(), cacheB = new Map<string, string>();
  const W = 595, H = 842, M = 50, size = 10, lh = 14;
  pdf.setTitle(m.subject || "E-Mail");
  let page = pdf.addPage([W, H]);
  let y = H - M;
  const line = (t: string, f = font, s = size, color = rgb(0.1, 0.1, 0.1)) => {
    const c = f === bold ? cacheB : cache;
    // Zeile umbrechen, damit nichts über den Rand läuft
    const words = printable(f, t, c).split(" ");
    let cur = "";
    const flush = () => {
      if (y < M) { page = pdf.addPage([W, H]); y = H - M; }
      page.drawText(cur, { x: M, y, size: s, font: f, color });
      y -= s === size ? lh : s * 1.4;
      cur = "";
    };
    for (const w of words) {
      // sehr lange Wörter (Links) hart trennen
      for (let part = w; part.length; ) {
        const next = cur ? `${cur} ${part}` : part;
        if (f.widthOfTextAtSize(next, s) <= W - 2 * M) { cur = next; part = ""; continue; }
        if (cur) { flush(); continue; }
        let n = part.length;
        while (n > 1 && f.widthOfTextAtSize(part.slice(0, n), s) > W - 2 * M) n--;
        cur = part.slice(0, n); part = part.slice(n); flush();
      }
    }
    if (cur || !t) flush();
  };
  line(m.subject || "(ohne Betreff)", bold, 14);
  y -= 4;
  line(`Von: ${m.from}`, font, 9, rgb(0.4, 0.4, 0.4));
  if (m.date) line(`Datum: ${new Date(m.date).toLocaleString("de-DE")}`, font, 9, rgb(0.4, 0.4, 0.4));
  line("Aus dem E-Mail-Text übernommen (die Mail hatte keinen Dokument-Anhang).", font, 9, rgb(0.4, 0.4, 0.4));
  y -= 10;
  for (const l of (m.bodyText ?? "").split("\n")) line(l);
  const bytes = await pdf.save();
  const sender = m.from.replace(/<.*>/, "").replace(/["']/g, "").trim() || m.from.replace(/.*@/, "").replace(/>.*/, "");
  const name = `${sender} – ${m.subject || "E-Mail"}`.replace(/[\\/:*?"<>|]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 150);
  return new File([bytes as BlobPart], `${name}.pdf`, { type: "application/pdf" });
}
