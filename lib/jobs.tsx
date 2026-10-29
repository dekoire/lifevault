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
export type Job = { id: string; kind: "export" | "mail"; title: string; detail?: string; done: number; total: number; state: "running" | "done" | "error"; downloadId?: string };

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
export type SavedDownload = { id: string; name: string; created: string; count: number; size: number; blob: Blob };
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
export function startExport(list: Doc[]) {
  const name = `Lifevault-Export ${new Date().toISOString().slice(0, 10)}.zip`;
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
      const blob = new Blob([zipSync(files) as BlobPart], { type: "application/zip" });
      const saved: SavedDownload = { id: crypto.randomUUID(), name, created: new Date().toISOString(), count: index.length, size: blob.size, blob };
      await saveDownload(saved);
      saveFile(blob, name);
      updateJob(id, {
        state: failed.length && !index.length ? "error" : "done", downloadId: saved.id,
        title: index.length ? "Export fertig" : "Export fehlgeschlagen",
        detail: failed.length ? `${index.length} exportiert, ${failed.length} nicht ladbar` : `${index.length} ${index.length === 1 ? "Dokument" : "Dokumente"} · ${(blob.size / 1_048_576).toFixed(1).replace(".", ",")} MB`,
      });
    } catch (e) {
      updateJob(id, { state: "error", title: "Export fehlgeschlagen", detail: (e as Error).message });
    }
  })();
}
