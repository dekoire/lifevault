"use client";
import { IconTile } from "@/components/ClusterIcon";
import Link from "next/link";
import { useState } from "react";
import { Check, Eye, EyeOff, Loader2, LockKeyhole, X } from "lucide-react";
import { useMe } from "@/lib/me";
import { REMEMBER_MIN, unlockVault } from "@/lib/vault";

/** Tresor entsperren – Box wie die PIN-Abfrage (Passwort bleibt im Gerät) */
export function VaultUnlock({ text = "Dieses Dokument ist verschlüsselt. Gib dein Tresor-Passwort ein, um Inhalt und Original zu sehen.", title = "Verschlüsselt", compact = false, footer, onClose }: { text?: React.ReactNode; title?: string; compact?: boolean; footer?: React.ReactNode; onClose?: () => void }) {
  const { vault } = useMe();
  const [pw, setPw] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [keep, setKeep] = useState(() => { try { return localStorage.getItem("lifevault:vault-keep") !== "0"; } catch { return true; } });
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!vault) return;
    setBusy(true);
    setError(undefined);
    try { try { localStorage.setItem("lifevault:vault-keep", keep ? "1" : "0"); } catch { /* egal */ } await unlockVault(pw, vault.salt, vault.verifier, keep ? REMEMBER_MIN : 0); } catch (err) { setError((err as Error).message); } finally { setBusy(false); }
  };
  const field = (cls: string) => (
    <label className={`relative block min-w-0 ${cls}`}>
      <input type={show ? "text" : "password"} autoComplete="current-password" value={pw} onChange={(e) => setPw(e.target.value)} placeholder="Tresor-Passwort" aria-label="Tresor-Passwort" autoFocus={!compact} data-own-focus
        className={`h-10 w-full rounded-full border bg-surface pr-10 pl-4 text-[14px] outline-none focus:border-brand-500 ${error ? "border-negative" : "border-card-line"}`} />
      <button type="button" onClick={() => setShow(!show)} aria-label={show ? "Passwort verbergen" : "Passwort zeigen"} className="absolute top-1/2 right-2 grid h-7 w-7 -translate-y-1/2 place-items-center rounded-full text-muted hover:text-fg">{show ? <EyeOff size={15} /> : <Eye size={15} />}</button>
    </label>
  );
  // rundes Häkchen: weißer Kreis, lila Haken
  const keepBox = (
    <label className="inline-flex cursor-pointer items-center gap-2 text-[13px] text-muted">
      <input type="checkbox" checked={keep} onChange={(e) => setKeep(e.target.checked)} className="peer sr-only" />
      <span className="grid h-[18px] w-[18px] shrink-0 place-items-center rounded-full border border-card-line bg-white peer-focus-visible:ring-2 peer-focus-visible:ring-white/60">{keep && <Check size={12} strokeWidth={3.2} className="text-brand-600" />}</span>
      {REMEMBER_MIN} Min. entsperrt lassen
    </label>
  );
  const button = <button type="submit" disabled={busy || !pw} className="inline-flex h-10 shrink-0 items-center justify-center gap-1.5 rounded-full bg-brand-500 px-4 text-[14px] font-semibold text-white disabled:opacity-50">{busy && <Loader2 size={14} className="animate-spin" />} Entsperren</button>;

  // kompakt: lila Karte mit Frage, Feld und Häkchen – die Knöpfe stehen darunter, außerhalb der Karte
  const card = (inner?: React.ReactNode) => (
    <div className="w-full rounded-2xl px-3.5 py-3 text-white shadow-card" style={{ background: "var(--accent-grad, linear-gradient(120deg,#5530c9 0%,#6438da 55%,#7650e6 100%))" }}>
      <div className="flex items-start gap-3">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-[10px] bg-white/15 text-white"><LockKeyhole size={16} /></span>
        <span className="min-w-0 flex-1 pt-0.5">
          <b className="block text-[14px] leading-5">{vault ? title : "Noch kein Tresor"}</b>
          <span className="block text-[12px] leading-4 text-white/75">{vault ? text : "Lege einen Tresor an, um Dokumente zu verschlüsseln."}</span>
        </span>
        {onClose && <button type="button" onClick={onClose} aria-label="Schließen" className="-mt-1 -mr-1.5 grid h-8 w-8 shrink-0 place-items-center rounded-full text-white/75 hover:bg-white/10 hover:text-white"><X size={16} /></button>}
      </div>
      {inner}
    </div>
  );
  if (compact) return vault ? (
    <form onSubmit={submit} className="w-full">
      {card(<>
        <div className="mt-2.5 [&_input]:border-transparent [&_input]:text-fg">{field("")}</div>
        <div className="mt-2 flex items-center justify-between gap-2 pl-0.5 [&_label]:text-white/85 [&_label>span]:border-transparent">{keepBox}{error && <span className="rounded-full bg-white px-3 py-1 text-[12px] text-negative-text" role="alert">{error}</span>}</div>
      </>)}
      <div className="mt-2.5 flex gap-2 [&>*]:h-10 [&>*]:flex-1">
        {footer}
        <button type="submit" disabled={busy || !pw} className="inline-flex items-center justify-center gap-1.5 rounded-full bg-fg px-4 text-[14px] font-semibold text-canvas disabled:opacity-40">{busy && <Loader2 size={14} className="animate-spin" />} Entsperren</button>
      </div>
    </form>
  ) : card(<Link href="/einstellungen/tresor" className="mt-2.5 inline-flex h-9 items-center rounded-full bg-white px-4 text-[13px] font-semibold text-brand-600">Tresor einrichten</Link>);

  return (
    <div className="mx-auto w-full max-w-sm rounded-3xl border border-card-line bg-surface px-6 py-6 text-center shadow-card">
      <IconTile icon={LockKeyhole} size={40} className="mx-auto" />
      <h2 className="mt-3 text-[16px] leading-6 font-semibold">{vault ? title : "Noch kein Tresor"}</h2>
      <p className="mt-0.5 text-[13px] text-soft">{vault ? text : "Lege einen Tresor an, um Dokumente Ende-zu-Ende zu verschlüsseln."}</p>
      {vault ? (
        <form onSubmit={submit} className="mt-4 space-y-2.5">
          {field("")}
          <button type="submit" disabled={busy || !pw} className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-full bg-brand-500 text-[14px] font-semibold text-white disabled:opacity-50">{busy && <Loader2 size={15} className="animate-spin" />} Entsperren</button>
          <div>{keepBox}</div>
          {error && <p className="text-[13px] text-negative-text" role="alert">{error}</p>}
          <p className="text-[12px] text-muted">Das Passwort verlässt dein Gerät nicht.</p>
        </form>
      ) : (
        <Link href="/einstellungen/tresor" className="mt-4 inline-flex h-10 items-center rounded-full bg-brand-500 px-5 text-[14px] font-semibold text-white">Tresor einrichten</Link>
      )}
    </div>
  );
}
