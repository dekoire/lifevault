"use client";
import { authFetch, supabase } from "@/lib/supabase";
import type { Doc, SecretPart } from "@/lib/types";
import { openBytes, openJson, sealBytes, sealJson } from "@/lib/vault";

/**
 * Verschlüsselung einzelner Dokumente (Ende-zu-Ende, siehe lib/vault.ts):
 * Original-Datei und Inhalt (Zusammenfassung, Fakten, Fristen, Beträge, Volltext) liegen danach nur noch verschlüsselt vor.
 * Lesbar bleiben Titel, Bereich, Art, Absender und Datum – damit Sortieren und Suchen nach Titel weiter funktionieren.
 */
const SECRET_COLS = "summary,key_facts,deadlines,amounts,full_text";
const CLEARED = { summary: null, key_facts: [], deadlines: [], amounts: [], full_text: null };

async function download(path: string) {
  const { data, error } = await supabase.storage.from("documents").download(path);
  if (error || !data) throw new Error("Datei konnte nicht geladen werden.");
  return new Uint8Array(await data.arrayBuffer());
}
async function upload(path: string, bytes: Uint8Array, type: string) {
  const { error } = await supabase.storage.from("documents").upload(path, new Blob([bytes as BlobPart], { type }), { upsert: true, contentType: type });
  if (error) throw new Error("Datei konnte nicht gespeichert werden.");
}

export async function protectDoc(d: Pick<Doc, "id" | "file_path" | "mime_type">) {
  const plain = await download(d.file_path);
  const { data } = await supabase.from("documents").select(SECRET_COLS).eq("id", d.id).single();
  const secret = await sealJson(data as SecretPart);
  await upload(d.file_path, await sealBytes(plain), "application/octet-stream");
  const { error } = await supabase.from("documents").update({ ...CLEARED, encrypted: true, secret }).eq("id", d.id);
  if (error) throw new Error("Verschlüsseln hat nicht geklappt.");
}

export async function unprotectDoc(d: Pick<Doc, "id" | "file_path" | "mime_type" | "secret">) {
  if (!d.secret) throw new Error("Kein verschlüsselter Inhalt.");
  const content = await openJson<SecretPart>(d.secret);
  const file = await openBytes(await download(d.file_path));
  await upload(d.file_path, file, d.mime_type);
  const { error } = await supabase.from("documents").update({ ...content, encrypted: false, secret: null }).eq("id", d.id);
  if (error) throw new Error("Entschlüsseln hat nicht geklappt.");
}

/** Verschlüsseltes Dokument zum Anzeigen öffnen: Inhalt + Datei als lokale Adresse (nur im Browser) */
export async function openDoc(d: Pick<Doc, "file_path" | "mime_type" | "secret">) {
  const content = d.secret ? await openJson<SecretPart>(d.secret) : null;
  const file = await openBytes(await download(d.file_path));
  return { content, url: URL.createObjectURL(new Blob([file as BlobPart], { type: d.mime_type })), bytes: file };
}

const toB64 = (u: Uint8Array) => { let s = ""; for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode(...u.subarray(i, i + 0x8000)); return btoa(s); };

/** Verschlüsseltes Dokument (neu) auslesen: Datei entschlüsselt zum Server, Ergebnis verschlüsselt zurück in die Datenbank */
export async function processEncrypted(d: Pick<Doc, "id" | "mime_type">, plain: Uint8Array) {
  if (plain.length > 4_000_000) throw new Error("Verschlüsselte Dateien können bis 4 MB ausgelesen werden.");
  const res = await authFetch("/api/process", { method: "POST", body: JSON.stringify({ id: d.id, data: toB64(plain), mediaType: d.mime_type }) });
  const r = (await res.json().catch(() => ({}))) as { content?: SecretPart; error?: string };
  if (!res.ok || !r.content) throw new Error(r.error ?? "Auslesen hat nicht geklappt.");
  await supabase.from("documents").update({ secret: await sealJson(r.content), encrypted: true, ...CLEARED }).eq("id", d.id);
}

export { download as downloadFile, sealBytes };
