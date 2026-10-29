"use client";
import { useEffect, useRef, useState } from "react";
import { Loader2, LockKeyhole } from "lucide-react";
import { supabase } from "@/lib/supabase";

/**
 * App-Sperre mit PIN (wie bei Finastry): nach X Minuten ohne Bedienung bleibt man angemeldet, die App ist aber gesperrt,
 * bis die PIN stimmt. Geprüft wird in der Datenbank (pin_verify, bcrypt); nach 5 Fehlversuchen: abmelden.
 * Sperrzustand und Minuten liegen pro Gerät im localStorage.
 */
const LOCKED = "lifevault:locked";
const LAST = "lifevault:last-active";
const MIN = "lifevault:lock-minutes";
const SKIP = "lifevault:pin-skip";
const EVT = "lifevault:lock-change";

const get = (k: string) => { try { return localStorage.getItem(k); } catch { return null; } };
const set = (k: string, v: string | null) => { try { if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch { /* egal */ } };

export const lockMinutes = () => { const v = Number(get(MIN)); return Number.isFinite(v) && get(MIN) !== null ? v : 15; };
export const setLockMinutes = (m: number) => { set(MIN, String(m)); window.dispatchEvent(new Event(EVT)); };
export const lockApp = () => { set(LOCKED, "1"); window.dispatchEvent(new Event(EVT)); };
export const unlockApp = () => { set(LOCKED, null); set(LAST, String(Date.now())); window.dispatchEvent(new Event(EVT)); };

export async function pinStatus() { const { data } = await supabase.rpc("pin_status"); return !!data; }
export async function setPin(pin: string, current?: string) { const { data, error } = await supabase.rpc("pin_set", { p_new: pin, p_current: current ?? null }); if (error) throw new Error("PIN konnte nicht gespeichert werden."); return !!data; }
export async function removePin(current: string) { const { data } = await supabase.rpc("pin_remove", { p_current: current }); return !!data; }
async function verifyPin(pin: string) { const { data, error } = await supabase.rpc("pin_verify", { p_pin: pin }); if (error) throw new Error("Prüfen hat nicht geklappt. Bitte erneut versuchen."); return data as { ok: boolean; left?: number; signOut?: boolean }; }

/** Vier Kästchen mit unsichtbarem Ziffernfeld (Handy: Zahlentastatur); bei 4 Ziffern geht es los */
export function PinInput({ onDone, disabled, error }: { onDone: (pin: string) => void; disabled?: boolean; error?: boolean }) {
  const [v, setV] = useState("");
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => { if (error) setV(""); }, [error]);
  useEffect(() => { ref.current?.focus(); }, [disabled]);
  return (
    <label className="relative mx-auto mt-6 flex w-fit cursor-text gap-3" onClick={() => ref.current?.focus()}>
      {[0, 1, 2, 3].map((i) => (
        <span key={i} className={`grid h-14 w-12 place-items-center rounded-2xl border-2 bg-surface text-2xl font-bold transition-colors ${error ? "border-negative" : i === v.length ? "border-brand-500" : "border-card-line"}`}>{v[i] ? "•" : ""}</span>
      ))}
      <input ref={ref} value={v} disabled={disabled} inputMode="numeric" autoComplete="off" aria-label="PIN, 4 Ziffern" maxLength={4}
        onChange={(e) => { const n = e.target.value.replace(/\D/g, "").slice(0, 4); setV(n); if (n.length === 4) onDone(n); }}
        className="absolute inset-0 opacity-0" />
    </label>
  );
}

export function PinFrame({ title, text, children }: { title: string; text: string; children: React.ReactNode }) {
  return (
    <main className="fixed inset-0 z-[60] grid place-items-center bg-page px-5">
      <div className="w-full max-w-sm rounded-3xl border border-card-line bg-surface p-7 text-center shadow-card">
        <span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-brand-500 text-white"><LockKeyhole size={22} /></span>
        <h1 className="mt-4 text-[22px] leading-8 font-bold">{title}</h1>
        <p className="mt-1 text-[14px] text-soft">{text}</p>
        {children}
      </div>
    </main>
  );
}

function LockScreen() {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string>();
  const [wrong, setWrong] = useState(0);
  const signOut = async () => { set(LOCKED, null); await supabase.auth.signOut(); location.href = "/login"; };
  return (
    <PinFrame title="Lifevault gesperrt" text="Gib deine PIN ein, um weiterzumachen.">
      <PinInput key={wrong} disabled={busy} error={wrong > 0 && !!msg} onDone={async (pin) => {
        setBusy(true); setMsg(undefined);
        try {
          const r = await verifyPin(pin);
          if (r.ok) return unlockApp();
          if (r.signOut) return void signOut();
          setWrong((w) => w + 1);
          setMsg(`PIN falsch. Noch ${r.left} ${r.left === 1 ? "Versuch" : "Versuche"}, dann musst du dich neu anmelden.`);
        } catch (e) { setMsg((e as Error).message); } finally { setBusy(false); }
      }} />
      <p className="mt-3 min-h-5 text-[13px] text-negative-text" role="alert">{busy ? <Loader2 size={16} className="mx-auto animate-spin text-muted" /> : msg}</p>
      <button type="button" onClick={() => void signOut()} className="mt-4 text-[13px] font-semibold text-selected hover:underline">PIN vergessen? Mit Passwort anmelden</button>
    </PinFrame>
  );
}

/** PIN festlegen (zweimal eingeben); onSkip optional für „Später“ */
export function PinSetup({ onDone, onSkip }: { onDone: () => void; onSkip?: () => void }) {
  const [first, setFirst] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string>();
  const [round, setRound] = useState(0);
  return (
    <PinFrame title={first ? "PIN wiederholen" : "PIN festlegen"} text={first ? "Zur Sicherheit noch einmal." : `4 Ziffern. Lifevault sperrt sich nach ${lockMinutes()} Minuten ohne Bedienung – mit der PIN bist du sofort wieder drin.`}>
      <PinInput key={`${first ?? ""}-${round}`} disabled={busy} error={!!msg} onDone={async (pin) => {
        if (!first) { setFirst(pin); setMsg(undefined); return; }
        if (pin !== first) { setFirst(undefined); setRound((r) => r + 1); setMsg("Die beiden PINs waren nicht gleich. Bitte neu festlegen."); return; }
        setBusy(true);
        try { if (!(await setPin(pin))) throw new Error("PIN konnte nicht gespeichert werden."); unlockApp(); onDone(); }
        catch (e) { setMsg((e as Error).message); setFirst(undefined); setRound((r) => r + 1); }
        finally { setBusy(false); }
      }} />
      <p className="mt-3 min-h-5 text-[13px] text-negative-text" role="alert">{msg}</p>
      {onSkip && <button type="button" onClick={onSkip} className="mt-2 text-[13px] font-semibold text-muted hover:text-fg">Später</button>}
    </PinFrame>
  );
}

/** Umschließt die App: PIN einrichten (einmal anbieten), Inaktivität messen, bei Bedarf sperren */
export function LockGate({ children }: { children: React.ReactNode }) {
  const [hasPin, setHasPin] = useState<boolean>();
  const [locked, setLocked] = useState(false);
  const [skip, setSkip] = useState(true);
  useEffect(() => {
    void pinStatus().then(setHasPin).catch(() => setHasPin(true));
    setSkip(get(SKIP) === "1");
    const sync = () => setLocked(get(LOCKED) === "1");
    sync();
    window.addEventListener(EVT, sync);
    window.addEventListener("storage", sync);
    return () => { window.removeEventListener(EVT, sync); window.removeEventListener("storage", sync); };
  }, []);
  // Inaktivität: letzte Bedienung merken (alle Tabs), regelmäßig und beim Zurückkehren prüfen
  useEffect(() => {
    if (!hasPin) return;
    let lastWrite = 0;
    const touch = () => { const now = Date.now(); if (now - lastWrite > 5000) { lastWrite = now; set(LAST, String(now)); } };
    const check = () => {
      const m = lockMinutes();
      if (!m || get(LOCKED) === "1") return;
      const last = Number(get(LAST)) || Date.now();
      if (Date.now() - last > m * 60_000) lockApp();
    };
    if (!get(LAST)) set(LAST, String(Date.now()));
    check();
    const evs = ["pointerdown", "keydown", "scroll", "touchstart"] as const;
    evs.forEach((e) => window.addEventListener(e, touch, { passive: true }));
    const vis = () => (document.visibilityState === "visible" ? check() : touch());
    document.addEventListener("visibilitychange", vis);
    const t = setInterval(check, 30_000);
    return () => { evs.forEach((e) => window.removeEventListener(e, touch)); document.removeEventListener("visibilitychange", vis); clearInterval(t); };
  }, [hasPin]);

  if (hasPin === false && !skip) return <PinSetup onDone={() => setHasPin(true)} onSkip={() => { set(SKIP, "1"); setSkip(true); }} />;
  if (hasPin && locked) return <LockScreen />;
  return <>{children}</>;
}

export function useLockSettings() {
  const [minutes, setM] = useState(15);
  const [hasPin, setHasPin] = useState<boolean>();
  useEffect(() => {
    setM(lockMinutes());
    void pinStatus().then(setHasPin);
    const sync = () => setM(lockMinutes());
    window.addEventListener(EVT, sync);
    return () => window.removeEventListener(EVT, sync);
  }, []);
  return { minutes, setMinutes: setLockMinutes, hasPin, refresh: () => void pinStatus().then(setHasPin) };
}
