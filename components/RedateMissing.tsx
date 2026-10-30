"use client";
import { useEffect, useRef } from "react";
import { useDocs } from "@/lib/docs";
import { authFetch } from "@/lib/supabase";

const KEY = "lifevault:redate-tried";

/**
 * Dokumente ohne Dokumentdatum (oft Belege aus Mails): Datum einmal aus dem gespeicherten Text nachholen,
 * damit nicht das Eingangsdatum angezeigt wird. Läuft still im Hintergrund, je Dokument nur einmal.
 */
export function RedateMissing() {
  const { docs, refresh } = useDocs();
  const running = useRef(false);
  useEffect(() => {
    if (running.current) return;
    let tried: string[] = [];
    try { tried = JSON.parse(localStorage.getItem(KEY) ?? "[]") as string[]; } catch { /* egal */ }
    const todo = docs.filter((d) => d.status === "ready" && !d.encrypted && !d.doc_date && !tried.includes(d.id)).slice(0, 40);
    if (!todo.length) return;
    running.current = true;
    void (async () => {
      let changed = false;
      for (const d of todo) {
        const r = await authFetch("/api/redate", { method: "POST", body: JSON.stringify({ id: d.id }) }).then((x) => x.json()).catch(() => ({})) as { date?: string | null };
        if (r.date) changed = true;
        tried.push(d.id);
        try { localStorage.setItem(KEY, JSON.stringify(tried.slice(-2000))); } catch { /* egal */ }
      }
      if (changed) await refresh();
      running.current = false;
    })();
  }, [docs, refresh]);
  return null;
}
