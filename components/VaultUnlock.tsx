"use client";
import Link from "next/link";
import { useState } from "react";
import { Eye, EyeOff, Loader2, LockKeyhole } from "lucide-react";
import { useMe } from "@/lib/me";
import { unlockVault } from "@/lib/vault";

/** Tresor entsperren – Box wie die PIN-Abfrage (Passwort bleibt im Gerät) */
export function VaultUnlock({ text = "Dieses Dokument ist verschlüsselt. Gib dein Tresor-Passwort ein, um Inhalt und Original zu sehen.", title = "Verschlüsselt", compact = false }: { text?: string; title?: string; compact?: boolean }) {
  const { vault } = useMe();
  const [pw, setPw] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!vault) return;
    setBusy(true);
    setError(undefined);
    try { await unlockVault(pw, vault.salt, vault.verifier); } catch (err) { setError((err as Error).message); } finally { setBusy(false); }
  };
  return (
    <div className={`mx-auto w-full rounded-3xl border border-card-line bg-surface text-center shadow-card ${compact ? "p-5" : "max-w-md p-7"}`}>
      <span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-brand-500 text-white"><LockKeyhole size={22} /></span>
      <h2 className="mt-4 text-[20px] leading-7 font-bold">{vault ? title : "Noch kein Tresor"}</h2>
      <p className="mt-1 text-[14px] text-soft">{vault ? text : "Lege einen Tresor an, um Dokumente Ende-zu-Ende zu verschlüsseln."}</p>
      {vault ? (
        <form onSubmit={submit} className="mt-5 space-y-3">
          <label className="relative block">
            <input type={show ? "text" : "password"} autoComplete="current-password" value={pw} onChange={(e) => setPw(e.target.value)} placeholder="Tresor-Passwort" aria-label="Tresor-Passwort" autoFocus={!compact}
              className={`h-13 w-full rounded-2xl border-2 bg-surface pr-12 pl-4 text-center text-[16px] outline-none focus:border-brand-500 ${error ? "border-negative" : "border-card-line"}`} />
            <button type="button" onClick={() => setShow(!show)} aria-label={show ? "Passwort verbergen" : "Passwort zeigen"} className="absolute top-1/2 right-3 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-full text-muted hover:text-fg">{show ? <EyeOff size={17} /> : <Eye size={17} />}</button>
          </label>
          <button type="submit" disabled={busy || !pw} className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-full bg-brand-500 text-[15px] font-semibold text-white disabled:opacity-50">{busy && <Loader2 size={16} className="animate-spin" />} Entsperren</button>
          <p className="min-h-5 text-[13px] text-negative-text" role="alert">{error}</p>
          <p className="text-[12px] text-muted">Das Passwort verlässt dein Gerät nicht. Der Tresor sperrt sich wieder, wenn du die App schließt.</p>
        </form>
      ) : (
        <Link href="/einstellungen/tresor" className="mt-5 inline-flex h-11 items-center rounded-full bg-brand-500 px-5 text-[14px] font-semibold text-white">Tresor einrichten</Link>
      )}
    </div>
  );
}
