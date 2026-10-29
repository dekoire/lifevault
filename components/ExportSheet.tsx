"use client";
import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowUp, Check, ChevronDown, Copy, Download, RefreshCw, Loader2, Lock, Minus, Search, Sparkles, X } from "lucide-react";
import { ClusterIcon } from "@/components/ClusterIcon";
import { SenderLogo } from "@/components/SenderLogo";
import { LabelChip } from "@/components/Labels";
import { VaultUnlock } from "@/components/VaultUnlock";
import { groupOf, LABEL_GROUPS } from "@/lib/labels";
import { CLUSTERS, clusterOf } from "@/lib/clusters";
import { fmtDate, useDocs } from "@/lib/docs";
import { useMe } from "@/lib/me";
import { EXPORT_FORMATS, newPassword, startExport, type ExportFormat } from "@/lib/jobs";
import { authFetch } from "@/lib/supabase";
import type { Doc } from "@/lib/types";

/**
 * Export als ZIP: Auswahl über Bereiche/Themen, einzelne Dokumente oder per KI-Suche („alle Dokumente zu …“).
 * Alles landet in einer gemeinsamen Auswahl, die man beliebig ergänzen oder ausdünnen kann.
 * Verschlüsselte Dateien werden im Browser entschlüsselt – nur bei entsperrtem Tresor.
 */
type Tab = "areas" | "docs" | "ai";
type Round = { q: string; ids: string[]; error?: string; busy?: boolean };
const dateOf = (d: Doc) => d.doc_date ?? d.received_at.slice(0, 10);
const topicOf = (d: Doc) => d.topic ?? "Ohne Thema";

export function ExportSheet({ onClose }: { onClose: () => void }) {
  const { allDocs } = useDocs();
  const { unlocked } = useMe();
  const docs = useMemo(() => allDocs.filter((d) => d.status === "ready" && !d.merged_into).sort((a, b) => dateOf(b).localeCompare(dateOf(a))), [allDocs]);
  const byId = useMemo(() => new Map(docs.map((d) => [d.id, d])), [docs]);
  const [tab, setTab] = useState<Tab>("areas");
  const [sel, setSel] = useState<Set<string>>(new Set());
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    addEventListener("keydown", k); return () => removeEventListener("keydown", k);
  }, [onClose]);

  const setMany = (ids: string[], on: boolean) => setSel((s) => { const n = new Set(s); for (const id of ids) (on ? n.add(id) : n.delete(id)); return n; });
  const chosen = [...sel].map((id) => byId.get(id)).filter((d): d is Doc => !!d);
  const lockedN = unlocked ? 0 : chosen.filter((d) => d.encrypted).length;

  // läuft im Hintergrund weiter (lila Karte unten rechts), das Fenster schließt sofort
  // Passwort: Pflicht, sobald Tresor-Dokumente dabei sind, sonst wahlweise
  const withVault = chosen.some((d) => d.encrypted && unlocked);
  const [protect, setProtect] = useState(false);
  const [format, setFormat] = useState<ExportFormat>("files");
  const [pw, setPw] = useState(newPassword);
  const locked = protect || withVault;
  const run = () => {
    const list = chosen.filter((d) => !d.encrypted || unlocked);
    if (!list.length) return;
    startExport(list, { password: locked ? pw : undefined, format });
    onClose();
  };

  const TABS: { id: Tab; label: string }[] = [{ id: "areas", label: "Bereiche & Themen" }, { id: "docs", label: "Einzelne Dokumente" }, { id: "ai", label: "Mit KI suchen" }];
  return createPortal(
    <div className="sheet-backdrop fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center sm:p-6" onClick={onClose}>
      <div role="dialog" aria-label="Exportieren" onClick={(e) => e.stopPropagation()} className="sheet-rise flex h-[92dvh] w-full max-w-2xl flex-col overflow-hidden rounded-t-3xl bg-surface shadow-[0_24px_64px_rgba(16,24,40,.25)] sm:h-[min(52rem,90dvh)] sm:rounded-3xl">
        <div className="flex items-center justify-between px-6 pt-5 pb-3">
          <span><b className="block text-[19px] font-semibold">Exportieren</b><span className="text-[13px] text-muted">Wähle aus, was du exportieren möchtest</span></span>
          <button type="button" onClick={onClose} aria-label="Schließen" className="grid h-9 w-9 place-items-center rounded-full bg-surface-3 disabled:opacity-40"><X size={18} /></button>
        </div>
        <div className="px-6 pb-3">
          <div className="flex gap-1 rounded-full bg-surface-3 p-1">
            {TABS.map((t) => <button key={t.id} type="button" onClick={() => setTab(t.id)} aria-pressed={tab === t.id} className={`h-9 flex-1 rounded-full px-2 text-[13px] font-semibold transition-colors ${tab === t.id ? "bg-surface text-fg shadow-card" : "text-soft hover:text-fg"}`}>{t.label}</button>)}
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto border-t border-line">
          {tab === "areas" && <Areas docs={docs} sel={sel} setMany={setMany} />}
          {tab === "docs" && <Docs docs={docs} sel={sel} setMany={setMany} />}
          {tab === "ai" && <AiSearch byId={byId} sel={sel} setMany={setMany} />}
        </div>
        <div className="border-t border-line px-6 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))]">
          {lockedN > 0 && <div className="mb-3"><VaultUnlock compact title={`${lockedN} verschlüsselte ${lockedN === 1 ? "Datei" : "Dateien"} dabei`} text="Zum Mitexportieren Tresor entsperren – sie werden nur im Browser entschlüsselt." /></div>}
          {sel.size > 0 && (
            <div className="mb-2">
              <span className="mb-1.5 block text-[12.5px] font-semibold text-soft">Wie sollen die Dateien raus?</span>
              <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
                {EXPORT_FORMATS.map((f) => (
                  <button key={f.id} type="button" onClick={() => setFormat(f.id)} aria-pressed={format === f.id} title={f.hint} className={`rounded-xl border px-2.5 py-2 text-left transition-colors ${format === f.id ? "border-brand-500 bg-brand-500/[0.07]" : "border-card-line hover:bg-surface-2"}`}>
                    <b className="block text-[12.5px] leading-4">{f.label}</b>
                    <span className="mt-0.5 block text-[11px] leading-[14px] text-muted">{f.hint}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
          {sel.size > 0 && (
            <div className="mb-3 rounded-2xl bg-surface-2 px-3.5 py-2.5">
              <div className="flex items-center gap-3">
                <span className="min-w-0 flex-1">
                  <b className="block text-[13.5px]">Mit Passwort schützen</b>
                  <span className="block text-[12px] text-muted">{withVault ? "Pflicht, weil Tresor-Dokumente dabei sind" : "ZIP verschlüsselt (AES-256)"}</span>
                </span>
                <button type="button" role="switch" aria-checked={locked} disabled={withVault} onClick={() => setProtect(!protect)} className={`relative h-6 w-10 shrink-0 rounded-full transition disabled:opacity-60 ${locked ? "bg-brand-500" : "bg-surface-3 ring-1 ring-card-line"}`}><span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${locked ? "left-[1.125rem]" : "left-0.5"}`} /></button>
              </div>
              {locked && (
                <div className="mt-2 flex items-center gap-2">
                  <code className="tnum min-w-0 flex-1 truncate rounded-full border border-card-line bg-surface px-3 py-1.5 text-[13.5px] font-semibold tracking-wide">{pw}</code>
                  <button type="button" onClick={() => void navigator.clipboard?.writeText(pw)} aria-label="Passwort kopieren" title="Kopieren" className="grid h-8 w-8 place-items-center rounded-full bg-surface hover:bg-surface-3"><Copy size={14} /></button>
                  <button type="button" onClick={() => setPw(newPassword())} aria-label="Neues Passwort" title="Neues Passwort" className="grid h-8 w-8 place-items-center rounded-full bg-surface hover:bg-surface-3"><RefreshCw size={14} /></button>
                </div>
              )}
            </div>
          )}
          <div className="flex items-center gap-3">
            <span className="min-w-0 flex-1 text-[14px]"><b className="tnum">{sel.size}</b> {sel.size === 1 ? "Dokument" : "Dokumente"} ausgewählt{sel.size > 0 && <> · <button type="button" onClick={() => setSel(new Set())} className="font-semibold text-selected">leeren</button></>}</span>
            <button type="button" onClick={run} disabled={sel.size - lockedN <= 0} className="inline-flex h-11 shrink-0 items-center gap-2 rounded-full bg-fg px-5 text-[14px] font-semibold text-canvas disabled:opacity-40">
              <Download size={16} /> Fertig – {format === "pdf-one" && !locked ? "PDF erstellen" : "Export erstellen"}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}

type SelProps = { sel: Set<string>; setMany: (ids: string[], on: boolean) => void };

/** Kästchen: an, aus oder teilweise */
export function Box({ state }: { state: "on" | "off" | "some" }) {
  return (
    <span className={`grid h-5 w-5 shrink-0 place-items-center rounded-md border ${state === "off" ? "border-line-strong bg-surface" : "border-fg bg-fg text-canvas"}`}>
      {state === "on" ? <Check size={13} strokeWidth={3} /> : state === "some" ? <Minus size={13} strokeWidth={3} /> : null}
    </span>
  );
}
export const stateOf = (ids: string[], sel: Set<string>) => { const n = ids.filter((id) => sel.has(id)).length; return n === 0 ? "off" : n === ids.length ? "on" : "some"; };

function Areas({ docs, sel, setMany }: { docs: Doc[] } & SelProps) {
  const [open, setOpen] = useState<string>();
  const groups = CLUSTERS.map((c) => {
    const ds = docs.filter((d) => clusterOf(d.cluster).id === c.id);
    const topics = new Map<string, string[]>();
    for (const d of ds) topics.set(topicOf(d), [...(topics.get(topicOf(d)) ?? []), d.id]);
    return { c, ids: ds.map((d) => d.id), topics: [...topics.entries()].sort((a, b) => b[1].length - a[1].length) };
  }).filter((g) => g.ids.length);
  const byTag = new Map<string, string[]>();
  for (const d of docs) for (const t of d.labels ?? []) byTag.set(t, [...(byTag.get(t) ?? []), d.id]);
  const tagged = [...byTag.entries()];
  return (
    <div className="divide-y divide-line">
      {groups.map(({ c, ids, topics }) => {
        const st = stateOf(ids, sel);
        return (
          <div key={c.id}>
            <div className="flex items-center gap-3 px-6 py-3">
              <button type="button" onClick={() => setMany(ids, st !== "on")} className="flex min-w-0 flex-1 items-center gap-3 text-left">
                <Box state={st} />
                <ClusterIcon id={c.id} size={34} />
                <span className="min-w-0 flex-1 truncate text-[15px] font-semibold">{c.label}</span>
                <span className="tnum text-[12.5px] text-muted">{ids.filter((id) => sel.has(id)).length ? `${ids.filter((id) => sel.has(id)).length} / ` : ""}{ids.length}</span>
              </button>
              {topics.length > 1 && <button type="button" onClick={() => setOpen(open === c.id ? undefined : c.id)} aria-expanded={open === c.id} aria-label="Themen zeigen" className="grid h-8 w-8 place-items-center rounded-full text-muted hover:bg-surface-2"><ChevronDown size={17} className={`transition-transform ${open === c.id ? "rotate-180" : ""}`} /></button>}
            </div>
            {open === c.id && (
              <div className="bg-surface-2 py-1">
                {topics.map(([t, tids]) => (
                  <button key={t} type="button" onClick={() => setMany(tids, stateOf(tids, sel) !== "on")} className="flex w-full items-center gap-3 py-2 pr-6 pl-14 text-left text-[14px] hover:bg-surface-3">
                    <Box state={stateOf(tids, sel)} />
                    <span className="min-w-0 flex-1 truncate">{t}</span>
                    <span className="tnum text-[12.5px] text-muted">{tids.length}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        );
      })}
      {tagged.length > 0 && (
        <div className="px-6 pt-5 pb-4">
          <span className="mb-2 block text-[13px] font-semibold text-soft">Nach Tags</span>
          {LABEL_GROUPS.map((g) => { const tags = tagged.filter(([t]) => groupOf(t)?.id === g.id); return tags.length ? (
            <div key={g.id} className="mb-2 flex flex-wrap items-center gap-1.5">
              <span className="mr-0.5 inline-flex items-center gap-1.5 text-[11.5px] font-semibold text-muted"><span className="h-2 w-2 rounded-full" style={{ background: g.color }} />{g.label}</span>
              {tags.map(([t, ids]) => <LabelChip key={t} tag={`${t}`} on={stateOf(ids, sel) === "on"} onClick={() => setMany(ids, stateOf(ids, sel) !== "on")} />)}
            </div>
          ) : null; })}
        </div>
      )}
    </div>
  );
}

function DocLine({ d, on, onToggle }: { d: Doc; on: boolean; onToggle: () => void }) {
  return (
    <button type="button" onClick={onToggle} className="flex w-full items-center gap-3 px-6 py-2.5 text-left hover:bg-surface-2">
      <Box state={on ? "on" : "off"} />
      <SenderLogo domain={d.sender_domain} sender={d.sender} cluster={d.cluster} size={32} />
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5"><span className="truncate text-[14px] font-semibold">{d.title ?? d.file_name}</span>{d.encrypted && <Lock size={12} className="shrink-0 text-brand-500" />}</span>
        <span className="block truncate text-[12.5px] text-muted">{[d.sender, clusterOf(d.cluster).label, fmtDate(dateOf(d))].filter(Boolean).join(" · ")}</span>
      </span>
    </button>
  );
}

function Docs({ docs, sel, setMany }: { docs: Doc[] } & SelProps) {
  const [q, setQ] = useState("");
  const [only, setOnly] = useState(false);
  const term = q.trim().toLowerCase();
  const list = docs.filter((d) => (!only || sel.has(d.id)) && (!term || `${d.title ?? ""} ${d.file_name} ${d.sender ?? ""} ${d.doc_type ?? ""} ${d.topic ?? ""} ${clusterOf(d.cluster).label}`.toLowerCase().includes(term)));
  const st = stateOf(list.map((d) => d.id), sel);
  return (
    <div>
      <div className="sticky top-0 z-10 space-y-2 bg-surface px-6 pt-3 pb-2">
        <label className="flex h-10 items-center gap-2 rounded-full border border-card-line px-3.5">
          <Search size={16} className="text-muted" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Titel, Absender, Thema …" className="min-w-0 flex-1 bg-transparent text-[14.5px] outline-none placeholder:text-muted" />
          {q && <button type="button" onClick={() => setQ("")} aria-label="Suche leeren" className="text-muted"><X size={15} /></button>}
        </label>
        <div className="flex items-center gap-3 text-[13px]">
          <button type="button" onClick={() => setMany(list.map((d) => d.id), st !== "on")} disabled={!list.length} className="inline-flex items-center gap-2 font-semibold disabled:opacity-40"><Box state={st} /> {st === "on" ? "Alle abwählen" : `Alle ${list.length} wählen`}</button>
          <span className="flex-1" />
          <button type="button" onClick={() => setOnly(!only)} aria-pressed={only} className={`rounded-full px-3 py-1 font-semibold ${only ? "bg-fg text-canvas" : "bg-surface-3 text-soft"}`}>Nur ausgewählte</button>
        </div>
      </div>
      {list.length === 0 ? <p className="px-6 py-8 text-center text-[14px] text-muted">Nichts gefunden.</p> : list.slice(0, 300).map((d) => <DocLine key={d.id} d={d} on={sel.has(d.id)} onToggle={() => setMany([d.id], !sel.has(d.id))} />)}
    </div>
  );
}

/** KI-Suche: jede Frage ergänzt die Auswahl um ihre Treffer; einzelne Treffer lassen sich wieder abwählen */
function AiSearch({ byId, sel, setMany }: { byId: Map<string, Doc> } & SelProps) {
  const [q, setQ] = useState("");
  const [rounds, setRounds] = useState<Round[]>([]);
  const busy = rounds.some((r) => r.busy);
  const ask = async () => {
    const query = q.trim();
    if (!query || busy) return;
    setQ("");
    setRounds((r) => [{ q: query, ids: [], busy: true }, ...r]);
    try {
      const res = await authFetch("/api/export/find", { method: "POST", body: JSON.stringify({ q: query }) });
      const j = (await res.json().catch(() => ({}))) as { ids?: string[]; error?: string };
      const ids = (j.ids ?? []).filter((id) => byId.has(id));
      if (ids.length) setMany(ids, true);
      setRounds((r) => r.map((x) => (x.q === query && x.busy ? { q: query, ids, error: res.ok ? undefined : j.error ?? "Die Suche hat nicht geklappt." } : x)));
    } catch {
      setRounds((r) => r.map((x) => (x.q === query && x.busy ? { q: query, ids: [], error: "Die Suche hat nicht geklappt." } : x)));
    }
  };
  return (
    <div className="px-6 py-4">
      <form onSubmit={(e) => { e.preventDefault(); void ask(); }} className="flex items-center gap-2 rounded-[22px] border border-card-line bg-surface p-1.5 pl-4 shadow-card">
        <Sparkles size={16} className="shrink-0 text-brand-500" />
        <input data-own-focus value={q} onChange={(e) => setQ(e.target.value)} placeholder="z. B. alle Dokumente zu meiner Krankenkasse" className="h-9 min-w-0 flex-1 bg-transparent text-[15px] outline-none placeholder:text-muted" />
        <button type="submit" disabled={!q.trim() || busy} aria-label="Suchen" className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-brand-500 text-white disabled:bg-surface-3 disabled:text-muted">{busy ? <Loader2 size={16} className="animate-spin" /> : <ArrowUp size={17} strokeWidth={2.4} />}</button>
      </form>
      {rounds.length === 0 && <p className="mt-4 text-center text-[13.5px] text-muted">Beschreib, was du brauchst – die Treffer kommen direkt in die Auswahl. Weitere Fragen ergänzen sie, einzelne Treffer kannst du wieder abwählen.</p>}
      <div className="mt-4 space-y-4">
        {rounds.map((r, i) => (
          <section key={`${r.q}-${rounds.length - i}`} className="overflow-hidden rounded-2xl border border-card-line">
            <div className="flex items-center gap-2 bg-surface-2 px-4 py-2.5">
              <span className="min-w-0 flex-1 truncate text-[14px] font-semibold">„{r.q}“</span>
              {r.busy ? <Loader2 size={15} className="animate-spin text-muted" /> : r.ids.length > 0 && (
                <button type="button" onClick={() => setMany(r.ids, stateOf(r.ids, sel) !== "on")} className="text-[12.5px] font-semibold text-selected">{stateOf(r.ids, sel) === "on" ? "Alle abwählen" : "Alle wählen"}</button>
              )}
            </div>
            {r.error ? <p className="px-4 py-3 text-[13px] text-negative-text">{r.error}</p>
              : !r.busy && r.ids.length === 0 ? <p className="px-4 py-3 text-[13px] text-muted">Keine passenden Dokumente gefunden.</p>
              : <div className="divide-y divide-line [&>button]:px-4">{r.ids.map((id) => byId.get(id)).filter((d): d is Doc => !!d).map((d) => <DocLine key={d.id} d={d} on={sel.has(d.id)} onToggle={() => setMany([d.id], !sel.has(d.id))} />)}</div>}
          </section>
        ))}
      </div>
    </div>
  );
}
