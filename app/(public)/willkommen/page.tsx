import Link from "next/link";
import { ArrowRight, ChevronDown, CircleCheck, Copy, FolderOutput, FolderTree, KeyRound, Layers, Lightbulb, Lock, Mail, MapPin, MessageSquare, PenLine, ScanLine, ShieldCheck, Sparkles, Tags, UserRound, Users } from "lucide-react";
import { ClusterIcon } from "@/components/ClusterIcon";
import { CLUSTERS } from "@/lib/clusters";
import { DevicePair, FloatCard, Head, Kicker, Spotlight, StageBackdrop } from "@/components/landing/Stage";
import { ChatShowcase, ConnectApps, Cta, DeviceList, Pillars } from "@/components/landing/Sections";

export const metadata = { title: "Lifevault – alle Unterlagen in einem Tresor", description: "Hochladen, automatisch sortieren, Fristen im Blick, alles fragen. Verträge, Rechnungen, Arztbriefe, Belege – sicher an einem Ort, Server in Frankfurt." };

/**
 * Öffentliche Startseite – Aufbau 1:1 wie die Startseite von Finastry (Reihenfolge, Bühnen, Abstände, Typografie),
 * nur in Lila und mit Lifevault-Inhalten. Bilder: Ansichten der echten App mit frei erfundenen Beispieldaten (public/landing).
 */
const IMG = (n: string) => `/landing/${n}.webp`;

/** Drei Funktionen im Fokus – Aussagen passend zum Code */
const SPOTLIGHTS = [
  {
    id: "sortieren", kicker: "Hochladen & sortieren", tone: "brand" as const,
    title: "Foto machen. Lifevault macht den Rest",
    text: "Brief fotografieren, PDF hochladen oder Rechnungen per E-Mail weiterleiten. Die KI liest jedes Dokument vollständig, erkennt die Art und legt es in den richtigen Bereich, nach Jahr sortiert.",
    points: ["Scan-Modus zieht Fotos gerade und hellt sie auf", "Mehrere Seiten oder Dateien auf einmal", "13 Bereiche, automatisch zugeordnet", "Key-Fakten, Beträge und Fristen herausgeschrieben"],
    href: "/funktionen#sortieren", desktop: "desktop-bereich", phone: "phone-home",
    altDesktop: "Lifevault am Computer: Bereich Verträge, nach Jahr sortiert", altPhone: "Lifevault am Handy: Startseite mit Überblick und Partnern",
  },
  {
    id: "fristen", kicker: "Fristen im Blick", tone: "teal" as const,
    title: "Das Wichtige auf einen Blick, keine Frist verpasst",
    text: "Jedes Dokument zeigt oben die wichtigsten Angaben und die nächste Frist. Was zu tun ist, landet unter „Zu erledigen“ auf der Startseite und auf Wunsch als Mitteilung auf dem Handy.",
    points: ["Zahlungen, Kündigungen, Einsprüche und Rücksendungen erkannt", "Kurzfassung und Fakten in aufklappbaren Gruppen", "Original immer dabei, mit Download", "Veraltetes wird archiviert, z. B. der alte Handyvertrag"],
    href: "/funktionen#dokument", desktop: "desktop-frist", phone: "phone-dokument",
    altDesktop: "Lifevault am Computer: Nebenkostenabrechnung mit Nachzahlung und nächster Frist", altPhone: "Lifevault am Handy: Stromvertrag mit Abschlag und Frist",
  },
  {
    id: "assistent", kicker: "Fragen", tone: "indigo" as const,
    title: "Ein Assistent, der deine Unterlagen kennt",
    text: "Frag in eigenen Worten, auch per Sprache. Die Antwort ist kurz und klar aufgebaut, mit den Details und dem Link auf die Stelle im Dokument, aus der sie stammt.",
    points: ["Jede Aussage mit Quelle und Seite", "Rechnet Fristen vom heutigen Tag aus", "Schreiben vorbereiten: Kündigung, Widerspruch, Rückfrage", "Verlauf aller Gespräche"],
    href: "/funktionen#fragen", desktop: "desktop-chat", phone: "phone-fragen",
    altDesktop: "Lifevault am Computer: Chat mit Fristen und Quellenangaben", altPhone: "Lifevault am Handy: Fragen mit Startvorschlägen",
  },
];

/** Ein Blick in die App: Ansichten der echten App mit Beispieldaten */
const TOUR = [
  { src: "desktop-dokument", t: "Dokumentansicht", d: "Kurzfassung, Kacheln mit Beträgen und Fristen, Fragen zum Dokument.", href: "/funktionen#dokument" },
  { src: "desktop-partner", t: "Partner", d: "Alle Firmen und Stellen mit Kunden-, Vertrags- und Versicherungsnummern.", href: "/funktionen#sortieren" },
  { src: "desktop-partner-detail", t: "Verlauf je Partner", d: "Anstehende Fristen und alle Schreiben einer Stelle, vom Vertrag bis zur Abrechnung.", href: "/funktionen#sortieren" },
  { src: "desktop-gesundheit", t: "Bereiche", d: "Nach Jahr sortiert, Verschlüsseltes mit Schloss markiert. Alles hat seinen Platz.", href: "/funktionen#sortieren" },
  { src: "desktop-tresor", t: "Tresor", d: "Sensible Bereiche mit deinem eigenen Passwort verschlüsseln.", href: "/funktionen#sicherheit" },
  { src: "desktop-apps", t: "Verbundene Apps", d: "Welche App was sehen darf, jederzeit anpassen oder widerrufen.", href: "/funktionen#api" },
];

const STEPS = [
  { icon: ScanLine, t: "Fotografieren oder hochladen", d: "Brief, PDF oder Kassenbon. Mehrere auf einmal, oder Rechnungen einfach per E-Mail weiterleiten." },
  { icon: Layers, t: "Automatisch sortiert", d: "Lifevault liest alles aus, legt es in den richtigen Bereich und schreibt Fakten und Fristen heraus." },
  { icon: MessageSquare, t: "Einfach fragen", d: "„Wann läuft mein Handyvertrag aus?“ Die Antwort kommt mit Quelle, das Dokument ist einen Klick entfernt." },
];

const MORE = [
  { icon: ScanLine, t: "Scan-Modus" },
  { icon: Tags, t: "Tags wie Finanzamt oder Arztbesuch" },
  { icon: PenLine, t: "Schreiben vorbereiten" },
  { icon: Lightbulb, t: "Handlungsempfehlungen" },
  { icon: FolderOutput, t: "Export als ZIP oder PDF" },
  { icon: Mail, t: "E-Mail-Import" },
  { icon: FolderTree, t: "Projekte" },
  { icon: Copy, t: "Doppeltes erkennen" },
  { icon: UserRound, t: "Lebensprofil" },
  { icon: Users, t: "Partner mit Nummern" },
  { icon: KeyRound, t: "App-Sperre mit PIN" },
];

/** Sicherheit in einfachen Worten */
const TRUST = [
  { icon: ShieldCheck, t: "Nur du siehst deine Daten", d: "Jede Datei liegt in deinem privaten Bereich. Die Datenbank gibt nur dir deine Zeilen heraus." },
  { icon: Lock, t: "Tresor mit eigenem Passwort", d: "Arztbriefe und andere sensible Bereiche verschlüsselt dein Gerät (AES-256). Ohne dein Tresor-Passwort kann sie niemand lesen." },
  { icon: KeyRound, t: "Zwei-Faktor und PIN-Sperre", d: "Anmeldung zusätzlich mit Code aus der Authenticator-App. Lifevault sperrt sich, wenn du länger nichts tust." },
  { icon: MapPin, t: "Server in Frankfurt", d: "Datenbank und Dateien liegen in einem Rechenzentrum in Frankfurt am Main, also in der EU." },
];

const FAQ = [
  { q: "Ist Lifevault sicher?", a: "Ja. Jede Datei liegt in deinem privaten Bereich, die Datenbank gibt nur dir deine Zeilen heraus, und die Anmeldung lässt sich mit Zwei-Faktor schützen. Sensible Bereiche verschlüsselst du zusätzlich mit deinem Tresor-Passwort, der Schlüssel bleibt auf deinem Gerät." },
  { q: "Welche Unterlagen kann ich ablegen?", a: "Alles, was als Foto, PDF oder Bild vorliegt: Verträge, Rechnungen, Mahnungen, Arztbriefe, Gehaltsabrechnungen, Steuerbescheide, Kassenbons, Ausweise und mehr. Was in keinen Bereich passt, landet unter „Sonstiges“. Verloren geht nichts." },
  { q: "Woher weiß Lifevault, was in meinen Dokumenten steht?", a: "Eine KI liest jedes Dokument vollständig, erkennt die Art und schreibt die wichtigen Fakten, Beträge und Fristen heraus. Text in Dokumenten gilt dabei immer als Daten, nie als Anweisung." },
  { q: "Kann ich andere Apps mit Lifevault verbinden?", a: "Ja, über „Mit Lifevault verbinden“. Du meldest dich an und legst fest, welche Arten von Dokumenten und welche Projekte eine App sehen darf. Tresor-Dokumente sind für Apps nie sichtbar, und du kannst die Freigabe jederzeit widerrufen." },
  { q: "Auf welchen Geräten läuft Lifevault?", a: "Im Browser auf Computer, Tablet und Handy. Am Handy kannst du Lifevault zum Home-Bildschirm hinzufügen, dann startet es wie eine App." },
];

const SECTION = "scroll-mt-24 py-20 md:py-28";

/** Öffentliche Startseite (Kurzfassung), Details unter /funktionen */
export default function Landing() {
  return (
    <>
      {/* ---------- Hero: Pille → Überschrift → Text und Knöpfe → Geräte auf einer Bühne ---------- */}
      <section className="relative -mx-4 overflow-hidden px-4 pt-12 pb-10 md:-mx-8 md:px-8 md:pt-20 md:pb-16">
        <StageBackdrop className="[mask-image:linear-gradient(#000_55%,transparent)]" />
        <div className="relative text-center">
          <span className="lp-rise inline-flex items-center gap-2 rounded-full border border-card-line bg-surface/80 px-4 py-1.5 text-sm font-medium text-selected backdrop-blur">
            <Lock size={14} /> Dein persönlicher <b className="font-[750]">Dokumenten-Tresor</b>
          </span>
          <h1 className="lp-rise mx-auto mt-6 max-w-4xl text-[44px] leading-[48px] font-[720] tracking-[-0.035em] text-balance [animation-delay:.08s] md:text-[76px] md:leading-[80px]">
            Alle Unterlagen. <span className="bg-clip-text text-transparent" style={{ backgroundImage: "var(--gradient-brand)" }}>Ein Tresor.</span>
          </h1>
          <p className="lp-rise mx-auto mt-6 max-w-2xl text-[18px] leading-8 text-pretty text-soft [animation-delay:.16s] md:text-[19px]">
            Verträge, Rechnungen, Arztbriefe, Gehaltsabrechnungen: einfach hochladen. Lifevault sortiert alles, behält deine Fristen im Blick und beantwortet dir jede Frage dazu, immer mit Quelle.
          </p>
          <div className="lp-rise mt-9 flex flex-col items-center justify-center gap-3 [animation-delay:.24s] sm:flex-row">
            <Link href="/register" className="inline-flex h-[54px] items-center gap-2 rounded-full bg-brand-500 px-7 text-[15px] font-semibold text-white shadow-[0_10px_30px_-10px_rgba(109,74,255,.7)] transition hover:bg-brand-600">
              Kostenlos starten <ArrowRight size={17} />
            </Link>
            <Link href="/funktionen" className="inline-flex h-[54px] items-center gap-2 rounded-full border border-card-line bg-surface px-7 text-[15px] font-semibold transition hover:bg-surface-2"><Sparkles size={17} /> Funktionen ansehen</Link>
          </div>
          <ul className="lp-rise mt-7 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm text-muted [animation-delay:.3s]">
            {["Server in Frankfurt", "Tresor-Verschlüsselung auf deinem Gerät", "Zwei-Faktor-Anmeldung"].map((x) => (
              <li key={x} className="flex items-center gap-1.5"><CircleCheck size={15} className="text-positive" /> {x}</li>
            ))}
          </ul>
        </div>

        {/* Geräte: Ansichten der echten App mit Beispieldaten, dazu zwei Beispiele, was Lifevault automatisch erkennt */}
        <div className="lp-rise relative mx-auto mt-14 max-w-[1080px] [animation-delay:.36s] md:mt-20">
          <DevicePair eager url="lifevault.app" desktop={IMG("desktop-home")} phone={IMG("phone-chat")} altDesktop="Lifevault am Computer: Startseite mit Überblick, Partnern und Bereichen" altPhone="Lifevault am Handy: Chat mit Fristen und Quellen" />
          <FloatCard className="top-[18%] -left-6 items-center gap-3 lg:-left-14">
            <ClusterIcon id="arbeit" size={38} />
            <span className="text-left leading-tight">
              <span className="block text-[11px] font-semibold text-positive-text">Automatisch einsortiert</span>
              <span className="block text-[14px] font-semibold">Gehaltsabrechnung Oktober</span>
              <span className="block text-[12px] text-muted">Arbeit & Gehalt · 4 Key-Fakten</span>
            </span>
          </FloatCard>
          <FloatCard delay={1.6} className="bottom-[26%] -left-4 items-center gap-3 lg:-left-10">
            <ClusterIcon id="steuer" size={38} />
            <span className="text-left leading-tight">
              <span className="block text-[11px] font-semibold text-selected">Frist erkannt</span>
              <span className="block text-[14px] font-semibold">Einspruch bis 09.11.2026</span>
              <span className="block text-[12px] text-muted">Einkommensteuerbescheid 2025</span>
            </span>
          </FloatCard>
        </div>
      </section>

      {/* ---------- Bereiche (an der Stelle der Banken bei Finastry) ---------- */}
      <section aria-label="Für alle deine Unterlagen" className="lp-reveal border-y border-line py-10">
        <p className="text-center text-sm font-medium text-muted">Für alle deine Unterlagen, automatisch in 13 Bereiche sortiert</p>
        <ul className="mx-auto mt-6 flex max-w-5xl flex-wrap items-center justify-center gap-x-7 gap-y-4 px-2">
          {CLUSTERS.filter((c) => c.id !== "sonstiges").map((c) => (
            <li key={c.id} className="flex items-center gap-2 text-[15px] font-semibold text-soft">
              <ClusterIcon id={c.id} size={30} /> {c.label}
            </li>
          ))}
          <li className="text-[15px] font-semibold text-selected">+ Sonstiges</li>
        </ul>
      </section>

      {/* ---------- Drei Stärken ---------- */}
      <section id="staerken" className={SECTION}>
        <div className="lp-reveal"><Head kicker="Lifevault" title="Drei Stärken. Ein Ziel: Ordnung ohne Aufwand" text="Lifevault nimmt dir das Abheften ab, behält deine Fristen im Blick und beantwortet dir jede Frage zu deinen Unterlagen." /></div>
        <div className="lp-reveal mt-14"><Pillars /></div>
      </section>

      {/* ---------- Funktionen im Fokus ---------- */}
      <section id="funktionen" className="scroll-mt-24 space-y-24 pb-20 md:space-y-32 md:pb-28">
        {SPOTLIGHTS.map((s, i) => (
          <Spotlight key={s.id} {...s} url="lifevault.app" desktop={IMG(s.desktop)} phone={IMG(s.phone)} flip={i % 2 === 1} />
        ))}
      </section>

      {/* ---------- Chat ---------- */}
      <div className="lp-reveal"><ChatShowcase /></div>

      {/* ---------- Ein Blick in die App ---------- */}
      <section id="rundgang" className="scroll-mt-24 pb-20 md:pb-28">
        <div className="lp-reveal"><Head kicker="Ein Blick in die App" title="So sehen deine Unterlagen in Lifevault aus" text="Echte Ansichten der App mit erfundenen Beispieldaten. Klick auf ein Bild für alle Details zu diesem Bereich." /></div>
        <div className="-mx-4 mt-12 flex snap-x snap-mandatory gap-4 overflow-x-auto px-4 pb-2 [scrollbar-width:none] md:mx-0 md:grid md:grid-cols-2 md:gap-6 md:overflow-visible md:px-0 lg:grid-cols-3">
          {TOUR.map((x) => (
            <Link key={x.src} href={x.href} className="lp-reveal group w-[82%] shrink-0 snap-start rounded-[24px] border border-card-line bg-surface p-2.5 transition hover:-translate-y-1 hover:shadow-[0_24px_48px_-24px_rgba(16,24,40,.25)] md:w-auto">
              <span className="block overflow-hidden rounded-[16px] border border-line bg-page">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={IMG(x.src)} alt={`Lifevault: ${x.t}`} width={1440} height={900} loading="lazy" decoding="async" className="block aspect-[16/10] w-full object-cover object-top transition duration-500 group-hover:scale-[1.02]" />
              </span>
              <span className="block px-2.5 pt-4 pb-2">
                <span className="flex items-center gap-1.5 text-[16px] font-semibold">{x.t} <ArrowRight size={15} className="text-brand-500 transition group-hover:translate-x-0.5" /></span>
                <span className="mt-1 block text-sm leading-6 text-soft">{x.d}</span>
              </span>
            </Link>
          ))}
        </div>
        <ul className="lp-reveal mx-auto mt-12 flex max-w-4xl flex-wrap justify-center gap-2.5">
          {MORE.map(({ icon: Icon, t }) => (
            <li key={t} className="inline-flex items-center gap-2 rounded-full border border-card-line bg-surface px-4 py-2.5 text-[14px] font-medium">
              <Icon size={16} className="text-brand-500" /> {t}
            </li>
          ))}
        </ul>
        <div className="mt-10 text-center">
          <Link href="/funktionen" className="inline-flex h-12 items-center gap-2 rounded-full border border-card-line bg-surface px-6 text-sm font-semibold transition hover:bg-surface-2">Alle Funktionen ansehen <ArrowRight size={16} /></Link>
        </div>
      </section>

      {/* ---------- So funktioniert's ---------- */}
      <section id="so-gehts" className="scroll-mt-24 pb-20 md:pb-28">
        <div className="lp-reveal"><Head kicker="So funktioniert’s" title="In drei Schritten zur Ordnung" text="Kein Abheften, kein Vorsortieren. Lifevault übernimmt die Arbeit. Du fragst nur noch, was du wissen willst." /></div>
        <ol className="relative mt-14 grid gap-5 md:grid-cols-3">
          <span aria-hidden className="absolute top-[52px] right-[16%] left-[16%] hidden border-t border-dashed border-line-strong md:block" />
          {STEPS.map(({ icon: Icon, t, d }, i) => (
            <li key={t} className="lp-reveal relative rounded-[24px] border border-card-line bg-surface p-7 text-center">
              <span className="relative mx-auto grid h-12 w-12 place-items-center rounded-2xl text-white" style={{ background: "var(--gradient-brand)" }}><Icon size={22} strokeWidth={1.75} /></span>
              <span className="mt-4 block text-xs font-semibold tracking-wide text-muted uppercase">Schritt {i + 1}</span>
              <h3 className="mt-1 text-[19px] font-semibold">{t}</h3>
              <p className="mt-2 text-[15px] leading-6 text-soft">{d}</p>
            </li>
          ))}
        </ol>
      </section>

      {/* ---------- Sicherheit: dunkle Fläche ---------- */}
      <section id="sicherheit" className="scroll-mt-24 pb-20 md:pb-28">
        <div className="lp-reveal relative overflow-hidden rounded-[32px] bg-[#100c24] px-6 py-14 text-white sm:px-10 md:px-14 md:py-20">
          <div aria-hidden className="pointer-events-none absolute inset-0" style={{ background: "radial-gradient(60% 80% at 85% 0%, rgba(124,92,255,.32), transparent 60%), radial-gradient(50% 70% at 0% 100%, rgba(31,150,136,.22), transparent 60%)" }} />
          <div className="relative grid gap-12 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:items-center">
            <div>
              <Kicker tone="light">Sicherheit</Kicker>
              <h2 className="mt-4 text-[32px] leading-[38px] font-[680] tracking-[-0.025em] text-balance md:text-[44px] md:leading-[50px]">Sicher von Anfang an</h2>
              <p className="mt-4 text-[17px] leading-7 text-white/70">Deine Unterlagen gehören dir. Lifevault greift nur in deinem Namen darauf zu, und das Sensibelste verschlüsselst du selbst.</p>
              <Link href="/funktionen#sicherheit" className="mt-8 inline-flex h-12 items-center gap-2 rounded-full bg-white px-6 text-sm font-semibold text-[#100c24] transition hover:bg-white/90"><ShieldCheck size={16} /> Mehr zur Sicherheit</Link>
            </div>
            <ul className="grid gap-4 sm:grid-cols-2">
              {TRUST.map(({ icon: Icon, t, d }) => (
                <li key={t} className="rounded-[20px] border border-white/10 bg-white/[.04] p-6">
                  <span className="grid h-11 w-11 place-items-center rounded-2xl bg-white/10 text-[#c4b5ff]"><Icon size={20} strokeWidth={1.75} /></span>
                  <h3 className="mt-4 text-[16px] font-semibold">{t}</h3>
                  <p className="mt-1.5 text-sm leading-6 text-white/65">{d}</p>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* ---------- Verbundene Apps (an der Stelle der Preise bei Finastry) ---------- */}
      <section id="verbinden" className="scroll-mt-24 pb-20 md:pb-28">
        <div className="lp-reveal"><Head tone="teal" kicker="Verbundene Apps" title="Mit Lifevault verbinden" text="Andere Apps, zum Beispiel Finastry, können mit deiner Freigabe Unterlagen abrufen oder ablegen. Du entscheidest, was sie sehen." /></div>
        <div className="lp-reveal mt-12"><ConnectApps /></div>
      </section>

      {/* ---------- Geräte ---------- */}
      <section id="geraete" className="scroll-mt-24 pb-20 md:pb-28">
        <div className="lp-reveal grid items-center gap-10 rounded-[32px] border border-card-line bg-surface-2 p-6 sm:p-10 md:grid-cols-[1fr_1.1fr] md:p-14">
          <div>
            <Kicker>Überall dabei</Kicker>
            <h2 className="mt-4 text-[30px] leading-9 font-[680] tracking-[-0.025em] md:text-[40px] md:leading-[46px]">Auf allen deinen Geräten</h2>
            <p className="mt-4 text-[17px] leading-7 text-soft">Im Browser auf Computer, Tablet und Handy. Am Handy fotografierst du Briefe direkt mit der Kamera. Deine Unterlagen sind überall gleich geschützt.</p>
            <Link href="/register" className="mt-7 inline-flex h-12 items-center gap-2 rounded-full bg-brand-500 px-6 text-sm font-semibold text-white transition hover:bg-brand-600">Jetzt starten <ArrowRight size={16} /></Link>
          </div>
          <DeviceList />
        </div>
      </section>

      {/* ---------- FAQ ---------- */}
      <section id="faq" className="scroll-mt-24 pb-20 md:pb-28">
        <div className="grid gap-10 lg:grid-cols-[minmax(0,4fr)_minmax(0,7fr)]">
          <div className="lp-reveal">
            <Head align="left" kicker="FAQ" title="Gut zu wissen" text="Die häufigsten Fragen in Kürze. Alle Funktionen im Detail findest du auf der Funktionsseite." />
            <Link href="/funktionen" className="group mt-6 inline-flex items-center gap-1.5 text-[15px] font-semibold text-selected">Alle Funktionen <ArrowRight size={16} className="transition group-hover:translate-x-0.5" /></Link>
          </div>
          <div className="lp-reveal divide-y divide-line rounded-[24px] border border-card-line bg-surface">
            {FAQ.map((f) => (
              <details key={f.q} className="group px-6 py-1">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 py-5 text-[16px] font-semibold">
                  {f.q} <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-surface-2 text-muted transition group-open:rotate-180"><ChevronDown size={17} /></span>
                </summary>
                <p className="pb-6 text-[15px] leading-7 text-soft">{f.a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* ---------- CTA ---------- */}
      <div className="lp-reveal">
        <Cta
          title="Ordnung in einer Minute"
          text="Konto anlegen, erstes Dokument fotografieren, fertig. Lifevault sortiert es ein, schreibt das Wichtige heraus und erinnert dich an Fristen."
          points={["Kostenlos starten", "Server in Frankfurt, in der EU", "Sensibles mit eigenem Passwort verschlüsselt"]}
          image={IMG("phone-partner")}
        />
      </div>
    </>
  );
}
