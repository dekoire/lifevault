"use client";
import { useEffect, useRef } from "react";
import { useDocs } from "@/lib/docs";
import { useMe } from "@/lib/me";
import { isStuck } from "@/lib/types";

/**
 * Dokumente, die seit über 10 Minuten „wird ausgelesen“ zeigen, sind hängen geblieben (App geschlossen, Zeitüberschreitung
 * beim Mail-Import …). Einmal je Sitzung neu anstoßen, nacheinander; klappt es nicht, steht danach ein Fehler am Dokument.
 */
export function RetryStuck() {
  const { allDocs, reprocess } = useDocs();
  const { unlocked } = useMe();
  const tried = useRef(new Set<string>());
  const running = useRef(false);
  useEffect(() => {
    if (running.current) return;
    const todo = allDocs.filter((d) => isStuck(d) && !tried.current.has(d.id) && (!d.encrypted || unlocked));
    if (!todo.length) return;
    running.current = true;
    void (async () => {
      for (const d of todo) {
        tried.current.add(d.id);
        await reprocess(d.id).catch((e) => console.error("retry", (e as Error).message));
      }
      running.current = false;
    })();
  }, [allDocs, reprocess, unlocked]);
  return null;
}
