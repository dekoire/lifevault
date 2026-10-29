"use client";
import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, CalendarClock, Check, ChevronRight, ClipboardPen, Clock, Euro, FileSignature, ListTodo, Scale, Tag } from "lucide-react";
import { useDetail } from "@/components/DetailPanel";
import { SenderLogo } from "@/components/SenderLogo";
import { CARD } from "@/components/ui";
import { dueLabel, todoKind, todos, type TodoKind } from "@/lib/actions";
import { fmtDate, fmtMoney } from "@/lib/docs";
import type { Doc } from "@/lib/types";

const KEY = "lifevault:todo-done";

/** Art der Aufgabe: eigene Farbe + Symbol (Zahlung, Formular, Angebot läuft ab …) */
export const KIND: Record<TodoKind, { label: string; icon: typeof Euro; cls: string }> = {
  zahlung: { label: "Zahlung", icon: Euro, cls: "bg-[#fff4e5] text-[#b45309] dark:bg-[#3a2a12] dark:text-[#f5b45a]" },
  formular: { label: "Formular", icon: ClipboardPen, cls: "bg-[#e8f1ff] text-[#1d5fd6] dark:bg-[#132544] dark:text-[#8db8ff]" },
  angebot: { label: "Angebot läuft ab", icon: Tag, cls: "bg-[#e6f6f3] text-[#157368] dark:bg-[#10302b] dark:text-[#6fd3c4]" },
  widerspruch: { label: "Widerspruch", icon: Scale, cls: "bg-lavender text-brand-600 dark:bg-[#2a2350] dark:text-brand-300" },
  vertrag: { label: "Vertrag", icon: FileSignature, cls: "bg-[#f1f1f4] text-[#3f3f46] dark:bg-[#26262e] dark:text-[#d4d4d8]" },
  termin: { label: "Termin", icon: CalendarClock, cls: "bg-[#fdeef6] text-[#b0246f] dark:bg-[#3a1529] dark:text-[#f59cc9]" },
  frist: { label: "Frist", icon: Clock, cls: "bg-[#f1f1f4] text-[#52525b] dark:bg-[#26262e] dark:text-[#d4d4d8]" },
};
const load = (): string[] => { try { return JSON.parse(localStorage.getItem(KEY) ?? "[]"); } catch { return []; } };

/** „Zu erledigen“: Fristen mit Handlungsbedarf, überfällige rot; Klick öffnet Details (Überweisung, Kontakt) rechts */
export function TodoList({ docs }: { docs: Doc[] }) {
  const open = useDetail();
  const today = new Date().toISOString().slice(0, 10);
  const [done, setDone] = useState<string[]>([]);
  const [tab, setTab] = useState<"open" | "late" | "soon" | "done">("open");
  const [all, setAll] = useState(false);
  useEffect(() => setDone(load()), []);
  const toggle = (k: string) => setDone((cur) => { const n = cur.includes(k) ? cur.filter((x) => x !== k) : [...cur, k]; try { localStorage.setItem(KEY, JSON.stringify(n)); } catch { /* egal */ } return n; });
  const [kind, setKind] = useState<TodoKind | null>(null);
  const all0 = useMemo(() => todos(docs, today).map((t) => ({ ...t, kind: todoKind(t) })), [docs, today]);
  const list = kind ? all0.filter((t) => t.kind === kind) : all0;
  const key = (t: (typeof list)[number]) => `${t.doc.id}|${t.date}`;
  const openList = list.filter((t) => !done.includes(key(t)));
  const doneList = list.filter((t) => done.includes(key(t)));
  const late = openList.filter((t) => t.days < 0).length;
  if (!all0.length) return null;
  // Arten mit offenen Aufgaben, für den Filter (Zähler über alle offenen)
  const kinds = (Object.keys(KIND) as TodoKind[]).map((k) => ({ k, n: all0.filter((t) => t.kind === k && !done.includes(key(t))).length })).filter((x) => x.n > 0);
  const soonList = openList.filter((t) => t.days >= 0 && t.days <= 14);
  const tabs = [
    { id: "open", label: "Offen", list: openList },
    { id: "late", label: "Überfällig", list: openList.filter((t) => t.days < 0) },
    { id: "soon", label: "Nächste 14 Tage", list: soonList },
    { id: "done", label: "Erledigt", list: doneList },
  ] as const;
  const current = tabs.find((x) => x.id === tab)!.list;
  const shown = current.slice(0, all ? 50 : 6);

  return (
    <section className={`${CARD} overflow-hidden`}>
      <div className="flex items-center justify-between gap-3 px-4 pt-4 pb-2">
        <h2 className="flex items-center gap-2 text-[16px] font-semibold"><ListTodo size={18} /> Zu erledigen
          {openList.length > 0 && <span className="tnum rounded-full border border-card-line bg-surface-2 px-2 py-px text-[12px] font-bold">{openList.length}</span>}
          {late > 0 && <span className="inline-flex items-center gap-1 text-[12.5px] font-semibold text-negative-text"><AlertTriangle size={13} /> {late} überfällig</span>}
        </h2>
      </div>
      {/* Reiter als Pills */}
      <div className="no-scrollbar flex gap-1.5 overflow-x-auto px-4 pb-3" role="tablist">
        {tabs.map((x) => (
          <button key={x.id} type="button" role="tab" aria-selected={tab === x.id} onClick={() => { setTab(x.id); setAll(false); }}
            className={`inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full px-3.5 text-[13px] font-semibold ${tab === x.id ? "bg-fg text-canvas" : "border border-card-line text-soft hover:text-fg"}`}>
            {x.label}<span className={`tnum text-[12px] ${tab === x.id ? "text-canvas/70" : x.id === "late" && x.list.length ? "text-negative-text" : "text-muted"}`}>{x.list.length}</span>
          </button>
        ))}
      </div>
      {kinds.length > 1 && (
        <div className="no-scrollbar flex items-center gap-1.5 overflow-x-auto px-4 pb-3">
          <span className="mr-0.5 shrink-0 text-[12px] font-semibold text-muted">Art:</span>
          <button type="button" onClick={() => { setKind(null); setAll(false); }} className={`h-7 shrink-0 rounded-full px-3 text-[12px] font-semibold ${!kind ? "bg-fg text-canvas" : "border border-card-line text-soft hover:text-fg"}`}>Alle</button>
          {kinds.map(({ k, n }) => { const K = KIND[k]; const on = kind === k; return (
            <button key={k} type="button" aria-pressed={on} onClick={() => { setKind(on ? null : k); setAll(false); }} className={`inline-flex h-7 shrink-0 items-center gap-1 rounded-full px-2.5 text-[12px] font-semibold transition ${on ? `${K.cls} ring-2 ring-current/30` : "border border-card-line text-soft hover:text-fg"}`}>
              <K.icon size={12} strokeWidth={2.4} />{K.label}<span className="tnum opacity-70">{n}</span>
            </button>
          ); })}
        </div>
      )}
      {current.length === 0 && <p className="border-t border-line px-4 py-4 text-[13.5px] text-muted">{tab === "done" ? "Noch nichts abgehakt." : tab === "open" ? "Alles erledigt. 🎉" : "Nichts in dieser Ansicht."}</p>}
      <ul className="divide-y divide-line border-t border-line">
        {shown.map((t) => {
          const k = key(t);
          const isDone = done.includes(k);
          const overdue = t.days < 0 && !isDone;
          const soon = t.days >= 0 && t.days <= 7 && !isDone;
          return (
            <li key={k} className={`flex items-center gap-3 px-4 py-3 ${isDone ? "opacity-50" : ""}`}>
              <button type="button" onClick={() => toggle(k)} aria-label={isDone ? "Wieder offen" : "Als erledigt markieren"} title={isDone ? "Wieder offen" : "Erledigt"} className={`grid h-6 w-6 shrink-0 place-items-center rounded-full border-2 ${isDone ? "border-positive bg-positive text-white" : "border-line-strong hover:border-fg"}`}>{isDone && <Check size={13} strokeWidth={3} />}</button>
              <button type="button" onClick={() => open?.({ kind: "doc", id: t.doc.id })} className="flex min-w-0 flex-1 items-center gap-3 text-left">
                <SenderLogo domain={t.doc.sender_domain} sender={t.doc.sender} cluster={t.doc.cluster} size={38} />
                <span className="min-w-0 flex-1">
                  <span className={`block truncate text-[14px] font-semibold ${isDone ? "line-through" : ""}`}>{t.what}</span>
                  <span className="mt-0.5 flex min-w-0 items-center gap-1.5 text-[12px] text-muted">{(() => { const k = KIND[t.kind]; return <span className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-px text-[11px] font-semibold ${k.cls}`}><k.icon size={11} strokeWidth={2.4} />{k.label}</span>; })()}<span className="min-w-0 truncate">{t.doc.title}{t.more > 0 ? ` · +${t.more} weitere Frist${t.more === 1 ? "" : "en"}` : ""}</span></span>
                </span>
                <span className="shrink-0 text-right">
                  {t.payment?.amount !== undefined && <b className="tnum block text-[13.5px]">{fmtMoney(t.payment.amount, t.payment.currency)}</b>}
                  <span className={`inline-block rounded-full border bg-surface px-2.5 py-0.5 text-[12px] font-semibold whitespace-nowrap ${overdue || soon ? "border-negative/40 text-negative-text" : "border-card-line text-soft"}`}>{overdue || soon ? dueLabel(t.days) : `bis ${fmtDate(t.date)}`}</span>
                </span>
                <ChevronRight size={16} className="shrink-0 text-muted max-sm:hidden" />
              </button>
            </li>
          );
        })}
      </ul>
      {current.length > 6 && <button type="button" onClick={() => setAll(!all)} className="w-full border-t border-line px-4 py-2.5 text-left text-[13px] font-semibold text-selected hover:bg-surface-2">{all ? "Weniger anzeigen" : `Alle ${current.length} anzeigen`}</button>}
    </section>
  );
}
