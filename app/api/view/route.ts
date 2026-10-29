import { loadAiSettings } from "@/lib/ai";
import { unauthorized, userClient } from "@/lib/server";
import type { Doc } from "@/lib/types";
import { buildView } from "@/lib/view";

export const maxDuration = 60;

/** Aufbereitete Ansicht für ein älteres Dokument nachholen (beim ersten Öffnen); nur unverschlüsselt */
export async function POST(req: Request) {
  const auth = await userClient(req);
  if (!auth) return unauthorized();
  await loadAiSettings(auth.sb);
  const body = (await req.json().catch(() => ({}))) as { id?: unknown; force?: unknown };
  const id = typeof body.id === "string" && /^[0-9a-f-]{36}$/i.test(body.id) ? body.id : "";
  if (!id) return Response.json({ error: "Ungültige Anfrage." }, { status: 400 });
  const { data } = await auth.sb.from("documents").select("id,title,doc_type,sender,doc_date,summary,key_facts,amounts,deadlines,full_text,encrypted,status,view").eq("id", id).eq("user_id", auth.user.id).maybeSingle();
  const d = data as Doc | null;
  if (!d || d.status !== "ready" || d.encrypted) return Response.json({ error: "Nicht verfügbar." }, { status: 404 });
  if (d.view && body.force !== true) return Response.json({ view: d.view });
  try {
    const view = await buildView({ title: d.title, docType: d.doc_type, sender: d.sender, docDate: d.doc_date, summary: d.summary, keyFacts: d.key_facts ?? [], amounts: d.amounts ?? [], deadlines: d.deadlines ?? [], fullText: d.full_text });
    if (!view) return Response.json({ error: "Aufbereiten hat nicht geklappt." }, { status: 502 });
    await auth.sb.from("documents").update({ view }).eq("id", id).eq("user_id", auth.user.id);
    return Response.json({ view });
  } catch (e) {
    console.error("view", (e as Error).message);
    return Response.json({ error: "Aufbereiten hat nicht geklappt." }, { status: 502 });
  }
}
