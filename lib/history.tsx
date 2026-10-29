"use client";
import { useEffect, useMemo, useState } from "react";
import type { LifeProfile } from "@/app/api/profile/route";
import type { History, HistoryEntry } from "@/lib/historySchema";
import { partnerKey } from "@/lib/partners";
import { supabase, useSession } from "@/lib/supabase";
import type { Doc } from "@/lib/types";

export type { History, HistoryEntry };
export type Link = { role: string; entry: HistoryEntry; prev?: HistoryEntry; next?: HistoryEntry; current?: HistoryEntry };

/** Lebensprofil inkl. Verlauf (aus life_profiles) – einmal pro Seite geladen */
export function useLifeProfile() {
  const session = useSession();
  const [profile, setProfile] = useState<LifeProfile | null>();
  useEffect(() => {
    if (!session) return;
    void supabase.from("life_profiles").select("data").eq("user_id", session.user.id).maybeSingle().then(({ data }) => setProfile((data?.data as LifeProfile) ?? null));
  }, [session]);
  return { profile, setProfile };
}

/** Partner-Schlüssel eines Verlaufs-Eintrags: aus dem Namen und den Absendern seiner Quelldokumente */
function keysOf(e: HistoryEntry, docs: Doc[]) {
  const keys = new Set([partnerKey(e.name)]);
  for (const id of e.docIds) { const s = docs.find((d) => d.id === id)?.sender; if (s) keys.add(partnerKey(s)); }
  return keys;
}

/** Für jeden Partner: in welcher Rolle, wer kam davor, wer danach, wer ist aktuell */
export function useHistoryLinks(docs: Doc[]) {
  const { profile } = useLifeProfile();
  const history = profile?.history;
  const byPartner = useMemo(() => {
    const map = new Map<string, Link>();
    for (const r of history?.roles ?? []) {
      const current = [...r.chain].reverse().find((e) => e.status === "aktuell");
      r.chain.forEach((e, i) => {
        const link: Link = { role: r.role, entry: e, prev: r.chain[i - 1], next: r.chain[i + 1], current: current !== e ? current : undefined };
        for (const k of keysOf(e, docs)) if (!map.has(k) || e.status === "aktuell") map.set(k, link);
      });
    }
    return map;
  }, [history, docs]);
  // ältere Vertragsfassung → neuere
  const newerDoc = useMemo(() => {
    const map = new Map<string, { topic: string; currentDocId: string | null; note: string | null }>();
    for (const c of history?.contracts ?? []) for (const id of c.oldDocIds) map.set(id, { topic: c.topic, currentDocId: c.currentDocId, note: c.note });
    return map;
  }, [history]);
  return { history, byPartner, newerDoc, loaded: profile !== undefined };
}

export const CHANGE_LABEL: Record<string, string> = { start: "Beginn", wechsel: "Wechsel", uebergabe: "Übergabe", umzug: "Umzug", neuer_vertrag: "Neuer Vertrag", ende: "Ende" };

/** „2008“, „03/2022“, „2008 – 2013“, „seit 2022“ */
export function span(e: Pick<HistoryEntry, "from" | "to" | "status">) {
  const f = (v: string | null) => (v ? v.replace(/^(\d{4})-(\d{2}).*$/, "$2/$1") : null);
  const a = f(e.from), b = f(e.to);
  if (e.status === "aktuell") return a ? `seit ${a}` : "aktuell";
  return a && b ? (a === b ? a : `${a} – ${b}`) : a ? `ab ${a}` : b ? `bis ${b}` : "früher";
}
