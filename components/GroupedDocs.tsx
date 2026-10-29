"use client";
import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Check, ChevronDown, Search, Users } from "lucide-react";
import { DocCarousel } from "@/components/DocCarousel";
import { DocRow } from "@/components/DocRow";
import { FilterBar, FilterToggle } from "@/components/ListControls";
import { SenderLogo } from "@/components/SenderLogo";
import { CARD } from "@/components/ui";
import { todos } from "@/lib/actions";
import { chrono, useDocs } from "@/lib/docs";
import { buildPartners, partnerKey } from "@/lib/partners";
import { guessPurpose, PURPOSES, topicsFor } from "@/lib/topics";
import type { Doc } from "@/lib/types";

/**
 * Bereich gruppiert und gefiltert: Abschnitte nach Absender (als Partner zusammengefasst), Thema oder Jahr – aufklappbar.
 * Filter im Seitenpanel zeigen nur Auswahl, die Treffer hat.
 * Abschnitte mit offenen Aufgaben stehen oben. Die Suche durchsucht alles, auch Eingeklapptes.
 */
type GroupBy = "topic" | "sender" | "year";
const GROUPS: { id: GroupBy; label: string }[] = [{ id: "topic", label: "Thema" }, { id: "sender", label: "Absender" }, { id: "year", label: "Jahr" }];
const dateOf = (d: Doc) => d.doc_date ?? d.received_at.slice(0, 10);
type Range = "all" | "year" | "12m";
type Filter = { purposes: string[]; topics: string[]; sender: string; range: Range; encOnly: boolean };
const NONE: Filter = { purposes: [], topics: [], sender: "", range: "all", encOnly: false };

export function GroupedDocs({ cluster, view }: { cluster: string; view: "cards" | "list" }) {
  const { docs: visible } = useDocs();
  const docs = useMemo(() => visible.filter((d) => d.cluster === cluster && !d.archived), [visible, cluster]);
  const key = `lifevault:group2:${cluster}`;
  const [by, setBy] = useState<GroupBy>(cluster === "gesundheit" ? "topic" : "sender");
  useEffect(() => { try { const v = localStorage.getItem(key) as GroupBy | null; if (v && GROUPS.some((g) => g.id === v)) setBy(v); } catch { /* egal */ } }, [key]);
  const pickBy = (g: GroupBy) => { setBy(g); setClosed([]); try { localStorage.setItem(key, g); } catch { /* egal */ } };

  const [q, setQ] = useState("");
  const [f, setF] = useState<Filter>(NONE);
  const set = (p: Partial<Filter>) => setF((x) => ({ ...x, ...p }));
  const [closed, setClosed] = useState<string[]>([]);

  // Zweck je Dokument: „erledigt“, wenn nichts mehr offen ist
  const today = new Date().toISOString().slice(0, 10);
  const openIds = useMemo(() => new Set(todos(docs, today, { pastDays: 3650, aheadDays: 3650 }).map((t) => t.doc.id)), [docs, today]);
  const purposeOf = (d: Doc) => { const p = d.purpose ?? guessPurpose(d); return p === "zu_erledigen" && !openIds.has(d.id) ? "erledigt" : p; };
  const topicOf = (d: Doc) => d.topic ?? "Noch nicht eingeordnet";
  // Absender als Partner: „Mercedes-Benz AG“, „Mercedes-Benz Group AG“ … → ein Partner „Mercedes-Benz“
  const partners = useMemo(() => new Map(buildPartners(docs).map((p) => [p.key, p])), [docs]);
  const senderOf = (d: Doc) => (d.sender ? partnerKey(d.sender) : "");
  const senderName = (k: string) => partners.get(k)?.name ?? (k || "Ohne Absender");

  const term = q.trim().toLowerCase();
  const from = f.range === "year" ? `${today.slice(0, 4)}-01-01` : f.range === "12m" ? new Date(Date.now() - 365 * 86_400_000).toISOString().slice(0, 10) : "";
  // ein Filter ausgelassen: daraus ergeben sich die Auswahlmöglichkeiten, die noch Treffer haben
  const match = (d: Doc, skip?: keyof Filter) =>
    (skip === "purposes" || !f.purposes.length || f.purposes.includes(purposeOf(d))) &&
    (skip === "topics" || !f.topics.length || f.topics.includes(topicOf(d))) &&
    (skip === "sender" || !f.sender || senderOf(d) === f.sender) &&
    (skip === "range" || !from || dateOf(d) >= from) &&
    (!f.encOnly || d.encrypted) &&
    (!term || `${d.title ?? ""} ${d.file_name} ${d.sender ?? ""} ${d.doc_type ?? ""} ${d.topic ?? ""} ${(d.tags ?? []).join(" ")}`.toLowerCase().includes(term));
  const list = docs.filter((d) => match(d));
  const countBy = (skip: keyof Filter, val: (d: Doc) => string) => {
    const m = new Map<string, number>();
    for (const d of docs) if (match(d, skip)) m.set(val(d), (m.get(val(d)) ?? 0) + 1);
    return m;
  };

  const labelOf = (d: Doc) => by === "topic" ? topicOf(d) : by === "sender" ? senderName(senderOf(d)) : dateOf(d).slice(0, 4);
  const sections = useMemo(() => {
    const map = new Map<string, Doc[]>();
    for (const d of list) map.set(labelOf(d), [...(map.get(labelOf(d)) ?? []), d]);
    const order = (l: string) => by === "topic" ? (topicsFor(cluster).indexOf(l) + 1 || 99) : 0;
    return [...map.entries()].map(([label, ds]) => ({ label, docs: ds.sort((a, b) => dateOf(b).localeCompare(dateOf(a))), open: ds.filter((d) => openIds.has(d.id)).length, partner: by === "sender" ? partners.get(senderOf(ds[0])) : undefined }))
      // offene Aufgaben zuerst; Jahre absteigend, sonst nach Anzahl
      .sort((a, b) => Number(b.open > 0) - Number(a.open > 0) || (by === "year" ? b.label.localeCompare(a.label) : b.docs.length - a.docs.length || order(a.label) - order(b.label) || a.label.localeCompare(b.label, "de")));
  }, [list, by]); // eslint-disable-line react-hooks/exhaustive-deps

  // nur Auswahl mit Treffern anzeigen (z. B. kein leeres „Betriebsrat“)
  const purposeN = countBy("purposes", purposeOf);
  const topicN = countBy("topics", topicOf);
  const senderN = countBy("sender", senderOf);
  const purposeOpts = PURPOSES.filter((p) => purposeN.get(p.id) || f.purposes.includes(p.id));
  const topicOpts = [...topicN.keys()].concat(f.topics.filter((t) => !topicN.has(t))).sort((a, b) => (topicN.get(b) ?? 0) - (topicN.get(a) ?? 0) || a.localeCompare(b, "de"));
  const senders = [...senderN.entries()].filter(([k]) => k).map(([k, n]) => { const p = partners.get(k); return { key: k, name: p?.name ?? k, n, domain: p?.domain ?? null, cluster: p?.cluster ?? cluster }; }).sort((a, b) => b.n - a.n || a.name.localeCompare(b.name, "de"));
  const active = Number(f.purposes.length > 0) + Number(f.topics.length > 0) + Number(!!f.sender) + Number(f.range !== "all") + Number(f.encOnly);
  const toggle = (arr: string[], v: string) => (arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);
  const chip = (on: boolean) => `inline-flex h-9 items-center gap-1.5 rounded-full px-3.5 text-[13px] font-semibold transition-colors ${on ? "bg-fg text-canvas" : "bg-surface-3 text-soft hover:text-fg"}`;
  const n = (v?: number) => <span className="tnum text-[11.5px] opacity-60">{v ?? 0}</span>;

  if (!docs.length) return <p className={`${CARD} p-6 text-center text-[14px] text-muted`}>Noch keine Dokumente in diesem Bereich.</p>;
  return (
    <div className="space-y-4">
      {/* Steuerung schlicht: Suche + „Filter“; Gruppieren und alle Filter im Seitenpanel rechts */}
      <FilterBar q={q} onQ={setQ} placeholder="In diesem Bereich suchen" activeCount={active} onReset={() => setF(NONE)} count={`${list.length} von ${docs.length} Dokumenten`}>
        <Group label="Sortieren nach">{GROUPS.map((g) => <button key={g.id} type="button" onClick={() => pickBy(g.id)} aria-pressed={by === g.id} className={chip(by === g.id)}>{g.label}</button>)}</Group>
        {senders.length > 1 && <SenderPick value={f.sender} onChange={(v) => set({ sender: v })} options={senders} />}
        {topicOpts.length > 1 && <Group label="Thema">{topicOpts.map((t) => <button key={t} type="button" onClick={() => set({ topics: toggle(f.topics, t) })} aria-pressed={f.topics.includes(t)} className={chip(f.topics.includes(t))}>{t} {n(topicN.get(t))}</button>)}</Group>}
        {purposeOpts.length > 1 && <Group label="Status">{purposeOpts.map((p) => <button key={p.id} type="button" title={p.hint} onClick={() => set({ purposes: toggle(f.purposes, p.id) })} aria-pressed={f.purposes.includes(p.id)} className={chip(f.purposes.includes(p.id))}>{p.label} {n(purposeN.get(p.id))}</button>)}</Group>}
        <Group label="Zeitraum">{(["all", "year", "12m"] as const).map((r) => <button key={r} type="button" onClick={() => set({ range: r })} aria-pressed={f.range === r} className={chip(f.range === r)}>{r === "all" ? "Alle" : r === "year" ? "Dieses Jahr" : "Letzte 12 Monate"}</button>)}</Group>
        {docs.some((d) => d.encrypted) && <FilterToggle label="Nur verschlüsselte" on={f.encOnly} onChange={(v) => set({ encOnly: v })} />}
      </FilterBar>

      {sections.length === 0 && <p className={`${CARD} p-6 text-center text-[14px] text-muted`}>Nichts gefunden – Filter zurücksetzen?</p>}
      {sections.map((s) => {
        const isOpen = !closed.includes(s.label) || !!term;
        return (
          <section key={s.label} className={`${CARD} overflow-hidden`}>
            <button type="button" aria-expanded={isOpen} onClick={() => setClosed((c) => (c.includes(s.label) ? c.filter((x) => x !== s.label) : [...c, s.label]))} className="flex w-full items-center gap-2.5 px-4 py-3.5 text-left hover:bg-surface-2/60">
              {s.partner && <SenderLogo domain={s.partner.domain} sender={s.partner.name} cluster={s.partner.cluster} size={30} />}
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

function Group({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <span className="mb-2 block text-[13px] font-semibold text-soft">{label}</span>
      <div className="flex flex-wrap gap-1.5">{children}</div>
    </div>
  );
}

/** Absender-Auswahl mit Partner-Logos: zugeklappt die Auswahl, aufgeklappt Liste mit Suche */
function SenderPick({ value, onChange, options }: { value: string; onChange: (v: string) => void; options: { key: string; name: string; n: number; domain: string | null; cluster: string | null }[] }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const cur = options.find((o) => o.key === value);
  const list = options.filter((o) => !q.trim() || o.name.toLowerCase().includes(q.trim().toLowerCase()));
  const pick = (v: string) => { onChange(v); setOpen(false); setQ(""); };
  const row = (sel: boolean) => `flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-left text-[14px] hover:bg-surface-2 ${sel ? "bg-surface-2 font-semibold" : ""}`;
  return (
    <div>
      <span className="mb-2 block text-[13px] font-semibold text-soft">Absender</span>
      <div className={`overflow-hidden rounded-2xl border ${value ? "border-fg" : "border-card-line"} bg-surface`}>
        <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} className="flex w-full items-center gap-3 px-3 py-2.5 text-left">
          {cur ? <SenderLogo domain={cur.domain} sender={cur.name} cluster={cur.cluster} size={32} /> : <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-surface-3 text-soft"><Users size={16} /></span>}
          <span className="min-w-0 flex-1 truncate text-[14.5px] font-semibold">{cur?.name ?? "Alle Absender"}</span>
          <ChevronDown size={17} className={`shrink-0 text-muted transition-transform ${open ? "rotate-180" : ""}`} />
        </button>
        {open && (
          <div className="border-t border-line p-1.5">
            {options.length > 6 && (
              <label className="mb-1 flex h-9 items-center gap-2 rounded-full bg-surface-2 px-3">
                <Search size={14} className="text-muted" />
                <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Absender suchen" className="min-w-0 flex-1 bg-transparent text-[13.5px] outline-none placeholder:text-muted" />
              </label>
            )}
            <div className="max-h-72 overflow-y-auto">
              <button type="button" onClick={() => pick("")} className={row(!value)}>
                <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-surface-3 text-soft"><Users size={14} /></span>
                <span className="flex-1">Alle Absender</span>{!value && <Check size={16} />}
              </button>
              {list.map((o) => (
                <button key={o.key} type="button" onClick={() => pick(o.key)} className={row(o.key === value)}>
                  <SenderLogo domain={o.domain} sender={o.name} cluster={o.cluster} size={28} />
                  <span className="min-w-0 flex-1 truncate">{o.name}</span>
                  <span className="tnum text-[12px] text-muted">{o.n}</span>
                  {o.key === value && <Check size={16} />}
                </button>
              ))}
              {!list.length && <p className="px-3 py-2 text-[13px] text-muted">Kein Absender gefunden.</p>}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
