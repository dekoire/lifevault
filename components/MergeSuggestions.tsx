"use client";
import { useEffect, useMemo, useState } from "react";
import { Combine, X } from "lucide-react";
import { Thumb } from "@/components/ChatWidgets";
import { secureGet, secureSet } from "@/lib/devicekey";
export { toPdf } from "@/lib/pdfmerge";
import { MergeSheet } from "@/components/MergeReview";
import { cardOrder, walletCards } from "@/lib/cards";
import { useDocs } from "@/lib/docs";
import { authFetch, supabase } from "@/lib/supabase";
import type { Doc } from "@/lib/types";

/**
 * Kurz nacheinander hochgeladene Fotos/Seiten, die eigentlich ein Dokument sind (Brief mit Rückseite, Ausweis vorne/hinten …):
 * die KI schlägt Gruppen vor, ein Tipp fügt sie zu einem PDF zusammen. Die Einzeldateien werden danach gelöscht.
 */
type Group = { ids: string[]; title: string; reason: string; skip?: string[] };
const GAP = 10 * 60_000;
const KEY = "lifevault:merge";
// verschlüsselt im Browser (Titel und Gründe nennen Dokumente), beim Abmelden gelöscht
const save = (k: string, v: unknown) => void secureSet(k, v);
const num = (n: string) => Number(n.match(/\((\d+)\)/)?.[1] ?? 0);

/** Upload-Stapel: Dokumente mit weniger als 10 Minuten Abstand, mindestens 2, aus den letzten 30 Tagen */
function batches(docs: Doc[]) {
  const recent = docs.filter((d) => d.status === "ready" && !d.encrypted && !d.archived && Date.now() - Date.parse(d.received_at) < 30 * 86_400_000).sort((a, b) => a.received_at.localeCompare(b.received_at));
  const out: Doc[][] = [];
  for (const d of recent) {
    const last = out[out.length - 1];
    if (last && Date.parse(d.received_at) - Date.parse(last[last.length - 1].received_at) < GAP) last.push(d);
    else out.push([d]);
  }
  return out.filter((b) => b.length >= 2).reverse().slice(0, 3);
}

/** intro: steht nur da, wenn es Vorschläge gibt; empty: statt nichts (z. B. auf der Seite „Aufräumen“) */
export function MergeSuggestions({ intro, empty }: { intro?: React.ReactNode; empty?: React.ReactNode } = {}) {
  const { allDocs } = useDocs();
  const stacks = useMemo(() => batches(allDocs), [allDocs]);
  const [found, setFound] = useState<Record<string, Group[]>>();
  const [gone, setGone] = useState<string[]>([]);
  useEffect(() => {
    void secureGet<Record<string, Group[]>>(`${KEY}:found`).then((v) => setFound((f) => ({ ...(v ?? {}), ...(f ?? {}) })));
    void secureGet<string[]>(`${KEY}:dismissed`).then((v) => v && setGone((g) => [...new Set([...v, ...g])]));
  }, []);
  const [open, setOpen] = useState<Group>();

  // je Stapel einmal fragen (Ergebnis merken)
  useEffect(() => {
    if (!found) return; // erst den gemerkten Stand lesen, sonst fragt die KI doppelt
    for (const b of stacks) {
      const key = b.map((d) => d.id).sort().join(",");
      if (found[key]) continue;
      setFound((f) => ({ ...f, [key]: [] }));
      void authFetch("/api/group", { method: "POST", body: JSON.stringify({ ids: b.map((d) => d.id) }) })
        .then((r) => r.json()).then((j: { groups?: Group[] }) => setFound((f) => { const n = { ...f, [key]: j.groups ?? [] }; save(`${KEY}:found`, n); return n; }))
        .catch(() => undefined);
    }
  }, [stacks, found]);

  const byId = new Map(allDocs.map((d) => [d.id, d]));
  const cardGroups: Group[] = walletCards(allDocs).filter((c) => c.docs.length >= 2).map((c) => ({ ...cardOrder(c), title: `${c.label}${c.issuer && c.kind !== "id" ? ` ${c.issuer}` : ""}`, reason: c.docs.length === 2 ? "Vorder- und Rückseite derselben Karte" : `${c.docs.length} Fotos derselben Karte` }));
  // Karten zuerst; KI-Vorschläge mit denselben Fotos weglassen
  const cardIds = new Set(cardGroups.flatMap((g) => g.ids));
  const groups = [...cardGroups, ...Object.values(found ?? {}).flat().filter((g) => !g.ids.some((id) => cardIds.has(id)))]
    .map((g) => ({ ...g, docs: g.ids.map((id) => byId.get(id)).filter((d): d is Doc => !!d) }))
    .filter((g) => g.docs.length >= 2 && !gone.includes(g.ids.join(",")));
  if (!groups.length) return <>{empty ?? null}</>;

  const dismiss = (g: Group) => { const n = [...gone, g.ids.join(",")]; setGone(n); save(`${KEY}:dismissed`, n); };

  return (
    <>
    {intro}
    <section className="overflow-hidden rounded-2xl border border-card-line bg-surface shadow-card">
      <div className="px-4 pt-5 pb-3 md:px-6">
        <h2 className="flex items-center gap-2 text-[18px] leading-[26px] font-semibold">Gehören zusammen? <span className="tnum rounded-full border border-card-line px-2 py-px text-[12px] font-semibold text-soft">{groups.length}</span></h2>
        <p className="mt-0.5 text-[13px] text-muted">Kurz nacheinander hochgeladen – sieht nach einem Dokument aus</p>
      </div>
      {/* statt Trennstrich: Kopfzeile wie eine Tabelle */}
      <div className="hidden border-y border-line px-6 py-3.5 text-[12px] font-semibold text-muted sm:flex sm:items-center sm:gap-3">
        <span className="w-[76px] shrink-0">Teile</span><span className="flex-1">Dokument</span><span className="w-[214px] shrink-0 text-right">Aktion</span>
      </div>
      <ul className="divide-y divide-line border-t border-line sm:border-t-0">
        {groups.map((g) => {
          const k = g.ids.join(",");
          return (
            <li key={k} className="flex flex-wrap items-center gap-3 px-4 py-4 sm:flex-nowrap md:px-6">
              {/* kleine Vorschau der Teile, überlappend */}
              <button type="button" onClick={() => setOpen(g)} className="flex w-[76px] shrink-0 -space-x-4" aria-label="Ansehen">
                {g.docs.slice(0, 3).map((d, i) => <span key={d.id} className="h-14 w-11 overflow-hidden rounded-lg border-2 border-surface bg-surface-2 shadow-card" style={{ transform: `rotate(${(i - 1) * 4}deg)` }}><Thumb d={d} /></span>)}
              </button>
              <span className="min-w-0 flex-1">
                <b className="block truncate text-[14px]">{g.title}</b>
                <span className="block truncate text-[12px] text-muted">{g.docs.length} Teile · {g.reason}</span>
              </span>
              <span className="flex shrink-0 justify-end gap-2 sm:w-[214px]">
                <button type="button" onClick={() => dismiss(g)} className="inline-flex h-9 items-center gap-1 rounded-full border border-card-line px-3 text-[13px] font-semibold hover:bg-surface-2"><X size={13} /> Nein</button>
                <button type="button" onClick={() => setOpen(g)} className="inline-flex h-9 items-center gap-1.5 rounded-full bg-fg px-3.5 text-[13px] font-semibold text-canvas"><Combine size={13} /> Ansehen & prüfen</button>
              </span>
            </li>
          );
        })}
      </ul>
      {open && <MergeSheet docs={open.ids.map((id) => byId.get(id)).filter((d): d is Doc => !!d)} title={open.title} reason={open.reason} skip={open.skip} onClose={() => setOpen(undefined)} onDone={() => dismiss(open)} onNotSame={() => dismiss(open)} />}
    </section>
    </>
  );
}
