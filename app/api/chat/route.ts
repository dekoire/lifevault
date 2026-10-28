import { streamText, type ModelMessage } from "ai";
import { aiFor } from "@/lib/ai";
import { clusterOf } from "@/lib/clusters";
import { unauthorized, userClient } from "@/lib/server";
import type { Doc } from "@/lib/types";

export const maxDuration = 300;

const SYSTEM = `Du bist Lifevault, der persönliche Assistent für die Unterlagen deines Nutzers (Deutsch, du-Form).
Antworte nur auf Basis der mitgelieferten Dokumente. Steht etwas nicht drin, sag das ehrlich und nenne, welches Dokument fehlen könnte.
Nenne immer die Quelle als Link im Format [Titel](/d/ID) – genau die ID aus der Liste.
Sei konkret: Zahlen, Fristen, Namen. Kurze Absätze, Listen wo hilfreich, **fett** für das Wichtigste.
Gesundheitsdaten behandelst du sachlich und vertraulich; bei medizinischen Fragen ersetzt du keinen Arzt.`;

const words = (q: string) => [...new Set(q.toLowerCase().match(/[\p{L}\p{N}]{3,}/gu) ?? [])].slice(0, 12);

/** Chat über alle eigenen Dokumente: Volltextsuche + Übersicht, Antwort als Text-Stream mit Quellen. */
export async function POST(req: Request) {
  const auth = await userClient(req);
  if (!auth) return unauthorized();
  const { sb } = auth;
  const body = (await req.json().catch(() => null)) as { messages?: { role: string; content: string }[] } | null;
  const history = (body?.messages ?? []).filter((m) => (m.role === "user" || m.role === "assistant") && typeof m.content === "string").slice(-12);
  const last = [...history].reverse().find((m) => m.role === "user")?.content.slice(0, 2000) ?? "";
  if (!last.trim()) return Response.json({ error: "Leere Frage." }, { status: 400 });

  // 1) Treffer per Volltext (beliebiges Wort), 2) Übersicht aller Dokumente
  const q = words(last).join(" or ");
  const hits = q ? ((await sb.rpc("search_documents", { q, max_results: 6 })).data as Doc[] | null) ?? [] : [];
  const { data: all } = await sb.from("documents").select("id,title,cluster,doc_type,sender,doc_date,received_at,summary,key_facts,deadlines,amounts,tags").eq("status", "ready").order("received_at", { ascending: false }).limit(120);
  const overview = (all ?? []).map((d) => `- [${d.title}](/d/${d.id}) · ${clusterOf(d.cluster).label} · ${d.doc_type ?? ""} · ${d.sender ?? ""} · ${d.doc_date ?? d.received_at.slice(0, 10)}\n  ${d.summary ?? ""}\n  Fakten: ${(d.key_facts as { label: string; value: string }[]).slice(0, 12).map((f) => `${f.label}: ${f.value}`).join("; ")}${(d.deadlines as { date: string; what: string }[]).length ? `\n  Fristen: ${(d.deadlines as { date: string; what: string }[]).map((x) => `${x.date} ${x.what}`).join("; ")}` : ""}`).join("\n");
  const details = hits.slice(0, 5).map((d) => `### [${d.title}](/d/${d.id})\n${(d.full_text ?? "").slice(0, 15000)}`).join("\n\n");
  const context = `Heute ist ${new Date().toISOString().slice(0, 10)}.\n\n## Alle Dokumente (${all?.length ?? 0})\n${overview || "(noch keine Dokumente)"}\n\n## Volltext der passendsten Dokumente\n${details || "(keine Volltext-Treffer)"}`;

  const messages: ModelMessage[] = history.map((m) => ({ role: m.role as "user" | "assistant", content: m.content.slice(0, 8000) }));
  const res = streamText({ ...aiFor("chat"), system: `${SYSTEM}\n\n${context}`, messages, maxOutputTokens: 4000 });
  return res.toTextStreamResponse();
}
