import { streamText, type ModelMessage } from "ai";
import { aiFor, todayLine } from "@/lib/ai";
import { clusterOf } from "@/lib/clusters";
import { buildPartners } from "@/lib/partners";
import { unauthorized, userClient } from "@/lib/server";
import type { Doc } from "@/lib/types";

export const maxDuration = 300;

const SYSTEM = `Du bist Lifevault, der persönliche Assistent für die Unterlagen deines Nutzers (Deutsch, du-Form).
Antworte auf Basis der mitgelieferten Dokumente. Steht etwas nicht drin, sag das ehrlich.

DATUM: Rechne immer vom heutigen Datum aus (steht unten). Leite daraus ab, was es konkret bedeutet:
- Dauer bis heute (z. B. Betriebszugehörigkeit seit Vertragsbeginn: „seit 01.04.2022, also 4 Jahre und 6 Monate“), weil davon oft Fristen abhängen.
- Tage bis zu einer Frist, ob sie schon verstrichen ist, und der nächstmögliche Termin.
- Den spätesten Tag, an dem etwas raus muss (Zugang beim Empfänger zählt; Postweg 3 Werktage Puffer; fällt ein Fristende auf Wochenende/Feiertag, beachten).
Zeige die Rechnung kurz und nachvollziehbar.

Antworte immer strukturiert in dieser Form (Markdown):
1. Erste Zeile: die direkte Antwort in einem Satz, **fett** – mit konkretem Datum, wenn es um Fristen geht.
2. „### Was das für dich heißt“: 2–4 Stichpunkte, bezogen auf heute (wie weit du stehst, was bis wann passieren muss).
3. „### Details“: Stichpunkte (je Punkt **Begriff:** Wert) oder bei Vergleichen eine Tabelle.
4. „### Tipps“: 2–4 praktische Tipps, damit es sicher klappt (z. B. Schriftform = eigenhändig unterschrieben, keine E-Mail; Einschreiben oder Bote mit Zeugen; Eingangsbestätigung verlangen; Erinnerung im Kalender; was man beilegt).
5. Wenn es etwas zu tun gibt: „### Nächste Schritte“ als nummerierte Liste mit Datum.
6. „### Quellen“: Liste der verwendeten Dokumente als Link [Titel](/d/ID) – genau die ID aus der Liste.
INFOGRAFIK: Geht es um Zahlen, setze direkt nach der fetten ersten Zeile einen Kennzahlen-Block (2–4 Werte, je Zeile: Bezeichnung | Wert | kurzer Zusatz):
\`\`\`kpi
Netto | 3.549,94 € | September 2026
Resttage | 63 Tage | bis 31.12.2026
\`\`\`
Bei Vergleichen oder Verläufen mit mindestens 3 Werten zusätzlich ein Balkendiagramm (je Zeile: Bezeichnung | Zahl):
\`\`\`chart
title: Netto je Monat
unit: €
Juli | 3371.52
August | 3786.52
September | 3549.94
\`\`\`
Nur echte Werte aus den Dokumenten, nichts schätzen.
Firmen, Vertragspartner und Händler aus der Partnerliste nennst du im Text als Link [Name](/partner/KEY) mit genau dem KEY aus der Liste; Dokumente im Text als [Titel](/d/ID).
Keine Einleitung, keine Wiederholung der Frage. Zahlen, Fristen und Namen konkret.

FEHLT ETWAS: Wenn für eine sichere Antwort eine Information oder ein Dokument fehlt (z. B. der geltende Tarifvertrag, AGB des Anbieters, eine gesetzliche Regel), schreib unter „### Was noch fehlt“, was genau und warum.
Schlage dann eine Internetrecherche vor, indem du als ALLERLETZTE Zeile genau das schreibst:
[[RECHERCHE: <Suchanfrage ohne persönliche Daten, z. B. „Kündigungsfristen Tarifvertrag Metall- und Elektroindustrie Baden-Württemberg“> | <was fehlt, kurz> | <ID des Bezugsdokuments oder leer>]]
Höchstens eine solche Zeile, nur wenn es wirklich hilft. Keine Namen, Adressen oder Nummern in der Suchanfrage.

Bei rechtlichen Fragen: allgemeine Information, keine Rechtsberatung – sag das in einem kurzen Halbsatz bei den Tipps.
Gesundheitsdaten behandelst du sachlich und vertraulich; bei medizinischen Fragen ersetzt du keinen Arzt.`;

const words = (q: string) => [...new Set(q.toLowerCase().match(/[\p{L}\p{N}]{3,}/gu) ?? [])].slice(0, 12);

/** Chat über alle eigenen Dokumente: Volltextsuche + Übersicht, Antwort als Text-Stream mit Quellen. */
export async function POST(req: Request) {
  const auth = await userClient(req);
  if (!auth) return unauthorized();
  const { sb } = auth;
  const body = (await req.json().catch(() => null)) as { messages?: { role: string; content: string }[]; docId?: string; docText?: string; projectId?: string; depth?: string; attachIds?: string[] } | null;
  const history = (body?.messages ?? []).filter((m) => (m.role === "user" || m.role === "assistant") && typeof m.content === "string").slice(-12);
  const last = [...history].reverse().find((m) => m.role === "user")?.content.slice(0, 2000) ?? "";
  if (!last.trim()) return Response.json({ error: "Leere Frage." }, { status: 400 });

  // Chat zu einem Dokument: dessen Inhalt zuerst (verschlüsselte Dokumente schickt der Browser entschlüsselt mit – nur für diese Antwort)
  const docId = typeof body?.docId === "string" && /^[0-9a-f-]{36}$/i.test(body.docId) ? body.docId : undefined;
  const focus = docId ? (await sb.from("documents").select("id,title,doc_type,sender,doc_date,summary,key_facts,full_text,encrypted").eq("id", docId).maybeSingle()).data : null;
  // im Chat angehängte Dateien (gerade hochgeladen): vollständig mitgeben
  const attachIds = (Array.isArray(body?.attachIds) ? body.attachIds : []).filter((x) => typeof x === "string" && /^[0-9a-f-]{36}$/i.test(x)).slice(0, 5);
  const attached = attachIds.length ? ((await sb.from("documents").select("id,title,doc_type,sender,doc_date,summary,key_facts,deadlines,full_text,status").in("id", attachIds)).data ?? []) : [];
  const depth = body?.depth === "kurz" || body?.depth === "gruendlich" ? body.depth : "normal";
  const focusText = focus ? (focus.encrypted ? (typeof body?.docText === "string" ? body.docText.slice(0, 60000) : "") : `${focus.summary ?? ""}\n${JSON.stringify(focus.key_facts)}\n${focus.full_text ?? ""}`.slice(0, 60000)) : "";

  // 1) Treffer per Volltext (beliebiges Wort), 2) Übersicht aller Dokumente
  const q = words(last).join(" or ");
  const hits = q ? ((await sb.rpc("search_documents", { q, max_results: depth === "gruendlich" ? 10 : 6 })).data as Doc[] | null) ?? [] : [];
  // nur das gewählte Projekt (falls eines gewählt ist)
  const projectId = typeof body?.projectId === "string" && /^[0-9a-f-]{36}$/i.test(body.projectId) ? body.projectId : undefined;
  let dq = sb.from("documents").select("id,title,cluster,doc_type,sender,doc_date,received_at,summary,key_facts,deadlines,amounts,tags,archived,encrypted").eq("status", "ready");
  if (projectId) dq = dq.eq("project_id", projectId);
  const { data: all } = await dq.order("received_at", { ascending: false }).limit(120);
  const overview = (all ?? []).map((d) => `- [${d.title}](/d/${d.id}) · ${clusterOf(d.cluster).label} · ${d.doc_type ?? ""} · ${d.sender ?? ""} · ${d.doc_date ?? d.received_at.slice(0, 10)}${d.archived ? " · ARCHIVIERT (gilt nicht mehr)" : ""}${d.encrypted ? " · verschlüsselt (Inhalt nicht lesbar)" : ""}\n  ${d.summary ?? ""}\n  Fakten: ${(d.key_facts as { label: string; value: string }[]).slice(0, 12).map((f) => `${f.label}: ${f.value}`).join("; ")}${(d.deadlines as { date: string; what: string }[]).length ? `\n  Fristen: ${(d.deadlines as { date: string; what: string }[]).map((x) => `${x.date} ${x.what}`).join("; ")}` : ""}`).join("\n");
  const details = hits.slice(0, depth === "gruendlich" ? 8 : depth === "kurz" ? 3 : 5).map((d) => `### [${d.title}](/d/${d.id})\n${(d.full_text ?? "").slice(0, depth === "gruendlich" ? 25000 : 15000)}`).join("\n\n");
  // Partnerliste mit Schlüsseln, damit Firmen im Text klickbar verlinkt werden
  const partners = buildPartners((all ?? []).map((d) => ({ ...d, status: "ready" }) as unknown as Doc)).slice(0, 80).map((p) => `- [${p.name}](/partner/${p.key})`).join("\n");
  const attachBlock = attached.length ? `## Gerade im Chat angehängt – darauf bezieht sich die Frage\n${attached.map((d) => `### [${d.title ?? "Neues Dokument"}](/d/${d.id})${d.status !== "ready" ? " (wird noch ausgelesen)" : ""}\n${d.summary ?? ""}\n${JSON.stringify(d.key_facts)}\nFristen: ${JSON.stringify(d.deadlines)}\n${(d.full_text ?? "").slice(0, 30000)}`).join("\n\n")}\n\n` : "";
  const focusBlock = focus ? `## Dieses Dokument steht im Mittelpunkt: [${focus.title}](/d/${focus.id})\n${focusText || "(Inhalt verschlüsselt – Tresor nicht entsperrt)"}\n\n` : "";
  const context = `${attachBlock}${focusBlock}${todayLine()}\n\n## Alle Dokumente (${all?.length ?? 0})\n${overview || "(noch keine Dokumente)"}\n\n## Partner (Firmen, Vertragspartner, Händler)\n${partners || "(keine)"}\n\n## Volltext der passendsten Dokumente\n${details || "(keine Volltext-Treffer)"}`;

  const messages: ModelMessage[] = history.map((m) => ({ role: m.role as "user" | "assistant", content: m.content.slice(0, 8000) }));
  const style = depth === "kurz"
    ? "\n\nANTWORTTIEFE: Kurz. Nur die fette Antwort, höchstens 3 Stichpunkte unter „Was das für dich heißt“, 1–2 Tipps, Quellen. Keine Details-Liste."
    : depth === "gruendlich"
      ? "\n\nANTWORTTIEFE: Gründlich. Prüfe alle passenden Dokumente, vergleiche sie, zeige Rechnungen und Fristen Schritt für Schritt, nenne Alternativen und Risiken und einen klaren Plan."
      : "";
  const res = streamText({ ...aiFor("chat"), system: `${SYSTEM}${style}\n\n${context}`, messages, maxOutputTokens: depth === "gruendlich" ? 9000 : depth === "kurz" ? 1500 : 4000 });
  return res.toTextStreamResponse();
}
