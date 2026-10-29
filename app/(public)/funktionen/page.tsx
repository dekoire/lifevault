import Link from "next/link";
import { Archive, ArrowRight, Download, FileSearch, FolderTree, Globe, KeyRound, Lock, Mail, MessageSquare, ScanLine, ShieldCheck, Sparkles, Table2, UserRound } from "lucide-react";
import { ChatMock, DocMock, HomeMock } from "@/components/landing/Mockups";

export const metadata = { title: "Funktionen – Lifevault", description: "Was Lifevault kann: hochladen, auslesen, sortieren, fragen, verschlüsseln, Lebensprofil." };

type Block = { id: string; eyebrow: string; title: string; text: string; points: { icon: typeof ScanLine; t: string }[]; mock: React.ReactNode };

const BLOCKS: Block[] = [
  {
    id: "sortieren", eyebrow: "Hochladen & sortieren", title: "Reinwerfen – Lifevault macht den Rest",
    text: "Foto, PDF oder Scan. Die KI liest jedes Dokument vollständig, erkennt die Art (Rechnung, Mahnung, Arbeitsvertrag, Arztbrief …), ordnet es einem Bereich zu und schreibt die wichtigen Fakten heraus.",
    points: [{ icon: ScanLine, t: "Kamera, PDF und Bilder, mehrere auf einmal" }, { icon: FolderTree, t: "13 Bereiche, automatisch zugeordnet" }, { icon: Globe, t: "Absender mit Logo (z. B. Telekom, Vodafone)" }, { icon: FileSearch, t: "Volltextsuche über alles" }],
    mock: <HomeMock />,
  },
  {
    id: "dokument", eyebrow: "Dokumentansicht", title: "Das Wichtige in Tabellen, das Original immer dabei",
    text: "Jedes Dokument zeigt oben eine kurze Zusammenfassung, darunter die Fakten in aufklappbaren Gruppen – bei der Gehaltsabrechnung z. B. Persönliche Daten, Bezüge, Abzüge, Auszahlung. Fristen und Beträge extra.",
    points: [{ icon: Table2, t: "Fakten gruppiert und aufklappbar" }, { icon: Download, t: "Original herunterladen, als Markdown exportieren" }, { icon: MessageSquare, t: "Chat zu genau diesem Dokument" }, { icon: Archive, t: "Veraltetes wird archiviert (z. B. alter Handyvertrag)" }],
    mock: <DocMock />,
  },
  {
    id: "fragen", eyebrow: "Fragen", title: "Ein Assistent, der deine Unterlagen kennt",
    text: "Frag in eigenen Worten. Die Antwort ist kurz und klar aufgebaut: das Ergebnis, die Details, die nächsten Schritte – und die Dokumente, aus denen sie stammt. Alte Gespräche findest du im Verlauf.",
    points: [{ icon: Sparkles, t: "Strukturierte Antworten mit Quellen" }, { icon: MessageSquare, t: "Verlauf aller Gespräche" }],
    mock: <ChatMock />,
  },
];

const MORE = [
  { id: "profil", icon: UserRound, t: "Lebensprofil", d: "Aus allen Dokumenten: wo du arbeitest, wohnst, versichert bist, welche Verträge laufen – und was früher war." },
  { id: "sicherheit", icon: Lock, t: "Tresor-Verschlüsselung", d: "Ganze Bereiche (z. B. Gesundheit) oder einzelne Dateien mit deinem Tresor-Passwort verschlüsseln. Der Schlüssel bleibt auf deinem Gerät." },
  { id: "zwei-faktor", icon: KeyRound, t: "Zwei-Faktor", d: "Freiwillig oder vom Admin für alle vorgeschrieben. Ohne Code gibt auch die Datenbank nichts heraus." },
  { id: "admin", icon: ShieldCheck, t: "Admin", d: "Benutzer verwalten, Admin-Rechte vergeben, festlegen, was in der Dokumentansicht zu sehen ist." },
  { id: "email", icon: Mail, t: "E-Mail-Eingang (geplant)", d: "Rechnungen und Verträge per Weiterleitung an deine persönliche Adresse – Lifevault legt sie automatisch ab." },
];

/** Funktionen im Detail, aufgebaut wie die Funktionsseite von Finastry */
export default function Funktionen() {
  return (
    <>
      <section className="py-14 text-center md:py-20">
        <h1 className="text-[40px] leading-[46px] font-[680] tracking-tight md:text-[50px] md:leading-[56px]">Was Lifevault für dich tut</h1>
        <p className="mx-auto mt-4 max-w-2xl text-[17px] leading-7 text-soft">Vom Foto bis zur Antwort: alle Funktionen auf einen Blick.</p>
        <nav className="mt-8 flex flex-wrap justify-center gap-2">
          {[...BLOCKS.map((b) => [b.id, b.eyebrow]), ...MORE.map((m) => [m.id, m.t])].map(([id, l]) => <a key={id} href={`#${id}`} className="rounded-full border border-card-line bg-surface px-4 py-2 text-[14px] font-semibold hover:bg-surface-2">{l}</a>)}
        </nav>
      </section>

      {BLOCKS.map((b, i) => (
        <section key={b.id} id={b.id} className="grid scroll-mt-24 items-center gap-10 py-14 lg:grid-cols-2">
          <div className={i % 2 ? "lg:order-2" : ""}>
            <span className="text-[13px] font-semibold tracking-wide text-selected uppercase">{b.eyebrow}</span>
            <h2 className="mt-2 text-[30px] leading-10 font-[650] tracking-tight">{b.title}</h2>
            <p className="mt-4 text-[16px] leading-7 text-soft">{b.text}</p>
            <ul className="mt-6 grid gap-3 sm:grid-cols-2">{b.points.map(({ icon: Icon, t }) => <li key={t} className="flex items-start gap-2.5 text-[14px] font-medium"><span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-lavender text-selected"><Icon size={15} /></span><span className="pt-1.5">{t}</span></li>)}</ul>
          </div>
          {b.mock}
        </section>
      ))}

      <section className="grid gap-4 py-10 md:grid-cols-2 lg:grid-cols-3">
        {MORE.map(({ id, icon: Icon, t, d }) => (
          <div key={id} id={id} className="scroll-mt-24 rounded-2xl border border-card-line bg-surface p-6">
            <span className="grid h-11 w-11 place-items-center rounded-full bg-lavender text-selected"><Icon size={20} /></span>
            <h3 className="mt-4 text-[17px] font-semibold">{t}</h3>
            <p className="mt-1 text-[14px] leading-6 text-muted">{d}</p>
          </div>
        ))}
      </section>

      <section className="py-10 text-center">
        <Link href="/register" className="inline-flex h-12 items-center gap-2 rounded-full bg-brand-500 px-6 text-[15px] font-semibold text-white hover:bg-brand-600">Konto erstellen <ArrowRight size={17} /></Link>
      </section>
    </>
  );
}
