import { unzipSync, strFromU8 } from "fflate";

export const OFFICE_TYPES: Record<string, "pptx" | "docx" | "xlsx"> = {
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": "pptx",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
};
export const officeKind = (mime: string, name = "") => OFFICE_TYPES[mime] ?? (/\.(pptx|docx|xlsx)$/i.exec(name)?.[1].toLowerCase() as "pptx" | "docx" | "xlsx" | undefined);
export const OFFICE_MIME = (k: "pptx" | "docx" | "xlsx") => Object.entries(OFFICE_TYPES).find(([, v]) => v === k)![0];

const xmlText = (xml: string, tag: string) =>
  [...xml.matchAll(new RegExp(`<${tag}(?:\\s[^>]*)?>([^<]*)</${tag}>`, "g"))].map((m) => m[1].replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'"));

export type OfficeContent = { kind: "pptx" | "docx" | "xlsx"; parts: { title: string; text: string }[]; thumbnail?: Uint8Array };

/** Office-Datei (Open XML) entpacken und Text je Folie/Seite/Tabelle herauslesen – ohne Server-Dienste */
export function readOffice(data: Uint8Array, kind: "pptx" | "docx" | "xlsx"): OfficeContent {
  const files = unzipSync(data);
  const thumb = files["docProps/thumbnail.jpeg"] ?? files["docProps/thumbnail.png"];
  if (kind === "pptx") {
    const slides = Object.keys(files).filter((f) => /^ppt\/slides\/slide\d+\.xml$/.test(f)).sort((a, b) => Number(/(\d+)\.xml/.exec(a)![1]) - Number(/(\d+)\.xml/.exec(b)![1]));
    return { kind, thumbnail: thumb, parts: slides.map((f, i) => {
      // Absätze zusammenhalten: Text je <a:p>
      const xml = strFromU8(files[f]);
      const paras = [...xml.matchAll(/<a:p>([\s\S]*?)<\/a:p>/g)].map((p) => xmlText(p[1], "a:t").join("")).filter((t) => t.trim());
      return { title: `Folie ${i + 1}`, text: paras.join("\n") };
    }) };
  }
  if (kind === "docx") {
    const xml = strFromU8(files["word/document.xml"] ?? new Uint8Array());
    const paras = [...xml.matchAll(/<w:p[ >][\s\S]*?<\/w:p>/g)].map((p) => xmlText(p[0], "w:t").join("")).filter((t) => t.trim());
    return { kind, thumbnail: thumb, parts: [{ title: "Dokument", text: paras.join("\n") }] };
  }
  const shared = xmlText(strFromU8(files["xl/sharedStrings.xml"] ?? new Uint8Array()), "t");
  const sheets = Object.keys(files).filter((f) => /^xl\/worksheets\/sheet\d+\.xml$/.test(f)).sort();
  return { kind, thumbnail: thumb, parts: sheets.map((f, i) => {
    const xml = strFromU8(files[f]);
    const rows = [...xml.matchAll(/<row[^>]*>([\s\S]*?)<\/row>/g)].slice(0, 300).map((r) =>
      [...r[1].matchAll(/<c([^>]*)>(?:<f>[^<]*<\/f>)?<v>([^<]*)<\/v><\/c>/g)].map((c) => (/\bt="s"/.test(c[1]) ? shared[Number(c[2])] ?? "" : c[2])).join(" | "));
    return { title: `Tabelle ${i + 1}`, text: rows.filter((r) => r.trim()).join("\n") };
  }) };
}

export const officeAsText = (c: OfficeContent) => c.parts.map((p) => `## ${p.title}\n${p.text}`).join("\n\n");
