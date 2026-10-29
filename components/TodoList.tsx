"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, CalendarClock, Check, ChevronDown, ClipboardPen, Clock, Euro, FileSignature, ListTodo, PenLine, Scale, Tag } from "lucide-react";
import { useDetail } from "@/components/DetailPanel";
import { openDraft } from "@/components/DraftSheet";
import type { DraftPurpose } from "@/lib/drafts";
import { SenderLogo } from "@/components/SenderLogo";
import { CARD } from "@/components/ui";
import { dueLabel, todoKind, todos, type TodoKind } from "@/lib/actions";
import { fmtDate, fmtMoney } from "@/lib/docs";
import type { Doc } from "@/lib/types";

const KEY = "lifevault:todo-done";

const critical = (k: TodoKind) => k === "zahlung";
const warn = (k: TodoKind) => k === "widerspruch" || k === "vertrag" || k === "frist";
type Status = "late" | "soon" | "later" | "done";
const STATUS: { id: Status; label: string; icon: typeof Euro }[] = [
  { id: "late", label: "Überfällig", icon: AlertTriangle },
  { id: "soon", label: "Nächste 14 Tage", icon: CalendarClock },
  { id: "later", label: "Später", icon: Clock },
  { id: "done", label: "Erledigt", icon: Check },
];

/** Art der Aufgabe: eigene Farbe + Symbol (Zahlung, Formular, Angebot läuft ab …) */
export const KIND: Record<TodoKind, { label: string; icon: typeof Euro; cls: string }> = {
  zahlung: { label: "Zahlung", icon: Euro, cls: "text-fg" },
  formular: { label: "Formular", icon: ClipboardPen, cls: "text-fg" },
  angebot: { label: "Angebot läuft ab", icon: Tag, cls: "text-fg" },
  widerspruch: { label: "Widerspruch", icon: Scale, cls: "text-fg" },
  vertrag: { label: "Vertrag", icon: FileSignature, cls: "text-fg" },
  termin: { label: "Termin", icon: CalendarClock, cls: "text-fg" },
  frist: { label: "Frist", icon: Clock, cls: "text-fg" },
};
/** passendes Schreiben je Art der Aufgabe */
const DRAFT_FOR: Record<TodoKind, DraftPurpose> = { zahlung: "stundung", widerspruch: "widerspruch", vertrag: "kuendigung", angebot: "rueckfrage", formular: "rueckfrage", termin: "rueckfrage", frist: "rueckfrage" };
const load = (): string[] => { try { return JSON.parse(localStorage.getItem(KEY) ?? "[]"); } catch { return []; } };

/** „Zu erledigen“: Fristen mit Handlungsbedarf, überfällige rot; Klick öffnet Details (Überweisung, Kontakt) rechts */
export function TodoList({ docs }: { docs: Doc[] }) {
  const open = useDetail();
  const today = new Date().toISOString().slice(0, 10);
  const [done, setDone] = useState<string[]>([]);
  const [status, setStatus] = useState<Status[]>(["late", "soon", "later"]);
  const [all, setAll] = useState(false);
  useEffect(() => setDone(load()), []);
  const toggle = (k: string) => setDone((cur) => { const n = cur.includes(k) ? cur.filter((x) => x !== k) : [...cur, k]; try { localStorage.setItem(KEY, JSON.stringify(n)); } catch { /* egal */ } return n; });
  const [kinds_, setKinds] = useState<TodoKind[]>([]);
  const all0 = useMemo(() => todos(docs, today).map((t) => ({ ...t, kind: todoKind(t) })), [docs, today]);
  const list = kinds_.length ? all0.filter((t) => kinds_.includes(t.kind)) : all0;
  const key = (t: (typeof list)[number]) => `${t.doc.id}|${t.date}`;
  const openList = list.filter((t) => !done.includes(key(t)));
  const doneList = list.filter((t) => done.includes(key(t)));
  // als „überfällig“ zählt nur, was wirklich kritisch ist (Zahlungen)
  const late = openList.filter((t) => t.days < 0 && critical(t.kind)).length;
  if (!all0.length) return null;
  // Arten mit offenen Aufgaben, für den Filter (Zähler über alle offenen)
  const kinds = (Object.keys(KIND) as TodoKind[]).map((k) => ({ k, n: all0.filter((t) => t.kind === k && !done.includes(key(t))).length })).filter((x) => x.n > 0);
  const statusOf = (t: (typeof list)[number]): Status => (done.includes(key(t)) ? "done" : t.days < 0 ? "late" : t.days <= 14 ? "soon" : "later");
  const statusCount = (st: Status) => list.filter((t) => statusOf(t) === st).length;
  const current = list.filter((t) => status.includes(statusOf(t)));
  const shown = current.slice(0, all ? 50 : 6);

  const GRID = "md:grid md:grid-cols-[1.75rem_minmax(0,1fr)_8.5rem_6.5rem_10.5rem_2rem] md:items-center md:gap-4";
  const HEAD = "text-[12px] font-semibold tracking-wide text-muted uppercase";

  return (
    <section className={`${CARD} overflow-hidden`}>
      {/* Kopf: Titel + Zähler links, Auswahlfelder rechtsbündig in einer Zeile; mobil darunter je 50 % */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2.5 px-4 pt-4 pb-3">
        <h2 className="flex min-w-0 flex-1 items-center gap-2 text-[16px] font-semibold"><ListTodo size={18} className="shrink-0" /> Zu erledigen
          {openList.length > 0 && (late > 0
            ? <span className="tnum inline-flex items-center gap-1 rounded-full bg-negative/10 px-2 py-0.5 text-[12px] font-semibold text-negative-text"><AlertTriangle size={12} /> {late} von {openList.length} überfällig</span>
            : <span className="tnum rounded-full bg-surface-2 px-2 py-px text-[12px] font-bold">{openList.length}</span>)}
        </h2>
        <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto sm:items-center">
          <MultiSelect label="Status" name={(v) => ([...v].sort().join() === "late,later,soon" ? "Offen" : undefined)} value={status} onChange={(v) => { setStatus(v as Status[]); setAll(false); }} allLabel="Alle"
            options={STATUS.map((x) => ({ id: x.id, label: x.label, icon: x.icon, n: statusCount(x.id), alert: x.id === "late" }))} />
          <MultiSelect label="Art" value={kinds_} onChange={(v) => { setKinds(v as TodoKind[]); setAll(false); }} allLabel="Alle"
            options={kinds.map(({ k, n }) => ({ id: k, label: KIND[k].label, icon: KIND[k].icon, n }))} />
          {(kinds_.length > 0 || status.join() !== "late,soon,later") && <button type="button" onClick={() => { setKinds([]); setStatus(["late", "soon", "later"]); }} className="col-span-2 text-[12.5px] font-semibold text-selected sm:col-span-1">Zurücksetzen</button>}
        </div>
      </div>
      {current.length === 0 && <p className="border-t border-line px-4 py-4 text-[13.5px] text-muted">{status.length === 1 && status[0] === "done" ? "Noch nichts abgehakt." : openList.length === 0 ? "Alles erledigt. 🎉" : "Nichts in dieser Auswahl."}</p>}
      {current.length > 0 && (
        <div className={`hidden border-t border-b border-line bg-surface-2/60 px-4 py-3.5 ${GRID}`} role="row">
          <span />
          <span className={HEAD}>Aufgabe</span>
          <span className={HEAD}>Art</span>
          <span className={`${HEAD} text-right`}>Betrag</span>
          <span className={`${HEAD} text-right`}>Fällig</span>
          <span />
        </div>
      )}
      <ul className="divide-y divide-line border-t border-line md:border-t-0">
        {shown.map((t) => {
          const k = key(t);
          const isDone = done.includes(k);
          const overdue = t.days < 0 && !isDone;
          const soon = t.days >= 0 && t.days <= 7 && !isDone;
          const K = KIND[t.kind];
          // Farbe nach Wichtigkeit: Zahlung rot, Widerspruch/Vertrag orange, alles andere (Zählerstand, Formular …) grün
          const tone = critical(t.kind) ? "text-negative-text" : warn(t.kind) ? "text-amber" : "text-positive-text";
          const due = <span className={`inline-block text-[12.5px] font-semibold whitespace-nowrap ${overdue || soon ? tone : "text-soft"}`}>{overdue || soon ? dueLabel(t.days) : `bis ${fmtDate(t.date)}`}</span>;
          const amt = t.total ?? t.payment?.amount;
          const amount = amt !== undefined ? fmtMoney(amt, t.payment?.currency ?? "EUR") : null;
          return (
            <li key={k} className={`flex items-center gap-3 px-4 py-3 ${GRID} ${isDone ? "opacity-50" : ""}`}>
              <button type="button" onClick={() => toggle(k)} aria-label={isDone ? "Wieder offen" : "Als erledigt markieren"} title={isDone ? "Wieder offen" : "Erledigt"} className={`grid h-6 w-6 shrink-0 place-items-center rounded-full border-2 ${isDone ? "border-positive bg-positive text-white" : "border-line-strong hover:border-fg"}`}>{isDone && <Check size={13} strokeWidth={3} />}</button>
              <button type="button" onClick={() => open?.({ kind: "doc", id: t.doc.id })} className="flex min-w-0 flex-1 items-center gap-3 text-left md:contents">
                <span className="flex min-w-0 flex-1 items-center gap-3">
                  <span className="shrink-0 self-start md:self-auto"><SenderLogo domain={t.doc.sender_domain} sender={t.doc.sender} cluster={t.doc.cluster} size={36} /></span>
                  <span className="min-w-0 flex-1">
                    <span className={`line-clamp-2 text-[14px] leading-5 font-semibold md:line-clamp-1 ${isDone ? "line-through" : ""}`}>{t.what}</span>
                    <span className="hidden min-w-0 truncate text-[12px] text-muted md:block">{t.doc.sender ?? t.doc.title}{t.letters?.length ? ` · ${t.letters.length + 1} Schreiben zusammengefasst` : ""}{t.items?.length ? ` · ${t.items.length} Posten` : ""}{t.more > 0 ? ` · +${t.more} weitere Frist${t.more === 1 ? "" : "en"}` : ""}</span>
                    {/* Handy: Art, Fälligkeit, Betrag in der zweiten Zeile */}
                    <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] md:hidden">
                      <span className="inline-flex items-center gap-1 font-semibold"><K.icon size={12} strokeWidth={2.2} />{K.label}</span>
                      {due}
                      {amount && <b className="tnum">{amount}</b>}
                    </span>
                  </span>
                </span>
                <span className="hidden items-center gap-1.5 text-[13px] font-medium text-fg md:inline-flex"><K.icon size={14} strokeWidth={2} className="shrink-0" />{K.label}</span>
                <span className="tnum hidden text-right text-[13.5px] font-semibold md:block">{amount ?? <span className="text-muted">–</span>}</span>
                <span className="hidden shrink-0 text-right md:block">{due}</span>
              </button>
              <button type="button" onClick={() => openDraft(t.doc, DRAFT_FOR[t.kind])} aria-label="Schreiben vorbereiten" title="Mail oder Brief vorbereiten" className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-soft hover:bg-surface-2 hover:text-fg"><PenLine size={15} /></button>
            </li>
          );
        })}
      </ul>
      {current.length > 6 && <button type="button" onClick={() => setAll(!all)} className="w-full border-t border-line bg-surface-2 px-4 py-2.5 text-center text-[13px] font-semibold text-fg transition-colors hover:bg-surface-3">{all ? "Weniger anzeigen" : `Alle ${current.length} anzeigen`}</button>}
    </section>
  );
}

type Opt = { id: string; label: string; icon: typeof ListTodo; n: number; alert?: boolean };

/** Auswahlfeld mit Symbolen und Mehrfachauswahl; leere Auswahl = alle */
export function MultiSelect({ label, value, options, onChange, allLabel, name }: { label: string; value: string[]; options: Opt[]; onChange: (v: string[]) => void; allLabel: string; name?: (sel: string[]) => string | undefined }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);
  const sel = options.filter((o) => value.includes(o.id));
  const all = !sel.length || sel.length === options.length;
  const Icon = sel.length === 1 ? sel[0].icon : ListTodo;
  const text = name?.(value) ?? (all ? allLabel : sel.length === 1 ? sel[0].label : `${sel.length} gewählt`);
  const toggle = (id: string) => onChange(value.includes(id) ? value.filter((x) => x !== id) : [...value, id]);
  return (
    <div ref={ref} className="relative">
      <button type="button" aria-haspopup="listbox" aria-expanded={open} onClick={() => setOpen(!open)} className="inline-flex h-9 w-full items-center gap-1.5 rounded-full border border-card-line bg-surface pr-2.5 pl-3 text-[13px] font-semibold hover:bg-surface-2 sm:w-auto">
        <Icon size={14} className="shrink-0" /><span className="text-muted">{label}:</span><span className="min-w-0 flex-1 truncate text-left">{text}</span><ChevronDown size={14} className={`shrink-0 text-muted transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div role="listbox" aria-multiselectable="true" className="pop-in absolute inset-x-0 z-30 mt-1.5 min-w-[11rem] sm:right-0 sm:left-auto sm:w-64 rounded-xl border border-card-line bg-surface p-1 shadow-lg">
          {options.map((o) => { const on = value.includes(o.id); return (
            <button key={o.id} type="button" role="option" aria-selected={on} onClick={() => toggle(o.id)} className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[13.5px] hover:bg-surface-2">
              <span className={`grid h-4.5 w-4.5 shrink-0 place-items-center rounded-[5px] border-2 ${on ? "border-fg bg-fg text-canvas" : "border-line-strong"}`}>{on && <Check size={11} strokeWidth={3} />}</span>
              <o.icon size={15} className="shrink-0" /><span className="flex-1">{o.label}</span><span className={`tnum text-[12px] ${o.alert && o.n ? "font-semibold text-negative-text" : "text-muted"}`}>{o.n}</span>
            </button>
          ); })}
          <div className="mt-1 flex justify-between border-t border-line px-2.5 pt-1.5 pb-1 text-[12.5px] font-semibold">
            <button type="button" onClick={() => onChange(options.map((o) => o.id))} className="text-selected">Alle wählen</button>
            <button type="button" onClick={() => setOpen(false)} className="text-soft hover:text-fg">Fertig</button>
          </div>
        </div>
      )}
    </div>
  );
}
