"use client";
import { IconTile } from "@/components/ClusterIcon";
import { useState } from "react";
import { Lock, Timer } from "lucide-react";
import { CARD } from "@/components/ui";
import { PinFrame, PinInput, PinSetup, lockApp, removePin, useLockSettings } from "@/lib/applock";

const OPTIONS = [1, 5, 15, 30, 60, 0];
const label = (m: number) => (m === 0 ? "Nie" : m === 60 ? "1 Stunde" : `${m} Minuten`);

/** Einstellungen › App-Sperre: PIN festlegen/ändern/entfernen, nach wie vielen Minuten gesperrt wird */
export function AppLockSettings() {
  const { minutes, setMinutes, hasPin, refresh } = useLockSettings();
  const [mode, setMode] = useState<"set" | "remove">();
  const [msg, setMsg] = useState<string>();
  if (mode === "set") return <PinSetup onDone={() => { setMode(undefined); refresh(); setMsg("PIN gespeichert."); }} onSkip={() => setMode(undefined)} />;
  if (mode === "remove") return (
    <PinFrame title="PIN entfernen" text="Gib deine aktuelle PIN ein.">
      <PinInput onDone={async (pin) => { const ok = await removePin(pin); setMode(undefined); refresh(); setMsg(ok ? "PIN entfernt – die App sperrt sich nicht mehr." : "PIN war falsch."); }} />
      <button type="button" onClick={() => setMode(undefined)} className="mt-6 text-[13px] font-semibold text-muted hover:text-fg">Abbrechen</button>
    </PinFrame>
  );
  return (
    <div className="space-y-4">
      <section className={`${CARD} p-5`}>
        <div className="flex items-start gap-3">
          <IconTile icon={Lock} size={40} color="#64748b" />
          <span className="min-w-0 flex-1"><b className="text-[15px]">PIN</b><span className="mt-0.5 block text-[13px] text-muted">{hasPin === undefined ? "Lädt …" : hasPin ? "Eingerichtet. Nach 5 falschen Versuchen wirst du abgemeldet." : "Noch keine PIN. Ohne PIN sperrt sich die App nicht."}</span></span>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <button type="button" onClick={() => setMode("set")} className="inline-flex h-9 items-center rounded-full bg-fg px-4 text-[13px] font-semibold text-canvas">{hasPin ? "PIN ändern" : "PIN festlegen"}</button>
          {hasPin && <button type="button" onClick={() => setMode("remove")} className="inline-flex h-9 items-center rounded-full border border-card-line px-4 text-[13px] font-semibold hover:bg-surface-2">PIN entfernen</button>}
          {hasPin && <button type="button" onClick={lockApp} className="inline-flex h-9 items-center rounded-full border border-card-line px-4 text-[13px] font-semibold hover:bg-surface-2">Jetzt sperren</button>}
        </div>
        {msg && <p className="mt-3 text-[13px] font-semibold text-positive-text">{msg}</p>}
      </section>
      <section className={`${CARD} p-5`}>
        <div className="flex items-start gap-3">
          <IconTile icon={Timer} size={40} color="#64748b" />
          <span><b className="text-[15px]">Sperren nach</b><span className="mt-0.5 block text-[13px] text-muted">So lange ohne Bedienung, dann fragt Lifevault nach der PIN (gilt für dieses Gerät).</span></span>
        </div>
        <div className="mt-4 flex flex-wrap gap-1.5">
          {OPTIONS.map((m) => <button key={m} type="button" aria-pressed={minutes === m} onClick={() => setMinutes(m)} className={`h-8 rounded-full px-3.5 text-[13px] font-semibold ${minutes === m ? "bg-fg text-canvas" : "border border-card-line text-soft hover:text-fg"}`}>{label(m)}</button>)}
        </div>
      </section>
    </div>
  );
}
