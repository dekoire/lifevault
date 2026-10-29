import Link from "next/link";
import { ArrowRight, FileSearch, FolderTree, KeyRound, Lock, MessageSquare, ScanLine, ShieldCheck, UserRound } from "lucide-react";
import { ChatMock, HomeMock } from "@/components/landing/Mockups";
import { ClusterIcon } from "@/components/ClusterIcon";
import { CLUSTERS } from "@/lib/clusters";

export const metadata = { title: "Lifevault – alle Unterlagen in einem Tresor", description: "Hochladen, automatisch sortieren, alles fragen. Verträge, Rechnungen, Arztbriefe, Belege – sicher an einem Ort." };

const STEPS = [
  { icon: ScanLine, t: "Fotografieren oder hochladen", d: "Brief, PDF, Kassenbon. Mehrere auf einmal." },
  { icon: FolderTree, t: "Automatisch sortiert", d: "Lifevault liest alles aus und legt es in den richtigen Bereich." },
  { icon: MessageSquare, t: "Einfach fragen", d: "„Wann läuft mein Handyvertrag aus?“ – mit Quelle als Antwort." },
];

const TRUST = [
  { icon: ShieldCheck, t: "Nur du siehst deine Daten", d: "Jede Datei liegt in deinem privaten Bereich. Die Datenbank gibt nur dir deine Zeilen heraus." },
  { icon: Lock, t: "Tresor mit eigenem Passwort", d: "Arztbriefe und andere sensible Bereiche verschlüsselt dein Gerät – ohne dein Tresor-Passwort kann sie niemand lesen." },
  { icon: KeyRound, t: "Zwei-Faktor", d: "Anmeldung zusätzlich mit Code aus der Authenticator-App." },
];

/** Öffentliche Startseite (Kurzfassung), Details unter /funktionen */
export default function Landing() {
  return (
    <>
      <section className="grid items-center gap-10 py-14 md:py-20 lg:grid-cols-[1.05fr_1fr]">
        <div>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-card-line bg-surface px-3 py-1 text-[13px] font-semibold text-fg"><Lock size={14} /> Dein persönlicher Dokumenten-Tresor</span>
          <h1 className="mt-5 text-[40px] leading-[46px] font-[680] tracking-tight md:text-[54px] md:leading-[60px]">Alle Unterlagen.<br /><span className="text-brand-500">Ein Tresor.</span></h1>
          <p className="mt-5 max-w-xl text-[17px] leading-7 text-soft">Verträge, Rechnungen, Arztbriefe, Gehaltsabrechnungen, Belege: einfach hochladen. Lifevault sortiert alles, schreibt die wichtigen Fakten heraus und beantwortet dir jede Frage dazu.</p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href="/register" className="inline-flex h-12 items-center gap-2 rounded-full bg-brand-500 px-6 text-[15px] font-semibold text-white hover:bg-brand-600">Kostenlos starten <ArrowRight size={17} /></Link>
            <Link href="/funktionen" className="inline-flex h-12 items-center rounded-full border border-card-line bg-surface px-6 text-[15px] font-semibold hover:bg-surface-2">Funktionen ansehen</Link>
          </div>
        </div>
        <HomeMock />
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        {STEPS.map(({ icon: Icon, t, d }, i) => (
          <div key={t} className="rounded-2xl border border-card-line bg-surface p-6">
            <span className="flex items-center gap-3"><span className="grid h-11 w-11 place-items-center rounded-full border border-card-line bg-surface text-fg"><Icon size={20} /></span><span className="text-[13px] font-semibold text-muted">Schritt {i + 1}</span></span>
            <h3 className="mt-4 text-[18px] font-semibold">{t}</h3>
            <p className="mt-1 text-[15px] leading-6 text-muted">{d}</p>
          </div>
        ))}
      </section>

      <section className="grid items-center gap-10 py-20 lg:grid-cols-2">
        <ChatMock />
        <div>
          <h2 className="text-[32px] leading-10 font-[650] tracking-tight">Frag einfach – die Antwort kommt mit Quelle.</h2>
          <p className="mt-4 text-[16px] leading-7 text-soft">Statt Ordner zu durchsuchen, fragst du: „Welche Rechnungen brauche ich für die Steuer?“, „Wo bin ich haftpflichtversichert?“, „Was hat der Arzt im März festgestellt?“ Lifevault antwortet kurz, nennt die Details und verlinkt das Dokument.</p>
          <Link href="/funktionen#fragen" className="mt-6 inline-flex items-center gap-1.5 text-[15px] font-semibold text-selected hover:underline">Mehr zum Chat <ArrowRight size={16} /></Link>
        </div>
      </section>

      <section className="rounded-3xl border border-card-line bg-surface p-6 md:p-10">
        <h2 className="text-[28px] leading-9 font-[650] tracking-tight">13 Bereiche, alles hat seinen Platz</h2>
        <p className="mt-2 max-w-2xl text-[15px] text-muted">Du musst nichts vorsortieren. Was nicht passt, landet unter „Sonstiges“ – verloren geht nichts.</p>
        <ul className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {CLUSTERS.map((c) => <li key={c.id} className="flex items-center gap-2.5 rounded-2xl border border-card-line p-3"><ClusterIcon id={c.id} size={32} /><span className="text-[14px] font-semibold">{c.label}</span></li>)}
        </ul>
      </section>

      <section className="py-20">
        <h2 className="text-center text-[32px] leading-10 font-[650] tracking-tight">Sicher von Anfang an</h2>
        <div className="mt-8 grid gap-4 md:grid-cols-3">
          {TRUST.map(({ icon: Icon, t, d }) => (
            <div key={t} className="rounded-2xl border border-card-line bg-surface p-6">
              <span className="grid h-11 w-11 place-items-center rounded-full bg-fg text-canvas"><Icon size={20} /></span>
              <h3 className="mt-4 text-[17px] font-semibold">{t}</h3>
              <p className="mt-1 text-[14px] leading-6 text-muted">{d}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="relative overflow-hidden rounded-3xl p-8 text-white md:p-12" style={{ background: "linear-gradient(135deg, #7c5cff 0%, #6d4aff 45%, #4a2fc4 100%)" }}>
        <div className="flex flex-col items-start gap-6 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-[28px] leading-9 font-[650] tracking-tight">Ordnung in einer Minute</h2>
            <p className="mt-2 flex items-center gap-2 text-white/80"><FileSearch size={16} /> Konto anlegen, erstes Dokument fotografieren, fertig. <UserRound size={16} /> Dein Profil baut sich von selbst.</p>
          </div>
          <Link href="/register" className="inline-flex h-12 shrink-0 items-center gap-2 rounded-full bg-white px-6 text-[15px] font-semibold text-brand-600">Jetzt starten <ArrowRight size={17} /></Link>
        </div>
      </section>
    </>
  );
}
