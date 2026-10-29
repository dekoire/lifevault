"use client";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useMe } from "@/lib/me";
import { useProjects } from "@/lib/projects";
import { OFFICE_MIME, officeKind } from "@/lib/office";
import { downloadFile, processEncrypted, protectDoc } from "@/lib/protect";
import { authFetch, supabase } from "@/lib/supabase";
import { openBytes, sealBytes, vaultKey } from "@/lib/vault";
import { isBack } from "@/lib/cards";
import { removeThumbs } from "@/lib/thumbs";
import { LIST_COLS, type Doc } from "@/lib/types";

export type BatchItem = { key: string; name: string; id?: string; state: "uploading" | "saved" | "failed"; error?: string };
type Ctx = { batch: BatchItem[]; clearBatch: () => void; docs: Doc[]; allDocs: Doc[]; partsOf: (id: string) => Doc[]; loading: boolean; refresh: () => Promise<void>; upload: (files: File[], opts?: { encrypt?: boolean; projectId?: string | null; silent?: boolean; noSplit?: boolean }) => Promise<string[]>; pendingProtect: number; reprocess: (id: string, password?: string) => Promise<void>; splitDoc: (id: string) => Promise<void>; remove: (d: Doc) => Promise<void>; uploading: number };
const DocsCtx = createContext<Ctx | null>(null);

const OK = ["image/jpeg", "image/png", "image/webp", "application/pdf"];

/** „image.jpg“ vom iPhone u. Ä. → „Foto 29.10.2026 07:25.jpg“ */
function friendlyName(name: string, i: number, n: number) {
  if (!/^(image|img[_-]?\d*|photo|foto|pxl_|dsc|screenshot|scan)[^/]*\.(jpe?g|png|heic|heif|webp)$/i.test(name)) return name;
  const now = new Date();
  const stamp = `${now.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" })} ${now.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })}`;
  return `Foto ${stamp}${n > 1 ? ` (${i + 1})` : ""}.${name.split(".").pop()!.toLowerCase()}`;
}

/** Fotos verkleinern (lange Kante 2400 px) und als JPEG speichern – auch HEIC vom iPhone, sofern der Browser es lesen kann */
async function prepare(file: File): Promise<File> {
  if (file.type === "application/pdf") return file;
  // Office-Dateien: manche Browser liefern keinen Typ – aus der Endung ergänzen
  const kind = officeKind(file.type, file.name);
  if (kind) return file.type ? file : new File([file], file.name, { type: OFFICE_MIME(kind) });
  const isImage = file.type.startsWith("image/") || /\.(heic|heif)$/i.test(file.name);
  if (!isImage) return file;
  if (OK.includes(file.type) && file.size < 2_500_000) return file;
  try {
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, 2400 / Math.max(bmp.width, bmp.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bmp.width * scale);
    canvas.height = Math.round(bmp.height * scale);
    canvas.getContext("2d")!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", 0.86));
    if (!blob) return file;
    return new File([blob], file.name.replace(/\.[^.]+$/, "") + ".jpg", { type: "image/jpeg" });
  } catch {
    return file;
  }
}

/** höchstens 3 Dateien gleichzeitig auslesen – 20 parallele KI-Aufrufe (z. B. Mail mit vielen Anhängen) liefen in Fehler */
const MAX_PARALLEL = 3;
let running = 0;
const waiting: (() => void)[] = [];
async function queued<T>(fn: () => Promise<T>): Promise<T> {
  if (running >= MAX_PARALLEL) await new Promise<void>((r) => waiting.push(r));
  running++;
  try { return await fn(); } finally { running--; waiting.shift()?.(); }
}

export function DocsProvider({ userId, children }: { userId: string; children: React.ReactNode }) {
  const [docs, setDocs] = useState<Doc[]>([]);
  const [parts, setParts] = useState<Doc[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(0);
  const [batch, setBatch] = useState<BatchItem[]>([]);
  const patch = (key: string, p: Partial<BatchItem>) => setBatch((b) => b.map((x) => (x.key === key ? { ...x, ...p } : x)));
  const clearBatch = useCallback(() => setBatch([]), []);
  const refresh = useCallback(async () => {
    const load = (cols: string) => supabase.from("documents").select(cols).order("received_at", { ascending: false }).limit(1000);
    let { data, error } = await load(LIST_COLS);
    // Datenbank noch ohne Projekte (Migration 0003 fehlt): ohne die neuen Spalten laden
    if (error) ({ data, error } = await load(LIST_COLS.replace(",project_id,split_from", "")));
    const list = (data as unknown as Doc[]) ?? [];
    // Einzelteile zusammengeführter Dokumente ausblenden, aber merken (für „Teile“ und „Wieder trennen“)
    setParts(list.filter((d) => d.merged_into));
    setDocs(list.filter((d) => !d.merged_into));
    setLoading(false);
  }, []);
  useEffect(() => { void refresh(); }, [refresh]);

  // solange etwas ausgelesen wird: alle 3 s nachsehen
  const busy = docs.some((d) => d.status === "processing") || uploading > 0;
  const timer = useRef<number>(undefined);
  useEffect(() => {
    if (!busy) return;
    timer.current = window.setInterval(() => void refresh(), 3000);
    return () => window.clearInterval(timer.current);
  }, [busy, refresh]);

  // Auslesen; enthält eine PDF mehrere Briefe, kommen die Teile zurück und werden einzeln ausgelesen
  // split: true = jetzt trennen, false = nie trennen (z. B. bewusst zusammengeführt), undefined = automatisch
  const process = async (id: string, split?: boolean, password?: string): Promise<void> => {
    try {
      const res = await queued(() => authFetch("/api/process", { method: "POST", body: JSON.stringify({ id, ...(split !== undefined ? { split } : {}), ...(password ? { password } : {}) }) }));
      const json = (await res.json().catch(() => ({}))) as { split?: string[] };
      await refresh();
      if (json.split?.length) for (let i = 0; i < json.split.length; i += 2) await Promise.all(json.split.slice(i, i + 2).map((x) => process(x)));
    } catch {
      await refresh();
    }
  };
  const { current, defaultProject } = useProjects();

  const upload = useCallback(async (files: File[], opts: { encrypt?: boolean; projectId?: string | null; silent?: boolean; noSplit?: boolean } = {}): Promise<string[]> => {
    const ids: string[] = [];
    const encrypt = !!opts.encrypt && !!vaultKey();
    const projectId = opts.projectId ?? (current !== "all" ? current : defaultProject?.id ?? null);
    setUploading((n) => n + files.length);
    const items = files.map((f, i) => ({ key: crypto.randomUUID(), name: friendlyName(f.name, i, files.length), state: "uploading" as const }));
    // silent: ohne Fortschritts-Fenster (z. B. Anhang im Chat)
    if (!opts.silent) setBatch((b) => [...b.filter((x) => x.state !== "failed"), ...items]);
    await Promise.all(files.map(async (raw, i) => {
      const item = items[i];
      try {
        const file = await prepare(raw);
        const ext = (file.name.split(".").pop() ?? "bin").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 5) || "bin";
        const path = `${userId}/${crypto.randomUUID()}.${ext}`;
        const plain = new Uint8Array(await file.arrayBuffer());
        // direkt verschlüsselt: nur verschlüsselte Bytes landen im Speicher
        const body = encrypt ? new Blob([(await sealBytes(plain)) as BlobPart], { type: "application/octet-stream" }) : file;
        const { error: upErr } = await supabase.storage.from("documents").upload(path, body, { contentType: encrypt ? "application/octet-stream" : file.type || "application/octet-stream" });
        if (upErr) throw upErr;
        const { data, error } = await supabase.from("documents").insert({ file_path: path, file_name: item.name.slice(0, 200), mime_type: file.type || "application/octet-stream", size_bytes: file.size, encrypted: encrypt, ...(projectId ? { project_id: projectId } : {}) }).select("id").single();
        if (error) throw error;
        patch(item.key, { id: data.id, state: "saved" });
        ids.push(data.id);
        await refresh();
        if (encrypt) await processEncrypted({ id: data.id, mime_type: file.type }, plain).catch(async (e) => { await supabase.from("documents").update({ status: "error", error: (e as Error).message }).eq("id", data.id); }).finally(() => refresh());
        else void process(data.id, opts.noSplit ? false : undefined);
      } catch (e) {
        console.error(e);
        patch(item.key, { state: "failed", error: "Hochladen hat nicht geklappt." });
      } finally {
        setUploading((n) => n - 1);
      }
    }));
    return ids;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, refresh, current, defaultProject?.id]);

  // Über die API hochgeladene Originale aus der Inbox in den eigenen Speicher holen (mit dem Zugang des Nutzers)
  const draining = useRef(false);
  const drainInbox = useCallback(async () => {
    if (draining.current) return;
    draining.current = true;
    try {
      const { data: items } = await supabase.from("api_inbox").select("id,document_id,file_name,mime_type").limit(10);
      for (const it of items ?? []) {
        const { data: row } = await supabase.from("api_inbox").select("data").eq("id", it.id).maybeSingle();
        const hex = typeof row?.data === "string" ? row.data.replace(/^\\x/, "") : "";
        if (!hex) continue;
        const bytes = new Uint8Array(hex.length / 2);
        for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
        const ext = ({ "application/pdf": "pdf", "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "text/plain": "txt", "text/markdown": "md" } as Record<string, string>)[it.mime_type] ?? "bin";
        const path = `${userId}/${crypto.randomUUID()}.${ext}`;
        const up = await supabase.storage.from("documents").upload(path, new Blob([bytes], { type: it.mime_type }), { contentType: it.mime_type });
        if (up.error) continue;
        const { data: moved } = await supabase.from("documents").update({ file_path: path }).eq("id", it.document_id).like("file_path", "inbox/%").select("id");
        if (!moved?.length) await supabase.storage.from("documents").remove([path]); // schon von einem anderen Tab übernommen
        await supabase.from("api_inbox").delete().eq("id", it.id);
      }
      if (items?.length) await refresh();
    } finally {
      draining.current = false;
    }
  }, [userId, refresh]);
  useEffect(() => {
    void drainInbox();
    const t = window.setInterval(() => void drainInbox(), 60_000);
    const onFocus = () => void drainInbox();
    window.addEventListener("focus", onFocus);
    return () => { window.clearInterval(t); window.removeEventListener("focus", onFocus); };
  }, [drainInbox]);

  // geschützte Bereiche (z. B. Gesundheit): nach dem Erkennen automatisch verschlüsseln, sobald der Tresor offen ist
  const { vault, unlocked } = useMe();
  const protecting = useRef(new Set<string>());
  const toProtect = docs.filter((d) => d.status === "ready" && !d.encrypted && !d.file_path.startsWith("inbox/") && d.cluster && vault?.protected_clusters.includes(d.cluster));
  useEffect(() => {
    if (!unlocked || !toProtect.length) return;
    void (async () => {
      for (const d of toProtect) {
        if (protecting.current.has(d.id)) continue;
        protecting.current.add(d.id);
        await protectDoc(d).catch((e) => console.error("protect", e));
      }
      await refresh();
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unlocked, toProtect.map((d) => d.id).join()]);

  const reprocess = useCallback(async (id: string, password?: string) => {
    const d = docs.find((x) => x.id === id);
    await supabase.from("documents").update({ status: "processing", error: null }).eq("id", id);
    await refresh();
    if (d?.encrypted) {
      // verschlüsselt: im Browser entschlüsseln, auslesen lassen, Ergebnis verschlüsselt speichern
      const plain = await openBytes(await downloadFile(d.file_path));
      await processEncrypted(d, plain).catch(async (e) => { await supabase.from("documents").update({ status: "error", error: (e as Error).message }).eq("id", id); });
      await refresh();
    } else await process(id, password ? false : undefined, password);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refresh, docs]);

  /** PDF nachträglich in einzelne Dokumente trennen (z. B. Krankenakte mit vielen Briefen) */
  const splitDoc = useCallback(async (id: string) => {
    await supabase.from("documents").update({ status: "processing", error: null }).eq("id", id);
    await refresh();
    await process(id, true);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refresh]);

  const remove = useCallback(async (d: Doc) => {
    await supabase.storage.from("documents").remove([d.file_path]);
    await removeThumbs(d);
    await supabase.from("documents").delete().eq("id", d.id);
    await refresh();
  }, [refresh]);

  const pendingProtect = unlocked ? 0 : toProtect.length;
  // Ansicht auf das gewählte Projekt beschränken
  const visible = useMemo(() => (current === "all" ? docs : docs.filter((d) => d.project_id === current)), [docs, current]);
  const partsOf = useCallback((id: string) => parts.filter((d) => d.merged_into === id).sort((a, b) => Number(isBack(a)) - Number(isBack(b)) || (a.file_name ?? "").localeCompare(b.file_name ?? "", "de", { numeric: true })), [parts]);
  const value = useMemo(() => ({ batch, clearBatch, docs: visible, allDocs: docs, partsOf, loading, refresh, upload, reprocess, splitDoc, remove, uploading, pendingProtect }), [batch, clearBatch, visible, docs, partsOf, loading, refresh, upload, reprocess, splitDoc, remove, uploading, pendingProtect]);
  return <DocsCtx.Provider value={value}>{children}</DocsCtx.Provider>;
}

export function useDocs() {
  const v = useContext(DocsCtx);
  if (!v) throw new Error("useDocs außerhalb von DocsProvider");
  return v;
}

export const fmtDate = (iso?: string | null) => (iso ? new Date(`${iso.slice(0, 10)}T00:00:00`).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" }) : "");
export const fmtMoney = (v: number, cur = "EUR") => { try { return v.toLocaleString("de-DE", { style: "currency", currency: cur || "EUR" }); } catch { return `${v.toLocaleString("de-DE")} ${cur}`; } };

/** Zeitliche Reihenfolge: älteste zuerst (Dokumentdatum, sonst Eingang) */
export const dateOf = (d: Pick<Doc, "doc_date" | "received_at">) => d.doc_date ?? d.received_at.slice(0, 10);
export const chrono = <T extends Pick<Doc, "doc_date" | "received_at">>(list: T[]) => [...list].sort((a, b) => dateOf(a).localeCompare(dateOf(b)) || a.received_at.localeCompare(b.received_at));

/** Dringend: Mahnung oder Frist in den nächsten 7 Tagen (nicht archiviert) */
export function isUrgent(d: Pick<Doc, "archived" | "doc_type" | "deadlines" | "doc_date" | "received_at">) {
  if (d.archived) return false;
  const today = new Date().toISOString().slice(0, 10);
  const in7 = new Date(Date.now() + 7 * 864e5).toISOString().slice(0, 10);
  if ((d.deadlines ?? []).some((x) => x.date >= today && x.date <= in7)) return true;
  return /mahnung/i.test(d.doc_type ?? "") && (d.deadlines ?? []).some((x) => x.date >= today);
}
