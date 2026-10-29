"use client";
import { useCallback, useEffect, useSyncExternalStore } from "react";
import { supabase } from "@/lib/supabase";

/**
 * Entscheidungen zu Doppelten, gespeichert in partner_merges (geräteübergreifend, rückgängig machbar):
 * „distinct“ = verschiedene Partner, „distinct_docs“ = keine doppelten Dokumente. Einträge sind Paar-Schlüssel („a|b“).
 */
export type Decision = { id: string; kind: "distinct" | "distinct_docs"; target_name: string; pairs: string[]; created_at: string };
type State = { loaded: boolean; list: Decision[] };
let state: State = { loaded: false, list: [] };
const subs = new Set<() => void>();
const emit = () => subs.forEach((f) => f());
let loading = false;

// frühere Entscheidungen nur im Browser – einmal mit übernehmen
const legacy = (k: string): string[] => { try { return JSON.parse(localStorage.getItem(k) ?? "[]"); } catch { return []; } };

export async function loadDecisions(force = false) {
  if ((state.loaded && !force) || loading) return;
  loading = true;
  const { data } = await supabase.from("partner_merges").select("id,kind,target_name,entries,created_at").in("kind", ["distinct", "distinct_docs"]).is("undone_at", null).order("created_at", { ascending: false }).limit(500);
  state = { loaded: true, list: (data ?? []).map((d) => ({ id: d.id, kind: d.kind, target_name: d.target_name, created_at: d.created_at, pairs: ((d.entries ?? []) as { doc_id: string }[]).map((e) => e.doc_id) })) };
  loading = false;
  emit();
}

export async function addDecision(kind: Decision["kind"], pairs: string[], label: string) {
  const { data } = await supabase.from("partner_merges").insert({ kind, target_name: label.slice(0, 300), entries: pairs.map((p) => ({ doc_id: p, sender: null, sender_domain: null })) }).select("id,created_at").single();
  state = { ...state, list: [{ id: data?.id ?? crypto.randomUUID(), kind, target_name: label, pairs, created_at: data?.created_at ?? new Date().toISOString() }, ...state.list] };
  emit();
}

export async function undoDecision(id: string) {
  await supabase.from("partner_merges").update({ undone_at: new Date().toISOString() }).eq("id", id);
  state = { ...state, list: state.list.filter((d) => d.id !== id) };
  emit();
}

export function useDecisions() {
  const s = useSyncExternalStore((f) => { subs.add(f); return () => subs.delete(f); }, () => state, () => state);
  useEffect(() => { void loadDecisions(); }, []);
  const pairs = useCallback((kind: Decision["kind"]) => {
    const fromDb = s.list.filter((d) => d.kind === kind).flatMap((d) => d.pairs);
    return [...new Set([...fromDb, ...legacy(kind === "distinct" ? "lifevault:not-same-partner" : "lifevault:not-dupes")])];
  }, [s]);
  return { loaded: s.loaded, list: s.list, pairs };
}
