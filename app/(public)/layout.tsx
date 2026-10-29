import Link from "next/link";
import { ShieldCheck } from "lucide-react";
import { Logo } from "@/components/Logo";

const FOOTER = [
  { title: "Produkt", links: [{ href: "/funktionen", label: "Funktionen" }, { href: "/funktionen#sicherheit", label: "Sicherheit" }, { href: "/", label: "App öffnen" }] },
  { title: "Bereiche", links: [{ href: "/funktionen#sortieren", label: "Automatisch sortiert" }, { href: "/funktionen#fragen", label: "Fragen stellen" }, { href: "/funktionen#profil", label: "Lebensprofil" }] },
];

/** Öffentliche Seiten wie bei Finastry: Kopf mit Anmelden/Registrieren, Fuß mit Links */
export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col bg-canvas">
      <header className="pt-safe sticky top-0 z-40 border-b border-line bg-surface/95 backdrop-blur">
        <div className="mx-auto flex h-[68px] w-full max-w-[1200px] items-center justify-between gap-4 px-5 md:px-8">
          <Link href="/willkommen" aria-label="Startseite"><Logo /></Link>
          <nav className="flex items-center gap-1.5 text-sm font-semibold">
            <Link href="/funktionen" className="inline-flex h-11 items-center rounded-full px-4 text-fg hover:bg-surface-2 max-sm:hidden">Funktionen</Link>
            <Link href="/register" className="inline-flex h-11 items-center rounded-full px-4 text-fg hover:bg-surface-2 max-sm:hidden">Registrieren</Link>
            <Link href="/login" className="inline-flex h-11 items-center rounded-full bg-brand-500 px-5 text-white hover:bg-brand-600">Anmelden</Link>
          </nav>
        </div>
      </header>
      <main className="mx-auto w-full max-w-[1200px] flex-1 px-4 md:px-8">{children}</main>
      <footer className="mt-10 border-t border-line bg-surface">
        <div className="mx-auto grid w-full max-w-[1200px] gap-10 px-5 py-12 md:grid-cols-[2fr_1fr_1fr] md:px-8">
          <div>
            <Logo />
            <p className="mt-4 max-w-xs text-sm leading-6 text-muted">Alle Unterlagen in einem Tresor. Automatisch sortiert, jederzeit gefragt.</p>
            <p className="mt-4 inline-flex items-center gap-1.5 text-xs font-semibold text-positive-text"><ShieldCheck size={14} /> Server in der EU</p>
          </div>
          {FOOTER.map((col) => (
            <div key={col.title}>
              <div className="text-sm font-semibold">{col.title}</div>
              <ul className="mt-3 space-y-2 text-sm text-muted">{col.links.map((l) => <li key={l.href}><Link href={l.href} className="hover:text-fg">{l.label}</Link></li>)}</ul>
            </div>
          ))}
        </div>
        <div className="border-t border-line"><p className="mx-auto w-full max-w-[1200px] px-5 py-6 text-xs text-muted md:px-8">© {new Date().getFullYear()} Lifevault · in Entwicklung</p></div>
      </footer>
    </div>
  );
}
