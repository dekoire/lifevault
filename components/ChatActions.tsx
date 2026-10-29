"use client";
import { useState } from "react";
import { ArrowRight, Building2, Check, Combine, Loader2, PencilLine, RotateCcw, X } from "lucide-react";
import { Thumb } from "@/components/ChatWidgets";
import { useDetail } from "@/components/DetailPanel";
import { MergeReview } from "@/components/MergeReview";
import { SenderLogo } from "@/components/SenderLogo";
import { fmtDate, useDocs } from "@/lib/docs";
import { supabase } from "@/lib/supabase";
import type { Doc } from "@/lib/types";

/**
 * Aktionen aus dem Chat – die KI schlägt vor, du bestätigst jede einzeln:
 * umbenennen, Absender ändern (z. B. „polygo“ → „VVS“), zusammenführen (Vorder-/Rückseite, mehrere Seiten).
 * Format im Baustein ```aktion: eine JSON-Zeile je Aktion.
 */
type Action =
  | { typ: "umbenennen"; id: string; titel: string }
  | { typ: "absender"; ids: string[]; absender: string; domain?: string }
  | { typ: "zusammenfuehren"; ids: string[]; titel: string; grund?: string };

const UUID = /^[0-9a-f-]{36}$/i;
export function parseActions(body: string): Action[] {
  const out: Action[] = [];
  const chunks = body.trim().startsWith("[") ? (() => { try { return JSON.parse(body) as unknown[]; } catch { return []; } })() : body.split("\n").map((l) => { try { return JSON.parse(l); } catch { return null; } });
  for (const a of chunks as Record<string, unknown>[]) {
    if (!a || typeof a !== "object") continue;
    const ids = (Array.isArray(a.ids) ? a.ids : a.id ? [a.id] : []).filter((x): x is string => typeof x === "string" && UUID.test(x));
    if (a.typ === "umbenennen" && ids[0] && typeof a.titel === "string") out.push({ typ: "umbenennen", id: ids[0], titel: a.titel.slice(0, 200) });
    if (a.typ === "absender" && ids.length && typeof a.absender === "string") out.push({ typ: "absender", ids, absender: a.absender.slice(0, 120), domain: typeof a.domain === "string" ? a.domain.slice(0, 120) : undefined });
    if (a.typ === "zusammenfuehren" && ids.length >= 2) out.push({ typ: "zusammenfuehren", ids, titel: typeof a.titel === "string" ? a.titel.slice(0, 160) : "Zusammengeführtes Dokument", grund: typeof a.grund === "string" ? a.grund.slice(0, 200) : undefined });
  }
  return out;
}

export function ActionsWidget({ body }: { body: string }) {
  const actions = parseActions(body);
  if (!actions.length) return null;
  return <div className="space-y-2.5">{actions.map((a, i) => <ActionCard key={i} a={a} n={actions.length > 1 ? i + 1 : undefined} />)}</div>;
}

function Head({ icon: Icon, title, n }: { icon: typeof PencilLine; title: string; n?: number }) {
  return <p className="flex items-center gap-2 px-4 pt-3.5 text-[12px] font-semibold tracking-wide text-muted uppercase"><Icon size={14} /> {n ? `Schritt ${n} · ` : ""}{title}</p>;
}
function DocLine({ d }: { d: Doc }) {
  const open = useDetail();
  return (
    <button type="button" onClick={() => open?.({ kind: "doc", id: d.id })} className="flex w-full items-center gap-3 rounded-xl px-1 py-1 text-left hover:bg-surface-2">
      <span className="h-12 w-10 shrink-0 overflow-hidden rounded-md border border-card-line bg-surface-2"><Thumb d={d} /></span>
      <span className="min-w-0 flex-1"><b className="block truncate text-[13px]">{d.title ?? d.file_name}</b><span className="block truncate text-[11.5px] text-muted">{d.sender ?? "–"} · {fmtDate(d.doc_date ?? d.received_at)}</span></span>
    </button>
  );
}

function ActionCard({ a, n }: { a: Action; n?: number }) {
  const { allDocs, refresh } = useDocs();
  const [state, setState] = useState<"ask" | "busy" | "done" | "cancelled">("ask");
  const [undo, setUndo] = useState<(() => Promise<void>) | null>(null);
  const [error, setError] = useState<string>();
  const docs = (a.typ === "umbenennen" ? [a.id] : a.ids).map((id) => allDocs.find((d) => d.id === id)).filter((d): d is Doc => !!d);
  const box = "overflow-hidden rounded-2xl border border-card-line bg-surface shadow-card";

  const run = async (fn: () => Promise<(() => Promise<void>) | null>) => {
    setState("busy"); setError(undefined);
    try { const u = await fn(); setUndo(() => u); await refresh(); setState("done"); }
    catch (e) { setError((e as Error).message); setState("ask"); }
  };
  const buttons = (label: string, fn: () => Promise<(() => Promise<void>) | null>) => (
    <div className="flex flex-wrap items-center gap-2 border-t border-line px-4 py-3">
      {state === "done" ? (
        <>
          <span className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-positive-text"><Check size={15} /> Erledigt</span>
          {undo && <button type="button" onClick={() => void run(async () => { await undo(); return null; }).then(() => setState("cancelled"))} className="inline-flex h-8 items-center gap-1 rounded-full border border-card-line px-3 text-[12px] font-semibold hover:bg-surface-2"><RotateCcw size={12} /> Rückgängig</button>}
        </>
      ) : state === "cancelled" ? <span className="text-[13px] text-muted">Nicht ausgeführt.</span> : (
        <>
          <button type="button" disabled={state === "busy"} onClick={() => void run(fn)} className="inline-flex h-9 items-center gap-1.5 rounded-full bg-fg px-4 text-[13px] font-semibold text-canvas disabled:opacity-60">{state === "busy" ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />} {label}</button>
          <button type="button" disabled={state === "busy"} onClick={() => setState("cancelled")} className="inline-flex h-9 items-center gap-1 rounded-full border border-card-line px-3.5 text-[13px] font-semibold hover:bg-surface-2"><X size={14} /> Abbrechen</button>
        </>
      )}
      {error && <span role="alert" className="w-full text-[12.5px] text-negative-text">{error}</span>}
    </div>
  );

  if (!docs.length) return <div className={`${box} px-4 py-3 text-[13px] text-muted`}>Die Dokumente dieser Aktion gibt es nicht (mehr).</div>;

  if (a.typ === "umbenennen") {
    const d = docs[0];
    const already = d.title === a.titel && state === "ask";
    return (
      <div className={box}>
        <Head icon={PencilLine} title="Umbenennen" n={n} />
        <div className="space-y-2 px-4 py-3">
          <DocLine d={d} />
          <p className="flex flex-wrap items-center gap-2 text-[13px]"><span className="text-muted line-through">{d.title ?? d.file_name}</span><ArrowRight size={14} className="text-muted" /><b>{a.titel}</b></p>
        </div>
        {already ? <p className="border-t border-line px-4 py-3 text-[13px] font-semibold text-positive-text">✓ Heißt schon so</p> : buttons("Umbenennen", async () => {
          const old = d.title;
          const { error } = await supabase.from("documents").update({ title: a.titel }).eq("id", d.id);
          if (error) throw new Error("Umbenennen hat nicht geklappt.");
          return async () => { await supabase.from("documents").update({ title: old }).eq("id", d.id); };
        })}
      </div>
    );
  }

  if (a.typ === "absender") {
    const already = docs.every((d) => d.sender === a.absender) && state === "ask";
    return (
      <div className={box}>
        <Head icon={Building2} title="Absender ändern" n={n} />
        <div className="space-y-2 px-4 py-3">
          {docs.slice(0, 4).map((d) => <DocLine key={d.id} d={d} />)}
          {docs.length > 4 && <p className="text-[12px] text-muted">+ {docs.length - 4} weitere</p>}
          <p className="flex flex-wrap items-center gap-2 text-[13px]">
            <span className="text-muted line-through">{[...new Set(docs.map((d) => d.sender ?? "–"))].join(", ")}</span><ArrowRight size={14} className="text-muted" />
            <span className="inline-flex items-center gap-1.5 font-semibold"><SenderLogo domain={a.domain ?? null} sender={a.absender} cluster={docs[0].cluster} size={22} /> {a.absender}</span>
          </p>
        </div>
        {already ? <p className="border-t border-line px-4 py-3 text-[13px] font-semibold text-positive-text">✓ Steht schon so</p> : buttons(`${docs.length === 1 ? "Absender" : `${docs.length} Dokumente`} ändern`, async () => {
          const old = docs.map((d) => ({ id: d.id, sender: d.sender, sender_domain: d.sender_domain }));
          const { error } = await supabase.from("documents").update({ sender: a.absender, ...(a.domain ? { sender_domain: a.domain } : {}) }).in("id", docs.map((d) => d.id));
          if (error) throw new Error("Ändern hat nicht geklappt.");
          return async () => { for (const o of old) await supabase.from("documents").update({ sender: o.sender, sender_domain: o.sender_domain }).eq("id", o.id); };
        })}
      </div>
    );
  }

  // zusammenführen: große Vorschau zum Wischen, Reihenfolge/Seiten anpassbar, dann bestätigen
  if (state === "done") return <div className={`${box} px-4 py-3 text-[13px] font-semibold text-positive-text`}>✓ Zusammengeführt zu „{a.titel}“</div>;
  if (state === "cancelled") return <div className={`${box} px-4 py-3 text-[13px] text-muted`}>Zusammenführen abgebrochen.</div>;
  if (docs.length < 2) return <div className={`${box} px-4 py-3 text-[13px] text-muted`}>Nur noch ein Dokument da – vermutlich schon zusammengeführt.</div>;
  return (
    <div className={box}>
      <Head icon={Combine} title="Zusammenführen" n={n} />
      <div className="px-4 py-3"><MergeReview docs={docs} title={a.titel} reason={a.grund} onDone={() => setState("done")} onCancel={() => setState("cancelled")} /></div>
    </div>
  );
}
