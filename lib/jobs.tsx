"use client";
import { useSyncExternalStore } from "react";
import { zipSync } from "fflate";
import { clusterOf } from "@/lib/clusters";
import { downloadFile } from "@/lib/protect";
import { openBytes } from "@/lib/vault";
import type { Doc } from "@/lib/types";

/**
 * Hintergrund-Aufgaben (Export, Mail-Abruf) mit Fortschritt – angezeigt unten rechts als lila Karte.
 * Fertige Exporte bleiben in diesem Browser gespeichert (IndexedDB, die letzten 20) und stehen unter Downloads.
 */
export type Job = { id: string; kind: "export" | "mail" | "info"; title: string; detail?: string; done: number; total: number; state: "running" | "done" | "error"; downloadId?: string; password?: string };

let jobs: Job[] = [];
const subs = new Set<() => void>();
const emit = () => { jobs = [...jobs]; subs.forEach((f) => f()); };
export function useJobs() {
  return useSyncExternalStore((f) => { subs.add(f); return () => { subs.delete(f); }; }, () => jobs, () => jobs);
}
export function startJob(j: Omit<Job, "id" | "state" | "done" | "total"> & { total?: number }) {
  const job: Job = { id: crypto.randomUUID(), state: "running", done: 0, total: j.total ?? 0, ...j };
  jobs = [...jobs, job]; emit();
  return job.id;
}
export function updateJob(id: string, patch: Partial<Job>) {
  jobs = jobs.map((j) => (j.id === id ? { ...j, ...patch } : j)); emit();
  // fertige Karten verschwinden nach einer Weile von selbst
  if (patch.state && patch.state !== "running") setTimeout(() => dismissJob(id), patch.state === "error" ? 20_000 : 12_000);
}
export function dismissJob(id: string) { jobs = jobs.filter((j) => j.id !== id); emit(); }

/* ---------- gespeicherte Downloads ---------- */
export type SavedDownload = { id: string; name: string; created: string; count: number; size: number; blob: Blob; password?: string };
const DB = "lifevault-downloads", STORE = "zips", KEEP = 20;
const db = () => new Promise<IDBDatabase>((ok, no) => {
  const r = indexedDB.open(DB, 1);
  r.onupgradeneeded = () => r.result.createObjectStore(STORE, { keyPath: "id" });
  r.onsuccess = () => ok(r.result); r.onerror = () => no(r.error);
});
const tx = async <T,>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>) => {
  const d = await db();
  return new Promise<T>((ok, no) => { const q = fn(d.transaction(STORE, mode).objectStore(STORE)); q.onsuccess = () => ok(q.result); q.onerror = () => no(q.error); });
};
export async function listDownloads(): Promise<SavedDownload[]> {
  try { return ((await tx("readonly", (s) => s.getAll())) as SavedDownload[]).sort((a, b) => b.created.localeCompare(a.created)); } catch { return []; }
}
export async function deleteDownload(id: string) { try { await tx("readwrite", (s) => s.delete(id)); } catch { /* egal */ } window.dispatchEvent(new Event("lifevault:downloads")); }
async function saveDownload(d: SavedDownload) {
  try {
    await tx("readwrite", (s) => s.put(d));
    for (const old of (await listDownloads()).slice(KEEP)) await tx("readwrite", (s) => s.delete(old.id));
  } catch { /* privater Modus o. Ä.: Download klappt trotzdem */ }
  window.dispatchEvent(new Event("lifevault:downloads"));
}
export function saveFile(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  Object.assign(document.createElement("a"), { href: url, download: name }).click();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

/* ---------- Export als ZIP ---------- */
const dateOf = (d: Doc) => d.doc_date ?? d.received_at.slice(0, 10);
const topicOf = (d: Doc) => d.topic ?? "Ohne Thema";
const clean = (s: string) => s.replace(/[\\/:*?"<>|\n\r]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 90);

/** Startet den Export im Hintergrund; Fenster darf sofort zu */
export type ExportFormat = "files" | "pdf-one" | "pdf-area" | "pdf-topic";
export const EXPORT_FORMATS: { id: ExportFormat; label: string; hint: string }[] = [
  { id: "files", label: "Einzelne Dateien", hint: "Originale in Ordnern nach Bereich und Thema" },
  { id: "pdf-one", label: "Ein PDF", hint: "alles in einer Datei, neueste zuerst" },
  { id: "pdf-area", label: "Ein PDF je Bereich", hint: "z. B. Gesundheit.pdf, Arbeit & Gehalt.pdf" },
  { id: "pdf-topic", label: "Ein PDF je Thema", hint: "z. B. Gesundheit – Urologie.pdf" },
];

export function startExport(list: Doc[], opts: { password?: string; format?: ExportFormat } = {}) {
  const format = opts.format ?? "files";
  let name = `Lifevault-Export ${new Date().toISOString().slice(0, 10)}.zip`;
  const id = startJob({ kind: "export", title: "Export wird erstellt", detail: `${list.length} ${list.length === 1 ? "Dokument" : "Dokumente"}`, total: list.length });
  void (async () => {
    const files: Record<string, [Uint8Array, { level: 0 }]> = {};
    const used = new Set<string>();
    const index: [string, Doc][] = [];
    const failed: string[] = [];
    let done = 0;
    const queue = [...list];
    const worker = async () => {
      for (let d = queue.shift(); d; d = queue.shift()) {
        try {
          const raw = await downloadFile(d.file_path);
          const bytes = d.encrypted ? await openBytes(raw) : raw;
          const ext = d.file_name.includes(".") ? d.file_name.slice(d.file_name.lastIndexOf(".")) : "";
          const base = `${clean(clusterOf(d.cluster).label)}/${clean(topicOf(d))}/${dateOf(d)} ${clean(d.title ?? d.file_name.replace(/\.[^.]+$/, ""))}`;
          let path = `${base}${ext}`;
          for (let i = 2; used.has(path); i++) path = `${base} (${i})${ext}`;
          used.add(path);
          files[path] = [bytes, { level: 0 }];
          index.push([path, d]);
        } catch { failed.push(d.title ?? d.file_name); }
        updateJob(id, { done: ++done });
      }
    };
    try {
      await Promise.all([worker(), worker(), worker(), worker()]);
      // Übersicht als CSV (öffnet in Excel/Numbers)
      const csv = ["Datei;Bereich;Thema;Titel;Absender;Datum", ...index.sort((x, y) => x[0].localeCompare(y[0])).map(([p, d]) =>
        [p, clusterOf(d.cluster).label, topicOf(d), d.title ?? "", d.sender ?? "", dateOf(d)].map((v) => `"${String(v).replace(/"/g, '""')}"`).join(";"))].join("\r\n");
      files["Übersicht.csv"] = [new TextEncoder().encode(`﻿${csv}`), { level: 0 }];
      let blob: Blob | undefined;
      if (format !== "files") {
        // zu PDFs zusammenfassen: PDFs und Bilder; alles andere (Word, Excel …) bleibt als Datei dabei
        const key = (d: Doc) => format === "pdf-one" ? "Lifevault-Export" : format === "pdf-area" ? clean(clusterOf(d.cluster).label) : `${clean(clusterOf(d.cluster).label)} – ${clean(topicOf(d))}`;
        const groups = new Map<string, [string, Doc][]>();
        const rest: [string, Doc][] = [];
        for (const e of index) (/pdf|image\/(jpe?g|png)/.test(e[1].mime_type) ? groups.set(key(e[1]), [...(groups.get(key(e[1])) ?? []), e]) : rest.push(e));
        const out: Record<string, [Uint8Array, { level: 0 }]> = {};
        updateJob(id, { title: "PDF wird erstellt" });
        for (const [k, items] of groups) out[`${k}.pdf`] = [await mergePdf(items.sort((a, b) => dateOf(b[1]).localeCompare(dateOf(a[1]))).map(([p, d]) => ({ bytes: files[p][0], mime: d.mime_type }))), { level: 0 }];
        for (const [p] of rest) out[`Weitere Dateien/${p.split("/").pop()}`] = files[p];
        if (format === "pdf-one" && !rest.length && !opts.password) {
          name = name.replace(/\.zip$/, ".pdf");
          blob = new Blob([out["Lifevault-Export.pdf"][0] as BlobPart], { type: "application/pdf" });
        } else {
          out["Übersicht.csv"] = files["Übersicht.csv"];
          for (const k of Object.keys(files)) delete files[k];
          Object.assign(files, out);
        }
      }
      blob ??= opts.password ? await encryptedZip(files, opts.password) : new Blob([zipSync(files) as BlobPart], { type: "application/zip" });
      const saved: SavedDownload = { id: crypto.randomUUID(), name, created: new Date().toISOString(), count: index.length, size: blob.size, blob, password: opts.password };
      await saveDownload(saved);
      saveFile(blob, name);
      updateJob(id, {
        state: failed.length && !index.length ? "error" : "done", downloadId: saved.id, password: opts.password,
        title: index.length ? "Export fertig" : "Export fehlgeschlagen",
        detail: failed.length ? `${index.length} exportiert, ${failed.length} nicht ladbar` : `${index.length} ${index.length === 1 ? "Dokument" : "Dokumente"} · ${(blob.size / 1_048_576).toFixed(1).replace(".", ",")} MB`,
      });
    } catch (e) {
      updateJob(id, { state: "error", title: "Export fehlgeschlagen", detail: (e as Error).message });
    }
  })();
}

/** ZIP mit Passwort (AES-256) – öffnet mit macOS/iOS-Dateien, 7-Zip, WinRAR; der Windows-Explorer kann AES-ZIPs nicht */
async function encryptedZip(files: Record<string, [Uint8Array, unknown]>, password: string) {
  const { BlobWriter, Uint8ArrayReader, ZipWriter, configure } = await import("@zip.js/zip.js");
  configure({ useWebWorkers: false });
  const w = new ZipWriter(new BlobWriter("application/zip"), { password, encryptionStrength: 3 });
  for (const [path, [bytes]] of Object.entries(files)) await w.add(path, new Uint8ArrayReader(bytes), { level: 0 });
  return w.close();
}

/** Lesbares Zufallspasswort, z. B. „Kq7m-Tz4p-Wd9x-Hn3r“ (ohne verwechselbare Zeichen) */
export function newPassword() {
  const abc = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const r = crypto.getRandomValues(new Uint8Array(16));
  const s = Array.from(r, (b) => abc[b % abc.length]).join("");
  return s.match(/.{4}/g)!.join("-");
}

/** Per Mail teilen: am Handy mit Datei im Teilen-Menü, sonst Mail-Programm mit Passwort (Datei liegt in den Downloads) */
export async function shareExport(d: { blob: Blob; name: string; password?: string }) {
  const text = d.password
    ? `Hallo,\n\nanbei die Unterlagen als ZIP-Datei (${d.name}).\nDas Passwort zum Öffnen: ${d.password}\n\nViele Grüße`
    : `Hallo,\n\nanbei die Unterlagen als ZIP-Datei (${d.name}).\n\nViele Grüße`;
  const file = new File([d.blob], d.name, { type: "application/zip" });
  const nav = navigator as Navigator & { canShare?: (x: ShareData) => boolean };
  if (nav.canShare?.({ files: [file] })) {
    try { await nav.share({ files: [file], title: "Unterlagen", text }); return; } catch (e) { if ((e as Error).name === "AbortError") return; }
  }
  saveFile(d.blob, d.name);
  location.href = `mailto:?subject=${encodeURIComponent("Unterlagen")}&body=${encodeURIComponent(`${text}\n\n(Bitte die heruntergeladene Datei „${d.name}“ an diese Mail anhängen.)`)}`;
}

/** PDFs und Bilder zu einem PDF zusammenfügen (Bilder auf A4, eingepasst) */
async function mergePdf(items: { bytes: Uint8Array; mime: string }[]) {
  const { PDFDocument } = await import("pdf-lib");
  const out = await PDFDocument.create();
  for (const it of items) {
    try {
      if (it.mime === "application/pdf") {
        const src = await PDFDocument.load(it.bytes, { ignoreEncryption: true });
        for (const pg of await out.copyPages(src, src.getPageIndices())) out.addPage(pg);
      } else {
        const img = it.mime === "image/png" ? await out.embedPng(it.bytes) : await out.embedJpg(it.bytes);
        const [W, H] = [595.28, 841.89], m = 24;
        const s = Math.min((W - 2 * m) / img.width, (H - 2 * m) / img.height, 1);
        const page = out.addPage([W, H]);
        page.drawImage(img, { x: (W - img.width * s) / 2, y: (H - img.height * s) / 2, width: img.width * s, height: img.height * s });
      }
    } catch { /* beschädigte Datei überspringen */ }
  }
  return out.save();
}
