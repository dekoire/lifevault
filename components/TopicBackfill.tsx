"use client";
import { useEffect, useRef } from "react";
import { useDocs } from "@/lib/docs";
import { authFetch } from "@/lib/supabase";

/** Einmal pro Sitzung: Dokumente ohne Thema/Zweck von der KI einordnen lassen (in Paketen), danach neu laden */
export function TopicBackfill() {
  const { allDocs, refresh } = useDocs();
  const ran = useRef(false);
  useEffect(() => {
    if (ran.current || !allDocs.some((d) => d.status === "ready" && !d.topic && !d.merged_into)) return;
    ran.current = true;
    void (async () => {
      for (let i = 0; i < 6; i++) {
        const r = await authFetch("/api/classify", { method: "POST" }).then((x) => x.json()).catch(() => null) as { left?: number } | null;
        if (!r || !r.left) break;
      }
      await refresh();
    })();
  }, [allDocs, refresh]);
  return null;
}
