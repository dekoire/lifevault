"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Check, Eye, EyeOff, Loader2, ShieldCheck, X } from "lucide-react";
import { useMe } from "@/lib/me";
import { REMEMBER_MIN, unlockVault } from "@/lib/vault";

/** Ganze Karte im Lila-Verlauf (wie der Tresor in Notara, dort blau) */
const VAULT_BG = "linear-gradient(135deg, #0e0920 0%, #23125c 42%, #4a28b8 78%, #6d4aff 100%)";
const VAULT_EDGE = "inset 0 0 0 1px rgba(255,255,255,.12)";

/**
 * Schloss mit beweglichem Bügel: `open` → der Bügel springt hoch und klappt zur Seite, sonst rastet er federnd ein.
 * Jeder Wechsel spielt die Bewegung (auch beim ersten Erscheinen: es schließt sich). CSS: `.lock-anim` in globals.css.
 */
export function AnimatedLock({ open, size = 20, className = "" }: { open: boolean; size?: number; className?: string }) {
  const [shown, setShown] = useState(!open);
  useEffect(() => { const id = requestAnimationFrame(() => setShown(open)); return () => cancelAnimationFrame(id); }, [open]);
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={`lock-anim ${shown ? "is-open" : ""} ${className}`} aria-hidden>
      <path className="lock-shackle" d="M7 11V7.5a5 5 0 0 1 10 0V11" />
      <rect className="lock-body" x="4" y="11" width="16" height="10" rx="2.5" />
      <circle cx="12" cy="16" r="1.4" fill="currentColor" stroke="none" />
    </svg>
  );
}

/**
 * Tresor entsperren – die ganze Karte im Lila-Verlauf: animiertes Schloss, Frage, weißes Passwortfeld, großer Kreis
 * „15 Min. entsperrt lassen“, weiße Knöpfe. Nach dem richtigen Passwort springt das Schloss sichtbar auf, dann geht der
 * Tresor auf (`beforeOpen` an `unlockVault`). Das Passwort bleibt im Gerät. `compact`: für Chat, Export, Einstellungen.
 */
export function VaultUnlock({ text = "Dieses Dokument ist verschlüsselt. Gib dein Tresor-Passwort ein, um Inhalt und Original zu sehen.", title = "Verschlüsselt", compact = false, footer, onClose }: { text?: React.ReactNode; title?: string; compact?: boolean; footer?: React.ReactNode; onClose?: () => void }) {
  const { vault } = useMe();
  const [pw, setPw] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [opening, setOpening] = useState(false);
  const [caps, setCaps] = useState(false);
  const [error, setError] = useState<string>();
  const [keep, setKeep] = useState(() => { try { return localStorage.getItem("lifevault:vault-keep") !== "0"; } catch { return true; } });
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!vault || opening) return;
    setBusy(true);
    setError(undefined);
    try {
      try { localStorage.setItem("lifevault:vault-keep", keep ? "1" : "0"); } catch { /* egal */ }
      await unlockVault(pw, vault.salt, vault.verifier, keep ? REMEMBER_MIN : 0, async () => {
        setBusy(false);
        setOpening(true);
        await new Promise((r) => setTimeout(r, 650));
      });
    } catch (err) { setError((err as Error).message); setOpening(false); } finally { setBusy(false); }
  };

  return (
    <div className={`w-full rounded-3xl p-4 text-left text-white sm:p-5 ${compact ? "" : "mx-auto max-w-md"}`} style={{ backgroundImage: VAULT_BG, boxShadow: `${VAULT_EDGE}, 0 20px 50px -20px rgba(109,74,255,.55)` }}>
      <div className="flex items-start gap-3">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-white/12"><AnimatedLock open={opening} size={24} /></span>
        <span className="min-w-0 flex-1 pt-0.5">
          <b className="block text-[16px] leading-6">{vault ? title : "Noch kein Tresor"}</b>
          <span className="block text-[13px] leading-5 text-white/80">{vault ? text : "Lege einen Tresor an, um Dokumente Ende-zu-Ende zu verschlüsseln."}</span>
        </span>
        {onClose && <button type="button" onClick={onClose} aria-label="Schließen" className="-mt-1 -mr-1.5 grid h-9 w-9 shrink-0 place-items-center rounded-full text-white/80 hover:bg-white/10 hover:text-white"><X size={17} /></button>}
      </div>
      {vault ? (
        <form onSubmit={submit}>
          <label className="relative mt-3 block">
            <input type={show ? "text" : "password"} autoComplete="current-password" value={pw} onChange={(e) => setPw(e.target.value)} onKeyUp={(e) => setCaps(e.getModifierState?.("CapsLock") ?? false)} placeholder="Tresor-Passwort" aria-label="Tresor-Passwort" autoFocus={!compact} data-own-focus
              className={`vault-input h-12 w-full rounded-full border bg-white pr-20 pl-5 text-[15px] text-[#111] outline-none placeholder:text-[#888] ${error ? "border-negative" : "border-transparent"}`} />
            <button type="button" onClick={() => setShow(!show)} aria-label={show ? "Passwort verbergen" : "Passwort zeigen"} className="absolute top-1/2 right-2 grid h-9 w-9 -translate-y-1/2 place-items-center rounded-full text-[#777] hover:bg-black/5 hover:text-[#111]">{show ? <EyeOff size={16} /> : <Eye size={16} />}</button>
          </label>
          <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
            <label className="-my-1 inline-flex min-h-11 cursor-pointer items-center gap-2.5 py-1 pr-2 text-[14px] text-white/90">
              <input type="checkbox" checked={keep} onChange={(e) => setKeep(e.target.checked)} className="peer sr-only" />
              <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-full transition peer-focus-visible:ring-2 peer-focus-visible:ring-white/60 ${keep ? "bg-white" : "border-2 border-white/60"}`}>{keep && <Check size={16} strokeWidth={3.2} className="text-brand-600" />}</span>
              {REMEMBER_MIN} Min. entsperrt lassen
            </label>
            {error ? <span role="alert" className="rounded-full bg-white px-3 py-1.5 text-[12px] font-semibold text-negative-text">{error}</span> : caps && <span className="rounded-full bg-white/15 px-3 py-1.5 text-[12px] font-semibold">Feststelltaste an</span>}
          </div>
          <div className="mt-3 flex gap-2 [&>*]:h-11 [&>*]:flex-1 [&>*:not([type=submit])]:rounded-full [&>*:not([type=submit])]:border [&>*:not([type=submit])]:border-white/35 [&>*:not([type=submit])]:bg-transparent [&>*:not([type=submit])]:text-white [&>*:not([type=submit])]:hover:bg-white/10">
            {footer}
            <button type="submit" disabled={!opening && (busy || !pw)} className="inline-flex items-center justify-center gap-1.5 rounded-full bg-white px-4 text-[14px] font-semibold text-brand-700 transition hover:bg-white/90 disabled:opacity-50">
              {busy && <Loader2 size={15} className="animate-spin" />} {opening ? <><AnimatedLock open size={16} /> Offen</> : "Entsperren"}
            </button>
          </div>
          <p className="mt-3 flex items-center justify-center gap-1.5 text-center text-[12px] text-white/70"><ShieldCheck size={14} /> Das Passwort verlässt dein Gerät nicht</p>
        </form>
      ) : (
        <Link href="/einstellungen/tresor" className="mt-3 inline-flex h-11 items-center rounded-full bg-white px-5 text-[14px] font-semibold text-brand-700">Tresor einrichten</Link>
      )}
    </div>
  );
}
