"use client";
import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Check, ChevronRight, ListTodo } from "lucide-react";
import { useDetail } from "@/components/DetailPanel";
import { SenderLogo } from "@/components/SenderLogo";
import { CARD } from "@/components/ui";
import { dueLabel, todos } from "@/lib/actions";
import { fmtDate, fmtMoney } from "@/lib/docs";
import type { Doc } from "@/lib/types";

const KEY = "lifevault:todo-done";
const load = (): string[] => { try { return JSON.parse(localStorage.getItem(KEY) ?? "[]"); } catch { return []; } };

/** „Zu erledigen“: Fristen mit Handlungsbedarf, überfällige rot; Klick öffnet Details (Überweisung, Kontakt) rechts */
export function TodoList({ docs }: { docs: Doc[] }) {
  const open = useDetail();
  const today = new Date().toISOString().slice(0, 10);
  const [done, setDone] = useState<string[]>([]);
  const [showDone, setShowDone] = useState(false);
  const [all, setAll] = useState(false);
  useEffect(() => setDone(load()), []);
  const toggle = (k: string) => setDone((cur) => { const n = cur.includes(k) ? cur.filter((x) => x !== k) : [...cur, k]; try { localStorage.setItem(KEY, JSON.stringify(n)); } catch { /* egal */ } return n; });
  const list = useMemo(() => todos(docs, today), [docs, today]);
  const key = (t: (typeof list)[number]) => `${t.doc.id}|${t.date}`;
  const openList = list.filter((t) => !done.includes(key(t)));
  const doneList = list.filter((t) => done.includes(key(t)));
  const late = openList.filter((t) => t.days < 0).length;
  if (!list.length) return null;
  const shown = (showDone ? [...openList, ...doneList] : openList).slice(0, all ? 50 : 6);

  return (
    <section className={`${CARD} overflow-hidden`}>
      <div className="flex items-center justify-between gap-3 px-4 pt-4 pb-2">
        <h2 className="flex items-center gap-2 text-[16px] font-semibold"><ListTodo size={18} /> Zu erledigen
          {openList.length > 0 && <span className="tnum rounded-full border border-card-line bg-surface-2 px-2 py-px text-[12px] font-bold">{openList.length}</span>}
          {late > 0 && <span className="inline-flex items-center gap-1 rounded-full bg-urgent px-2 py-px text-[11.5px] font-semibold text-white"><AlertTriangle size={11} /> {late} überfällig</span>}
        </h2>
        {doneList.length > 0 && <button type="button" onClick={() => setShowDone(!showDone)} className="text-[12.5px] font-semibold text-selected">{showDone ? "Erledigte ausblenden" : `${doneList.length} erledigt`}</button>}
      </div>
      {openList.length === 0 && !showDone && <p className="px-4 pb-4 text-[13.5px] text-muted">Alles erledigt. 🎉</p>}
      <ul className="divide-y divide-line">
        {shown.map((t) => {
          const k = key(t);
          const isDone = done.includes(k);
          const overdue = t.days < 0 && !isDone;
          const soon = t.days >= 0 && t.days <= 7 && !isDone;
          return (
            <li key={k} className={`flex items-center gap-3 px-4 py-3 ${isDone ? "opacity-50" : ""}`}>
              <button type="button" onClick={() => toggle(k)} aria-label={isDone ? "Wieder offen" : "Als erledigt markieren"} title={isDone ? "Wieder offen" : "Erledigt"} className={`grid h-6 w-6 shrink-0 place-items-center rounded-full border-2 ${isDone ? "border-positive bg-positive text-white" : "border-line-strong hover:border-fg"}`}>{isDone && <Check size={13} strokeWidth={3} />}</button>
              <button type="button" onClick={() => open?.({ kind: "doc", id: t.doc.id })} className="flex min-w-0 flex-1 items-center gap-3 text-left">
                <SenderLogo domain={t.doc.sender_domain} sender={t.doc.sender} cluster={t.doc.cluster} urgent={overdue} size={38} />
                <span className="min-w-0 flex-1">
                  <span className={`block truncate text-[14px] font-semibold ${isDone ? "line-through" : ""}`}>{t.what}</span>
                  <span className="block truncate text-[12px] text-muted">{t.doc.title}{t.more > 0 ? ` · +${t.more} weitere Frist${t.more === 1 ? "" : "en"}` : ""}</span>
                </span>
                <span className="shrink-0 text-right">
                  {t.payment?.amount !== undefined && <b className="tnum block text-[13.5px]">{fmtMoney(t.payment.amount, t.payment.currency)}</b>}
                  <span className={`inline-block rounded-full px-2 py-px text-[11.5px] font-semibold whitespace-nowrap ${overdue ? "bg-urgent text-white" : soon ? "border border-urgent/40 text-negative-text" : "border border-card-line text-soft"}`}>{overdue || soon ? dueLabel(t.days) : `bis ${fmtDate(t.date)}`}</span>
                </span>
                <ChevronRight size={16} className="shrink-0 text-muted max-sm:hidden" />
              </button>
            </li>
          );
        })}
      </ul>
      {(showDone ? list.length : openList.length) > 6 && <button type="button" onClick={() => setAll(!all)} className="w-full border-t border-line px-4 py-2.5 text-left text-[13px] font-semibold text-selected hover:bg-surface-2">{all ? "Weniger anzeigen" : `Alle ${showDone ? list.length : openList.length} anzeigen`}</button>}
    </section>
  );
}
