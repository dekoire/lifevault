"use client";
/**
 * E-Mail-Import im Browser: Gmail (Google-Anmeldung, nur Lesen) und Mail-Dateien (.eml/.mbox, z. B. Export aus Proton Mail).
 * Mails und Anhänge gehen nicht über unseren Server – nur Absender, Betreff, Vorschau und Dateinamen an die KI-Vorprüfung.
 */
import PostalMime from "postal-mime";

export type MailAttachment = { name: string; mime: string; size: number; load: () => Promise<Blob> };
export type MailItem = { id: string; source: string; from: string; subject: string; date: string; snippet: string; attachments: MailAttachment[] };

// ---------- Anhänge vorsortieren (ohne KI) ----------
const DOC_MIME = /^(application\/pdf|image\/(jpeg|png|heic|heif|webp)|application\/(msword|vnd\.openxmlformats-officedocument\.[a-z.]+|vnd\.ms-excel|vnd\.ms-powerpoint))$/i;
const DOC_EXT = /\.(pdf|jpe?g|png|heic|heif|webp|docx?|xlsx?|pptx?)$/i;
const JUNK = /^(image\d*|logo|banner|signature|unnamed|icon|spacer|facebook|twitter|instagram|linkedin|outlook)[\w-]*\.(png|jpe?g|gif)$/i;
const MIME_BY_EXT: Record<string, string> = { pdf: "application/pdf", jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", heic: "image/heic", heif: "image/heif", webp: "image/webp", doc: "application/msword", docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", xls: "application/vnd.ms-excel", xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", ppt: "application/vnd.ms-powerpoint", pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation" };

/** Kandidat: Dokument-Typ, nicht winzig (Logos/Signaturen), nicht offensichtlich Deko */
export function isCandidate(a: { name: string; mime: string; size: number; inline?: boolean }) {
  if (!DOC_MIME.test(a.mime) && !DOC_EXT.test(a.name)) return false;
  const image = /^image\//i.test(a.mime) || /\.(jpe?g|png|webp|heic|heif)$/i.test(a.name);
  if (image && (a.size < 40_000 || JUNK.test(a.name) || a.inline)) return false;
  return a.size > 2_000 && a.size < 20 * 1024 * 1024;
}
export const fixMime = (name: string, mime: string) => (mime && mime !== "application/octet-stream" ? mime : MIME_BY_EXT[name.split(".").pop()?.toLowerCase() ?? ""] ?? mime);

// ---------- Gmail ----------
type TokenClient = { requestAccessToken: (o?: { prompt?: string; login_hint?: string }) => void };
type GoogleOAuth = { accounts: { oauth2: { initTokenClient: (c: { client_id: string; scope: string; callback: (r: { access_token?: string; error?: string }) => void; error_callback?: (e: { type: string }) => void }) => TokenClient } } };
declare global { interface Window { google?: GoogleOAuth } }

export const GMAIL_CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ?? "";
const SCOPE = "https://www.googleapis.com/auth/gmail.readonly";

function loadGis() {
  return new Promise<void>((ok, fail) => {
    if (window.google?.accounts?.oauth2) return ok();
    const s = document.createElement("script");
    s.src = "https://accounts.google.com/gsi/client";
    s.async = true;
    s.onload = () => ok();
    s.onerror = () => fail(new Error("Google-Anmeldung konnte nicht geladen werden."));
    document.head.appendChild(s);
  });
}

/** Google fragt einmal nach Erlaubnis (nur Lesen); der Zugang gilt etwa eine Stunde und wird nirgends gespeichert */
export async function gmailToken(hint?: string): Promise<string> {
  if (!GMAIL_CLIENT_ID) throw new Error("Gmail ist noch nicht eingerichtet (Google Client-ID fehlt).");
  await loadGis();
  return new Promise((ok, fail) => {
    const client = window.google!.accounts.oauth2.initTokenClient({
      client_id: GMAIL_CLIENT_ID,
      scope: SCOPE,
      callback: (r) => (r.access_token ? ok(r.access_token) : fail(new Error(r.error === "access_denied" ? "Zugriff wurde nicht erlaubt." : "Google-Anmeldung fehlgeschlagen."))),
      error_callback: (e) => fail(new Error(e.type === "popup_closed" ? "Google-Fenster wurde geschlossen." : "Google-Anmeldung fehlgeschlagen.")),
    });
    client.requestAccessToken({ prompt: "", ...(hint ? { login_hint: hint } : {}) });
  });
}

async function gget<T>(token: string, path: string): Promise<T> {
  for (let i = 0; i < 4; i++) {
    const res = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/${path}`, { headers: { Authorization: `Bearer ${token}` } });
    if (res.status === 429 || res.status >= 500) { await new Promise((r) => setTimeout(r, 800 * 2 ** i)); continue; }
    if (res.status === 401) throw new Error("Google-Zugang abgelaufen – bitte erneut abrufen.");
    if (!res.ok) throw new Error(`Gmail-Fehler ${res.status}`);
    return res.json() as Promise<T>;
  }
  throw new Error("Gmail antwortet gerade nicht. Bitte später erneut versuchen.");
}

export async function gmailProfile(token: string) {
  return gget<{ emailAddress: string }>(token, "profile");
}

/** Begrenzte Parallelität */
export async function pool<T, R>(list: T[], n: number, fn: (x: T, i: number) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(list.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(n, list.length) }, async () => { while (next < list.length) { const i = next++; out[i] = await fn(list[i], i); } }));
  return out;
}

type Part = { filename?: string; mimeType: string; headers?: { name: string; value: string }[]; body?: { attachmentId?: string; size?: number; data?: string }; parts?: Part[] };
type GMsg = { id: string; snippet: string; internalDate: string; payload: Part };
const b64url = (s: string) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));

/** Mails mit Anhang im Zeitraum (from inklusive, to exklusive), höchstens max */
export async function gmailSearch(token: string, from: Date, to: Date, max: number, onProgress?: (n: number) => void): Promise<string[]> {
  const q = `has:attachment -in:chats -in:spam -in:trash after:${Math.floor(from.getTime() / 1000)} before:${Math.floor(to.getTime() / 1000)}`;
  const ids: string[] = [];
  let page: string | undefined;
  do {
    const r = await gget<{ messages?: { id: string }[]; nextPageToken?: string }>(token, `messages?maxResults=100&q=${encodeURIComponent(q)}${page ? `&pageToken=${page}` : ""}`);
    ids.push(...(r.messages ?? []).map((m) => m.id));
    onProgress?.(ids.length);
    page = r.nextPageToken;
  } while (page && ids.length < max);
  return ids.slice(0, max);
}

export async function gmailMessage(token: string, id: string, source: string): Promise<MailItem> {
  const m = await gget<GMsg>(token, `messages/${id}?format=full`);
  const head = (n: string) => m.payload.headers?.find((h) => h.name.toLowerCase() === n)?.value ?? "";
  const atts: MailAttachment[] = [];
  const walk = (p: Part) => {
    if (p.filename && p.body?.attachmentId) {
      const disp = p.headers?.find((h) => h.name.toLowerCase() === "content-disposition")?.value ?? "";
      const mime = fixMime(p.filename, p.mimeType);
      const a = { name: p.filename, mime, size: p.body.size ?? 0, inline: /^inline/i.test(disp) && !!p.headers?.some((h) => h.name.toLowerCase() === "content-id") };
      const attId = p.body.attachmentId;
      if (isCandidate(a)) atts.push({ name: a.name, mime, size: a.size, load: async () => new Blob([b64url((await gget<{ data: string }>(token, `messages/${id}/attachments/${attId}`)).data) as BlobPart], { type: mime }) });
    }
    p.parts?.forEach(walk);
  };
  walk(m.payload);
  return { id: `gmail:${id}`, source, from: head("from"), subject: head("subject"), date: new Date(Number(m.internalDate)).toISOString(), snippet: decodeEntities(m.snippet ?? ""), attachments: atts };
}

const decodeEntities = (s: string) => s.replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">");

// ---------- Mail-Dateien (.eml, .mbox) ----------
/** .mbox in einzelne Nachrichten teilen („From “ am Zeilenanfang nach Leerzeile) */
function splitMbox(text: string) {
  return text.split(/\r?\n(?=From [^\r\n]*\r?\n)/).map((m) => m.replace(/^From [^\r\n]*\r?\n/, "").replace(/^>(>*From )/gm, "$1")).filter((m) => m.trim());
}

async function hashId(s: string) {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(d)].slice(0, 12).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function parseMailFiles(files: File[], onProgress?: (n: number) => void): Promise<MailItem[]> {
  const raws: (string | ArrayBuffer)[] = [];
  for (const f of files) {
    if (/\.mbox$/i.test(f.name) || f.type === "application/mbox") raws.push(...splitMbox(await f.text()));
    else raws.push(await f.arrayBuffer());
  }
  const out: MailItem[] = [];
  for (const [i, raw] of raws.entries()) {
    const e = await PostalMime.parse(raw).catch(() => undefined);
    onProgress?.(i + 1);
    if (!e) continue;
    const atts: MailAttachment[] = [];
    for (const a of e.attachments ?? []) {
      const name = a.filename ?? "";
      const bytes = typeof a.content === "string" ? new TextEncoder().encode(a.content) : new Uint8Array(a.content as ArrayBuffer);
      const mime = fixMime(name, a.mimeType);
      if (name && isCandidate({ name, mime, size: bytes.byteLength, inline: a.disposition === "inline" && !!a.contentId })) atts.push({ name, mime, size: bytes.byteLength, load: async () => new Blob([bytes as BlobPart], { type: mime }) });
    }
    const date = e.date ? new Date(e.date) : new Date(NaN);
    const from = e.from ? (e.from.name ? `${e.from.name} <${e.from.address ?? ""}>` : e.from.address ?? "") : "";
    const key = e.messageId || `${from}|${e.subject}|${e.date}|${atts.map((a) => a.name).join(",")}`;
    out.push({ id: `eml:${await hashId(key)}`, source: "eml", from, subject: e.subject ?? "", date: isNaN(date.getTime()) ? "" : date.toISOString(), snippet: (e.text ?? "").replace(/\s+/g, " ").trim().slice(0, 300), attachments: atts });
  }
  return out;
}

/** Dateiname für den Tresor: Originalname, bei generischen Namen mit Absender davor */
export function importName(m: MailItem, a: MailAttachment) {
  const sender = m.from.replace(/<.*>/, "").replace(/["']/g, "").trim() || m.from.replace(/.*@/, "").replace(/>.*/, "");
  return /^(attachment|anhang|document|dokument|scan|file|datei|unnamed|image)?[-_ ]?\d*\.\w+$/i.test(a.name) ? `${sender} – ${a.name}`.slice(0, 180) : a.name;
}
