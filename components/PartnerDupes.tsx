"use client";
import { useEffect, useMemo, useState } from "react";
import { Check, GitMerge, History, Loader2, PencilLine, Undo2, Users, X } from "lucide-react";
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
    if (!ids.length || !confirm(`${ids.length} ${ids.length === 1 ? "Dokument" : "Dokumente"} von ${others.map((p) => `„${p.name}“`).join(", ")} zu „${target.name}“ verschieben?`)) return;
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
  return (
    <section className={`${CARD} overflow-hidden`}>
      <div className="px-4 pt-3.5">
        <p className="flex flex-wrap items-center gap-1.5 text-[12.5px] text-soft">
          <span className={`rounded-full px-2 py-px text-[11px] font-semibold ${g.sure ? "bg-fg text-canvas" : "border border-card-line"}`}>{g.sure ? "sehr wahrscheinlich gleich" : "vielleicht gleich"}</span>
          {g.reasons.join(" · ")}
        </p>
      </div>
      <ul className="space-y-1.5 px-4 py-3">
        {g.partners.map((p) => {
          const on = picked.includes(p.key);
          const isKeep = keep === p.key;
          return (
            <li key={p.key} className={`flex items-center gap-3 rounded-xl border px-3 py-2.5 ${isKeep ? "border-fg bg-surface-2" : "border-card-line"} ${on ? "" : "opacity-50"}`}>
              <button type="button" role="checkbox" aria-checked={on} disabled={isKeep} onClick={() => setPicked((c) => (on ? c.filter((x) => x !== p.key) : [...c, p.key]))} aria-label="Gehört dazu" className={`grid h-5 w-5 shrink-0 place-items-center rounded-md border-2 ${on ? "border-fg bg-fg text-canvas" : "border-line-strong"}`}>{on && <Check size={12} strokeWidth={3} />}</button>
              <SenderLogo domain={p.domain} sender={p.name} cluster={p.cluster} size={34} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13.5px] font-semibold">{p.name}</span>
                <span className="block truncate text-[12px] text-muted">{p.docs.length} {p.docs.length === 1 ? "Dokument" : "Dokumente"}{p.domain ? ` · ${p.domain}` : ""}{p.ids.length ? ` · ${p.ids.length} Kennungen` : ""}</span>
              </span>
              <button type="button" onClick={() => { setKeep(p.key); setPicked((c) => (c.includes(p.key) ? c : [...c, p.key])); }} className={`shrink-0 rounded-full px-2.5 py-1 text-[11.5px] font-semibold ${isKeep ? "bg-fg text-canvas" : "border border-card-line text-soft hover:text-fg"}`}>{isKeep ? "Name behalten" : "Diesen Namen"}</button>
            </li>
          );
        })}
      </ul>
      <div className="flex flex-wrap items-center gap-2 border-t border-line px-4 py-3">
        {done ? <span className="text-[13px] font-semibold text-positive-text">Zusammengeführt zu „{target.name}“.</span> : (
          <>
            <button type="button" disabled={busy || !others.length} onClick={() => void merge()} className="inline-flex h-9 items-center gap-1.5 rounded-full bg-fg px-4 text-[13px] font-semibold text-canvas disabled:opacity-40">
              {busy ? <Loader2 size={14} className="animate-spin" /> : <GitMerge size={14} />} {others.length ? `${others.length + 1} zusammenführen` : "Auswählen"}
            </button>
            <button type="button" onClick={onDismiss} className="inline-flex h-9 items-center gap-1.5 rounded-full border border-card-line px-4 text-[13px] font-semibold hover:bg-surface-2"><X size={14} /> Sind verschieden</button>
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
