/** Dateityp am Inhalt erkennen – für Dateien ohne Endung (z. B. „Vertragsänderung_23.09.2025“ aus einem Kundenportal), die der Browser als octet-stream meldet */
const EXT: Record<string, string> = { "application/pdf": "pdf", "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };

export function sniffMime(b: Uint8Array): string | undefined {
  const at = (i: number, ...xs: number[]) => xs.every((x, k) => b[i + k] === x);
  // %PDF kann nach ein paar Bytes Vorspann kommen
  for (let i = 0; i < Math.min(b.length - 4, 1024); i++) if (at(i, 0x25, 0x50, 0x44, 0x46)) return "application/pdf";
  if (at(0, 0xff, 0xd8, 0xff)) return "image/jpeg";
  if (at(0, 0x89, 0x50, 0x4e, 0x47)) return "image/png";
  if (at(0, 0x52, 0x49, 0x46, 0x46) && at(8, 0x57, 0x45, 0x42, 0x50)) return "image/webp";
  return undefined;
}

/** Gemeldeten Typ nehmen, wenn er brauchbar ist – sonst am Inhalt erkennen */
export const realMime = (reported: string | null | undefined, b: Uint8Array) =>
  !reported || reported === "application/octet-stream" || reported === "binary/octet-stream" ? sniffMime(b) ?? reported ?? "application/octet-stream" : reported;
export const extFor = (mime: string) => EXT[mime];
