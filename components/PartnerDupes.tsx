"use client";
import { useEffect, useMemo, useState } from "react";
import { ArrowRight, Check, GitMerge, History, Loader2, PencilLine, Undo2, Users, X } from "lucide-react";
import { SenderLogo } from "@/components/SenderLogo";
import { CARD } from "@/components/ui";
import { fmtDate, useDocs } from "@/lib/docs";
import { findPartnerDuplicates, partnerPairKeys, type PartnerGroup } from "@/lib/partnerDupes";
import { buildPartners, partnerKey } from "@/lib/partners";
import { supabase } from "@/lib/supabase";
import type { Doc } from "@/lib/types";

const KEY = "lifevault:not-same-partner";
const load = (): string[] => { try { return JSON.parse(localStorage.getItem(KEY) ?? "[]"); } catch { return []; } };

export function usePartnerDuplicates(docs: Doc[]) {
  const [dismissed, setDismissed] = useState<string[]>([]);
  useEffect(() => setDismissed(load()), []);
  const groups = useMemo(() => findPartnerDuplicates(buildPartners(docs), dismissed), [docs, dismissed]);
  const notSame = (keys: string[]) => setDismissed((cur) => { const n = [...new Set([...cur, ...keys])]; try { localStorage.setItem(KEY, JSON.stringify(n)); } catch { /* egal */ } return n; });
  return { groups, notSame };
}

/** Gleiche Partner unter verschiedenen Namen: auswählen, Namen festlegen, zusammenführen (Dokumente bekommen den gewählten Absender) */
export function PartnerMerge({ docs }: { docs: Doc[] }) {
  const { groups, notSame } = usePartnerDuplicates(docs);
  if (!groups.length) return <p className={`${CARD} p-5 text-center text-[14px] text-muted`}>Keine doppelten Partner gefunden. 👍</p>;
  return <div className="space-y-3">{groups.map((g) => <Group key={g.key} g={g} onDismiss={() => notSame(partnerPairKeys(g))} />)}</div>;
}

function Group({ g, onDismiss }: { g: PartnerGroup; onDismiss: () => void }) {
  const { refresh } = useDocs();
  const [keep, setKeep] = useState(g.partners[0].key);
  const [picked, setPicked] = useState<string[]>(g.partners.map((p) => p.key));
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const target = g.partners.find((p) => p.key === keep)!;
  const others = g.partners.filter((p) => p.key !== keep && picked.includes(p.key));
  const merge = async () => {
    const ids = others.flatMap((p) => p.docs.map((d) => d.id));
    if (!ids.length || !confirm(`${others.map((p) => `„${p.name}“`).join(", ")} und „${target.name}“ als einen Partner führen? ${ids.length} ${ids.length === 1 ? "Dokument bekommt" : "Dokumente bekommen"} den Absender „${target.name}“.`)) return;
    setBusy(true);
    // vorher merken, wie jedes Dokument hieß – damit es rückgängig gemacht werden kann
    const entries = others.flatMap((p) => p.docs.map((d) => ({ doc_id: d.id, sender: d.sender, sender_domain: d.sender_domain })));
    const { data: log } = await supabase.from("partner_merges").insert({ target_name: target.name, target_domain: target.domain, kind: "merge", entries }).select("id").single();
    const { error } = await supabase.from("documents").update({ sender: target.name, ...(target.domain ? { sender_domain: target.domain } : {}) }).in("id", ids);
    if (error && log) await supabase.from("partner_merges").delete().eq("id", log.id);
    setBusy(false);
    if (error) { alert("Das hat nicht geklappt. Bitte erneut versuchen."); return; }
    setDone(true);
    await refresh();
  };
  const total = target.docs.length + others.reduce((n, p) => n + p.docs.length, 0);
  return (
    <section className={`${CARD} overflow-hidden`}>
      {/* Frage zuerst: ist das derselbe Partner? */}
      <div className="px-4 pt-4">
        <p className="text-[15px] font-semibold">Ist das derselbe Partner?</p>
        <p className="mt-0.5 text-[12.5px] text-muted">
          <span className={`mr-1.5 rounded-full px-2 py-px text-[11px] font-semibold ${g.sure ? "bg-fg text-canvas" : "border border-card-line text-soft"}`}>{g.sure ? "sehr wahrscheinlich" : "vielleicht"}</span>
          {g.reasons.join(" · ")}
        </p>
      </div>
      <div className="grid gap-3 px-4 py-3.5 sm:grid-cols-[1fr_auto_1fr] sm:items-center">
        {/* links: die Namen, unter denen er gerade auftaucht – einen als Namen wählen */}
        <div>
          <p className="mb-1.5 text-[11px] font-semibold tracking-wide text-muted uppercase">Steht bei dir unter {g.partners.length} Namen</p>
          <ul className="space-y-1.5" role="radiogroup" aria-label="Welcher Name soll bleiben?">
            {g.partners.map((p) => {
              const on = picked.includes(p.key);
              const isKeep = keep === p.key;
              return (
                <li key={p.key} className={`flex items-center gap-2.5 rounded-xl border px-2.5 py-2 ${isKeep ? "border-fg" : "border-card-line"} ${on ? "" : "opacity-45"}`}>
                  <button type="button" role="radio" aria-checked={isKeep} onClick={() => { setKeep(p.key); setPicked((c) => (c.includes(p.key) ? c : [...c, p.key])); }} className="flex min-w-0 flex-1 items-center gap-2.5 text-left">
                    <span className={`grid h-[18px] w-[18px] shrink-0 place-items-center rounded-full border-2 ${isKeep ? "border-fg" : "border-line-strong"}`}>{isKeep && <span className="h-2 w-2 rounded-full bg-fg" />}</span>
                    <SenderLogo domain={p.domain} sender={p.name} cluster={p.cluster} size={30} />
                    <span className="min-w-0 flex-1"><b className="block truncate text-[13.5px] font-semibold">{p.name}</b><span className="block truncate text-[11.5px] text-muted">{p.docs.length} {p.docs.length === 1 ? "Dokument" : "Dokumente"}{p.domain ? ` · ${p.domain}` : ""}</span></span>
                  </button>
                  {g.partners.length > 2 && !isKeep && <button type="button" onClick={() => setPicked((c) => (on ? c.filter((x) => x !== p.key) : [...c, p.key]))} className="shrink-0 text-[11.5px] font-semibold text-muted hover:text-fg">{on ? "gehört nicht dazu" : "doch dazu"}</button>}
                </li>
              );
            })}
          </ul>
          <p className="mt-1.5 text-[11.5px] text-muted">Tippe den Namen an, der bleiben soll.</p>
        </div>
        <ArrowRight size={18} className="mx-auto rotate-90 text-muted sm:rotate-0" />
        {/* rechts: so sieht es danach aus */}
        <div className="rounded-xl bg-surface-2 p-3">
          <p className="mb-1.5 text-[11px] font-semibold tracking-wide text-muted uppercase">Danach ein Partner</p>
          <span className="flex items-center gap-2.5">
            <SenderLogo domain={target.domain} sender={target.name} cluster={target.cluster} size={36} />
            <span className="min-w-0"><b className="block truncate text-[14px]">{target.name}</b><span className="block text-[12px] text-muted">alle {total} Dokumente zusammen</span></span>
          </span>
          <p className="mt-2 text-[11.5px] text-muted">Nur der Absendername wird angeglichen – kein Dokument wird gelöscht. Rückgängig jederzeit.</p>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2 border-t border-line px-4 py-3">
        {done ? <span className="text-[13px] font-semibold text-positive-text">Erledigt – jetzt ein Partner: „{target.name}“.</span> : (
          <>
            <button type="button" disabled={busy || !others.length} onClick={() => void merge()} className="inline-flex h-9 items-center gap-1.5 rounded-full bg-fg px-4 text-[13px] font-semibold text-canvas disabled:opacity-40">
              {busy ? <Loader2 size={14} className="animate-spin" /> : <GitMerge size={14} />} Ja, ein Partner
            </button>
            <button type="button" onClick={onDismiss} className="inline-flex h-9 items-center gap-1.5 rounded-full border border-card-line px-4 text-[13px] font-semibold hover:bg-surface-2"><X size={14} /> Nein, verschiedene</button>
          </>
        )}
      </div>
    </section>
  );
}

export const PartnerIcon = Users;

type MergeLog = { id: string; target_name: string; kind: string; entries: { doc_id: string; sender: string | null; sender_domain: string | null }[]; created_at: string; undone_at: string | null };

/** Verlauf der Zusammenführungen (für einen Partner oder alle) – jede lässt sich rückgängig machen */
export function MergeHistory({ pkey, compact }: { pkey?: string; compact?: boolean }) {
  const { refresh } = useDocs();
  const [list, setList] = useState<MergeLog[]>();
  const [busy, setBusy] = useState<string>();
  const load = () => void supabase.from("partner_merges").select("id,target_name,kind,entries,created_at,undone_at").order("created_at", { ascending: false }).limit(100).then(({ data }) => setList((data as MergeLog[]) ?? []));
  useEffect(load, []);
  const mine = (list ?? []).filter((m) => !pkey || partnerKey(m.target_name) === pkey || m.entries.some((e) => e.sender && partnerKey(e.sender) === pkey));
  if (!mine.length) return null;
  const undo = async (m: MergeLog) => {
    if (!confirm(`${m.kind === "rename" ? "Umbenennung" : "Zusammenführung"} zu „${m.target_name}“ rückgängig machen? ${m.entries.length} ${m.entries.length === 1 ? "Dokument bekommt" : "Dokumente bekommen"} ihren alten Absender zurück.`)) return;
    setBusy(m.id);
    // je alter Name eine Aktualisierung
    const groups = new Map<string, { sender: string | null; sender_domain: string | null; ids: string[] }>();
    for (const e of m.entries) { const k = `${e.sender}|${e.sender_domain}`; const g = groups.get(k) ?? { sender: e.sender, sender_domain: e.sender_domain, ids: [] }; g.ids.push(e.doc_id); groups.set(k, g); }
    let ok = true;
    for (const g of groups.values()) { const { error } = await supabase.from("documents").update({ sender: g.sender, sender_domain: g.sender_domain }).in("id", g.ids); if (error) ok = false; }
    if (ok) await supabase.from("partner_merges").update({ undone_at: new Date().toISOString() }).eq("id", m.id);
    else alert("Nicht alles konnte zurückgesetzt werden. Bitte erneut versuchen.");
    setBusy(undefined);
    load();
    await refresh();
  };
  return (
    <section className={`${CARD} overflow-hidden`}>
      <h2 className={`flex items-center gap-2 px-4 pt-3.5 pb-2 font-semibold ${compact ? "text-[14px]" : "text-[16px]"}`}><History size={16} /> Namen & Zusammenführungen</h2>
      <ul className="divide-y divide-line border-t border-line">
        {mine.map((m) => {
          const names = [...new Map(m.entries.map((e) => [e.sender ?? "(ohne Absender)", 0])).keys()];
          const count = (n: string) => m.entries.filter((e) => (e.sender ?? "(ohne Absender)") === n).length;
          return (
            <li key={m.id} className={`flex items-start gap-3 px-4 py-3 ${m.undone_at ? "opacity-55" : ""}`}>
              <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-full bg-surface-2">{m.kind === "rename" ? <PencilLine size={15} /> : <GitMerge size={15} />}</span>
              <span className="min-w-0 flex-1 text-[13px]">
                <span className="block"><b className="font-semibold">{names.map((n) => `„${n}“ (${count(n)})`).join(", ")}</b> → <b className="font-semibold">„{m.target_name}“</b></span>
                <span className="block text-[12px] text-muted">{fmtDate(m.created_at)} {m.kind === "rename" ? "umbenannt" : "zusammengeführt"}{m.undone_at ? ` · am ${fmtDate(m.undone_at)} rückgängig gemacht` : ""}</span>
              </span>
              {!m.undone_at && <button type="button" disabled={busy === m.id} onClick={() => void undo(m)} className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-card-line px-3 py-1 text-[12px] font-semibold hover:bg-surface-2 disabled:opacity-50">{busy === m.id ? <Loader2 size={13} className="animate-spin" /> : <Undo2 size={13} />} Rückgängig</button>}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
