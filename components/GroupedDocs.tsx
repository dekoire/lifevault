"use client";
import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, ChevronDown, Lock, Search, X } from "lucide-react";
import { DocCarousel } from "@/components/DocCarousel";
import { DocRow } from "@/components/DocRow";
import { CARD } from "@/components/ui";
import { todos } from "@/lib/actions";
import { chrono, useDocs } from "@/lib/docs";
import { relatedPayDocs } from "@/lib/related";
import { guessPurpose, PURPOSES, topicsFor } from "@/lib/topics";
import type { Doc } from "@/lib/types";

/**
 * Bereich gruppiert und gefiltert: Abschnitte nach Thema, Zweck, Absender, Zeit oder Vorgang – aufklappbar.
 * Abschnitte mit offenen Aufgaben stehen oben. Die Suche durchsucht alles, auch Eingeklapptes.
 */
type GroupBy = "topic" | "purpose" | "sender" | "year" | "case";
const GROUPS: { id: GroupBy; label: string }[] = [
  { id: "topic", label: "Thema" }, { id: "purpose", label: "Zweck" }, { id: "sender", label: "Absender" }, { id: "year", label: "Zeit" }, { id: "case", label: "Vorgang" },
];
const defaultGroup = (cluster: string): GroupBy => (cluster === "gesundheit" ? "topic" : cluster === "rechnungen" ? "case" : "purpose");
const dateOf = (d: Doc) => d.doc_date ?? d.received_at.slice(0, 10);
type Range = "all" | "year" | "12m";

export function GroupedDocs({ cluster, view }: { cluster: string; view: "cards" | "list" }) {
  const { docs: visible } = useDocs();
  const docs = useMemo(() => visible.filter((d) => d.cluster === cluster && !d.archived), [visible, cluster]);
  const key = `lifevault:group:${cluster}`;
  const [by, setBy] = useState<GroupBy>(defaultGroup(cluster));
  useEffect(() => { try { const v = localStorage.getItem(key) as GroupBy | null; if (v && GROUPS.some((g) => g.id === v)) setBy(v); } catch { /* egal */ } }, [key]);
  const pickBy = (g: GroupBy) => { setBy(g); setClosed([]); try { localStorage.setItem(key, g); } catch { /* egal */ } };

  const [q, setQ] = useState("");
  const [purposes, setPurposes] = useState<string[]>([]);
  const [topics, setTopics] = useState<string[]>([]);
  const [sender, setSender] = useState("");
  const [range, setRange] = useState<Range>("all");
  const [encOnly, setEncOnly] = useState(false);
  const [closed, setClosed] = useState<string[]>([]);

  // Zweck je Dokument: „erledigt“, wenn nichts mehr offen ist
  const today = new Date().toISOString().slice(0, 10);
  const openIds = useMemo(() => new Set(todos(docs, today, { pastDays: 3650, aheadDays: 3650 }).map((t) => t.doc.id)), [docs, today]);
  const purposeOf = (d: Doc) => { const p = d.purpose ?? guessPurpose(d); return p === "zu_erledigen" && !openIds.has(d.id) ? "erledigt" : p; };
  const topicOf = (d: Doc) => d.topic ?? "Noch nicht eingeordnet";

  const term = q.trim().toLowerCase();
  const from = range === "year" ? `${today.slice(0, 4)}-01-01` : range === "12m" ? new Date(Date.now() - 365 * 86_400_000).toISOString().slice(0, 10) : "";
  const list = docs.filter((d) =>
    (!purposes.length || purposes.includes(purposeOf(d))) &&
    (!topics.length || topics.includes(topicOf(d))) &&
    (!sender || d.sender === sender) &&
    (!from || dateOf(d) >= from) &&
    (!encOnly || d.encrypted) &&
    (!term || `${d.title ?? ""} ${d.file_name} ${d.sender ?? ""} ${d.doc_type ?? ""} ${d.topic ?? ""} ${(d.tags ?? []).join(" ")}`.toLowerCase().includes(term)));

  // Vorgänge: Schreiben zum selben Zahlungs-Vorgang zusammenfassen
  const caseKey = useMemo(() => {
    const m = new Map<string, string>();
    for (const d of chrono(docs).reverse()) {
      if (m.has(d.id)) continue;
      const rel = relatedPayDocs(d, docs);
      const label = `${d.sender ?? "Ohne Absender"} – ${d.doc_type ?? d.title ?? "Vorgang"} ${dateOf(d).slice(0, 7).split("-").reverse().join(".")}`;
      for (const x of [d, ...rel]) if (!m.has(x.id)) m.set(x.id, rel.length ? label : `${d.sender ?? "Ohne Absender"} – Einzelschreiben`);
    }
    return m;
  }, [docs]);

  const labelOf = (d: Doc) => by === "topic" ? topicOf(d) : by === "purpose" ? PURPOSES.find((p) => p.id === purposeOf(d))!.label : by === "sender" ? d.sender ?? "Ohne Absender" : by === "year" ? dateOf(d).slice(0, 4) : caseKey.get(d.id) ?? "Sonstiges";
  const sections = useMemo(() => {
    const map = new Map<string, Doc[]>();
    for (const d of list) map.set(labelOf(d), [...(map.get(labelOf(d)) ?? []), d]);
    const order = (l: string) => by === "purpose" ? PURPOSES.findIndex((p) => p.label === l) : by === "topic" ? (topicsFor(cluster).indexOf(l) + 1 || 99) : 0;
    return [...map.entries()].map(([label, ds]) => ({ label, docs: ds.sort((a, b) => dateOf(b).localeCompare(dateOf(a))), open: ds.filter((d) => openIds.has(d.id)).length }))
      // offene Aufgaben zuerst, dann feste Reihenfolge (Zweck/Thema), Zeit absteigend, sonst nach Anzahl
      .sort((a, b) => Number(b.open > 0) - Number(a.open > 0) || (by === "year" ? b.label.localeCompare(a.label) : order(a.label) - order(b.label) || b.docs.length - a.docs.length || a.label.localeCompare(b.label, "de")));
  }, [list, by]); // eslint-disable-line react-hooks/exhaustive-deps

  const topicOpts = [...new Set(docs.map(topicOf))].sort((a, b) => (topicsFor(cluster).indexOf(a) + 1 || 99) - (topicsFor(cluster).indexOf(b) + 1 || 99));
  const senders = [...new Set(docs.map((d) => d.sender).filter((s): s is string => !!s))].sort((a, b) => a.localeCompare(b, "de"));
  const filtered = purposes.length + topics.length + Number(!!sender) + Number(range !== "all") + Number(encOnly) > 0;
  const toggle = (arr: string[], set: (v: string[]) => void, v: string) => set(arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);
  const chip = (on: boolean) => `inline-flex h-8 shrink-0 items-center gap-1 rounded-full px-3 text-[12.5px] font-semibold transition-colors ${on ? "bg-fg text-canvas" : "bg-surface-3 text-soft hover:text-fg"}`;

  if (!docs.length) return <p className={`${CARD} p-6 text-center text-[14px] text-muted`}>Noch keine Dokumente in diesem Bereich.</p>;
  return (
    <div className="space-y-4">
      {/* Steuerung: Suche, Gruppieren nach, Filter */}
      <section className={`${CARD} space-y-3 p-4`}>
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex h-10 min-w-[12rem] flex-1 items-center gap-2 rounded-full border border-card-line bg-surface px-3.5">
            <Search size={16} className="shrink-0 text-muted" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="In diesem Bereich suchen" className="h-full min-w-0 flex-1 bg-transparent text-[14px] outline-none placeholder:text-muted" />
            {q && <button type="button" onClick={() => setQ("")} aria-label="Suche leeren" className="text-muted hover:text-fg"><X size={15} /></button>}
          </label>
          <span className="inline-flex flex-wrap items-center gap-1 rounded-full bg-surface-3 p-1">
            <span className="px-2 text-[12px] font-semibold text-muted">Gruppieren</span>
            {GROUPS.map((g) => <button key={g.id} type="button" onClick={() => pickBy(g.id)} aria-pressed={by === g.id} className={`h-8 rounded-full px-3 text-[12.5px] font-semibold ${by === g.id ? "bg-surface text-fg shadow-card" : "text-soft hover:text-fg"}`}>{g.label}</button>)}
          </span>
        </div>
        <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-0.5 [scrollbar-width:none]">
          {PURPOSES.map((p) => <button key={p.id} type="button" title={p.hint} onClick={() => toggle(purposes, setPurposes, p.id)} className={chip(purposes.includes(p.id))}>{p.label}</button>)}
          <span className="mx-1 w-px shrink-0 bg-line" />
          {(["all", "year", "12m"] as const).map((r) => <button key={r} type="button" onClick={() => setRange(r)} className={chip(range === r)}>{r === "all" ? "Alle Zeit" : r === "year" ? "Dieses Jahr" : "12 Monate"}</button>)}
          {docs.some((d) => d.encrypted) && <><span className="mx-1 w-px shrink-0 bg-line" /><button type="button" onClick={() => setEncOnly(!encOnly)} className={chip(encOnly)}><Lock size={12} /> Verschlüsselt</button></>}
        </div>
        {topicOpts.length > 1 && (
          <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-0.5 [scrollbar-width:none]">
            {topicOpts.map((t) => <button key={t} type="button" onClick={() => toggle(topics, setTopics, t)} className={chip(topics.includes(t))}>{t}</button>)}
          </div>
        )}
        <div className="flex flex-wrap items-center gap-2">
          {senders.length > 1 && (
            <select value={sender} onChange={(e) => setSender(e.target.value)} className="h-9 max-w-[16rem] rounded-full border border-card-line bg-surface px-3 text-[13px] font-semibold">
              <option value="">Alle Absender</option>
              {senders.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          )}
          <span className="ml-auto text-[12.5px] text-muted">{list.length} von {docs.length}{filtered && <> · <button type="button" onClick={() => { setPurposes([]); setTopics([]); setSender(""); setRange("all"); setEncOnly(false); }} className="font-semibold text-selected">Filter zurücksetzen</button></>}</span>
        </div>
      </section>

      {sections.length === 0 && <p className={`${CARD} p-6 text-center text-[14px] text-muted`}>Nichts gefunden – Filter zurücksetzen?</p>}
      {sections.map((s) => {
        const isOpen = !closed.includes(s.label) || !!term;
        return (
          <section key={s.label} className={`${CARD} overflow-hidden`}>
            <button type="button" aria-expanded={isOpen} onClick={() => setClosed((c) => (c.includes(s.label) ? c.filter((x) => x !== s.label) : [...c, s.label]))} className="flex w-full items-center gap-2.5 px-4 py-3.5 text-left hover:bg-surface-2/60">
              <span className="min-w-0 flex-1 truncate text-[15.5px] font-semibold">{s.label}</span>
              {s.open > 0 && <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-negative/10 px-2 py-0.5 text-[11.5px] font-semibold text-negative-text"><AlertTriangle size={11} /> {s.open} offen</span>}
              <span className="tnum shrink-0 rounded-full bg-surface-2 px-2 py-px text-[12px] font-semibold text-soft">{s.docs.length}</span>
              <ChevronDown size={17} className={`shrink-0 text-muted transition-transform ${isOpen ? "rotate-180" : ""}`} />
            </button>
            {isOpen && (view === "list"
              ? <div className="divide-y divide-line border-t border-line">{s.docs.map((d) => <DocRow key={d.id} d={d} />)}</div>
              : <div className="border-t border-line px-4 pt-3 pb-4"><DocCarousel docs={chrono(s.docs)} /></div>)}
          </section>
        );
      })}
    </div>
  );
}
