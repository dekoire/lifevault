import { generateText, Output } from "ai";
import { z } from "zod";
import { aiFor, loadAiSettings, todayLine } from "@/lib/ai";
import { unauthorized, userClient } from "@/lib/server";

export const maxDuration = 120;

const Result = z.object({
  results: z.array(z.object({
    id: z.string(),
    relevant: z.boolean(),
    reason: z.string().describe("sehr kurz, z. B. „Rechnung Telekom Oktober“ oder „Newsletter mit Flyer“"),
    attachments: z.array(z.number().int()).describe("Indizes der Anhänge, die ins Archiv gehören (leer, wenn nicht relevant)"),
  })),
});

const SYSTEM = `Du sortierst E-Mails mit Anhängen für einen persönlichen Dokumenten-Tresor (Deutschland).
RELEVANT sind Anhänge, die man aufbewahren will: Rechnungen, Quittungen/Kaufbelege, Angebote, Kostenvoranschläge, Verträge und Vertragsänderungen, Kündigungen und Bestätigungen, Versicherungspolicen und -schreiben, Bescheide (Finanzamt, Behörden, Krankenkasse), Gehaltsabrechnungen, Lohnsteuerbescheinigungen, Kontoauszüge, Mahnungen, Arzt- und Klinikbriefe, Befunde, Rezepte, Mietunterlagen, Nebenkostenabrechnungen, Zeugnisse, Bewerbungs- und Arbeitgeberunterlagen, Tickets/Buchungsbestätigungen mit Rechnung, Garantie- und Lieferscheine.
NICHT relevant: Newsletter, Werbung, Prospekte, Einladungen ohne Dokument, Logos/Signaturbilder, Fotos ohne Dokumentcharakter, Präsentationen/Arbeitsdateien aus Projekten, AGB/Datenschutzhinweise ohne Bezug zu einem Vertrag, Kalenderdateien.
Im Zweifel bei Rechnungen/Behörden/Versicherungen: relevant. Gib für jede Mail genau ein Ergebnis mit derselben id zurück.`;

type In = { id: string; from: string; subject: string; date: string; snippet: string; attachments: { name: string; mime: string; size: number }[] };

/** Günstige Vorprüfung: welche Mails/Anhänge gehören in den Tresor (nur Kopfdaten, Vorschau, Dateinamen) */
export async function POST(req: Request) {
  const auth = await userClient(req);
  if (!auth) return unauthorized();
  await loadAiSettings(auth.sb);
  const body = (await req.json().catch(() => null)) as { items?: In[] } | null;
  const items = Array.isArray(body?.items) ? body!.items.slice(0, 40) : [];
  if (!items.length) return Response.json({ results: [] });
  const cut = (s: unknown, n: number) => (typeof s === "string" ? s.replace(/\s+/g, " ").slice(0, n) : "");
  const list = items.map((m) => [
    `### id: ${cut(m.id, 80)}`,
    `Von: ${cut(m.from, 120)} | Datum: ${cut(m.date, 10)}`,
    `Betreff: ${cut(m.subject, 200)}`,
    `Vorschau: ${cut(m.snippet, 300)}`,
    `Anhänge: ${(Array.isArray(m.attachments) ? m.attachments.slice(0, 12) : []).map((a, i) => `[${i}] ${cut(a.name, 100)} (${cut(a.mime, 60)}, ${Math.round((Number(a.size) || 0) / 1024)} KB)`).join("; ")}`,
  ].join("\n")).join("\n\n");
  try {
    const r = await generateText({
      ...aiFor("mail"),
      system: `${SYSTEM}\n${todayLine()}`,
      prompt: list,
      output: Output.object({ schema: Result, name: "triage" }),
      maxOutputTokens: 4000,
    });
    const ids = new Set(items.map((m) => m.id));
    return Response.json({ results: (r.output?.results ?? []).filter((x) => ids.has(x.id)) });
  } catch (e) {
    console.error("mail triage", (e as Error).name, (e as Error).message);
    return Response.json({ error: "Die KI-Vorprüfung ist fehlgeschlagen. Bitte erneut versuchen." }, { status: 502 });
  }
}
