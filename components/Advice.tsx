"use client";
import { useEffect, useState } from "react";
import { ChevronDown, Clock, Coins, FolderCheck, Lightbulb, Loader2, PenLine, RefreshCw, Scale } from "lucide-react";
import { useDetail } from "@/components/DetailPanel";
import { openDraft } from "@/components/DraftSheet";
import { SenderLogo } from "@/components/SenderLogo";
import { CARD } from "@/components/ui";
import { useDocs } from "@/lib/docs";
import { DRAFT_PURPOSES, type DraftPurpose } from "@/lib/drafts";
import { authFetch } from "@/lib/supabase";
import { secureGet, secureSet } from "@/lib/devicekey";

/**
 * „Handlungsempfehlungen“: Was das Leben leichter oder günstiger macht – Kosten senken, Geld zurückholen,
 * Rechte nutzen, Fristen. Abgewogen nach Nutzen und Aufwand. Einmal erstellt, 3 Tage gemerkt (spart KI-Kosten).
 */
export type AdviceItem = { title: string; why: string; kind: string; saving: number | null; effort: string; steps: string[]; doc_ids: string[]; draft: string | null };
const KEY = "lifevault:advice";
const GRID = "md:grid md:grid-cols-[minmax(0,1fr)_10rem_7rem_7rem_1rem] md:items-center md:gap-4";
const HEAD = "text-[12px] font-semibold text-muted";
const DAYS = 3;
const KINDS: Record<string, { label: string; icon: typeof Coins; color: string }> = {
  geld: { label: "Geld", icon: Coins, color: "#16a34a" },
  frist: { label: "Frist", icon: Clock, color: "#ea580c" },
  rechte: { label: "Deine Rechte", icon: Scale, color: "#7c3aed" },
  ordnung: { label: "Ordnung", icon: FolderCheck, color: "#2563eb" },
};

/** Letzte Bewertung – verschlüsselt im Browser (lib/devicekey.ts), beim Abmelden gelöscht */
export function readAdvice(): Promise<{ at: string; items: AdviceItem[] } | null> {
  return secureGet(KEY);
}

export function AdviceList() {
  const { allDocs } = useDocs();
  const detail = useDetail();
  const [data, setData] = useState<{ at: string; items: AdviceItem[] } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [open, setOpen] = useState<number | null>(0);
  const load = async () => {
    setBusy(true); setError("");
    try {
      const res = await authFetch("/api/advice", { method: "POST" });
      const j = (await res.json().catch(() => ({}))) as { items?: AdviceItem[]; at?: string; error?: string };
      if (!res.ok || !j.items) throw new Error(j.error ?? "Das hat nicht geklappt.");
      const v = { at: j.at ?? new Date().toISOString(), items: j.items };
      setData(v);
      void secureSet(KEY, v);
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  };
  useEffect(() => {
    void readAdvice().then((c) => {
      if (c && Date.now() - Date.parse(c.at) < DAYS * 86_400_000) setData(c);
      else if (allDocs.some((d) => d.status === "ready")) void load();
    });
  }, [allDocs.length > 0]); // eslint-disable-line react-hooks/exhaustive-deps

  const items = data?.items ?? [];
  const total = items.reduce((n, i) => n + (i.saving ?? 0), 0);
  // Nur zeigen, wenn es etwas zu tun gibt – sonst (auch beim Durchsehen oder bei Fehlern) keine Kachel
  if (!items.length) return null;
  return (
    <section className={`${CARD} overflow-hidden`}>
      {/* Kopf wie „Zuletzt hinzugefügt“: schlichte Überschrift, darunter Spaltenköpfe und Zeilen */}
      <div className="flex items-center gap-3 px-4 pt-5 pb-3 md:px-6">
        <span className="min-w-0 flex-1">
          <h2 className="text-[18px] leading-[26px] font-semibold">Handlungsempfehlungen</h2>
          <span className="block text-[13px] text-muted">{total > 0 ? `Bis zu ${Math.round(total).toLocaleString("de-DE")} € im Jahr möglich · nach Nutzen und Aufwand sortiert` : "Nach Nutzen und Aufwand sortiert"}</span>
        </span>
        <button type="button" onClick={() => void load()} disabled={busy} title="Neu bewerten" aria-label="Neu bewerten" className="grid h-9 w-9 place-items-center rounded-full text-soft hover:bg-surface-2 disabled:opacity-50">{busy ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}</button>
      </div>
      {error && <p className="mx-4 mb-3 rounded-xl bg-negative/10 px-3 py-2 text-[13px] text-negative-text">{error}</p>}
      <div className={`hidden border-b border-line px-4 py-[18px] md:px-6 ${GRID}`} role="row">
        <span className={HEAD}>Empfehlung</span><span className={HEAD}>Art</span><span className={HEAD}>Aufwand</span><span className={`${HEAD} text-right`}>Ersparnis</span><span />
      </div>
      <div className="divide-y divide-line border-t border-line md:border-t-0">
        {items.map((it, i) => {
          const k = KINDS[it.kind] ?? KINDS.ordnung;
          const docs = it.doc_ids.map((id) => allDocs.find((d) => d.id === id)).filter((d): d is NonNullable<typeof d> => !!d);
          const draft = DRAFT_PURPOSES.find((p) => p.id === it.draft);
          const isOpen = open === i;
          return (
            <div key={i}>
              <button type="button" onClick={() => setOpen(isOpen ? null : i)} aria-expanded={isOpen} className={`flex w-full items-center gap-3 px-4 py-3.5 md:px-6 text-left transition-colors hover:bg-canvas ${GRID}`}>
                <span className="min-w-0 flex-1">
                  <b className="block truncate text-[15px] font-semibold">{it.title}</b>
                  <span className="block truncate text-[12px] text-muted md:hidden">{k.label} · Aufwand {it.effort}{it.saving ? ` · ca. ${Math.round(it.saving).toLocaleString("de-DE")} €/Jahr` : ""}</span>
                </span>
                <span className="hidden items-center gap-1.5 text-[14px] md:inline-flex"><k.icon size={14} className="shrink-0" />{k.label}</span>
                <span className="hidden text-[14px] text-soft md:block">{it.effort}</span>
                <span className="tnum hidden text-right text-[14px] font-semibold md:block">{it.saving ? `${Math.round(it.saving).toLocaleString("de-DE")} €/J.` : "–"}</span>
                <ChevronDown size={16} className={`shrink-0 text-muted transition-transform ${isOpen ? "rotate-180" : ""}`} />
              </button>
              {isOpen && (
                <div className="space-y-3 px-4 pb-4 md:px-6">
                  <p className="text-[14px] text-soft">{it.why}</p>
                  <ol className="space-y-1.5">{it.steps.map((s, j) => <li key={j} className="flex gap-2 text-[14px]"><span className="tnum grid h-5 w-5 shrink-0 place-items-center rounded-full bg-surface-3 text-[11px] font-bold">{j + 1}</span>{s}</li>)}</ol>
                  <div className="flex flex-wrap items-center gap-2">
                    {docs.map((d) => (
                      <button key={d.id} type="button" onClick={() => detail?.({ kind: "doc", id: d.id })} className="inline-flex max-w-[16rem] items-center gap-1.5 rounded-full border border-card-line py-1 pr-3 pl-1 text-[13px] font-semibold hover:bg-surface-2">
                        <SenderLogo domain={d.sender_domain} sender={d.sender} cluster={d.cluster} size={22} /><span className="truncate">{d.title ?? d.file_name}</span>
                      </button>
                    ))}
                    {draft && docs[0] && <button type="button" onClick={() => openDraft(docs[0], draft.id as DraftPurpose)} className="ml-auto inline-flex h-8 items-center gap-1.5 rounded-full bg-brand-500 px-3.5 text-[13px] font-semibold text-white"><PenLine size={13} /> {draft.label} vorbereiten</button>}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

/** Empfehlung zu einem Dokument (aus der letzten Bewertung), für das Seitenpanel */
export function DocAdvice({ id }: { id: string }) {
  const [it, setIt] = useState<AdviceItem>();
  useEffect(() => { void readAdvice().then((a) => setIt(a?.items.find((x) => x.doc_ids.includes(id)))); }, [id]);
  if (!it) return null;
  const k = KINDS[it.kind] ?? KINDS.ordnung;
  return (
    <div className="rounded-2xl border border-card-line bg-surface px-3.5 py-3">
      <span className="mb-1 inline-flex items-center gap-1.5 text-[12px] font-semibold" style={{ color: k.color }}><Lightbulb size={12} /> Empfehlung</span>
      <b className="block text-[14px]">{it.title}</b>
      <p className="mt-0.5 text-[13px] text-soft">{it.why}</p>
    </div>
  );
}
