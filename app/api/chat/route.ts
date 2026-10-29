import { streamText, type ModelMessage } from "ai";
import { aiFor, loadAiSettings, todayLine } from "@/lib/ai";
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

WENIG TEXT, VIELE KACHELN. Die App zeigt echte Karten, wenn du Bausteine einfügst. Die Daten (IBAN, Beträge, Adressen, Telefon, Vorschaubilder) holt die App selbst; du nennst NUR IDs bzw. KEYs, exakt wie in den Listen unten. Nie IBAN, Bankdaten, Adressen oder Telefonnummern zusätzlich als Text abschreiben, wenn ein Baustein sie zeigt.
Bausteine (je Zeile eine ID/ein KEY):
- Zahlung, IBAN, Bankverbindung, „was muss ich zahlen“, offene Rechnungen/Mahnungen/Bußgelder → Karten mit Logo, Bankdaten zum Kopieren, Betrag, fertigem Verwendungszweck, GiroCode; bei mehreren kann der Nutzer auswählen. Nur Dokumente, zu denen wirklich etwas zu zahlen ist (neuestes Schreiben je Vorgang):
\`\`\`zahlung
<Dokument-ID>
\`\`\`
- Ansprechpartner, Arzt, Kasse, Versicherung, Arbeitgeber, Behörde, „bei wem bin ich …“, „wie erreiche ich …“ → Kontaktkarten (Logo, Adresse, Telefon, E-Mail, Nummern):
\`\`\`partner
<Partner-KEY>
\`\`\`
- Dokumente zeigen/auflisten („zeig mir …“, „welche Briefe …“) → Vorschau-Kacheln:
\`\`\`dokumente
<Dokument-ID>
\`\`\`
- „Was ist zu tun / offen“, Fristen, Aufgaben → abhakbare To-do-Liste (ohne IDs = alle offenen; mit IDs = nur diese):
\`\`\`aufgaben
\`\`\`
- „Wie viele Dokumente“, Überblick, Statistik → farbige Übersicht (leer lassen):
\`\`\`uebersicht
\`\`\`
- Gehalt, Verdienst, „was verdiene ich“ → Infografik aus Gehaltsabrechnungen (IDs der Abrechnungen, bis zu 12, alle Monate):
\`\`\`gehalt
<Dokument-ID>
\`\`\`
Kennzahlen (2–4 Werte, Bezeichnung | Wert | Zusatz) und Balken (Bezeichnung | Zahl) für alles andere mit Zahlen:
\`\`\`kpi
Resttage | 63 Tage | bis 31.12.2026
\`\`\`
\`\`\`chart
title: Beiträge je Jahr
unit: €
2024 | 1200
2025 | 1320
\`\`\`
Nur echte Werte aus den Dokumenten, nichts schätzen.

FORM:
1. Erste Zeile: die direkte Antwort in einem Satz, **fett** (mit Datum/Betrag, wenn es passt).
2. Dann der passende Baustein (oder mehrere). Mehrere Bausteine sind erlaubt, z. B. partner + zahlung.
3. Danach höchstens 2–4 kurze Stichpunkte, nur was die Karten nicht schon zeigen (Frist-Rechnung, Hinweis, Tipp). Bei reinen Nachschlage-Fragen (IBAN, Telefon, wie viele) gar keine Stichpunkte.
4. Nur bei echten Erklär- oder Rechtsfragen ausführlicher: „### Details“ (Stichpunkte **Begriff:** Wert) und „### Nächste Schritte“ (nummeriert, mit Datum); Fachbegriffe kurz erklären. Optional „### Weiterführende Links“ mit 1–3 offiziellen Seiten, die es sicher gibt.
5. Keine Quellenliste, wenn die Dokumente schon als Baustein gezeigt werden; sonst eine kurze Zeile „Quellen: [Titel](/d/ID), …“.
6. Ganz am Ende eine Zeile mit 3 kurzen Anschlussfragen (aus Sicht des Nutzers, je höchstens 60 Zeichen), gern solche, die wieder Kacheln ergeben:
[[FOLGEFRAGEN: Frage 1 | Frage 2 | Frage 3]]
Firmen aus der Partnerliste im Fließtext als [Name](/partner/KEY), Dokumente als [Titel](/d/ID).
Keine Einleitung, keine Wiederholung der Frage. Zahlen, Fristen und Namen konkret.

FEHLT ETWAS: Wenn für eine sichere Antwort eine Information oder ein Dokument fehlt (z. B. der geltende Tarifvertrag, AGB des Anbieters, eine gesetzliche Regel), schreib unter „### Was noch fehlt“, was genau und warum.
Schlage dann eine Internetrecherche vor, indem du als ALLERLETZTE Zeile genau das schreibst:
[[RECHERCHE: <Suchanfrage ohne persönliche Daten, z. B. „Kündigungsfristen Tarifvertrag Metall- und Elektroindustrie Baden-Württemberg“> | <was fehlt, kurz> | <ID des Bezugsdokuments oder leer>]]
Höchstens eine solche Zeile, nur wenn es wirklich hilft. Keine Namen, Adressen oder Nummern in der Suchanfrage. Die FOLGEFRAGEN-Zeile steht dann direkt davor.

Bei rechtlichen Fragen: allgemeine Information, keine Rechtsberatung – sag das in einem kurzen Halbsatz bei den Tipps.
Gesundheitsdaten behandelst du sachlich und vertraulich; bei medizinischen Fragen ersetzt du keinen Arzt.`;

const words = (q: string) => [...new Set(q.toLowerCase().match(/[\p{L}\p{N}]{3,}/gu) ?? [])].slice(0, 12);

/** Chat über alle eigenen Dokumente: Volltextsuche + Übersicht, Antwort als Text-Stream mit Quellen. */
export async function POST(req: Request) {
  const auth = await userClient(req);
  if (!auth) return unauthorized();
  await loadAiSettings(auth.sb);
  const { sb } = auth;
  const body = (await req.json().catch(() => null)) as { messages?: { role: string; content: string }[]; docId?: string; docText?: string; secretDocs?: { id: string; title: string; text: string }[]; projectId?: string; depth?: string; attachIds?: string[] } | null;
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
  // verschlüsselte Dokumente: nur wenn der Browser sie für diese Antwort entschlüsselt mitschickt – hier nicht gespeichert
  const secret = (Array.isArray(body?.secretDocs) ? body.secretDocs : []).filter((d) => typeof d?.id === "string" && /^[0-9a-f-]{36}$/i.test(d.id) && typeof d.text === "string").slice(0, 40);
  const secretBlock = secret.length ? `## Verschlüsselte Dokumente (für diese Antwort im Browser entschlüsselt)\n${secret.map((d) => `### [${String(d.title).slice(0, 200)}](/d/${d.id})\n${d.text.slice(0, 8000)}`).join("\n\n")}\n\n` : "";
  const context = `${attachBlock}${focusBlock}${secretBlock}${todayLine()}\n\n## Alle Dokumente (${all?.length ?? 0})\n${overview || "(noch keine Dokumente)"}\n\n## Partner (Firmen, Vertragspartner, Händler)\n${partners || "(keine)"}\n\n## Volltext der passendsten Dokumente\n${details || "(keine Volltext-Treffer)"}`;

  const messages: ModelMessage[] = history.map((m) => ({ role: m.role as "user" | "assistant", content: m.content.slice(0, 8000) }));
  const style = depth === "kurz"
    ? "\n\nANTWORTTIEFE: Kurz. Nur die fette Antwort, höchstens 3 Stichpunkte unter „Was das für dich heißt“, 1–2 Tipps, Quellen. Keine Details-Liste."
    : depth === "gruendlich"
      ? "\n\nANTWORTTIEFE: Gründlich. Prüfe alle passenden Dokumente, vergleiche sie, zeige Rechnungen und Fristen Schritt für Schritt, nenne Alternativen und Risiken und einen klaren Plan."
      : "";
  const res = streamText({ ...aiFor("chat"), system: `${SYSTEM}${style}\n\n${context}`, messages, maxOutputTokens: depth === "gruendlich" ? 9000 : depth === "kurz" ? 1500 : 4000 });
  return res.toTextStreamResponse();
}
