"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Camera, FileUp, House, LogOut, MessageSquare, Plus, X } from "lucide-react";
import { Logo, LogoMark } from "@/components/Logo";
import { useUploadPickers } from "@/components/UploadButtons";
import { DocsProvider } from "@/lib/docs";
import { supabase, useSession } from "@/lib/supabase";

/** App-Rahmen wie eine Handy-App: oben Logo und Abmelden, unten Leiste mit Start, Hochladen (+) und Chat */
export default function AppLayout({ children }: { children: React.ReactNode }) {
  const session = useSession();
  const router = useRouter();
  useEffect(() => {
    if (session === null) router.replace("/login");
  }, [session, router]);
  if (!session) return <div className="grid min-h-dvh place-items-center bg-page"><span className="animate-pulse"><LogoMark size={56} /></span></div>;
  return (
    <DocsProvider userId={session.user.id}>
      <Shell email={session.user.email ?? ""}>{children}</Shell>
    </DocsProvider>
  );
}

function Shell({ email, children }: { email: string; children: React.ReactNode }) {
  const path = usePathname();
  const chat = path.startsWith("/chat");
  const [sheet, setSheet] = useState(false);
  const { inputs, openCamera, openFiles } = useUploadPickers();
  const tab = (href: string, label: string, Icon: typeof House, on: boolean) => (
    <Link href={href} className={`flex flex-1 flex-col items-center justify-center gap-0.5 rounded-2xl py-1.5 text-[11px] font-semibold transition ${on ? "text-brand-600" : "text-muted"}`}>
      <Icon size={22} strokeWidth={on ? 2.2 : 1.8} /> {label}
    </Link>
  );
  return (
    <div className="min-h-dvh bg-page">
      {inputs}
      {!chat && (
        <header className="pt-safe sticky top-0 z-20 border-b border-line/60 bg-page/85 backdrop-blur-xl">
          <div className="mx-auto flex h-16 max-w-3xl items-center justify-between px-4">
            <Link href="/" aria-label="Start"><Logo size={28} /></Link>
            <button type="button" onClick={() => void supabase.auth.signOut()} title={`Abmelden (${email})`} className="grid h-10 w-10 place-items-center rounded-full bg-surface-3 text-soft hover:text-fg" aria-label="Abmelden"><LogOut size={17} /></button>
          </div>
        </header>
      )}
      <main className={chat ? "" : "mx-auto max-w-3xl px-4 pt-5 pb-32"}>{children}</main>
      {/* untere Leiste */}
      <nav className="pb-safe fixed inset-x-0 bottom-0 z-30 border-t border-card-line bg-surface/95 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-md items-center gap-2 px-6">
          {tab("/", "Start", House, path === "/" || path.startsWith("/c/") || path.startsWith("/d/"))}
          <button type="button" onClick={() => setSheet(true)} aria-label="Dokument hinzufügen" className="-mt-7 grid h-14 w-14 shrink-0 place-items-center rounded-full bg-brand-500 text-white shadow-[0_8px_24px_rgba(109,74,255,.45)] ring-4 ring-page active:scale-95"><Plus size={26} strokeWidth={2.4} /></button>
          {tab("/chat", "Fragen", MessageSquare, chat)}
        </div>
      </nav>
      {sheet && (
        <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/40 sm:items-center" onClick={() => setSheet(false)}>
          <div className="sheet-up pb-safe w-full max-w-md rounded-t-[28px] bg-surface p-5 sm:rounded-[28px]" onClick={(e) => e.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-[18px] font-semibold">Dokument hinzufügen</h2>
              <button type="button" onClick={() => setSheet(false)} aria-label="Schließen" className="grid h-9 w-9 place-items-center rounded-full bg-surface-3"><X size={18} /></button>
            </div>
            <div className="grid gap-2">
              <button type="button" onClick={() => { setSheet(false); openCamera(); }} className="flex h-14 items-center gap-3 rounded-2xl bg-surface-2 px-4 text-left text-[15px] font-semibold hover:bg-surface-3"><Camera size={20} className="text-brand-500" /> Fotografieren</button>
              <button type="button" onClick={() => { setSheet(false); openFiles(); }} className="flex h-14 items-center gap-3 rounded-2xl bg-surface-2 px-4 text-left text-[15px] font-semibold hover:bg-surface-3"><FileUp size={20} className="text-brand-500" /> Fotos oder PDFs auswählen</button>
            </div>
            <p className="mt-3 text-center text-xs text-muted">Mehrere Dateien auf einmal gehen auch. Sortiert wird automatisch.</p>
          </div>
        </div>
      )}
    </div>
  );
}
