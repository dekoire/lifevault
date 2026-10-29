"use client";
import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Building2, Download, X, CalendarDays, Check, ChevronDown, Search, Tag, Users, type LucideIcon } from "lucide-react";
import { DocCarousel } from "@/components/DocCarousel";
import { DocRow } from "@/components/DocRow";
import { Box, stateOf } from "@/components/ExportSheet";
import { FilterBar, FilterSelect, FilterToggle } from "@/components/ListControls";
import { KINDS, kindOf } from "@/lib/kinds";
import { SenderLogo } from "@/components/SenderLogo";
import { CARD } from "@/components/ui";
import { todos } from "@/lib/actions";
import { chrono, useDocs } from "@/lib/docs";
import { EXPORT_FORMATS, newPassword, startExport, type ExportFormat } from "@/lib/jobs";
import { groupOf, LABEL_GROUPS } from "@/lib/labels";
import { useMe } from "@/lib/me";
import { buildPartners, partnerKey } from "@/lib/partners";
import { guessPurpose, PURPOSES } from "@/lib/topics";
import type { Doc } from "@/lib/types";

/**
 * Bereich chronologisch: Abschnitte je Jahr (aufklappbar), wahlweise darin nach Absender (als Partner) oder Thema unterteilt.
 * Filter im Seitenpanel zeigen nur Auswahl, die Treffer hat.
 * Abschnitte mit offenen Aufgaben stehen oben. Die Suche durchsucht alles, auch Eingeklapptes.
 */
// immer chronologisch nach Jahr; optional innerhalb des Jahres unterteilt
type Sub = "" | "sender" | "topic" | "kind";
const SUBS: { value: Sub; label: string }[] = [{ value: "", label: "Nicht unterteilen" }, { value: "sender", label: "Absender" }, { value: "topic", label: "Thema" }, { value: "kind", label: "Art" }];
const dateOf = (d: Doc) => d.doc_date ?? d.received_at.slice(0, 10);
type Range = "all" | "year" | "12m";
type Filter = { kind: string; purpose: string; topic: string; label: string; sender: string; range: Range; year: string; encOnly: boolean };
const NONE: Filter = { kind: "", purpose: "", topic: "", label: "", sender: "", range: "all", year: "", encOnly: false };
type SortBy = "new" | "old" | "sender" | "title";
const SORTS: { value: SortBy; label: string }[] = [{ value: "old", label: "Älteste zuerst" }, { value: "sender", label: "Absender A–Z" }, { value: "title", label: "Titel A–Z" }];

export function GroupedDocs({ cluster, view }: { cluster: string; view: "cards" | "list" }) {
  const { docs: visible } = useDocs();
  const docs = useMemo(() => visible.filter((d) => d.cluster === cluster && !d.archived), [visible, cluster]);
  const key = `lifevault:sub:${cluster}`;
  const [sub, setSub] = useState<Sub>("");
  useEffect(() => { try { const v = localStorage.getItem(key) as Sub | null; if (v && SUBS.some((g) => g.value === v)) setSub(v); } catch { /* egal */ } }, [key]);
  const pickSub = (g: Sub) => { setSub(g); try { localStorage.setItem(key, g); } catch { /* egal */ } };

  const [q, setQ] = useState("");
  const [f, setF] = useState<Filter>(NONE);
  const set = (p: Partial<Filter>) => setF((x) => ({ ...x, ...p }));
  const [closed, setClosed] = useState<string[]>([]);
  const [sortBy, setSortBy] = useState<SortBy>("new");
  // Auswahl zum Export: Kästchen links vor dem Logo, unten eine Leiste
  const [picking, setPicking] = useState(false);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [pickFormat, setPickFormat] = useState<ExportFormat>("files");
  const { unlocked } = useMe();
  const pickMany = (ids: string[], on: boolean) => setPicked((s) => { const n = new Set(s); for (const id of ids) (on ? n.add(id) : n.delete(id)); return n; });
  const stopPicking = () => { setPicking(false); setPicked(new Set()); };

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
    (skip === "kind" || !f.kind || kindOf(d).id === f.kind) &&
    (skip === "purpose" || !f.purpose || purposeOf(d) === f.purpose) &&
    (skip === "topic" || !f.topic || topicOf(d) === f.topic) &&
    (skip === "label" || !f.label || (d.labels ?? []).includes(f.label)) &&
    (skip === "sender" || !f.sender || senderOf(d) === f.sender) &&
    (skip === "range" || !from || dateOf(d) >= from) &&
    (skip === "year" || !f.year || dateOf(d).startsWith(f.year)) &&
    (!f.encOnly || d.encrypted) &&
    (!term || `${d.title ?? ""} ${d.file_name} ${d.sender ?? ""} ${d.doc_type ?? ""} ${d.topic ?? ""} ${(d.tags ?? []).join(" ")} ${(d.labels ?? []).join(" ")}`.toLowerCase().includes(term));
  const list = docs.filter((d) => match(d));
  const countBy = (skip: keyof Filter, val: (d: Doc) => string) => {
    const m = new Map<string, number>();
    for (const d of docs) if (match(d, skip)) m.set(val(d), (m.get(val(d)) ?? 0) + 1);
    return m;
  };

  // Jahre absteigend, darin neueste zuerst; optional Unterabschnitte (größte zuerst)
  const sections = useMemo(() => {
    const years = new Map<string, Doc[]>();
    for (const d of list) years.set(dateOf(d).slice(0, 4), [...(years.get(dateOf(d).slice(0, 4)) ?? []), d]);
    const cmp = (a: Doc, b: Doc) => sortBy === "old" ? dateOf(a).localeCompare(dateOf(b)) : sortBy === "sender" ? (a.sender ?? "￿").localeCompare(b.sender ?? "￿", "de") || dateOf(b).localeCompare(dateOf(a)) : sortBy === "title" ? (a.title ?? a.file_name).localeCompare(b.title ?? b.file_name, "de") : dateOf(b).localeCompare(dateOf(a));
    return [...years.entries()].sort((a, b) => (sortBy === "old" ? a[0].localeCompare(b[0]) : b[0].localeCompare(a[0]))).map(([year, ds]) => {
      ds.sort(cmp);
      const groups = new Map<string, Doc[]>();
      if (sub) for (const d of ds) { const k = sub === "sender" ? senderOf(d) : sub === "kind" ? kindOf(d).label : topicOf(d); groups.set(k, [...(groups.get(k) ?? []), d]); }
      return {
        year, docs: ds, open: ds.filter((d) => openIds.has(d.id)).length,
        groups: [...groups.entries()].sort((a, b) => b[1].length - a[1].length).map(([k, gd]) => ({ key: k, label: sub === "sender" ? senderName(k) : k, partner: sub === "sender" ? partners.get(k) : undefined, docs: gd })),
      };
    });
  }, [list, sub, sortBy]); // eslint-disable-line react-hooks/exhaustive-deps

  // nur Auswahl mit Treffern anzeigen (z. B. kein leeres „Betriebsrat“)
  const purposeN = countBy("purpose", purposeOf);
  const kindN = countBy("kind", (d) => kindOf(d).id);
  const kindOpts = KINDS.filter((k) => kindN.get(k.id) || f.kind === k.id).map((k) => ({ value: k.id, label: `${k.label} (${kindN.get(k.id) ?? 0})` }));
  const topicN = countBy("topic", topicOf);
  const senderN = countBy("sender", senderOf);
  const purposeOpts = PURPOSES.filter((p) => purposeN.get(p.id) || f.purpose === p.id).map((p) => ({ value: p.id, label: `${p.label} (${purposeN.get(p.id) ?? 0})` }));
  const topicOpts = [...topicN.keys()].sort((a, b) => (topicN.get(b) ?? 0) - (topicN.get(a) ?? 0) || a.localeCompare(b, "de")).map((t) => ({ value: t, label: `${t} (${topicN.get(t)})` }));
  const senders = [...senderN.entries()].filter(([k]) => k).map(([k, n]) => { const p = partners.get(k); return { key: k, name: p?.name ?? k, n, domain: p?.domain ?? null, cluster: p?.cluster ?? cluster }; }).sort((a, b) => b.n - a.n || a.name.localeCompare(b.name, "de"));
  const labelN = new Map<string, number>();
  for (const d of docs) if (match(d, "label")) for (const t of d.labels ?? []) labelN.set(t, (labelN.get(t) ?? 0) + 1);
  const yearN = countBy("year", (d) => dateOf(d).slice(0, 4));
  const active = Number(!!f.kind) + Number(!!f.year) + Number(!!f.label) + Number(!!f.purpose) + Number(!!f.topic) + Number(!!f.sender) + Number(f.range !== "all") + Number(f.encOnly);
  const lockedN = unlocked ? 0 : docs.filter((d) => picked.has(d.id) && d.encrypted).length;
  const rows = (ds: Doc[]) => picking
    ? <div className="divide-y divide-line">{ds.map((d) => (
        <div key={d.id} role="checkbox" aria-checked={picked.has(d.id)} tabIndex={0} onClick={() => pickMany([d.id], !picked.has(d.id))} onKeyDown={(e) => { if (e.key === " " || e.key === "Enter") { e.preventDefault(); pickMany([d.id], !picked.has(d.id)); } }} className={`flex w-full cursor-pointer items-center gap-3 pl-4 text-left ${picked.has(d.id) ? "bg-brand-500/[0.06]" : ""}`}>
          <Box state={picked.has(d.id) ? "on" : "off"} />
          <span className="pointer-events-none min-w-0 flex-1 [&>a]:pl-0">{<DocRow d={d} />}</span>
        </div>
      ))}</div>
    : view === "list"
    ? <div className="divide-y divide-line">{ds.map((d) => <DocRow key={d.id} d={d} />)}</div>
    : <DocCarousel docs={ds} grid />;
  // Liste in einer Kachel, Karten frei im Raster
  const block = (ds: Doc[]) => (picking || view === "list" ? <div className={`${CARD} overflow-hidden`}>{rows(ds)}</div> : rows(ds));

  if (!docs.length) return <p className={`${CARD} p-6 text-center text-[14px] text-muted`}>Noch keine Dokumente in diesem Bereich.</p>;
  return (
    <div className="space-y-6">
      {/* Steuerung schlicht: Suche + „Filter“; alles Weitere als Auswahlfelder im Seitenpanel rechts */}
      <FilterBar q={q} onQ={setQ} placeholder="In diesem Bereich suchen" actions={<button type="button" onClick={() => (picking ? stopPicking() : setPicking(true))} aria-pressed={picking} className={`inline-flex h-11 shrink-0 items-center gap-2 rounded-full border px-4 text-[14px] font-semibold ${picking ? "border-brand-500 bg-brand-500 text-white" : "border-card-line bg-surface text-fg hover:bg-surface-2"}`}><Download size={16} /> Export</button>} activeCount={active} onReset={() => setF(NONE)} count={`${list.length} von ${docs.length} Dokumenten`}>
        <FilterSelect label="Sortieren" value={sortBy === "new" ? "" : sortBy} onChange={(v) => setSortBy((v || "new") as SortBy)} options={SORTS} empty="Neueste zuerst" />
        {yearN.size > 1 && <FilterSelect label="Jahr" value={f.year} onChange={(v) => set({ year: v })} options={[...yearN.entries()].sort((a, b) => b[0].localeCompare(a[0])).map(([y, n]) => ({ value: y, label: `${y} (${n})` }))} />}
        <FilterSelect label="Je Jahr unterteilen nach" value={sub} onChange={(v) => pickSub(v as Sub)} options={SUBS.slice(1)} empty="Nicht unterteilen" />
        {senders.length > 1 && <SenderPick value={f.sender} onChange={(v) => set({ sender: v })} options={senders} />}
        {kindOpts.length > 1 && <FilterSelect label="Art" value={f.kind} onChange={(v) => set({ kind: v })} options={kindOpts} />}
        {topicOpts.length > 1 && <FilterSelect label="Thema" value={f.topic} onChange={(v) => set({ topic: v })} options={topicOpts} />}
        {labelN.size > 0 && <LabelPick value={f.label} onChange={(v) => set({ label: v })} counts={labelN} />}
        {purposeOpts.length > 1 && <FilterSelect label="Status" value={f.purpose} onChange={(v) => set({ purpose: v })} options={purposeOpts} />}
        <FilterSelect label="Zeitraum" value={f.range === "all" ? "" : f.range} onChange={(v) => set({ range: (v || "all") as Range })} options={[{ value: "year", label: "Dieses Jahr" }, { value: "12m", label: "Letzte 12 Monate" }]} />
        {docs.some((d) => d.encrypted) && <FilterToggle label="Nur verschlüsselte" on={f.encOnly} onChange={(v) => set({ encOnly: v })} />}
      </FilterBar>
      {active > 0 && (
        <div className="-mt-3 flex flex-wrap items-center gap-1.5">
          {[
            f.kind && { k: "kind", text: KINDS.find((k) => k.id === f.kind)?.label ?? f.kind, color: KINDS.find((k) => k.id === f.kind)?.color },
            f.year && { k: "year", text: f.year },
            f.sender && { k: "sender", text: senders.find((x) => x.key === f.sender)?.name ?? f.sender },
            f.topic && { k: "topic", text: f.topic },
            f.label && { k: "label", text: f.label, color: groupOf(f.label)?.color },
            f.purpose && { k: "purpose", text: PURPOSES.find((p) => p.id === f.purpose)?.label ?? f.purpose },
            f.range !== "all" && { k: "range", text: f.range === "year" ? "Dieses Jahr" : "Letzte 12 Monate" },
            f.encOnly && { k: "encOnly", text: "Nur verschlüsselte" },
          ].filter((c): c is { k: keyof Filter; text: string; color?: string } => !!c).map((c) => (
            <button key={c.k} type="button" onClick={() => set({ [c.k]: NONE[c.k] } as Partial<Filter>)} className="inline-flex h-8 items-center gap-1.5 rounded-full border border-card-line bg-surface pr-2 pl-3 text-[12.5px] font-semibold hover:bg-surface-2" style={c.color ? { color: c.color, borderColor: `${c.color}55`, background: `${c.color}12` } : undefined}>
              {c.text}<X size={13} className="opacity-60" />
            </button>
          ))}
          <button type="button" onClick={() => setF(NONE)} className="h-8 px-2 text-[12.5px] font-semibold text-selected">Alle zurücksetzen</button>
        </div>
      )}
      {picking && (
        <div className="flex items-center gap-3 rounded-2xl bg-brand-500/[0.08] px-4 py-2.5 text-[14px]">
          <button type="button" onClick={() => pickMany(list.map((d) => d.id), stateOf(list.map((d) => d.id), picked) !== "on")} className="inline-flex items-center gap-2.5 font-semibold">
            <Box state={stateOf(list.map((d) => d.id), picked)} /> {stateOf(list.map((d) => d.id), picked) === "on" ? "Alle abwählen" : `Alle ${list.length} auswählen`}
          </button>
          <span className="ml-auto text-[13px] text-soft">Antippen zum Aus- oder Abwählen</span>
        </div>
      )}

      {sections.length === 0 && <p className={`${CARD} p-6 text-center text-[14px] text-muted`}>Nichts gefunden – Filter zurücksetzen?</p>}
      {sections.map((s) => {
        const isOpen = !closed.includes(s.year) || !!term;
        return (
          <section key={s.year} className="space-y-3">
            {/* schlichte Überschrift: Jahr links, feine Linie, Anzahl, auf-/zuklappen */}
            <div className="flex items-center gap-3">
              {picking && <button type="button" onClick={() => pickMany(s.docs.map((d) => d.id), stateOf(s.docs.map((d) => d.id), picked) !== "on")} aria-label={`${s.year} auswählen`}><Box state={stateOf(s.docs.map((d) => d.id), picked)} /></button>}
              <button type="button" aria-expanded={isOpen} onClick={() => setClosed((c) => (c.includes(s.year) ? c.filter((x) => x !== s.year) : [...c, s.year]))} className="group flex min-w-0 flex-1 items-center gap-3 text-left">
                <span className="tnum text-[22px] leading-7 font-bold tracking-tight">{s.year}</span>
                {s.open > 0 && <span className="text-[12px] font-semibold text-negative-text">{s.open} offen</span>}
                <span className="h-px flex-1 bg-line" />
                <span className="tnum rounded-full border border-card-line bg-surface px-2.5 py-0.5 text-[12px] font-semibold text-fg">{s.docs.length} {s.docs.length === 1 ? "Dokument" : "Dokumente"}</span>
                <ChevronDown size={15} className={`shrink-0 text-muted transition-transform group-hover:text-fg ${isOpen ? "rotate-180" : ""}`} />
              </button>
            </div>
            {isOpen && (sub ? (
              <div className="space-y-4">
                {s.groups.map((g) => (
                  <div key={g.key} className="space-y-2">
                    <div className="flex items-center gap-2 pl-0.5">
                      {g.partner && <SenderLogo domain={g.partner.domain} sender={g.partner.name} cluster={g.partner.cluster} size={24} />}
                      <span className="truncate text-[14px] font-semibold text-fg">{g.label}</span>
                      <span className="h-px flex-1 bg-line/70" />
                      <span className="tnum rounded-full border border-card-line bg-surface px-2 py-px text-[11.5px] font-semibold text-soft">{g.docs.length}</span>
                    </div>
                    {block(g.docs)}
                  </div>
                ))}
              </div>
            ) : block(s.docs))}
          </section>
        );
      })}
      {picking && (
        <div className="sheet-up fixed inset-x-3 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-30 mx-auto flex max-w-xl items-center gap-3 rounded-full bg-fg py-2 pr-2 pl-5 text-canvas shadow-[0_12px_32px_rgba(16,24,40,.3)] lg:bottom-6 lg:left-[calc(var(--side,15rem)+1.5rem)]">
          <span className="min-w-0 flex-1 text-[14px]"><b className="tnum">{picked.size}</b> ausgewählt{lockedN > 0 && <span className="text-canvas/60"> · {lockedN} verschlüsselt (Tresor entsperren)</span>}</span>
          <select value={pickFormat} onChange={(e) => setPickFormat(e.target.value as ExportFormat)} aria-label="Format" className="h-9 max-w-[9.5rem] rounded-full border border-canvas/25 bg-transparent px-3 text-[12.5px] font-semibold text-canvas [&>option]:text-fg">
            {EXPORT_FORMATS.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}
          </select>
          <button type="button" onClick={stopPicking} className="h-10 rounded-full px-3 text-[13.5px] font-semibold text-canvas/75 hover:text-canvas">Abbrechen</button>
          <button type="button" disabled={picked.size - lockedN <= 0} onClick={() => { const list = docs.filter((d) => picked.has(d.id) && (!d.encrypted || unlocked)); startExport(list, { password: list.some((d) => d.encrypted) ? newPassword() : undefined, format: pickFormat }); stopPicking(); }} className="inline-flex h-10 items-center gap-2 rounded-full bg-brand-500 px-4 text-[13.5px] font-semibold text-white disabled:opacity-40"><Download size={15} /> Erstellen</button>
        </div>
      )}
    </div>
  );
}

/** Tag-Auswahl: nach Typ gruppiert, mit Farbe und Anzahl (nur Tags mit Treffern) */
function LabelPick({ value, onChange, counts }: { value: string; onChange: (v: string) => void; counts: Map<string, number> }) {
  const color = value ? groupOf(value)?.color : undefined;
  return (
    <label className="block">
      <span className="mb-1.5 block text-[13px] font-semibold text-soft">Tag</span>
      <span className="relative block">
        {color && <span className="pointer-events-none absolute top-1/2 left-3.5 h-2.5 w-2.5 -translate-y-1/2 rounded-full" style={{ background: color }} />}
        <select value={value} onChange={(e) => onChange(e.target.value)} className={`h-11 w-full appearance-none rounded-xl border bg-surface pr-9 text-[14.5px] ${value ? "border-fg pl-8 font-semibold" : "border-card-line pl-3.5"}`}>
          <option value="">Alle</option>
          {LABEL_GROUPS.map((g) => { const tags = g.tags.filter((t) => counts.get(t) || t === value); return tags.length ? <optgroup key={g.id} label={g.label}>{tags.map((t) => <option key={t} value={t}>{t} ({counts.get(t) ?? 0})</option>)}</optgroup> : null; })}
        </select>
        <ChevronDown size={16} className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-muted" />
      </span>
    </label>
  );
}

/** Platzhalter ohne Logo: schwarzer Kreis, weißes Icon */
function Placeholder({ icon: Icon, size }: { icon: LucideIcon; size: number }) {
  return <span className="grid shrink-0 place-items-center rounded-full bg-fg text-canvas" style={{ width: size, height: size }}><Icon size={Math.round(size * 0.5)} /></span>;
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
          {cur ? <SenderLogo domain={cur.domain} sender={cur.name} cluster={cur.cluster} size={32} /> : <Placeholder icon={Users} size={32} />}
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
                <Placeholder icon={Users} size={28} />
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
