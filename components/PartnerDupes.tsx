"use client";
import { useEffect, useMemo, useState } from "react";
import { Check, GitMerge, Loader2, Users, X } from "lucide-react";
import { SenderLogo } from "@/components/SenderLogo";
import { CARD } from "@/components/ui";
import { useDocs } from "@/lib/docs";
import { findPartnerDuplicates, partnerPairKeys, type PartnerGroup } from "@/lib/partnerDupes";
import { buildPartners } from "@/lib/partners";
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
    const { error } = await supabase.from("documents").update({ sender: target.name, ...(target.domain ? { sender_domain: target.domain } : {}) }).in("id", ids);
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
