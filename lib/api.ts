import { createClient } from "@supabase/supabase-js";
import { extract, FILE_TYPES, TEXT_TYPES, toColumns } from "@/lib/extract";

/**
 * Schnittstelle für andere Apps (REST und MCP).
 * Der Server hat keinen Dienstschlüssel: Er reicht die Zugangsdaten der App an Datenbankfunktionen weiter,
 * die Zugang, Rechte, Projekte, Bereiche und Schwärzung selbst prüfen (siehe supabase/migrations/0003_projects_api.sql).
 */
const anon = () => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });

export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string) { super(message); }
}

const ERRORS: Record<string, [number, string]> = {
  unauthorized: [401, "Zugangsdaten fehlen, sind falsch, abgelaufen oder widerrufen."],
  forbidden: [403, "Diese App hat dafür keine Berechtigung."],
  forbidden_project: [403, "Diese App hat keinen Zugriff auf dieses Projekt."],
  rate_limited: [429, "Zu viele Anfragen. Bitte kurz warten."],
  not_found: [404, "Dokument nicht gefunden oder nicht freigegeben."],
  unsupported_type: [415, "Dateityp nicht unterstützt (PDF, JPEG, PNG, WebP, Text)."],
  too_large: [413, "Datei zu groß."],
  // OAuth (RFC 6749): Fehlercodes so, wie Apps sie erwarten
  invalid_client: [401, "App unbekannt, gesperrt oder Geheimnis falsch."],
  invalid_grant: [400, "Code bzw. Token ungültig, abgelaufen oder schon benutzt."],
  invalid_request: [400, "Anfrage unvollständig oder ungültig."],
};

export async function rpc<T>(fn: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await anon().rpc(fn, args);
  if (error) {
    const key = Object.keys(ERRORS).find((k) => error.message === k);
    if (key) throw new ApiError(ERRORS[key][0], key, ERRORS[key][1]);
    console.error("api", fn, error.message);
    throw new ApiError(400, "bad_request", "Anfrage konnte nicht verarbeitet werden.");
  }
  return data as T;
}

/** Zugang aus dem Header: „Bearer lvt_…“ (Token), „Bearer lv_…:geheimnis“ oder Basic Auth (client_id:client_secret) */
export function credential(req: Request): string {
  const h = req.headers.get("authorization") ?? "";
  const bearer = /^Bearer\s+(.+)$/i.exec(h)?.[1]?.trim();
  if (bearer) return bearer;
  const basic = /^Basic\s+(.+)$/i.exec(h)?.[1];
  if (basic) { try { return Buffer.from(basic, "base64").toString("utf8"); } catch { /* unten */ } }
  throw new ApiError(401, "unauthorized", ERRORS.unauthorized[1]);
}

const HEADERS = { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" };

export function ok(data: unknown, status = 200) {
  return Response.json(data, { status, headers: HEADERS });
}

export function fail(e: unknown) {
  const err = e instanceof ApiError ? e : new ApiError(500, "server_error", "Interner Fehler.");
  if (!(e instanceof ApiError)) console.error("api", (e as Error)?.message);
  return Response.json({ error: err.code, message: err.message }, {
    status: err.status,
    headers: { ...HEADERS, ...(err.status === 401 ? { "WWW-Authenticate": 'Bearer realm="lifevault"' } : {}) },
  });
}

export const MAX_UPLOAD = 4 * 1024 * 1024; // Vercel nimmt höchstens ~4,5 MB pro Anfrage an

/** Datei hochladen: Rechte prüfen → mit KI auslesen → speichern. Gibt das (gefilterte) Dokument zurück. */
export async function uploadDocument(cred: string, input: { fileName: string; mimeType: string; data: Uint8Array; projectId?: string | null }) {
  const mime = input.mimeType.split(";")[0].trim().toLowerCase();
  if (![...FILE_TYPES, ...TEXT_TYPES].includes(mime)) throw new ApiError(415, "unsupported_type", ERRORS.unsupported_type[1]);
  if (!input.data.length || input.data.length > MAX_UPLOAD) throw new ApiError(413, "too_large", `Datei zu groß (höchstens ${MAX_UPLOAD / 1024 / 1024} MB).`);
  if (input.projectId && !/^[0-9a-f-]{36}$/i.test(input.projectId)) throw new ApiError(400, "bad_request", "project_id ist keine gültige ID.");
  const { project_id } = await rpc<{ project_id: string }>("api_upload_check", { p_cred: cred, p_project: input.projectId ?? null });
  const o = await extract({ data: input.data, mediaType: mime }).catch((e) => { console.error("api extract", (e as Error).message); return undefined; });
  if (!o) throw new ApiError(422, "unreadable", "Das Dokument konnte nicht ausgelesen werden.");
  const { meta, content } = toColumns(o);
  return rpc<{ id: string; visible: boolean; document: unknown }>("api_upload", {
    p_cred: cred, p_project: project_id, p_file_name: input.fileName.slice(0, 200), p_mime: mime,
    p_data: Buffer.from(input.data).toString("base64"), p_doc: { ...meta, ...content },
  });
}

export type SearchArgs = { query?: string; project_id?: string; cluster?: string; kinds?: string[]; since?: string; until?: string; include_archived?: boolean; limit?: number; offset?: number };
/** Dokumentarten wie lib/kinds.ts (Filter „kinds=rechnung,mahnung“) */
export const KIND_IDS = ["mahnung", "gehalt", "medizin", "ausweis", "angebot", "bescheid", "formular", "bedingungen", "rechnung", "bestaetigung", "vertrag", "schreiben"];
const kindsOrNull = (v?: string[]) => { const k = (v ?? []).filter((x) => KIND_IDS.includes(x)); return k.length ? k : null; };
const uuidOrNull = (v?: string) => (v && /^[0-9a-f-]{36}$/i.test(v) ? v : null);
const dateOrNull = (v?: string) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);

export function search(cred: string, a: SearchArgs) {
  return rpc("api_search_v2", {
    p_cred: cred, p_query: a.query?.slice(0, 200) ?? null, p_project: uuidOrNull(a.project_id), p_cluster: a.cluster?.slice(0, 30) ?? null, p_kinds: kindsOrNull(a.kinds),
    p_since: dateOrNull(a.since), p_until: dateOrNull(a.until), p_archived: !!a.include_archived,
    p_limit: Number.isFinite(a.limit) ? a.limit : 20, p_offset: Number.isFinite(a.offset) ? a.offset : 0,
  });
}

export function getDocument(cred: string, id: string) {
  if (!uuidOrNull(id)) throw new ApiError(404, "not_found", ERRORS.not_found[1]);
  return rpc("api_get_document", { p_cred: cred, p_id: id });
}

/**
 * Original-Datei eines Dokuments. Die Datenbank prüft Zugang und Rechte (api_file). Liegt die Datei schon im Speicher,
 * liest der Server genau diesen einen Pfad im Ordner des Nutzers – mit dem Service-Role-Key, aber erst nach dieser Prüfung
 * (zweite Ausnahme neben dem Mail-Job, siehe CLAUDE.md).
 */
export async function getFile(cred: string, id: string): Promise<{ name: string; mime: string; data: Uint8Array }> {
  if (!uuidOrNull(id)) throw new ApiError(404, "not_found", ERRORS.not_found[1]);
  const f = await rpc<{ name: string; mime: string; data?: string; path?: string }>("api_file", { p_cred: cred, p_id: id });
  if (f.data) return { name: f.name, mime: f.mime, data: Uint8Array.from(Buffer.from(f.data, "base64")) };
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!f.path || !key) throw new ApiError(404, "not_found", ERRORS.not_found[1]);
  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await admin.storage.from("documents").download(f.path);
  if (error || !data) throw new ApiError(404, "not_found", ERRORS.not_found[1]);
  return { name: f.name, mime: f.mime, data: new Uint8Array(await data.arrayBuffer()) };
}
