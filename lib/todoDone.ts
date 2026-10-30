"use client";
import { useEffect, useState } from "react";

/** Erledigte Aufgaben (je Dokument + Fristdatum), auf dem Gerät gespeichert – geteilt von To-do-Liste und Mindmap */
const KEY = "lifevault:todo-done";
const EVT = "lifevault:todo-done";
export const todoKey = (docId: string, date: string) => `${docId}|${date}`;
const load = (): string[] => { try { return JSON.parse(localStorage.getItem(KEY) ?? "[]"); } catch { return []; } };

export function useTodoDone() {
  const [done, setDone] = useState<string[]>([]);
  useEffect(() => {
    const sync = () => setDone(load());
    sync();
    window.addEventListener(EVT, sync);
    window.addEventListener("storage", sync);
    return () => { window.removeEventListener(EVT, sync); window.removeEventListener("storage", sync); };
  }, []);
  const toggle = (k: string) => {
    const cur = load();
    const n = cur.includes(k) ? cur.filter((x) => x !== k) : [...cur, k];
    try { localStorage.setItem(KEY, JSON.stringify(n)); } catch { /* egal */ }
    setDone(n);
    window.dispatchEvent(new Event(EVT));
  };
  return { done, toggle };
}
