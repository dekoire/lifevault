import { generateText, Output } from "ai";
import { z } from "zod";
import { aiFor } from "@/lib/ai";
import { extract, FILE_TYPES, slicePdf, splitPlan, TEXT_TYPES, toColumns, type Extracted } from "@/lib/extract";
import { unauthorized, userClient } from "@/lib/server";

export const maxDuration = 300;

const MAX_BYTES = 20 * 1024 * 1024;

const Archive = z.object({
  newIsOutdated: z.boolean().describe("true, wenn das NEUE Dokument selbst schon überholt ist (z. B. alter Vertrag, früherer Arbeitgeber, abgelaufene Police)"),
  newReason: z.string().nullable(),
  outdated: z.array(z.object({ id: z.string(), reason: z.string() })).describe("bestehende Dokumente, die durch das neue überholt sind"),
});

/** Prüft, ob das neue Dokument ältere ersetzt (Anbieterwechsel, neuer Arbeitgeber, neue Police) oder selbst veraltet ist */
async function archiveCheck(sb: NonNullable<Awaited<ReturnType<typeof userClient>>>["sb"], id: string, o: Extracted) {
  const { data: others } = await sb.from("documents").select("id,title,doc_type,sender,doc_date,received_at,cluster,archived").eq("status", "ready").eq("cluster", o.cluster).neq("id", id).order("received_at", { ascending: false }).limit(40);
  if (!others?.length || !["vertraege", "arbeit", "versicherungen", "wohnen", "mobilitaet", "finanzen"].includes(o.cluster)) return;
  const list = others.map((d) => `- ${d.id} | ${d.title} | ${d.doc_type ?? ""} | ${d.sender ?? ""} | ${d.doc_date ?? d.received_at.slice(0, 10)}${d.archived ? " | bereits archiviert" : ""}`).join("\n");
  const r = await generateText({
    ...aiFor("classify"),
    system: `Du hältst einen Dokumenten-Tresor aktuell. Heute ist ${new Date().toISOString().slice(0, 10)}. Archiviert wird, was nicht mehr gilt: z. B. Mobilfunkvertrag O2, wenn ein neuerer Vodafone-Mobilfunkvertrag da ist; Arbeitsvertrag beim früheren Arbeitgeber, wenn ein neuerer Arbeitsvertrag/Gehaltsabrechnung eines anderen Arbeitgebers da ist; abgelaufene Policen. Gleicher Anbieter mit neuer Rechnung ersetzt nicht den Vertrag. Rechnungen und Belege werden nie archiviert, nur weil sie alt sind. Sei vorsichtig: im Zweifel nichts archivieren.`,
    prompt: `Neues Dokument: ${o.title} | ${o.docType} | ${o.sender ?? ""} | ${o.docDate ?? ""}\nZusammenfassung: ${o.summary}\n\nBestehende Dokumente im selben Bereich:\n${list}`,
    output: Output.object({ schema: Archive, name: "archive" }),
  }).catch(() => undefined);
  const a = r?.output;
  if (!a) return;
  if (a.newIsOutdated) await sb.from("documents").update({ archived: true, archived_reason: a.newReason?.slice(0, 300) ?? "veraltet" }).eq("id", id);
  const ids = new Set(others.filter((d) => !d.archived).map((d) => d.id));
  for (const x of a.outdated.filter((x) => ids.has(x.id)).slice(0, 10)) await sb.from("documents").update({ archived: true, archived_reason: x.reason.slice(0, 300) }).eq("id", x.id);
}

/**
 * Liest ein Dokument aus, ordnet es ein und speichert Struktur, Key-Fakten und Volltext.
 * Verschlüsselte Dokumente: Der Browser schickt die entschlüsselte Datei mit (data, Base64) – das Ergebnis geht nur zurück
 * an den Browser (inline), der es verschlüsselt speichert. Auf dem Server bleibt davon nichts liegen.
 */
export async function POST(req: Request) {
  const auth = await userClient(req);
  if (!auth) return unauthorized();
  const { sb } = auth;
  const body = (await req.json().catch(() => null)) as { id?: unknown; data?: unknown; mediaType?: unknown } | null;
  const id = typeof body?.id === "string" ? body.id : "";
  if (!/^[0-9a-f-]{36}$/i.test(id)) return Response.json({ error: "Ungültige Anfrage." }, { status: 400 });
  const inline = typeof body?.data === "string";

  const { data: doc } = await sb.from("documents").select("id,file_path,file_name,mime_type,size_bytes,project_id,received_at,split_from").eq("id", id).maybeSingle();
  if (!doc) return Response.json({ error: "Nicht gefunden." }, { status: 404 });
  const fail = async (msg: string) => {
    await sb.from("documents").update({ status: "error", error: msg }).eq("id", id);
    return Response.json({ error: msg }, { status: 422 });
  };
  const mediaType = inline && typeof body?.mediaType === "string" ? body.mediaType : doc.mime_type;
  if (![...FILE_TYPES, ...TEXT_TYPES].includes(mediaType)) return fail("Dieser Dateityp wird noch nicht unterstützt (Foto, PDF oder Text).");

  let data: Uint8Array;
  if (inline) {
    data = Uint8Array.from(Buffer.from(body!.data as string, "base64"));
  } else {
    if (doc.size_bytes > MAX_BYTES) return fail("Die Datei ist größer als 20 MB.");
    await sb.from("documents").update({ status: "processing", error: null }).eq("id", id);
    const { data: file, error: dlErr } = await sb.storage.from("documents").download(doc.file_path);
    if (dlErr || !file) return fail("Die Datei konnte nicht geladen werden.");
    data = new Uint8Array(await file.arrayBuffer());
  }

  // mehrere Briefe in einer PDF → in einzelne Dokumente trennen (nicht bei verschlüsselten Dateien)
  if (!inline && mediaType === "application/pdf" && !doc.split_from) {
    const plan = await splitPlan(data).catch(() => undefined);
    if (plan) {
      const ids: string[] = [];
      try {
        for (const [i, p] of plan.entries()) {
          const bytes = await slicePdf(data, p.fromPage, p.toPage);
          const path = `${auth.user.id}/${crypto.randomUUID()}.pdf`;
          const up = await sb.storage.from("documents").upload(path, bytes, { contentType: "application/pdf" });
          if (up.error) throw up.error;
          const name = `${doc.file_name.replace(/\.pdf$/i, "")} – Teil ${i + 1} (S. ${p.fromPage}${p.toPage > p.fromPage ? `–${p.toPage}` : ""}).pdf`;
          const { data: row, error } = await sb.from("documents").insert({ file_path: path, file_name: name.slice(0, 200), mime_type: "application/pdf", size_bytes: bytes.length, project_id: doc.project_id, received_at: doc.received_at, split_from: doc.id }).select("id").single();
          if (error) throw error;
          ids.push(row.id);
        }
        // Original durch die Teile ersetzen
        await sb.storage.from("documents").remove([doc.file_path]);
        await sb.from("documents").delete().eq("id", id);
        return Response.json({ ok: true, split: ids });
      } catch (e) {
        console.error("split", (e as Error).message);
        // halb angelegte Teile wieder entfernen, dann normal als ein Dokument auslesen
        if (ids.length) await sb.from("documents").delete().in("id", ids);
      }
    }
  }

  try {
    const o = await extract({ data, mediaType });
    if (!o) return fail("Das Dokument konnte nicht gelesen werden.");
    const { meta, content } = toColumns(o);
    if (inline) {
      // nur Metadaten speichern, Inhalt verschlüsselt der Browser
      await sb.from("documents").update({ ...meta, status: "ready", error: null }).eq("id", id);
      return Response.json({ ok: true, meta, content });
    }
    await sb.from("documents").update({ ...meta, ...content, status: "ready", error: null }).eq("id", id);
    await archiveCheck(sb, id, o).catch((e) => console.error("archive", (e as Error).message));
    return Response.json({ ok: true });
  } catch (e) {
    console.error("process", (e as Error).message);
    return fail("Das Auslesen hat nicht geklappt. Bitte später erneut versuchen.");
  }
}
