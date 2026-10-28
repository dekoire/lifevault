"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import { supabase } from "@/lib/supabase";

const field = "h-12 w-full rounded-xl border border-card-line bg-surface px-4 text-[15px] outline-none transition placeholder:text-muted focus:border-brand-500 focus:ring-4 focus:ring-brand-500/10";

/** Anmelden bzw. Registrieren mit E-Mail und Passwort */
export function AuthForm({ mode }: { mode: "login" | "register" }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [info, setInfo] = useState<string>();
  const login = mode === "login";

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(undefined);
    setInfo(undefined);
    try {
      if (login) {
        const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
        if (error) throw new Error(error.message === "Invalid login credentials" ? "E-Mail oder Passwort stimmt nicht." : error.message);
        router.replace("/");
      } else {
        if (password.length < 8) throw new Error("Das Passwort braucht mindestens 8 Zeichen.");
        const { data, error } = await supabase.auth.signUp({ email: email.trim(), password, options: { emailRedirectTo: `${location.origin}/` } });
        if (error) throw new Error(error.message);
        if (data.session) router.replace("/");
        else setInfo("Fast geschafft: Bestätige deine E-Mail-Adresse über den Link, den wir dir geschickt haben.");
      }
    } catch (err) {
      setError((err as Error).message || "Das hat nicht geklappt.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="sheet-up">
      <h1 className="text-[28px] leading-9 font-[650] tracking-tight">{login ? "Willkommen zurück" : "Konto erstellen"}</h1>
      <p className="mt-1.5 text-[15px] text-muted">{login ? "Melde dich an, um deine Unterlagen zu sehen." : "Dein Tresor für alle Unterlagen – in einer Minute eingerichtet."}</p>
      <form onSubmit={submit} className="mt-8 space-y-4">
        <label className="block">
          <span className="mb-1.5 block text-[13px] font-semibold text-soft">E-Mail</span>
          <input type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="du@beispiel.de" className={field} />
        </label>
        <label className="block">
          <span className="mb-1.5 block text-[13px] font-semibold text-soft">Passwort</span>
          <span className="relative block">
            <input type={show ? "text" : "password"} autoComplete={login ? "current-password" : "new-password"} required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} placeholder={login ? "Dein Passwort" : "Mindestens 8 Zeichen"} className={`${field} pr-12`} />
            <button type="button" onClick={() => setShow(!show)} aria-label={show ? "Passwort verbergen" : "Passwort zeigen"} className="absolute top-1/2 right-2 grid h-9 w-9 -translate-y-1/2 place-items-center rounded-lg text-muted hover:text-fg">{show ? <EyeOff size={18} /> : <Eye size={18} />}</button>
          </span>
        </label>
        {error && <p role="alert" className="rounded-xl bg-negative/10 px-3.5 py-2.5 text-sm text-negative-text">{error}</p>}
        {info && <p role="status" className="rounded-xl bg-lavender px-3.5 py-2.5 text-sm text-selected">{info}</p>}
        <button type="submit" disabled={busy} className="flex h-12 w-full items-center justify-center gap-2 rounded-full bg-brand-500 text-[15px] font-semibold text-white shadow-[0_8px_24px_rgba(109,74,255,.3)] transition hover:bg-brand-600 disabled:opacity-70">
          {busy && <Loader2 size={18} className="animate-spin" />} {login ? "Anmelden" : "Konto erstellen"}
        </button>
      </form>
      <p className="mt-6 text-center text-sm text-muted">
        {login ? <>Neu hier? <Link href="/register" className="font-semibold text-selected hover:underline">Konto erstellen</Link></> : <>Schon ein Konto? <Link href="/login" className="font-semibold text-selected hover:underline">Anmelden</Link></>}
      </p>
    </div>
  );
}
