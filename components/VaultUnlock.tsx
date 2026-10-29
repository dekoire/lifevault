"use client";
import Link from "next/link";
import { useState } from "react";
import { Loader2, Lock } from "lucide-react";
import { useMe } from "@/lib/me";
import { unlockVault } from "@/lib/vault";

/** Tresor entsperren (Passwort bleibt im Gerät) */
export function VaultUnlock({ text = "Dieses Dokument ist verschlüsselt. Entsperre deinen Tresor, um es zu sehen." }: { text?: string }) {
  const { vault } = useMe();
  const [pw, setPw] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  if (!vault) return <p className="rounded-xl border border-card-line bg-surface p-4 text-[14px] text-fg">Noch kein Tresor eingerichtet. <Link href="/einstellungen/tresor" className="font-semibold underline">Jetzt einrichten</Link></p>;
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(undefined);
    try { await unlockVault(pw, vault.salt, vault.verifier); } catch (err) { setError((err as Error).message); } finally { setBusy(false); }
  };
  return (
    <form onSubmit={submit} className="rounded-2xl border border-card-line bg-surface p-4">
      <p className="flex items-center gap-2 text-[14px] font-semibold text-fg"><Lock size={16} /> {text}</p>
      <div className="mt-3 flex gap-2">
        <input type="password" autoComplete="current-password" value={pw} onChange={(e) => setPw(e.target.value)} placeholder="Tresor-Passwort" className="h-11 min-w-0 flex-1 rounded-full border border-card-line bg-surface px-4 text-[15px] outline-none focus:border-brand-500" />
        <button type="submit" disabled={busy || !pw} className="inline-flex h-11 items-center gap-2 rounded-full bg-brand-500 px-5 text-[14px] font-semibold text-white disabled:opacity-60">{busy && <Loader2 size={16} className="animate-spin" />} Entsperren</button>
      </div>
      {error && <p className="mt-2 text-[13px] text-negative-text">{error}</p>}
    </form>
  );
}
