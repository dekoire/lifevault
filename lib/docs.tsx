"use client";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useMe } from "@/lib/me";
import { downloadFile, processEncrypted, protectDoc } from "@/lib/protect";
import { authFetch, supabase } from "@/lib/supabase";
import { openBytes, sealBytes, vaultKey } from "@/lib/vault";
import { LIST_COLS, type Doc } from "@/lib/types";

type Ctx = { docs: Doc[]; loading: boolean; refresh: () => Promise<void>; upload: (files: File[], opts?: { encrypt?: boolean }) => Promise<void>; pendingProtect: number; reprocess: (id: string) => Promise<void>; remove: (d: Doc) => Promise<void>; uploading: number };
const DocsCtx = createContext<Ctx | null>(null);

const OK = ["image/jpeg", "image/png", "image/webp", "application/pdf"];

/** Fotos verkleinern (lange Kante 2400 px) und als JPEG speichern – auch HEIC vom iPhone, sofern der Browser es lesen kann */
async function prepare(file: File): Promise<File> {
  if (file.type === "application/pdf") return file;
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

export function DocsProvider({ userId, children }: { userId: string; children: React.ReactNode }) {
  const [docs, setDocs] = useState<Doc[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(0);
  const refresh = useCallback(async () => {
    const { data } = await supabase.from("documents").select(LIST_COLS).order("received_at", { ascending: false }).limit(1000);
    setDocs((data as unknown as Doc[]) ?? []);
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

  const process = (id: string) => authFetch("/api/process", { method: "POST", body: JSON.stringify({ id }) }).then(() => refresh()).catch(() => refresh());

  const upload = useCallback(async (files: File[], opts: { encrypt?: boolean } = {}) => {
    const encrypt = !!opts.encrypt && !!vaultKey();
    setUploading((n) => n + files.length);
    await Promise.all(files.map(async (raw) => {
      try {
        const file = await prepare(raw);
        const ext = (file.name.split(".").pop() ?? "bin").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 5) || "bin";
        const path = `${userId}/${crypto.randomUUID()}.${ext}`;
        const plain = new Uint8Array(await file.arrayBuffer());
        // direkt verschlüsselt: nur verschlüsselte Bytes landen im Speicher
        const body = encrypt ? new Blob([(await sealBytes(plain)) as BlobPart], { type: "application/octet-stream" }) : file;
        const { error: upErr } = await supabase.storage.from("documents").upload(path, body, { contentType: encrypt ? "application/octet-stream" : file.type || "application/octet-stream" });
        if (upErr) throw upErr;
        const { data, error } = await supabase.from("documents").insert({ file_path: path, file_name: raw.name.slice(0, 200), mime_type: file.type || "application/octet-stream", size_bytes: file.size, encrypted: encrypt }).select("id").single();
        if (error) throw error;
        await refresh();
        if (encrypt) await processEncrypted({ id: data.id, mime_type: file.type }, plain).catch(async (e) => { await supabase.from("documents").update({ status: "error", error: (e as Error).message }).eq("id", data.id); }).finally(() => refresh());
        else void process(data.id);
      } catch (e) {
        console.error(e);
        alert(`„${raw.name}“ konnte nicht hochgeladen werden.`);
      } finally {
        setUploading((n) => n - 1);
      }
    }));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, refresh]);

  // geschützte Bereiche (z. B. Gesundheit): nach dem Erkennen automatisch verschlüsseln, sobald der Tresor offen ist
  const { vault, unlocked } = useMe();
  const protecting = useRef(new Set<string>());
  const toProtect = docs.filter((d) => d.status === "ready" && !d.encrypted && d.cluster && vault?.protected_clusters.includes(d.cluster));
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

  const reprocess = useCallback(async (id: string) => {
    const d = docs.find((x) => x.id === id);
    await supabase.from("documents").update({ status: "processing", error: null }).eq("id", id);
    await refresh();
    if (d?.encrypted) {
      // verschlüsselt: im Browser entschlüsseln, auslesen lassen, Ergebnis verschlüsselt speichern
      const plain = await openBytes(await downloadFile(d.file_path));
      await processEncrypted(d, plain).catch(async (e) => { await supabase.from("documents").update({ status: "error", error: (e as Error).message }).eq("id", id); });
      await refresh();
    } else await process(id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refresh, docs]);

  const remove = useCallback(async (d: Doc) => {
    await supabase.storage.from("documents").remove([d.file_path]);
    await supabase.from("documents").delete().eq("id", d.id);
    await refresh();
  }, [refresh]);

  const pendingProtect = unlocked ? 0 : toProtect.length;
  const value = useMemo(() => ({ docs, loading, refresh, upload, reprocess, remove, uploading, pendingProtect }), [docs, loading, refresh, upload, reprocess, remove, uploading, pendingProtect]);
  return <DocsCtx.Provider value={value}>{children}</DocsCtx.Provider>;
}

export function useDocs() {
  const v = useContext(DocsCtx);
  if (!v) throw new Error("useDocs außerhalb von DocsProvider");
  return v;
}

export const fmtDate = (iso?: string | null) => (iso ? new Date(`${iso.slice(0, 10)}T00:00:00`).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" }) : "");
export const fmtMoney = (v: number, cur = "EUR") => { try { return v.toLocaleString("de-DE", { style: "currency", currency: cur || "EUR" }); } catch { return `${v.toLocaleString("de-DE")} ${cur}`; } };
