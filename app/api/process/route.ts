import { loadAiSettings } from "@/lib/ai";
import { processDocument, type ProcessInput } from "@/lib/processDoc";
import { unauthorized, userClient } from "@/lib/server";

export const maxDuration = 300;

/**
 * Liest ein Dokument aus, ordnet es ein und speichert Struktur, Key-Fakten und Volltext (siehe lib/processDoc.ts).
 * Verschlüsselte Dokumente: Der Browser schickt die entschlüsselte Datei mit (data, Base64) – das Ergebnis geht nur zurück
 * an den Browser (inline), der es verschlüsselt speichert. Auf dem Server bleibt davon nichts liegen.
 */
export async function POST(req: Request) {
  const auth = await userClient(req);
  if (!auth) return unauthorized();
  await loadAiSettings(auth.sb);
  return processDocument(auth.sb, auth.user.id, (await req.json().catch(() => null)) as ProcessInput);
}
