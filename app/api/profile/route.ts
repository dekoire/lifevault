import { generateText, Output } from "ai";
import { z } from "zod";
import { aiFor } from "@/lib/ai";
import { unauthorized, userClient } from "@/lib/server";

export const maxDuration = 300;

const Item = z.object({
  label: z.string().describe("z. B. „Arbeitgeber“, „Mobilfunk“, „Haftpflicht“"),
  value: z.string().describe("z. B. „Nordwerk Maschinenbau GmbH“, „Vodafone, 39,95 €/Monat“"),
  detail: z.string().nullable().describe("kurzer Zusatz: seit, bis, Tarif, Kündigungsfrist …"),
  status: z.enum(["aktuell", "früher"]),
  docIds: z.array(z.string()).describe("IDs der Quelldokumente, höchstens 3 (die wichtigsten/neuesten)"),
});
const Schema = z.object({
  intro: z.string().describe("1–2 Sätze: wer ist die Person, was ist der aktuelle Stand"),
  sections: z.array(z.object({
    id: z.enum(["person", "arbeit", "wohnen", "versicherungen", "vertraege", "finanzen", "gesundheit", "mobilitaet", "offen"]),
    title: z.string(),
    items: z.array(Item).describe("höchstens 12"),
  })).describe("nur Bereiche mit Inhalt; „offen“ = offene Rechnungen, Mahnungen, anstehende Fristen"),
});
export type LifeProfile = z.infer<typeof Schema> & { generatedAt: string; docCount: number };

/** Lebensprofil aus allen Dokumenten: was läuft aktuell, was war früher – jeweils mit Quelle */
export async function POST(req: Request) {
  const auth = await userClient(req);
  if (!auth) return unauthorized();
  const { sb } = auth;
  const { data: docs } = await sb.from("documents").select("id,title,cluster,doc_type,sender,doc_date,received_at,summary,key_facts,deadlines,amounts,archived,archived_reason,encrypted").eq("status", "ready").order("received_at", { ascending: false }).limit(300);
  if (!docs?.length) return Response.json({ error: "Noch keine ausgelesenen Dokumente." }, { status: 400 });
  const list = docs.map((d) => `### ${d.id} | ${d.title} | ${d.cluster} | ${d.doc_type ?? ""} | ${d.sender ?? ""} | ${d.doc_date ?? d.received_at.slice(0, 10)}${d.archived ? ` | ARCHIVIERT: ${d.archived_reason ?? ""}` : ""}${d.encrypted ? " | verschlüsselt (nur Titel bekannt)" : ""}
${d.summary ?? ""}
${(d.key_facts as { group?: string; label: string; value: string }[]).slice(0, 40).map((f) => `- ${f.group ? `${f.group} › ` : ""}${f.label}: ${f.value}`).join("\n")}
${(d.deadlines as { date: string; what: string }[]).map((x) => `- Frist ${x.date}: ${x.what}`).join("\n")}`).join("\n\n").slice(0, 150000);
  try {
    const r = await generateText({
      ...aiFor("profile"),
      system: `Du erstellst aus den Dokumenten einer Person ein übersichtliches Lebensprofil (Deutsch). Heute ist ${new Date().toISOString().slice(0, 10)}.
Fasse zusammen, was AKTUELL gilt (Arbeitgeber, Wohnung, Versicherungen, Verträge mit Kosten, Fahrzeug, Bank, Gesundheit) und was FRÜHER war (archivierte Dokumente, frühere Arbeitgeber/Anbieter → status „früher“).
Nur Fakten aus den Dokumenten, nichts erfinden. Jede Angabe mit höchstens 3 IDs der Quelldokumente. Kurz und konkret.
Pro Bereich höchstens 12 Angaben – fasse zusammen statt aufzuzählen: Viele Arztbriefe werden zu wenigen Angaben (z. B. Diagnosen, behandelnde Kliniken, letzte Untersuchung), viele Merkblätter eines Arbeitgebers zu einer Angabe.`,
      prompt: list,
      maxOutputTokens: 16000,
      output: Output.object({ schema: Schema, name: "profile" }),
    });
    if (!r.output) return Response.json({ error: "Profil konnte nicht erstellt werden." }, { status: 422 });
    const sections = r.output.sections.map((s) => ({ ...s, items: s.items.slice(0, 15).map((i) => ({ ...i, docIds: i.docIds.slice(0, 3) })) }));
    const data: LifeProfile = { ...r.output, sections, generatedAt: new Date().toISOString(), docCount: docs.length };
    await sb.from("life_profiles").upsert({ user_id: auth.user.id, data, updated_at: new Date().toISOString() });
    return Response.json(data);
  } catch (e) {
    console.error("profile", (e as Error).name, (e as Error).message.slice(0, 500));
    return Response.json({ error: "Profil konnte nicht erstellt werden. Bitte später erneut versuchen." }, { status: 502 });
  }
}
