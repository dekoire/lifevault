"use client";
import { TopicBackfill } from "@/components/TopicBackfill";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ExportSheet } from "@/components/ExportSheet";
import { JobToasts } from "@/components/JobToasts";
import { DraftHost } from "@/components/DraftSheet";
import { ForwardConfirm } from "@/components/ForwardConfirm";
import { DownloadsMenu } from "@/components/settings/Downloads";
import { useCallback, useEffect, useState } from "react";
import { Building2, Camera, Download, FolderOutput, Search, ChevronsLeft, ChevronsRight, FileUp, House, MessageSquare, Plus, Settings, ShieldCheck, UserRound, X, type LucideIcon } from "lucide-react";
import { Logo, LogoMark } from "@/components/Logo";
import { MfaChallenge, MfaEnroll } from "@/components/Mfa";
import { useCaptureTray } from "@/components/CaptureTray";
import { DocsProvider, useDocs } from "@/lib/docs";
import { NotifySync } from "@/lib/notify";
import { InboxAutoSync } from "@/lib/inbox";
import { LockGate } from "@/lib/applock";
import { MeProvider, useMe } from "@/lib/me";
import { ProjectsProvider } from "@/lib/projects";
import { ProjectSwitcher, UploadTarget } from "@/components/ProjectSwitcher";
import { UploadProgress } from "@/components/UploadProgress";
import { DetailHost } from "@/components/DetailPanel";
import { GlobalSearch } from "@/components/GlobalSearch";
import { PullToRefresh } from "@/components/PullToRefresh";
import { PressFeedback } from "@/components/PressFeedback";
import { KeyboardWatch } from "@/components/KeyboardWatch";
import { Avatar, AvatarMenu, nameFromEmail } from "@/components/AvatarMenu";
import { supabase, useSession } from "@/lib/supabase";
import { takeNext } from "@/lib/next";

const Splash = () => <div className="grid min-h-dvh place-items-center bg-page"><span className="animate-pulse"><LogoMark size={56} /></span></div>;

/** Anmeldung prüfen, Zwei-Faktor abfragen bzw. einrichten (wenn vorgeschrieben), dann die App */
export default function AppLayout({ children }: { children: React.ReactNode }) {
  const session = useSession();
  const router = useRouter();
  const [gate, setGate] = useState<"check" | "challenge" | "enroll" | "ok">("check");
  useEffect(() => {
    // nicht angemeldet: zur Startseite – kommt man über „Mit Lifevault verbinden“, direkt zur Anmeldung mit Rückweg
    if (session === null) router.replace(location.pathname.startsWith("/connect") ? `/login?next=${encodeURIComponent(location.pathname + location.search)}` : "/willkommen");
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
  // nach Bestätigungslink oder Google/Apple-Anmeldung: gemerktes Ziel (z. B. /connect?…) aufrufen
  useEffect(() => {
    if (gate !== "ok") return;
    const n = takeNext();
    if (n && n !== location.pathname + location.search) router.replace(n);
  }, [gate, router]);
  if (!session || gate === "check") return <Splash />;
  if (gate === "challenge") return <MfaChallenge onDone={() => void supabase.auth.refreshSession().then(check)} />;
  if (gate === "enroll") return <MfaEnroll forced onDone={() => void supabase.auth.refreshSession().then(check)} />;
  return (
    <MeProvider userId={session.user.id}>
      <ProjectsProvider>
        <DocsProvider userId={session.user.id}>
          <LockGate><DetailHost><Shell email={session.user.email ?? ""}>{children}</Shell></DetailHost></LockGate>
          <QueueSync />
        </DocsProvider>
      </ProjectsProvider>
    </MeProvider>
  );
}

type Nav = { href: string; label: string; icon: LucideIcon; match: (p: string) => boolean };

/** Erinnerungen (Mitteilungen) aktuell halten */
function QueueSync() {
  const { allDocs } = useDocs();
  return <><NotifySync docs={allDocs} /><InboxAutoSync /></>;
}

/**
 * Ziehen zum Neuladen auf jeder Seite (auch im Chat); werden Dokumente ausgelesen, steht derselbe Kreis oben und zeigt
 * in der Mitte, wie viele noch laufen.
 */
function PullWithDocs() {
  const { allDocs } = useDocs();
  const router = useRouter();
  const running = allDocs.filter((d) => d.status === "processing").length;
  return <PullToRefresh color="#6d4aff" activity={running} activityLabel="Dokumente werden ausgelesen" onActivity={() => router.push("/")} />;
}

function Shell({ email, children }: { email: string; children: React.ReactNode }) {
  const path = usePathname();
  const { isAdmin } = useMe();
  const chat = path.startsWith("/chat");
  const [sheet, setSheet] = useState(false);
  const [exporting, setExporting] = useState(false);
  // Fotos und Dateien landen erst in der Sammelmappe; abgeschickt wird gesammelt
  const { ui: inputs, openCamera, openFiles } = useCaptureTray();
  // Desktop-Menü links ein-/ausklappen (wie bei Finastry), gemerkt; Breite als CSS-Variable --side für alle Seiten
  const [mini, setMini] = useState(false);
  useEffect(() => { try { setMini(localStorage.getItem("lifevault:side-mini") === "1"); } catch { /* egal */ } }, []);
  useEffect(() => { document.documentElement.style.setProperty("--side", mini ? "5.25rem" : "15.75rem"); }, [mini]);
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
      {exporting && <ExportSheet onClose={() => setExporting(false)} />}
      <PullWithDocs />
      <PressFeedback />
      <KeyboardWatch />
      <UploadProgress />
      <JobToasts />
      <DraftHost />
      {/* Desktop: Seitenleiste wie bei Finastry */}
      {/* schwebende, runde Karte mit Abstand zum Rand (oben, unten, links), leicht durchsichtig; --side enthält den Abstand */}
      <aside className={`fixed top-3 bottom-3 left-3 z-30 hidden flex-col rounded-2xl border border-card-line bg-surface/80 py-5 shadow-[0_8px_30px_rgba(15,23,42,.07)] backdrop-blur-xl transition-[width] duration-200 lg:flex ${mini ? "w-[4.5rem] px-2.5" : "w-60 px-3"}`}>
        <div className={`mb-5 flex items-center ${mini ? "justify-center" : "pl-2"}`}>
          <Link href="/" aria-label="Start">{mini ? <LogoMark size={30} /> : <Logo size={30} />}</Link>
        </div>
        {!mini && <div className="mb-3"><ProjectSwitcher /></div>}
        <nav className="grid gap-1">
          {NAV.filter((n) => n.href !== "/einstellungen").map(({ href, label, icon: Icon, match }) => {
            const on = match(path);
            return <Link key={href} href={href} aria-current={on ? "page" : undefined} title={mini ? label : undefined} className={`relative flex h-11 min-w-0 items-center gap-2.5 rounded-xl text-[13px] font-medium transition-colors duration-[120ms] ${mini ? "mx-auto w-11 justify-center px-0" : "px-3"} ${on ? "bg-fg text-canvas shadow-xs" : "text-soft hover:bg-surface-2 hover:text-fg"}`}><Icon size={18} strokeWidth={1.75} className="shrink-0" />{!mini && label}</Link>;
          })}
        </nav>
        <Link href="/einstellungen" className={`mt-auto flex items-center gap-2.5 rounded-xl p-2 hover:bg-surface-2 ${mini ? "justify-center" : ""}`} title={`${nameFromEmail(email)} · Einstellungen`}>
          <Avatar email={email} />
          {!mini && <><span className="min-w-0 flex-1"><b className="block truncate text-[13px]">{nameFromEmail(email)}</b><span className="block truncate text-[12px] text-muted">{email}</span></span><Settings size={16} className="shrink-0 text-muted" /></>}
        </Link>
        {/* Einklappen unten, wie in Finastry */}
        <div className={`-mb-2 mt-2 border-t border-line pt-2 ${mini ? "-mx-2.5 px-2.5" : "-mx-3 px-3"}`}>
          <button type="button" onClick={toggleMini} aria-label={mini ? "Seitenleiste ausklappen" : "Seitenleiste einklappen"} title={mini ? "Ausklappen" : "Einklappen"}
            className={`flex h-10 w-full items-center gap-3 rounded-lg text-[13px] font-medium text-muted hover:bg-surface-2 hover:text-fg ${mini ? "justify-center" : "px-3"}`}>
            {mini ? <ChevronsRight size={20} strokeWidth={1.75} /> : <ChevronsLeft size={20} strokeWidth={1.75} />}
            {!mini && "Einklappen"}
          </button>
        </div>
      </aside>

      {/* Handy: Kopf mit Logo */}
      {!chat && (
        <header className="pt-safe relative z-20 bg-page lg:hidden">
          {/* kompakt: Logo, Projekt, Avatar – Suchen, Export, Downloads, Einstellungen stecken im Avatar-Menü */}
          <div className="flex h-14 items-center gap-2.5 px-4">
            <Link href="/" aria-label="Start" className="shrink-0"><LogoMark size={30} /></Link>
            <span className="min-w-0 flex-1"><ProjectSwitcher compact /></span>
            <GlobalSearch compact button={false} />
            <AvatarMenu email={email} size={38} extra={[
              { icon: Search, label: "Suchen", onClick: () => window.dispatchEvent(new Event("lifevault:search")) },
              { icon: FolderOutput, label: "Exportieren", onClick: () => setExporting(true) },
              { icon: Download, label: "Downloads", href: "/downloads" },
            ]} />
          </div>
        </header>
      )}
      {/* Desktop: oben rechts Hinzufügen und Avatar */}
      {!chat && (
        <div className="relative z-20 hidden h-16 items-center gap-3 bg-page px-12 lg:ml-[var(--side,15.75rem)] lg:flex xl:px-16 2xl:px-20">
          <GlobalSearch />
          <span className="flex-1" />
          {path === "/" && <button type="button" onClick={() => setExporting(true)} aria-label="Exportieren" title="Exportieren" className="grid h-10 w-10 place-items-center rounded-full border border-card-line bg-surface text-fg transition-colors hover:bg-surface-2"><FolderOutput size={17} /></button>}
          <DownloadsMenu />
          <button type="button" onClick={() => setSheet(true)} aria-label="Hinzufügen" title="Hinzufügen" className="grid h-10 w-10 place-items-center rounded-full bg-brand-500 text-white transition-colors hover:bg-brand-600"><Plus size={19} /></button>
          <AvatarMenu email={email} />
        </div>
      )}
      <main className={`lg:pl-[var(--side,15.75rem)] ${chat ? "" : "pb-28 lg:pb-12"}`}>
        {chat ? children : <div key={path} className="page-in app-scale mx-auto max-w-[88rem] px-4 pt-5 md:px-6 lg:px-12 lg:pt-6 xl:px-16 2xl:px-20"><ForwardConfirm />{children}</div>}
      </main>

      {/* Handy: untere Leiste ohne Schatten – Start, +, Fragen */}
      <nav className="hide-on-kb pb-safe fixed inset-x-0 bottom-0 z-30 border-t border-card-line bg-surface lg:hidden">
        <div className="mx-auto flex h-16 max-w-md items-center gap-2 px-4">
          <Tab n={NAV[0]} on={NAV[0].match(path)} />
          <Tab n={NAV[2]} on={NAV[2].match(path)} />
          <button type="button" onClick={() => setSheet(true)} aria-label="Dokument hinzufügen" className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-brand-500 text-white active:scale-95"><Plus size={24} strokeWidth={2.4} /></button>
          <Tab n={NAV[1]} on={NAV[1].match(path)} />
          <Tab n={NAV[4]} on={NAV[4].match(path) || path.startsWith("/admin") || path.startsWith("/partner") || path.startsWith("/mail")} label="Mehr" />
        </div>
      </nav>

      <TopicBackfill />
      {sheet && (
        <div className="sheet-backdrop fixed inset-0 z-40 flex items-end justify-center bg-black/40 sm:items-center" onClick={() => setSheet(false)}>
          <div className="sheet-rise w-full max-w-md rounded-t-3xl bg-surface px-6 pt-6 pb-[max(1.75rem,env(safe-area-inset-bottom))] sm:rounded-3xl sm:p-7" onClick={(e) => e.stopPropagation()}>
            <div className="mb-5 flex items-center justify-between">
              <h2 className="text-[18px] font-semibold">Dokument hinzufügen</h2>
              <button type="button" onClick={() => setSheet(false)} aria-label="Schließen" className="grid h-9 w-9 place-items-center rounded-full bg-surface-3"><X size={18} /></button>
            </div>
            <UploadTarget />
            {/* zwei große Kacheln: Kamera oder Dateien */}
            <div className="grid grid-cols-2 gap-3">
              {([
                { icon: Camera, title: "Fotografieren", text: "auch mehrere Seiten", go: openCamera },
                { icon: FileUp, title: "Datei wählen", text: "Fotos oder PDFs", go: openFiles },
              ] as const).map(({ icon: Icon, title, text, go }) => (
                <button key={title} type="button" onClick={() => { setSheet(false); go(); }} className="flex flex-col items-center gap-3 rounded-2xl bg-surface-2 px-4 py-7 text-center transition-colors hover:bg-surface-3 active:scale-[.98]">
                  <span className="grid h-14 w-14 place-items-center rounded-full bg-brand-500 text-white"><Icon size={24} /></span>
                  <span><b className="block text-[15px]">{title}</b><span className="block text-[13px] text-muted">{text}</span></span>
                </button>
              ))}
            </div>
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
