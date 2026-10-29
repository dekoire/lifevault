"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { Building2, Camera, PanelLeftClose, PanelLeftOpen, FileUp, House, MessageSquare, Plus, Settings, ShieldCheck, UserRound, X, type LucideIcon } from "lucide-react";
import { Logo, LogoMark } from "@/components/Logo";
import { MfaChallenge, MfaEnroll } from "@/components/Mfa";
import { useUploadPickers } from "@/components/UploadButtons";
import { DocsProvider } from "@/lib/docs";
import { MeProvider, useMe } from "@/lib/me";
import { ProjectsProvider } from "@/lib/projects";
import { ProjectSwitcher, UploadTarget } from "@/components/ProjectSwitcher";
import { UploadProgress } from "@/components/UploadProgress";
import { DetailHost } from "@/components/DetailPanel";
import { GlobalSearch } from "@/components/GlobalSearch";
import { Avatar, AvatarMenu, nameFromEmail } from "@/components/AvatarMenu";
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
      <ProjectsProvider>
        <DocsProvider userId={session.user.id}>
          <DetailHost><Shell email={session.user.email ?? ""}>{children}</Shell></DetailHost>
        </DocsProvider>
      </ProjectsProvider>
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
  // Desktop-Menü links ein-/ausklappen (wie bei Finastry), gemerkt; Breite als CSS-Variable --side für alle Seiten
  const [mini, setMini] = useState(false);
  useEffect(() => { try { setMini(localStorage.getItem("lifevault:side-mini") === "1"); } catch { /* egal */ } }, []);
  useEffect(() => { document.documentElement.style.setProperty("--side", mini ? "4.5rem" : "15rem"); }, [mini]);
  const toggleMini = () => setMini((v) => { try { localStorage.setItem("lifevault:side-mini", v ? "0" : "1"); } catch { /* egal */ } return !v; });
  const NAV: Nav[] = [
    { href: "/", label: "Start", icon: House, match: (p) => p === "/" || p.startsWith("/c/") || p.startsWith("/d/") },
    { href: "/chat", label: "Fragen", icon: MessageSquare, match: (p) => p.startsWith("/chat") },
    { href: "/profil", label: "Profil", icon: UserRound, match: (p) => p.startsWith("/profil") },
    { href: "/partner", label: "Partner", icon: Building2, match: (p) => p.startsWith("/partner") },
    { href: "/einstellungen", label: "Einstellungen", icon: Settings, match: (p) => p.startsWith("/einstellungen") },
    ...(isAdmin ? [{ href: "/admin", label: "Admin", icon: ShieldCheck, match: (p: string) => p.startsWith("/admin") }] : []),
  ];
  return (
    <div className="min-h-dvh bg-page">
      {inputs}
      <UploadProgress />
      {/* Desktop: Seitenleiste wie bei Finastry */}
      <aside className={`fixed inset-y-0 left-0 z-30 hidden flex-col border-r border-card-line bg-surface py-5 transition-[width] duration-200 lg:flex ${mini ? "w-[4.5rem] px-2.5" : "w-60 px-3"}`}>
        <div className={`mb-5 flex items-center ${mini ? "flex-col gap-3" : "justify-between pl-2"}`}>
          <Link href="/" aria-label="Start">{mini ? <LogoMark size={30} /> : <Logo size={30} />}</Link>
          <button type="button" onClick={toggleMini} aria-label={mini ? "Menü aufklappen" : "Menü zuklappen"} title={mini ? "Menü aufklappen" : "Menü zuklappen"} className="grid h-9 w-9 place-items-center rounded-full text-soft hover:bg-surface-2 hover:text-fg">{mini ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}</button>
        </div>
        {!mini && <div className="mb-3"><ProjectSwitcher /></div>}
        <nav className="grid gap-1">
          {NAV.filter((n) => n.href !== "/einstellungen").map(({ href, label, icon: Icon, match }) => {
            const on = match(path);
            return <Link key={href} href={href} aria-current={on ? "page" : undefined} title={mini ? label : undefined} className={`flex h-11 items-center gap-2.5 rounded-xl text-[14px] font-medium transition-colors ${mini ? "justify-center" : "px-3"} ${on ? "bg-fg text-canvas" : "text-soft hover:bg-surface-2 hover:text-fg"}`}><Icon size={18} strokeWidth={1.8} />{!mini && label}</Link>;
          })}
        </nav>
        <Link href="/einstellungen" className={`mt-auto flex items-center gap-2.5 rounded-xl p-2 hover:bg-surface-2 ${mini ? "justify-center" : ""}`} title={`${nameFromEmail(email)} · Einstellungen`}>
          <Avatar email={email} />
          {!mini && <><span className="min-w-0 flex-1"><b className="block truncate text-[14px]">{nameFromEmail(email)}</b><span className="block truncate text-[12px] text-muted">{email}</span></span><Settings size={16} className="shrink-0 text-muted" /></>}
        </Link>
      </aside>

      {/* Handy: Kopf mit Logo */}
      {!chat && (
        <header className="pt-safe sticky top-0 z-20 bg-page/90 backdrop-blur-xl lg:hidden">
          <div className="flex h-14 items-center justify-between px-4">
            <Link href="/" aria-label="Start"><Logo size={28} /></Link>
            <span className="flex items-center gap-2">
              <GlobalSearch compact />
              <ProjectSwitcher compact />
              <Link href="/einstellungen" aria-label="Einstellungen" className="grid h-10 w-10 place-items-center rounded-full bg-surface-3 text-soft"><Settings size={18} /></Link>
            </span>
          </div>
        </header>
      )}
      {/* Desktop: oben rechts Hinzufügen und Avatar */}
      {!chat && (
        <div className="sticky top-0 z-20 hidden h-16 items-center gap-3 bg-page/90 px-8 backdrop-blur-xl lg:ml-[var(--side,15rem)] lg:flex">
          <GlobalSearch />
          <span className="flex-1" />
          <button type="button" onClick={() => setSheet(true)} className="inline-flex h-10 items-center gap-2 rounded-full border border-card-line bg-surface px-4 text-[14px] font-semibold text-fg hover:bg-surface-2"><Plus size={17} /> Hinzufügen</button>
          <AvatarMenu email={email} />
        </div>
      )}
      <main className={`lg:pl-[var(--side,15rem)] ${chat ? "" : "pb-28 lg:pb-12"}`}>
        {chat ? children : <div className="mx-auto max-w-[90rem] px-4 pt-5 md:px-6 lg:pt-6 xl:px-8">{children}</div>}
      </main>

      {/* Handy: untere Leiste ohne Schatten – Start, +, Fragen */}
      <nav className="pb-safe fixed inset-x-0 bottom-0 z-30 border-t border-card-line bg-surface lg:hidden">
        <div className="mx-auto flex h-16 max-w-md items-center gap-2 px-4">
          <Tab n={NAV[0]} on={NAV[0].match(path)} />
          <Tab n={NAV[2]} on={NAV[2].match(path)} />
          <button type="button" onClick={() => setSheet(true)} aria-label="Dokument hinzufügen" className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-brand-500 text-white active:scale-95"><Plus size={24} strokeWidth={2.4} /></button>
          <Tab n={NAV[1]} on={NAV[1].match(path)} />
          <Tab n={NAV[4]} on={NAV[4].match(path) || path.startsWith("/admin") || path.startsWith("/partner")} label="Mehr" />
        </div>
      </nav>

      {sheet && (
        <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/40 sm:items-center" onClick={() => setSheet(false)}>
          <div className="sheet-up pb-safe w-full max-w-md rounded-t-3xl bg-surface p-5 sm:rounded-3xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-[18px] font-semibold">Dokument hinzufügen</h2>
              <button type="button" onClick={() => setSheet(false)} aria-label="Schließen" className="grid h-9 w-9 place-items-center rounded-full bg-surface-3"><X size={18} /></button>
            </div>
            <UploadTarget />
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
