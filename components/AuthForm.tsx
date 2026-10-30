"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Eye, EyeOff, Link2, Loader2 } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { peekNext, rememberNext, safeNext, takeNext } from "@/lib/next";

const field = "h-12 w-full rounded-xl border border-card-line bg-surface px-4 text-[15px] outline-none transition placeholder:text-muted focus:border-brand-500 focus:ring-4 focus:ring-brand-500/10";

/** Anmelden bzw. Registrieren mit E-Mail und Passwort */
export function AuthForm({ mode }: { mode: "login" | "register" }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [repeat, setRepeat] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [info, setInfo] = useState<string>();
  const login = mode === "login";
  // ?next=/connect?… (z. B. „Mit Lifevault verbinden“): merken, damit es nach Anmelden oder Registrieren weitergeht
  const [next, setNext] = useState<string>();
  useEffect(() => {
    const n = safeNext(new URLSearchParams(location.search).get("next"));
    if (n) rememberNext(n);
    setNext(n ?? peekNext());
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(undefined);
    setInfo(undefined);
    try {
      if (login) {
        const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
        if (error) throw new Error(error.message === "Invalid login credentials" ? "E-Mail oder Passwort stimmt nicht." : error.message);
        router.replace(takeNext() ?? "/");
      } else {
        if (password.length < 8) throw new Error("Das Passwort braucht mindestens 8 Zeichen.");
        if (password !== repeat) throw new Error("Die beiden Passwörter stimmen nicht überein.");
        const { data, error } = await supabase.auth.signUp({ email: email.trim(), password, options: { emailRedirectTo: `${location.origin}${next ?? "/"}` } });
        if (error) throw new Error(error.message);
        if (data.session) router.replace(takeNext() ?? "/");
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
      {next?.startsWith("/connect") && (
        <p className="mb-5 flex items-start gap-2 rounded-xl bg-brand-500/10 px-3.5 py-2.5 text-[13px] leading-5 text-selected"><Link2 size={16} className="mt-0.5 shrink-0" /> Eine App möchte sich mit deinem Lifevault verbinden. {login ? "Melde dich an" : "Erstelle ein Konto"} – danach siehst du genau, worauf sie zugreifen will, und entscheidest selbst.</p>
      )}
      <h1 className="text-[28px] leading-9 font-[650] tracking-tight">{login ? "Willkommen zurück" : "Konto erstellen"}</h1>
      <p className="mt-1.5 text-[15px] text-muted">{login ? "Melde dich an, um deine Unterlagen zu sehen." : "Dein Tresor für alle Unterlagen – in einer Minute eingerichtet."}</p>
      <div className="mt-8"><SocialLogin register={!login} /></div>
      <form onSubmit={submit} className="mt-4 space-y-4">
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
        {!login && (
          <label className="block">
            <span className="mb-1.5 block text-[13px] font-semibold text-soft">Passwort wiederholen</span>
            <input type={show ? "text" : "password"} autoComplete="new-password" required minLength={8} value={repeat} onChange={(e) => setRepeat(e.target.value)} placeholder="Noch einmal eingeben" aria-invalid={!!repeat && repeat !== password} className={`${field} ${repeat && repeat !== password ? "border-negative" : ""}`} />
            {repeat && repeat !== password && <span className="mt-1 block text-[12px] text-negative-text">Stimmt noch nicht mit dem Passwort überein.</span>}
          </label>
        )}
        {error && <p role="alert" className="rounded-xl bg-negative/10 px-3.5 py-2.5 text-sm text-negative-text">{error}</p>}
        {info && <p role="status" className="rounded-xl border border-card-line px-3.5 py-2.5 text-sm text-fg">{info}</p>}
        <button type="submit" disabled={busy} className="flex h-12 w-full items-center justify-center gap-2 rounded-full bg-brand-500 text-[15px] font-semibold text-white shadow-[0_8px_24px_rgba(109,74,255,.3)] transition hover:bg-brand-600 disabled:opacity-70">
          {busy && <Loader2 size={18} className="animate-spin" />} {login ? "Anmelden" : "Konto erstellen"}
        </button>
      </form>
      <p className="mt-6 text-center text-sm text-muted">
        {login ? <>Neu hier? <Link href={next ? `/register?next=${encodeURIComponent(next)}` : "/register"} className="font-semibold text-selected hover:underline">Konto erstellen</Link></> : <>Schon ein Konto? <Link href={next ? `/login?next=${encodeURIComponent(next)}` : "/login"} className="font-semibold text-selected hover:underline">Anmelden</Link></>}
      </p>
    </div>
  );
}

function GoogleLogo() {
  return (
    <svg viewBox="0 0 24 24" width={18} height={18} aria-hidden>
      <path fill="#4285F4" d="M23.5 12.27c0-.79-.07-1.54-.2-2.27H12v4.3h6.45a5.5 5.5 0 0 1-2.4 3.62v3h3.88c2.27-2.1 3.57-5.18 3.57-8.65z" />
      <path fill="#34A853" d="M12 24c3.24 0 5.96-1.07 7.95-2.9l-3.88-3c-1.08.72-2.45 1.15-4.07 1.15-3.13 0-5.78-2.11-6.73-4.95H1.27v3.1A12 12 0 0 0 12 24z" />
      <path fill="#FBBC05" d="M5.27 14.3a7.2 7.2 0 0 1 0-4.6V6.6H1.27a12 12 0 0 0 0 10.8l4-3.1z" />
      <path fill="#EA4335" d="M12 4.75c1.77 0 3.35.6 4.6 1.8l3.44-3.44A11.5 11.5 0 0 0 12 0 12 12 0 0 0 1.27 6.6l4 3.1C6.22 6.86 8.87 4.75 12 4.75z" />
    </svg>
  );
}

function AppleLogo() {
  return (
    <svg viewBox="0 0 24 24" width={18} height={18} fill="currentColor" aria-hidden>
      <path d="M12.152 6.896c-.948 0-2.415-1.078-3.96-1.04-2.04.027-3.91 1.183-4.961 3.014-2.117 3.675-.546 9.103 1.519 12.09 1.013 1.454 2.208 3.09 3.792 3.039 1.52-.065 2.09-.987 3.935-.987 1.831 0 2.35.987 3.96.948 1.637-.026 2.676-1.48 3.676-2.948 1.156-1.688 1.636-3.325 1.662-3.415-.039-.013-3.182-1.221-3.22-4.857-.026-3.04 2.48-4.494 2.597-4.559-1.429-2.09-3.623-2.324-4.39-2.376-2-.156-3.675 1.09-4.61 1.09zM15.53 3.83c.843-1.012 1.4-2.427 1.245-3.83-1.207.052-2.662.805-3.532 1.818-.78.896-1.454 2.338-1.273 3.714 1.338.104 2.715-.688 3.559-1.701" />
    </svg>
  );
}

/**
 * Anmelden mit Apple oder Google (Supabase OAuth), aufgebaut wie bei Finastry. Ob ein Anbieter in Supabase
 * eingeschaltet ist, fragt die Seite bei /auth/v1/settings ab – sonst erklärt der Knopf, dass es noch nicht geht.
 */
function SocialLogin({ register }: { register: boolean }) {
  const [enabled, setEnabled] = useState<Record<string, boolean>>();
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState<string>();
  useEffect(() => {
    fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/settings`, { headers: { apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY! } })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { external?: Record<string, boolean> } | null) => setEnabled(d?.external ?? {}))
      .catch(() => setEnabled({}));
  }, []);
  const go = async (provider: "apple" | "google", name: string) => {
    setError(undefined);
    if (enabled && !enabled[provider]) return setError(`Die Anmeldung mit ${name} ist noch nicht eingerichtet. Nutze bitte E-Mail und Passwort.`);
    setBusy(provider);
    const { error: err } = await supabase.auth.signInWithOAuth({ provider, options: { redirectTo: `${location.origin}/` } });
    if (err) { setError(err.message); setBusy(undefined); }
  };
  const btn = "inline-flex h-12 w-full items-center justify-center gap-2.5 rounded-full border border-card-line bg-surface text-[15px] font-semibold text-fg transition hover:bg-surface-2 disabled:opacity-50";
  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <button type="button" className={btn} disabled={!!busy} onClick={() => void go("apple", "Apple")}>{busy === "apple" ? <Loader2 size={17} className="animate-spin" /> : <AppleLogo />} Mit Apple</button>
        <button type="button" className={btn} disabled={!!busy} onClick={() => void go("google", "Google")}>{busy === "google" ? <Loader2 size={17} className="animate-spin" /> : <GoogleLogo />} Mit Google</button>
      </div>
      {register && <p className="text-center text-xs text-muted">Mit Apple oder Google wird dein Konto beim ersten Anmelden angelegt.</p>}
      {error && <p role="alert" className="rounded-xl bg-negative/10 px-3.5 py-2.5 text-sm text-negative-text">{error}</p>}
      <div className="flex items-center gap-3 text-xs text-muted"><span className="h-px flex-1 bg-line" /> oder mit E-Mail <span className="h-px flex-1 bg-line" /></div>
    </div>
  );
}
