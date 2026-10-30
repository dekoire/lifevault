import { streamText, type ModelMessage } from "ai";
import { aiFor, loadAiSettings, todayLine } from "@/lib/ai";
import { clusterOf } from "@/lib/clusters";
import { routeQuestion } from "@/lib/route";
import { buildPartners } from "@/lib/partners";
import { unauthorized, userClient } from "@/lib/server";
import { guessImportance, roleLabel } from "@/lib/importance";
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
  Anderer Betrag (Teilzahlung, Rate, Abschlag, „QR-Code für 75 €“): hinter die ID „ | <Betrag>“ schreiben, z. B. „<ID> | 75“ – die App baut den GiroCode mit diesem Betrag; der Nutzer kann ihn in der Karte auch selbst ändern. Sag nie, dass ein anderer Betrag nicht geht.
  Steht im Schreiben keine IBAN, trotzdem den zahlung-Baustein ausgeben: die App nimmt dann die zuletzt bekannte Bankverbindung dieses Absenders und verlinkt das Dokument, aus dem sie stammt. Sag in der ersten Zeile, dass es die zuletzt bekannte ist (mit [Titel](/d/ID) des Quelldokuments, falls du es in der Liste siehst). Nie sagen, es gebe keine IBAN, wenn ein anderes Schreiben desselben Absenders eine hat.
- Ansprechpartner, Arzt, Kasse, Versicherung, Arbeitgeber, Behörde, „bei wem bin ich …“, „wie erreiche ich …“, „Adresse von …“ → Kontaktkarten (Logo, Karte mit Route, Adresse, Telefon, E-Mail, Nummern):
\`\`\`partner
<Partner-KEY>
\`\`\`
- Verlauf bei einem Partner, „ich bin gleich beim Arzt X“, „was war bisher bei …“, Vorgeschichte → Zeitleiste mit Datum, Art, Vorschaubild, Kernaussage und Betrag (dazu oft partner):
\`\`\`verlauf
<Partner-KEY>
\`\`\`
  Darunter höchstens 3 Stichpunkte: was davon jetzt wichtig ist (z. B. letzte Diagnose, offene Frage für den Termin).
- Dokumente zeigen/auflisten („zeig mir …“, „welche Briefe …“) → Vorschau-Kacheln (jede mit Stift zum Bearbeiten von Titel, Absender, Datum):
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
- ÄNDERN auf Wunsch (umbenennen, Absender/Partner korrigieren, zusammenführen/verbinden, Vorder-/Rückseite): Du änderst NIE selbst, du schlägst vor – die App zeigt je Aktion eine Karte mit Vorschau, der Nutzer bestätigt. Je Aktion eine JSON-Zeile:
\`\`\`aktion
{"typ":"umbenennen","id":"<Dokument-ID>","titel":"<neuer Titel>"}
{"typ":"absender","ids":["<Dokument-ID>"],"absender":"<richtiger Name>","domain":"<web-domain, falls bekannt>"}
{"typ":"partner","key":"<Partner-KEY>","name":"<neuer Name>","domain":"<web-domain, falls bekannt>"}
{"typ":"datum","id":"<Dokument-ID>","datum":"YYYY-MM-DD"}
{"typ":"zusammenfuehren","ids":["<Vorderseite/Seite 1>","<Rückseite/Seite 2>"],"titel":"<Titel des Ganzen>","grund":"<kurz>"}
\`\`\`
  Vorgehen: Ist unklar, welche Dokumente gemeint sind, zuerst suchen und als dokumente-Baustein zeigen (die Kacheln sind nummeriert) und fragen; sagt der Nutzer dann z. B. „verbinde 1 und 2“, nimm die IDs in genau dieser Reihenfolge. Sagt er „das ist die Rückseite“, kommt dieses Dokument an zweite Stelle. Mehrere Schritte = mehrere Zeilen, jeweils bestätigbar.
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

FORM – SCHNELL ZUM ERGEBNIS, WENIG TEXT (der Nutzer will nicht lesen, sondern sehen):
1. Erste Zeile: das Ergebnis in EINEM kurzen Satz, **fett**, mit dem Betrag/Datum/Namen, um den es geht.
2. Dann sofort der passende Baustein – Karten, Tabellen, kpi statt Fließtext. Mehrere Bausteine sind erlaubt (z. B. partner + verlauf, zahlung + aufgaben). Vergleiche und Listen mit mehreren Werten als kpi oder Markdown-Tabelle, nie als Absatz.
3. Danach höchstens 3 Stichpunkte mit je höchstens 12 Wörtern, nur was die Karten nicht zeigen. Keine Absätze mit mehr als 2 Sätzen. Bei Nachschlage-Fragen (IBAN, Telefon, Adresse, wie viele) gar keine Stichpunkte.
4. Nur wenn der Nutzer ausdrücklich erklärt haben will oder bei Rechtsfragen: „### Details“ (Stichpunkte **Begriff:** Wert) und „### Nächste Schritte“ (nummeriert, mit Datum).
5. Ändern im Chat: Will der Nutzer etwas umbenennen, einen Partner anders nennen, ein Datum korrigieren – sofort als aktion-Baustein, nicht erklären. Zum Bearbeiten mehrerer Felder zeig das Dokument als dokumente-Baustein (Stift in der Kachel).
6. Zahlung: anderer Betrag immer möglich („<ID> | 75“). Dauerauftrag und Echtzeitüberweisung kann ein GiroCode nicht enthalten – sag in einem Halbsatz, dass man das in der Banking-App nach dem Scannen wählt.
5. Keine Quellenliste, wenn die Dokumente schon als Baustein gezeigt werden; sonst eine kurze Zeile „Quellen: [Titel](/d/ID), …“.
6. Ganz am Ende eine Zeile mit 3 kurzen Anschlussfragen (aus Sicht des Nutzers, je höchstens 60 Zeichen), gern solche, die wieder Kacheln ergeben:
[[FOLGEFRAGEN: Frage 1 | Frage 2 | Frage 3]]
Firmen aus der Partnerliste im Fließtext als [Name](/partner/KEY), Dokumente als [Titel](/d/ID).
Keine Einleitung, keine Wiederholung der Frage. Zahlen, Fristen und Namen konkret.

ADRESSE/KONTAKT NICHT IN DEN UNTERLAGEN (z. B. „such die Adresse meines Hausarztes“): Steht sie in keinem Dokument, schlag die Recherche vor (RECHERCHE-Zeile unten) mit Name und Ort/Fachgebiet aus den Unterlagen, ohne persönliche Daten des Nutzers – z. B. „Hausarztpraxis Dr. Weber Stuttgart-West Adresse Telefon“.
FEHLT ETWAS: Wenn für eine sichere Antwort eine Information oder ein Dokument fehlt (z. B. der geltende Tarifvertrag, AGB des Anbieters, eine gesetzliche Regel), schreib unter „### Was noch fehlt“, was genau und warum.
Schlage dann eine Internetrecherche vor, indem du als ALLERLETZTE Zeile genau das schreibst:
[[RECHERCHE: <Suchanfrage ohne persönliche Daten, z. B. „Kündigungsfristen Tarifvertrag Metall- und Elektroindustrie Baden-Württemberg“> | <was fehlt, kurz> | <ID des Bezugsdokuments oder leer>]]
Höchstens eine solche Zeile, nur wenn es wirklich hilft. Keine Namen, Adressen oder Nummern in der Suchanfrage. Die FOLGEFRAGEN-Zeile steht dann direkt davor.

Bei rechtlichen Fragen: allgemeine Information, keine Rechtsberatung – sag das in einem kurzen Halbsatz bei den Tipps.
VORHANDEN IST VORHANDEN: Steht ein Dokument in „Passende Dokumente“ oder „Weitere Dokumente“ (Kurzliste mit Titel) oder wurde es im Gespräch schon genannt, behaupte nie, es fehle. Sagt der Nutzer „doch, es gibt …“, such in der Liste nach Titel, Art und Absender (auch bei Tippfehlern) und korrigiere dich. Ist ein passendes Dokument nur in der Kurzliste, nenne es mit Link – bei der nächsten Frage liegt dir sein Inhalt vor.
WICHTIGKEIT & ZUSAMMENHANG: Jedes Dokument hat eine Wichtigkeit (1–5, 5 = unverzichtbar) und eine Rolle beim Partner (Grundlage = Vertrag/Police/Arbeitsvertrag; Änderung; laufend = Rechnungen/Abrechnungen; Schriftverkehr; Nebensache). „gehört zu“ verbindet ein Dokument mit seiner Grundlage.
- Bei mehreren passenden Dokumenten stützt du dich zuerst auf die wichtigeren; Nebensachen (Wichtigkeit 1) nur, wenn ausdrücklich gefragt.
- Fragen zu Bedingungen, Laufzeit, Kündigung, Leistungen → zuerst die Grundlage des Partners, dann spätere Änderungen (die neueste gilt).
- Fragen zu Beträgen, Verlauf, Zahlungen → die laufenden Dokumente, die zu dieser Grundlage gehören.
- Erkläre Zusammenhänge innerhalb eines Partners kurz („die Rechnung gehört zu deinem Mobilfunkvertrag vom …“).
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

  // 1) Treffer per Volltext – aus den letzten Fragen des Gesprächs, nicht nur der letzten (Rückfragen wie „doch, es gibt einen“ enthalten das Thema oft nicht)
  const recentUser = history.filter((m) => m.role === "user").slice(-3).map((m) => m.content.slice(0, 600));
  const q = [...new Set([...words(last), ...recentUser.flatMap(words)])].slice(0, 20).join(" or ");
  const rawHits = q ? ((await sb.rpc("search_documents", { q, max_results: depth === "gruendlich" ? 12 : 8 })).data as Doc[] | null) ?? [] : [];
  // im Gespräch schon genannte Dokumente (Links /d/ID, Dokument-Bausteine): immer mit Volltext dabei
  const mentioned = [...new Set(history.filter((m) => m.role === "assistant").slice(-4).flatMap((m) => m.content.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi) ?? []))].filter((id) => !rawHits.some((h) => h.id === id)).slice(0, 6);
  if (mentioned.length) {
    const { data: extra } = await sb.from("documents").select("id,title,full_text,merged_into").in("id", mentioned).eq("status", "ready");
    rawHits.unshift(...((extra ?? []).filter((d) => !d.merged_into) as unknown as Doc[]));
  }
  // zusammengeführte Einzelteile weglassen – das Ganze ist schon dabei
  const parts = rawHits.length ? new Set(((await sb.from("documents").select("id").in("id", rawHits.map((h) => h.id)).not("merged_into", "is", null)).data ?? []).map((x) => x.id)) : new Set<string>();
  const hits = rawHits.filter((h) => !parts.has(h.id));
  // nur das gewählte Projekt (falls eines gewählt ist)
  const projectId = typeof body?.projectId === "string" && /^[0-9a-f-]{36}$/i.test(body.projectId) ? body.projectId : undefined;
  const COLS = "id,title,cluster,doc_type,sender,doc_date,received_at,summary,key_facts,deadlines,amounts,tags,archived,encrypted";
  const listAll = (cols: string) => {
    let dq = sb.from("documents").select(cols).eq("status", "ready").is("merged_into", null);
    if (projectId) dq = dq.eq("project_id", projectId);
    return dq.order("received_at", { ascending: false }).limit(1500);
  };
  // alle Dokumente (nicht nur die neuesten): ausführlich nur, was zur Frage passt (Bereich, Art, Partner, Treffer, im Gespräch genannt),
  // der Rest als Kurzliste – so geht nichts verloren, und es bleibt schnell und günstig, auch bei vielen Dokumenten
  type Row = { id: string; title: string | null; cluster: string | null; doc_type: string | null; sender: string | null; doc_date: string | null; received_at: string; summary: string | null; key_facts: unknown; deadlines: unknown; amounts: unknown; tags: string[]; archived: boolean; encrypted: boolean; importance?: number | null; importance_reason?: string | null; partner_role?: string | null; basis_id?: string | null };
  // mit Wichtigkeit und Bezug; fehlt die Spalte noch (Migration 0013), ohne
  let { data: all, error: allErr } = await listAll(`${COLS},importance,importance_reason,partner_role,basis_id`).returns<Row[]>();
  if (allErr) ({ data: all } = await listAll(COLS).returns<Row[]>());
  const byId = new Map((all ?? []).map((d) => [d.id, d]));
  const route = routeQuestion(recentUser.join(" "), all ?? []);
  const hitIds = new Set(hits.map((h) => h.id));
  const today = new Date().toISOString().slice(0, 10);
  const open = (d: { deadlines: unknown }) => (d.deadlines as { date: string }[]).some((x) => x.date >= today);
  const wanted = (d: NonNullable<typeof all>[number], i: number) => hitIds.has(d.id) || route.ids.has(d.id) || (route.general && (i < 40 || open(d)));
  // Treffer und Gefragtes zuerst, dann die wichtigeren – so fallen bei vielen Dokumenten die Nebensachen raus, nicht die Verträge
  const imp = (d: Row) => d.importance ?? guessImportance(d);
  const rich = (all ?? []).filter(wanted).map((d, i) => ({ d, i, s: (hitIds.has(d.id) ? 10 : 0) + (route.ids.has(d.id) ? 5 : 0) + imp(d) }))
    .sort((a, b) => b.s - a.s || a.i - b.i).map((x) => x.d).slice(0, depth === "gruendlich" ? 120 : 70);
  const richIds = new Set(rich.map((d) => d.id));
  const basisOf = (d: Row) => (d.basis_id && byId.get(d.basis_id) ? ` · gehört zu [${byId.get(d.basis_id)!.title}](/d/${d.basis_id})` : "");
  const line = (d: Row) => `- [${d.title}](/d/${d.id}) · ${clusterOf(d.cluster).label} · ${d.doc_type ?? ""} · ${d.sender ?? ""} · ${d.doc_date ?? d.received_at.slice(0, 10)} · Wichtigkeit ${imp(d)}/5${d.importance_reason ? ` (${d.importance_reason})` : ""}${d.partner_role ? ` · Rolle: ${roleLabel(d.partner_role)}` : ""}${basisOf(d)}${d.archived ? " · ARCHIVIERT (gilt nicht mehr)" : ""}${d.encrypted ? " · verschlüsselt (Inhalt nicht lesbar)" : ""}`;
  const overview = rich.map((d) => `${line(d)}\n  ${(d.summary ?? "").slice(0, 260)}\n  Fakten: ${(d.key_facts as { label: string; value: string }[]).slice(0, d.archived ? 3 : 10).map((f) => `${f.label}: ${f.value}`).join("; ")}${(d.deadlines as { date: string; what: string }[]).length ? `\n  Fristen: ${(d.deadlines as { date: string; what: string }[]).map((x) => `${x.date} ${x.what}`).join("; ")}` : ""}`).join("\n");
  const index = (all ?? []).filter((d) => !richIds.has(d.id)).map((d) => `- [${d.title}](/d/${d.id}) · ${d.doc_type ?? ""} · ${d.sender ?? ""} · ${d.doc_date ?? d.received_at.slice(0, 10)} · W${imp(d)}${d.partner_role === "grundlage" ? " · Grundlage" : ""}${d.archived ? " · archiviert" : ""}`).join("\n");
  const details = hits.slice(0, depth === "gruendlich" ? 8 : depth === "kurz" ? 3 : 5).map((d) => `### [${d.title}](/d/${d.id})\n${(d.full_text ?? "").slice(0, depth === "gruendlich" ? 25000 : 15000)}`).join("\n\n");
  // Partnerliste mit Schlüsseln, damit Firmen im Text klickbar verlinkt werden
  // je Partner seine Grundlagen (Vertrag, Police …) und wie viele Dokumente daran hängen
  const partners = buildPartners((all ?? []).map((d) => ({ ...d, status: "ready" }) as unknown as Doc)).slice(0, 80).map((p) => {
    const basis = p.docs.filter((d) => d.partner_role === "grundlage").slice(0, 4).map((b) => `[${b.title}](/d/${b.id})${b.archived ? " (archiviert)" : ""} – ${p.docs.filter((d) => d.basis_id === b.id).length} zugehörig`);
    return `- [${p.name}](/partner/${p.key}) · ${p.docs.length} Dok.${basis.length ? ` · Grundlage: ${basis.join("; ")}` : ""}`;
  }).join("\n");
  const attachBlock = attached.length ? `## Gerade im Chat angehängt – darauf bezieht sich die Frage\n${attached.map((d) => `### [${d.title ?? "Neues Dokument"}](/d/${d.id})${d.status !== "ready" ? " (wird noch ausgelesen)" : ""}\n${d.summary ?? ""}\n${JSON.stringify(d.key_facts)}\nFristen: ${JSON.stringify(d.deadlines)}\n${(d.full_text ?? "").slice(0, 30000)}`).join("\n\n")}\n\n` : "";
  const focusBlock = focus ? `## Dieses Dokument steht im Mittelpunkt: [${focus.title}](/d/${focus.id})\n${focusText || "(Inhalt verschlüsselt – Tresor nicht entsperrt)"}\n\n` : "";
  // verschlüsselte Dokumente: nur wenn der Browser sie für diese Antwort entschlüsselt mitschickt – hier nicht gespeichert
  const secret = (Array.isArray(body?.secretDocs) ? body.secretDocs : []).filter((d) => typeof d?.id === "string" && /^[0-9a-f-]{36}$/i.test(d.id) && typeof d.text === "string").slice(0, 40);
  const secretBlock = secret.length ? `## Verschlüsselte Dokumente (für diese Antwort im Browser entschlüsselt)\n${secret.map((d) => `### [${String(d.title).slice(0, 200)}](/d/${d.id})\n${d.text.slice(0, 8000)}`).join("\n\n")}\n\n` : "";
  const context = `${attachBlock}${focusBlock}${secretBlock}${todayLine()}\n\n## Passende Dokumente mit Inhalt (${rich.length} von ${all?.length ?? 0})\n${overview || "(noch keine Dokumente)"}\n\n## Weitere Dokumente – nur Titel (${(all?.length ?? 0) - rich.length})\n${index || "(keine)"}\n\n## Partner (Firmen, Vertragspartner, Händler)\n${partners || "(keine)"}\n\n## Volltext der passendsten Dokumente\n${details || "(keine Volltext-Treffer)"}`;

  const messages: ModelMessage[] = history.map((m) => ({ role: m.role as "user" | "assistant", content: m.content.slice(0, 8000) }));
  const style = depth === "kurz"
    ? "\n\nANTWORTTIEFE: Kurz. Nur die fette Antwort, höchstens 3 Stichpunkte unter „Was das für dich heißt“, 1–2 Tipps, Quellen. Keine Details-Liste."
    : depth === "gruendlich"
      ? "\n\nANTWORTTIEFE: Gründlich. Prüfe alle passenden Dokumente, vergleiche sie, zeige Rechnungen und Fristen Schritt für Schritt, nenne Alternativen und Risiken und einen klaren Plan."
      : "";
  const res = streamText({ ...aiFor("chat"), system: `${SYSTEM}${style}\n\n${context}`, messages, maxOutputTokens: depth === "gruendlich" ? 9000 : depth === "kurz" ? 1500 : 4000 });
  // eigener Text-Stream: am Ende eine unsichtbare Zeile, warum er endete – bricht er ab, sieht der Browser das und sagt es
  const enc = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(c) {
      let reason = "unbekannt";
      try {
        for await (const part of res.fullStream) {
          if (part.type === "text-delta") c.enqueue(enc.encode(part.text));
          else if (part.type === "error") throw part.error;
          else if (part.type === "finish") reason = part.finishReason;
          else if (part.type === "abort") reason = "abort";
        }
        c.enqueue(enc.encode(`\n[[ENDE:${reason}]]`));
      } catch (e) {
        console.error("chat stream", (e as Error)?.message ?? e);
        c.enqueue(enc.encode(`\n[[FEHLER:${String((e as Error)?.message ?? e).replace(/\]\]/g, "").slice(0, 200)}]]`));
      }
      c.close();
    },
  });
  return new Response(stream, { headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store", "x-accel-buffering": "no" } });
}
