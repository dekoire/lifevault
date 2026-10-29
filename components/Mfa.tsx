"use client";
import { useEffect, useState } from "react";
import { Loader2, LogOut, ShieldCheck } from "lucide-react";
import { LogoMark } from "@/components/Logo";
import { supabase } from "@/lib/supabase";

const codeField = "h-14 w-full rounded-xl border border-card-line bg-surface px-4 text-center text-[24px] tracking-[0.4em] tnum outline-none focus:border-brand-500 focus:ring-4 focus:ring-brand-500/10";

/** Code aus der Authenticator-App eingeben (nach dem Anmelden) */
export function MfaChallenge({ onDone }: { onDone: () => void }) {
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(undefined);
    const { data } = await supabase.auth.mfa.listFactors();
    const f = data?.totp.find((x) => x.status === "verified");
    if (!f) { setBusy(false); return setError("Kein Authenticator eingerichtet."); }
    const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId: f.id, code: code.trim() });
    setBusy(false);
    if (error) return setError("Der Code stimmt nicht oder ist abgelaufen.");
    onDone();
  };
  return (
    <Screen title="Bestätigungscode" text="Öffne deine Authenticator-App und gib den 6-stelligen Code für Lifevault ein.">
      <form onSubmit={submit} className="space-y-4">
        <input autoFocus inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} placeholder="000000" className={codeField} />
        {error && <p role="alert" className="rounded-xl bg-negative/10 px-3.5 py-2.5 text-sm text-negative-text">{error}</p>}
        <button type="submit" disabled={busy || code.length !== 6} className="flex h-12 w-full items-center justify-center gap-2 rounded-full bg-brand-500 font-semibold text-white disabled:opacity-60">{busy && <Loader2 size={18} className="animate-spin" />} Bestätigen</button>
      </form>
    </Screen>
  );
}

/** Authenticator einrichten: QR-Code scannen, Code bestätigen */
export function MfaEnroll({ onDone, forced = false }: { onDone: () => void; forced?: boolean }) {
  const [factor, setFactor] = useState<{ id: string; qr: string; secret: string }>();
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  useEffect(() => {
    void (async () => {
      // alte, nicht bestätigte Versuche aufräumen
      const { data } = await supabase.auth.mfa.listFactors();
      for (const f of data?.all ?? []) if (f.status !== "verified") await supabase.auth.mfa.unenroll({ factorId: f.id });
      const r = await supabase.auth.mfa.enroll({ factorType: "totp", friendlyName: `Lifevault ${new Date().toLocaleDateString("de-DE")}` });
      if (r.error || !r.data) return setError(r.error?.message ?? "Einrichten nicht möglich.");
      setFactor({ id: r.data.id, qr: r.data.totp.qr_code, secret: r.data.totp.secret });
    })();
  }, []);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!factor) return;
    setBusy(true);
    setError(undefined);
    const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId: factor.id, code: code.trim() });
    setBusy(false);
    if (error) return setError("Der Code stimmt nicht. Bitte den aktuellen Code aus der App eingeben.");
    onDone();
  };
  const body = (
    <form onSubmit={submit} className="space-y-4">
      <ol className="space-y-1.5 text-[14px] text-soft">
        <li>1. Authenticator-App öffnen (z. B. Google Authenticator, 1Password, Proton Pass).</li>
        <li>2. QR-Code scannen oder den Schlüssel von Hand eingeben.</li>
        <li>3. Den 6-stelligen Code hier bestätigen.</li>
      </ol>
      <div className="grid place-items-center rounded-2xl border border-card-line bg-white p-4">
        {factor ? <img src={factor.qr} alt="QR-Code für die Authenticator-App" className="h-44 w-44" /> : <Loader2 className="my-16 animate-spin text-muted" />}
      </div>
      {factor && <p className="text-center text-[12px] break-all text-muted">Schlüssel: <span className="font-mono text-soft select-all">{factor.secret}</span></p>}
      <input inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} placeholder="000000" className={codeField} />
      {error && <p role="alert" className="rounded-xl bg-negative/10 px-3.5 py-2.5 text-sm text-negative-text">{error}</p>}
      <button type="submit" disabled={busy || code.length !== 6 || !factor} className="flex h-12 w-full items-center justify-center gap-2 rounded-full bg-brand-500 font-semibold text-white disabled:opacity-60">{busy && <Loader2 size={18} className="animate-spin" />} Aktivieren</button>
    </form>
  );
  return forced ? <Screen title="Zwei-Faktor einrichten" text="Für Lifevault ist ein zweiter Faktor vorgeschrieben. Das dauert eine Minute.">{body}</Screen> : body;
}

function Screen({ title, text, children }: { title: string; text: string; children: React.ReactNode }) {
  return (
    <div className="grid min-h-dvh place-items-center bg-page px-5 pt-[max(2.5rem,env(safe-area-inset-top))] pb-10">
      <div className="w-full max-w-[400px]">
        <div className="mb-6 flex items-center gap-3"><LogoMark size={40} /><ShieldCheck size={22} className="text-positive" /></div>
        <h1 className="text-[26px] leading-8 font-[650] tracking-tight">{title}</h1>
        <p className="mt-1.5 mb-6 text-[15px] text-muted">{text}</p>
        {children}
        <button type="button" onClick={() => void supabase.auth.signOut()} className="mx-auto mt-6 flex items-center gap-1.5 text-[13px] font-semibold text-muted hover:text-fg"><LogOut size={14} /> Abmelden</button>
      </div>
    </div>
  );
}
