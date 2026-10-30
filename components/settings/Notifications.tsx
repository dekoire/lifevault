"use client";
import { useState } from "react";
import { BellRing, Loader2, Send, Smartphone } from "lucide-react";
import { KIND } from "@/components/TodoList";
import { CARD, Switch } from "@/components/ui";
import { useDocs } from "@/lib/docs";
import { ALL_KINDS, disablePush, enablePush, isIos, isStandalone, pushSupported, syncQueue, useNotifyPrefs, usePushOn, type NotifyPrefs } from "@/lib/notify";
import { authFetch } from "@/lib/supabase";

const DAYS = [14, 7, 3, 1, 0];
const dayLabel = (n: number) => (n === 0 ? "Am Tag" : n === 1 ? "1 Tag vorher" : `${n} Tage vorher`);
const TIMES = Array.from({ length: 16 }, (_, i) => `${String(i + 6).padStart(2, "0")}:00`);

/** Einstellungen › Mitteilungen: Gerät an/aus, wann und wofür erinnert wird */
export function NotificationSettings() {
  const on = usePushOn();
  const { prefs, save } = useNotifyPrefs();
  const { allDocs } = useDocs();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string }>();

  const toggle = async (v: boolean) => {
    setBusy(true); setMsg(undefined);
    if (v) {
      const err = await enablePush();
      if (err) setMsg({ ok: false, text: err });
      else if (prefs) { const n = await syncQueue(allDocs, prefs, loadDone()); setMsg({ ok: true, text: `Eingeschaltet. ${n} Erinnerungen geplant.` }); }
    } else await disablePush();
    setBusy(false);
  };
  const update = async (next: NotifyPrefs) => {
    await save(next);
    if (on) await syncQueue(allDocs, next, loadDone());
  };
  const test = async () => {
    setMsg(undefined);
    const res = await authFetch("/api/push", { method: "POST", body: JSON.stringify({ action: "test" }) });
    const j = (await res.json().catch(() => ({}))) as { sent?: number; error?: string };
    setMsg(j.error ? { ok: false, text: j.error } : { ok: !!j.sent, text: j.sent ? "Test-Mitteilung ist unterwegs." : "Kein angemeldetes Gerät gefunden." });
  };

  const iosHint = isIos() && !isStandalone();
  return (
    <div className="space-y-4">
      <section className={`${CARD} p-5`}>
        <div className="flex items-center justify-between gap-4">
          <span className="flex items-start gap-3">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-surface-2"><BellRing size={18} /></span>
            <span><b className="text-[15px]">Mitteilungen auf diesem Gerät</b><span className="mt-0.5 block text-[13px] text-muted">Erinnert an Fristen: Zahlungen, Formulare, Widersprüche, Termine – auch wenn die App zu ist.</span></span>
          </span>
          {busy || on === null ? <Loader2 size={20} className="animate-spin text-muted" /> : <Switch on={!!on} onChange={(v) => void toggle(v)} label="Mitteilungen" disabled={!pushSupported() && !iosHint} />}
        </div>
        {iosHint && (
          <p className="mt-4 flex items-start gap-2 rounded-xl bg-surface-2 px-3 py-2.5 text-[13px] text-soft"><Smartphone size={16} className="mt-0.5 shrink-0" />Auf dem iPhone gehen Mitteilungen nur in der Web-App: In Safari unten auf Teilen tippen › „Zum Home-Bildschirm“ › Lifevault vom Home-Bildschirm öffnen und hier einschalten.</p>
        )}
        {msg && <p className={`mt-3 text-[13px] font-semibold ${msg.ok ? "text-positive-text" : "text-negative-text"}`}>{msg.text}</p>}
        {on && <button type="button" onClick={() => void test()} className="mt-4 inline-flex h-9 items-center gap-1.5 rounded-full border border-card-line px-4 text-[13px] font-semibold hover:bg-surface-2"><Send size={14} /> Test-Mitteilung senden</button>}
      </section>

      {prefs && (
        <section className={`${CARD} divide-y divide-line`}>
          <div className="p-5">
            <b className="text-[14px]">Wann erinnern?</b>
            <span className="block text-[13px] text-muted">Mehrfachauswahl – vor jeder Frist</span>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {DAYS.map((d) => { const sel = prefs.daysBefore.includes(d); return <button key={d} type="button" aria-pressed={sel} onClick={() => void update({ ...prefs, daysBefore: sel ? prefs.daysBefore.filter((x) => x !== d) : [...prefs.daysBefore, d].sort((a, b) => b - a) })} className={`h-8 rounded-full px-3.5 text-[13px] font-semibold ${sel ? "bg-fg text-canvas" : "border border-card-line text-soft hover:text-fg"}`}>{dayLabel(d)}</button>; })}
            </div>
          </div>
          <div className="flex items-center justify-between gap-4 p-5">
            <span><b className="text-[14px]">Uhrzeit</b><span className="block text-[13px] text-muted">Erinnerungen kommen zu dieser Stunde</span></span>
            <select value={prefs.time} onChange={(e) => void update({ ...prefs, time: e.target.value })} className="h-10 rounded-full border border-card-line bg-surface px-3 text-[14px] font-semibold">{TIMES.map((t) => <option key={t} value={t}>{t} Uhr</option>)}</select>
          </div>
          <div className="flex items-center justify-between gap-4 p-5">
            <span><b className="text-[14px]">Überfällige wöchentlich</b><span className="block text-[13px] text-muted">Montags eine Zusammenfassung, was noch offen und überfällig ist</span></span>
            <Switch on={prefs.overdueWeekly} onChange={(v) => void update({ ...prefs, overdueWeekly: v })} label="Überfällige wöchentlich" />
          </div>
          <div className="p-5">
            <b className="text-[14px]">Wofür?</b>
            <span className="block text-[13px] text-muted">Nur diese Arten von Aufgaben</span>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {ALL_KINDS.map((k) => { const K = KIND[k]; const sel = prefs.kinds.includes(k); return (
                <button key={k} type="button" aria-pressed={sel} onClick={() => void update({ ...prefs, kinds: sel ? prefs.kinds.filter((x) => x !== k) : [...prefs.kinds, k] })} className={`inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-[13px] font-semibold ${sel ? "border border-fg text-fg" : "border border-card-line text-muted line-through"}`}><K.icon size={13} strokeWidth={2.4} />{K.label}</button>
              ); })}
            </div>
          </div>
        </section>
      )}
    </div>
  );
}

const loadDone = (): string[] => { try { return JSON.parse(localStorage.getItem("lifevault:todo-done") ?? "[]"); } catch { return []; } };
