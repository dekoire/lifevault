"use client";
import { useEffect, useRef } from "react";
import { useDocs } from "@/lib/docs";
import { authFetch } from "@/lib/supabase";

/**
 * Einmal pro Sitzung: Dokumente ohne Thema/Zweck von der KI einordnen lassen (in Paketen),
 * danach Wichtigkeit und Zusammenhang je Partner nachholen, dann neu laden
 */
export function TopicBackfill() {
  const { allDocs, refresh } = useDocs();
  const ran = useRef(false);
  useEffect(() => {
    const ready = allDocs.filter((d) => d.status === "ready" && !d.merged_into);
    const needTopic = ready.some((d) => !d.topic);
    // importance === undefined: Spalte fehlt noch (Migration 0013) – dann nicht nachholen
    const needRank = ready.some((d) => d.importance === null);
    if (ran.current || !ready.length) return;
    ran.current = true;
    void (async () => {
      const loop = async (url: string, max: number) => {
        for (let i = 0; i < max; i++) {
          const r = await authFetch(url, { method: "POST" }).then((x) => x.json()).catch(() => null) as { left?: number } | null;
          if (!r || !r.left) break;
        }
      };
      if (needTopic) await loop("/api/classify", 6);
      if (needRank) await loop("/api/rank", 10);
      // Alterung: alte Rechnungen, überholte Änderungen, Info-Post aussortieren (ohne KI)
      await authFetch("/api/age", { method: "POST" }).catch(() => undefined);
      await refresh();
    })();
  }, [allDocs, refresh]);
  return null;
}
