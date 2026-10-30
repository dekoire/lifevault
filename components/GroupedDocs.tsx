"use client";
import { IconTile } from "@/components/ClusterIcon";
import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { AlertTriangle, ArrowDownAZ, Building2, CalendarDays, CalendarRange, Check, ChevronDown, CircleAlert, CircleCheck, Clock, Download, Hash, History, Info, Rows3, Search, Shapes, Star, Tag, Users, X, type LucideIcon } from "lucide-react";
import { DocCarousel } from "@/components/DocCarousel";
import { DocRow, DocRowHead } from "@/components/DocRow";
import { Panel } from "@/components/Panel";
import { Box, stateOf } from "@/components/ExportSheet";
import { FilterBar, FilterSelect, FilterToggle, IconAvatar } from "@/components/ListControls";
import { KindAvatar } from "@/components/KindTag";
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
import { IMPORTANCE, importanceOf } from "@/lib/importance";
import type { Doc } from "@/lib/types";

/**
 * Bereich chronologisch: Abschnitte je Jahr (aufklappbar), wahlweise darin nach Absender (als Partner) oder Thema unterteilt.
 * Filter im Seitenpanel zeigen nur Auswahl, die Treffer hat.
 * Abschnitte mit offenen Aufgaben stehen oben. Die Suche durchsucht alles, auch Eingeklapptes.
 */
// immer chronologisch nach Jahr; optional innerhalb des Jahres unterteilt
type Sub = "" | "sender" | "topic" | "kind";
const SUBS: { value: Sub; label: string; icon?: React.ReactNode }[] = [{ value: "", label: "Nicht unterteilen" }, { value: "sender", label: "Absender", icon: <IconAvatar icon={Building2} /> }, { value: "topic", label: "Thema", icon: <IconAvatar icon={Hash} /> }, { value: "kind", label: "Art", icon: <IconAvatar icon={Shapes} /> }];
const dateOf = (d: Doc) => d.doc_date ?? d.received_at.slice(0, 10);
type Range = "all" | "year" | "12m";
type Filter = { kind: string; purpose: string; topic: string; label: string; sender: string; range: Range; year: string; encOnly: boolean; imp: string };
const NONE: Filter = { kind: "", purpose: "", topic: "", label: "", sender: "", range: "all", year: "", encOnly: false, imp: "" };
type SortBy = "new" | "old" | "sender" | "title" | "important";
const SORTS: { value: SortBy; label: string; icon: React.ReactNode }[] = [{ value: "important", label: "Wichtigste zuerst", icon: <IconAvatar icon={Star} /> }, { value: "old", label: "Älteste zuerst", icon: <IconAvatar icon={History} /> }, { value: "sender", label: "Absender A–Z", icon: <IconAvatar icon={Building2} /> }, { value: "title", label: "Titel A–Z", icon: <IconAvatar icon={ArrowDownAZ} /> }];
const TOPIC_COLOR = "#6d4aff";
const PURPOSE_ICON: Record<string, [LucideIcon, string | undefined]> = { zu_erledigen: [CircleAlert, "#dc2626"], wichtig: [Star, "#6d4aff"], info: [Info, "#64748b"], erledigt: [CircleCheck, "#16a34a"] };

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
    (skip === "imp" || !f.imp || importanceOf(d) >= Number(f.imp)) &&
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
    const cmp = (a: Doc, b: Doc) => sortBy === "old" ? dateOf(a).localeCompare(dateOf(b)) : sortBy === "sender" ? (a.sender ?? "￿").localeCompare(b.sender ?? "￿", "de") || dateOf(b).localeCompare(dateOf(a)) : sortBy === "title" ? (a.title ?? a.file_name).localeCompare(b.title ?? b.file_name, "de") : sortBy === "important" ? importanceOf(b) - importanceOf(a) || dateOf(b).localeCompare(dateOf(a)) : dateOf(b).localeCompare(dateOf(a));
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
  const kindOpts = KINDS.filter((k) => kindN.get(k.id) || f.kind === k.id).map((k) => ({ value: k.id, label: k.label, n: kindN.get(k.id) ?? 0, icon: <KindAvatar id={k.id} /> }));
  const topicN = countBy("topic", topicOf);
  const senderN = countBy("sender", senderOf);
  const purposeOpts = PURPOSES.filter((p) => purposeN.get(p.id) || f.purpose === p.id).map((p) => ({ value: p.id, label: p.label, n: purposeN.get(p.id) ?? 0, icon: <IconAvatar icon={PURPOSE_ICON[p.id]?.[0] ?? Info} color={PURPOSE_ICON[p.id]?.[1]} /> }));
  const topicOpts = [...topicN.keys()].sort((a, b) => (topicN.get(b) ?? 0) - (topicN.get(a) ?? 0) || a.localeCompare(b, "de")).map((t) => ({ value: t, label: t, n: topicN.get(t), icon: <IconAvatar icon={Hash} color={TOPIC_COLOR} /> }));
  const senders = [...senderN.entries()].filter(([k]) => k).map(([k, n]) => { const p = partners.get(k); return { key: k, name: p?.name ?? k, n, domain: p?.domain ?? null, cluster: p?.cluster ?? cluster }; }).sort((a, b) => b.n - a.n || a.name.localeCompare(b.name, "de"));
  const labelN = new Map<string, number>();
  for (const d of docs) if (match(d, "label")) for (const t of d.labels ?? []) labelN.set(t, (labelN.get(t) ?? 0) + 1);
  const yearN = countBy("year", (d) => dateOf(d).slice(0, 4));
  const active = Number(!!f.kind) + Number(!!f.year) + Number(!!f.label) + Number(!!f.purpose) + Number(!!f.topic) + Number(!!f.sender) + Number(f.range !== "all") + Number(f.encOnly) + Number(!!f.imp);
  const lockedN = unlocked ? 0 : docs.filter((d) => picked.has(d.id) && d.encrypted).length;
  const rows = (ds: Doc[]) => picking
    ? <div className="divide-y divide-line">{ds.map((d) => (
        <div key={d.id} role="checkbox" aria-checked={picked.has(d.id)} tabIndex={0} onClick={() => pickMany([d.id], !picked.has(d.id))} onKeyDown={(e) => { if (e.key === " " || e.key === "Enter") { e.preventDefault(); pickMany([d.id], !picked.has(d.id)); } }} className={`flex w-full cursor-pointer items-center gap-3 pl-4 text-left ${picked.has(d.id) ? "bg-brand-500/[0.06]" : ""}`}>
          <Box state={picked.has(d.id) ? "on" : "off"} />
          <span className="pointer-events-none min-w-0 flex-1 [&>a]:pl-0">{<DocRow d={d} />}</span>
        </div>
      ))}</div>
    : view === "list"
    ? <><DocRowHead /><div className="divide-y divide-line">{ds.map((d) => <DocRow key={d.id} d={d} />)}</div></>
    : <DocCarousel docs={ds} grid />;
  // Liste in einer Kachel, Karten frei im Raster
  const block = (ds: Doc[]) => (picking || view === "list" ? <div className={`${CARD} overflow-hidden`}>{rows(ds)}</div> : rows(ds));
  // in der Jahres-Kachel: Liste direkt, Karten mit Innenabstand
  const inner = (ds: Doc[]) => (picking || view === "list" ? rows(ds) : <div className="p-4">{rows(ds)}</div>);

  if (!docs.length) return <p className={`${CARD} p-6 text-center text-[14px] text-muted`}>Noch keine Dokumente in diesem Bereich.</p>;
  return (
    <div className={`space-y-6 ${picking ? "pb-40" : ""}`}>
      {/* Steuerung schlicht: Suche + „Filter“; alles Weitere als Auswahlfelder im Seitenpanel rechts */}
      <FilterBar q={q} onQ={setQ} placeholder="In diesem Bereich suchen" actions={<button type="button" onClick={() => (picking ? stopPicking() : setPicking(true))} aria-pressed={picking} className={`inline-flex h-11 shrink-0 items-center gap-2 rounded-full border px-4 text-[14px] font-semibold ${picking ? "border-brand-500 bg-brand-500 text-white" : "border-card-line bg-surface text-fg hover:bg-surface-2"}`}><Download size={16} /> Export</button>} activeCount={active} onReset={() => setF(NONE)} count={`${list.length} von ${docs.length} Dokumenten`}>
        <FilterSelect label="Sortieren" icon={Clock} value={sortBy === "new" ? "" : sortBy} onChange={(v) => setSortBy((v || "new") as SortBy)} options={SORTS} empty="Neueste zuerst" />
        {yearN.size > 1 && <FilterSelect label="Jahr" value={f.year} onChange={(v) => set({ year: v })} options={[...yearN.entries()].sort((a, b) => b[0].localeCompare(a[0])).map(([y, n]) => ({ value: y, label: y, n, icon: <IconAvatar text={`’${y.slice(2)}`} /> }))} icon={CalendarDays} />}
        <FilterSelect label="Je Jahr unterteilen nach" value={sub} onChange={(v) => pickSub(v as Sub)} options={SUBS.slice(1)} empty="Nicht unterteilen" icon={Rows3} />
        {senders.length > 1 && <SenderPick value={f.sender} onChange={(v) => set({ sender: v })} options={senders} />}
        {kindOpts.length > 1 && <FilterSelect label="Art" icon={Shapes} value={f.kind} onChange={(v) => set({ kind: v })} options={kindOpts} />}
        {topicOpts.length > 1 && <FilterSelect label="Thema" icon={Hash} value={f.topic} onChange={(v) => set({ topic: v })} options={topicOpts} />}
        {labelN.size > 0 && <LabelPick value={f.label} onChange={(v) => set({ label: v })} counts={labelN} />}
        {docs.some((d) => d.importance != null) && <FilterSelect label="Wichtigkeit" icon={Star} value={f.imp} onChange={(v) => set({ imp: v })} options={IMPORTANCE.filter((x) => x.value > 1).map((x) => ({ value: String(x.value), label: `ab ${x.label}`, n: docs.filter((d) => match(d, "imp") && importanceOf(d) >= x.value).length, icon: <IconAvatar text={`${x.value}+`} color="#6d4aff" /> }))} empty="Alle" />}
        {purposeOpts.length > 1 && <FilterSelect label="Status" icon={CircleCheck} value={f.purpose} onChange={(v) => set({ purpose: v })} options={purposeOpts} />}
        <FilterSelect label="Zeitraum" value={f.range === "all" ? "" : f.range} onChange={(v) => set({ range: (v || "all") as Range })} options={[{ value: "year", label: "Dieses Jahr", icon: <IconAvatar icon={CalendarDays} /> }, { value: "12m", label: "Letzte 12 Monate", icon: <IconAvatar icon={CalendarRange} /> }]} empty="Gesamter Zeitraum" icon={Clock} />
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
            f.imp && { k: "imp", text: `ab ${IMPORTANCE.find((x) => String(x.value) === f.imp)?.label ?? f.imp}` },
            f.range !== "all" && { k: "range", text: f.range === "year" ? "Dieses Jahr" : "Letzte 12 Monate" },
            f.encOnly && { k: "encOnly", text: "Nur verschlüsselte" },
          ].filter((c): c is { k: keyof Filter; text: string; color?: string } => !!c).map((c) => (
            <button key={c.k} type="button" onClick={() => set({ [c.k]: NONE[c.k] } as Partial<Filter>)} className="inline-flex h-8 items-center gap-1.5 rounded-full border border-card-line bg-surface pr-2 pl-3 text-[13px] font-semibold hover:bg-surface-2" style={c.color ? { color: c.color, borderColor: `${c.color}55`, background: `${c.color}12` } : undefined}>
              {c.text}<X size={13} className="opacity-60" />
            </button>
          ))}
          <button type="button" onClick={() => setF(NONE)} className="h-8 px-2 text-[13px] font-semibold text-selected">Alle zurücksetzen</button>
        </div>
      )}
      {picking && (
        <div className="flex items-center gap-3 rounded-2xl bg-brand-500/[0.08] px-4 py-2.5 text-[14px]">
          <button type="button" onClick={() => pickMany(list.map((d) => d.id), stateOf(list.map((d) => d.id), picked) !== "on")} className="inline-flex items-center gap-2.5 font-semibold">
            <Box state={stateOf(list.map((d) => d.id), picked)} /> {stateOf(list.map((d) => d.id), picked) === "on" ? "Alle abwählen" : `Alle ${list.length} auswählen`}
          </button>
          <span className="ml-auto text-[13px] text-soft max-sm:hidden">Antippen zum Aus- oder Abwählen</span>
        </div>
      )}

      {sections.length === 0 && <p className={`${CARD} p-6 text-center text-[14px] text-muted`}>Nichts gefunden – Filter zurücksetzen?</p>}
      {sections.map((s) => {
        const isOpen = !closed.includes(s.year) || !!term;
        return (
          <Panel key={s.year} title={s.year} icon={CalendarDays} color={s.open > 0 ? "#b42318" : "#6d4aff"} count={s.docs.length}
            sub={s.open > 0 ? <span className="font-semibold text-negative-text">{s.open} offen</span> : undefined}
            aside={picking ? <button type="button" onClick={() => pickMany(s.docs.map((d) => d.id), stateOf(s.docs.map((d) => d.id), picked) !== "on")} aria-label={`${s.year} auswählen`}><Box state={stateOf(s.docs.map((d) => d.id), picked)} /></button> : undefined}
            open={isOpen} onToggle={() => setClosed((c) => (c.includes(s.year) ? c.filter((x) => x !== s.year) : [...c, s.year]))} noLine={!sub && view === "list" && !picking}>
            {sub ? (
              <div>
                {s.groups.map((g) => (
                  <div key={g.key} className="border-b border-line last:border-b-0">
                    {/* Untergruppe (z. B. Partner): kleine Zwischenüberschrift */}
                    <div className="flex items-center gap-2.5 px-4 pt-5 pb-2 md:px-6">
                      {g.partner && <SenderLogo domain={g.partner.domain} sender={g.partner.name} cluster={g.partner.cluster} size={24} />}
                      <span className="min-w-0 flex-1 truncate text-[14px] font-semibold">{g.label}</span>
                      <span className="tnum rounded-full border border-card-line px-3 py-2 text-[12px] leading-4 font-semibold text-soft">{g.docs.length}</span>
                    </div>
                    {inner(g.docs)}
                  </div>
                ))}
              </div>
            ) : inner(s.docs)}
          </Panel>
        );
      })}
      {/* Export-Leiste: per Portal am Bildschirmrand (sonst verschiebt sie die Animation der Seite);
          oben Anzahl und Format, unten Abbrechen und Erstellen gleich breit */}
      {picking && createPortal(
        <div className="sheet-up fixed inset-x-3 bottom-[calc(4.75rem+env(safe-area-inset-bottom))] z-40 mx-auto max-w-md rounded-3xl bg-fg p-3 text-canvas shadow-[0_16px_40px_rgba(16,24,40,.35)] lg:bottom-6">
          <div className="flex items-center gap-3 px-1.5 pb-3">
            <span className="min-w-0 flex-1 text-[14px] leading-5"><b className="tnum text-[17px]">{picked.size}</b> ausgewählt{lockedN > 0 && <span className="block text-[12px] text-canvas/60">{lockedN} verschlüsselt – Tresor entsperren</span>}</span>
            <span className="relative shrink-0">
              <select value={pickFormat} onChange={(e) => setPickFormat(e.target.value as ExportFormat)} aria-label="Format" className="h-10 appearance-none rounded-full bg-canvas/15 pr-9 pl-4 text-[14px] font-semibold text-canvas [&>option]:text-fg">
                {EXPORT_FORMATS.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}
              </select>
              <ChevronDown size={15} className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-canvas/70" />
            </span>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button type="button" onClick={stopPicking} className="h-11 rounded-full bg-canvas/10 text-[14px] font-semibold text-canvas hover:bg-canvas/20">Abbrechen</button>
            <button type="button" disabled={picked.size - lockedN <= 0} onClick={() => { const list = docs.filter((d) => picked.has(d.id) && (!d.encrypted || unlocked)); startExport(list, { password: list.some((d) => d.encrypted) ? newPassword() : undefined, format: pickFormat }); stopPicking(); }} className="inline-flex h-11 items-center justify-center gap-2 rounded-full bg-brand-500 text-[14px] font-semibold text-white disabled:opacity-40"><Download size={16} /> Exportieren</button>
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}

/** Tag-Auswahl: nach Typ gruppiert, Avatar in der Farbe des Typs, mit Anzahl (nur Tags mit Treffern) */
function LabelPick({ value, onChange, counts }: { value: string; onChange: (v: string) => void; counts: Map<string, number> }) {
  const options = LABEL_GROUPS.flatMap((g) => g.tags.filter((t) => counts.get(t) || t === value).map((t) => ({ value: t, label: t, n: counts.get(t) ?? 0, group: g.label, icon: <IconAvatar icon={Tag} color={g.color} /> })));
  return <FilterSelect label="Tag" icon={Tag} value={value} onChange={onChange} options={options} />;
}

/** Platzhalter ohne Logo: Kachel mit Farbverlauf */
function Placeholder({ icon, size }: { icon: LucideIcon; size: number }) {
  return <IconTile icon={icon} size={size} />;
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
          <span className="min-w-0 flex-1 truncate text-[15px] font-semibold">{cur?.name ?? "Alle Absender"}</span>
          <ChevronDown size={17} className={`shrink-0 text-muted transition-transform ${open ? "rotate-180" : ""}`} />
        </button>
        {open && (
          <div className="border-t border-line p-1.5">
            {options.length > 6 && (
              <label className="mb-1 flex h-9 items-center gap-2 rounded-full bg-surface-2 px-3">
                <Search size={14} className="text-muted" />
                <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Absender suchen" className="min-w-0 flex-1 bg-transparent text-[14px] outline-none placeholder:text-muted" />
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
