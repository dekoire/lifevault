"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { Camera, FileUp, House, MessageSquare, Plus, Settings, ShieldCheck, UserRound, X, type LucideIcon } from "lucide-react";
import { Logo, LogoMark } from "@/components/Logo";
import { MfaChallenge, MfaEnroll } from "@/components/Mfa";
import { useUploadPickers } from "@/components/UploadButtons";
import { DocsProvider } from "@/lib/docs";
import { MeProvider, useMe } from "@/lib/me";
import { supabase, useSession } from "@/lib/supabase";

const Splash = () => <div className="grid min-h-dvh place-items-center bg-page"><span className="animate-pulse"><LogoMark size={56} /></span></div>;

/** Anmeldung prüfen, Zwei-Faktor abfragen bzw. einrichten (wenn vorgeschrieben), dann die App */
export default function AppLayout({ children }: { children: React.ReactNode }) {
  const session = useSession();
  const router = useRouter();
  const [gate, setGate] = useState<"check" | "challenge" | "enroll" | "ok">("check");
  useEffect(() => {
    if (session === null) router.replace("/willkommen");
  }, [session, router]);
  const check = useCallback(async () => {
    const [{ data: aal }, { data: s }, { data: f }] = await Promise.all([
      supabase.auth.mfa.getAuthenticatorAssuranceLevel(),
      supabase.from("app_settings").select("mfa_required").eq("id", 1).maybeSingle(),
      supabase.auth.mfa.listFactors(),
    ]);
    const hasFactor = (f?.totp ?? []).some((x) => x.status === "verified");
    if (aal?.nextLevel === "aal2" && aal.currentLevel !== "aal2") setGate("challenge");
    else if (s?.mfa_required && !hasFactor) setGate("enroll");
    else setGate("ok");
  }, []);
  useEffect(() => { if (session) void check(); }, [session, check]);
  if (!session || gate === "check") return <Splash />;
  if (gate === "challenge") return <MfaChallenge onDone={() => void supabase.auth.refreshSession().then(check)} />;
  if (gate === "enroll") return <MfaEnroll forced onDone={() => void supabase.auth.refreshSession().then(check)} />;
  return (
    <MeProvider userId={session.user.id}>
      <DocsProvider userId={session.user.id}>
        <Shell email={session.user.email ?? ""}>{children}</Shell>
      </DocsProvider>
    </MeProvider>
  );
}

type Nav = { href: string; label: string; icon: LucideIcon; match: (p: string) => boolean };

function Shell({ email, children }: { email: string; children: React.ReactNode }) {
  const path = usePathname();
  const { isAdmin } = useMe();
  const chat = path.startsWith("/chat");
  const [sheet, setSheet] = useState(false);
  const { inputs, openCamera, openFiles } = useUploadPickers();
  const NAV: Nav[] = [
    { href: "/", label: "Start", icon: House, match: (p) => p === "/" || p.startsWith("/c/") || p.startsWith("/d/") },
    { href: "/chat", label: "Fragen", icon: MessageSquare, match: (p) => p.startsWith("/chat") },
    { href: "/profil", label: "Profil", icon: UserRound, match: (p) => p.startsWith("/profil") },
    { href: "/einstellungen", label: "Einstellungen", icon: Settings, match: (p) => p.startsWith("/einstellungen") },
    ...(isAdmin ? [{ href: "/admin", label: "Admin", icon: ShieldCheck, match: (p: string) => p.startsWith("/admin") }] : []),
  ];
  return (
    <div className="min-h-dvh bg-page">
      {inputs}
      {/* Desktop: Seitenleiste wie bei Finastry */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 flex-col border-r border-card-line bg-surface px-3 py-5 lg:flex">
        <Link href="/" className="mb-6 px-2"><Logo size={30} /></Link>
        <button type="button" onClick={() => setSheet(true)} className="mb-5 flex h-11 items-center justify-center gap-2 rounded-full bg-brand-500 text-[14px] font-semibold text-white hover:bg-brand-600"><Plus size={18} strokeWidth={2.4} /> Hinzufügen</button>
        <nav className="grid gap-1">
          {NAV.map(({ href, label, icon: Icon, match }) => {
            const on = match(path);
            return <Link key={href} href={href} aria-current={on ? "page" : undefined} className={`flex h-11 items-center gap-2.5 rounded-xl px-3 text-[14px] font-medium transition-colors ${on ? "bg-fg text-canvas" : "text-soft hover:bg-surface-2 hover:text-fg"}`}><Icon size={18} strokeWidth={1.8} /> {label}</Link>;
          })}
        </nav>
        <p className="mt-auto truncate px-3 text-[12px] text-muted" title={email}>{email}</p>
      </aside>

      {/* Handy: Kopf mit Logo */}
      {!chat && (
        <header className="pt-safe sticky top-0 z-20 border-b border-card-line/70 bg-page/90 backdrop-blur-xl lg:hidden">
          <div className="flex h-14 items-center justify-between px-4">
            <Link href="/" aria-label="Start"><Logo size={28} /></Link>
            <Link href="/einstellungen" aria-label="Einstellungen" className="grid h-10 w-10 place-items-center rounded-full bg-surface-3 text-soft"><Settings size={18} /></Link>
          </div>
        </header>
      )}
      <main className={`lg:pl-60 ${chat ? "" : "pb-28 lg:pb-12"}`}>
        {chat ? children : <div className="mx-auto max-w-6xl px-4 pt-5 md:px-8 lg:pt-10">{children}</div>}
      </main>

      {/* Handy: untere Leiste ohne Schatten – Start, +, Fragen */}
      <nav className="pb-safe fixed inset-x-0 bottom-0 z-30 border-t border-card-line bg-surface lg:hidden">
        <div className="mx-auto flex h-16 max-w-md items-center gap-2 px-4">
          <Tab n={NAV[0]} on={NAV[0].match(path)} />
          <Tab n={NAV[2]} on={NAV[2].match(path)} />
          <button type="button" onClick={() => setSheet(true)} aria-label="Dokument hinzufügen" className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-brand-500 text-white active:scale-95"><Plus size={24} strokeWidth={2.4} /></button>
          <Tab n={NAV[1]} on={NAV[1].match(path)} />
          <Tab n={NAV[3]} on={NAV[3].match(path) || path.startsWith("/admin")} label="Mehr" />
        </div>
      </nav>

      {sheet && (
        <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/40 sm:items-center" onClick={() => setSheet(false)}>
          <div className="sheet-up pb-safe w-full max-w-md rounded-t-3xl bg-surface p-5 sm:rounded-3xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-[18px] font-semibold">Dokument hinzufügen</h2>
              <button type="button" onClick={() => setSheet(false)} aria-label="Schließen" className="grid h-9 w-9 place-items-center rounded-full bg-surface-3"><X size={18} /></button>
            </div>
            <div className="grid gap-2">
              <button type="button" onClick={() => { setSheet(false); openCamera(); }} className="flex h-12 items-center gap-3 rounded-full bg-surface-2 px-5 text-left text-[15px] font-semibold hover:bg-surface-3"><Camera size={19} className="text-brand-500" /> Fotografieren</button>
              <button type="button" onClick={() => { setSheet(false); openFiles(); }} className="flex h-12 items-center gap-3 rounded-full bg-surface-2 px-5 text-left text-[15px] font-semibold hover:bg-surface-3"><FileUp size={19} className="text-brand-500" /> Fotos oder PDFs auswählen</button>
            </div>
            <p className="mt-3 text-center text-xs text-muted">Mehrere Dateien auf einmal gehen auch. Sortiert wird automatisch.</p>
          </div>
        </div>
      )}
    </div>
  );
}

function Tab({ n, on, label }: { n: Nav; on: boolean; label?: string }) {
  const Icon = n.icon;
  return (
    <Link href={n.href} className={`flex flex-1 flex-col items-center justify-center gap-0.5 py-1.5 text-[11px] font-semibold ${on ? "text-brand-600" : "text-muted"}`}>
      <Icon size={22} strokeWidth={on ? 2.2 : 1.8} /> {label ?? n.label}
    </Link>
  );
}
