import Link from "next/link";
import { ArrowRight, ArrowUp, Ban, CalendarClock, Check, CheckCircle2, EyeOff, FileSearch, FolderTree, Globe, History, KeyRound, Laptop, MessageSquare, Mic, PenLine, Plus, ScanLine, ShieldCheck, Smartphone, Sparkles, Tablet, UserRound, X } from "lucide-react";
import { ClusterIcon } from "@/components/ClusterIcon";
import { Head } from "@/components/landing/Stage";

/**
 * Abschnitte der Startseite, aufgebaut wie die Gegenstücke bei Finastry (Pillars, ChatShowcase, Pricing, AppDownloads, Cta).
 * Aussagen passen zum Code: Auslesen und Sortieren (api/process, lib/clusters), Fristen (lib/actions, lib/notify),
 * Chat mit Quellen (api/chat, components/Cite), Tresor (lib/vault, AES-GCM 256), Verbinden (OAuth 2.1 + PKCE, /connect).
 */

/* ---------- Drei Stärken ---------- */
const PILLARS = [
  {
    id: "sortiert", icon: FolderTree, name: "Automatisch sortiert", title: "Du musst nichts mehr abheften",
    text: "Foto, PDF oder Scan: Die KI liest jedes Dokument vollständig, erkennt die Art und legt es in einen von 13 Bereichen. Die wichtigen Fakten schreibt sie gleich heraus.",
    points: ["Rechnung, Vertrag, Arztbrief, Bescheid erkannt", "Key-Fakten, Beträge und Fristen herausgeschrieben", "Absender als Partner mit allen Kundennummern", "Volltextsuche über alles", "Doppeltes wird erkannt"],
    href: "/funktionen#sortieren", tone: { bg: "bg-brand-500", soft: "bg-lavender", text: "text-selected" },
  },
  {
    id: "fristen", icon: CalendarClock, name: "Fristen im Blick", title: "Keine Frist mehr verpassen",
    text: "Zahlungen, Kündigungen, Einsprüche, Rücksendungen: Lifevault findet die Fristen in deinen Unterlagen und zeigt dir, was als Nächstes ansteht.",
    points: ["„Zu erledigen“ direkt auf der Startseite", "Mitteilungen aufs Handy, wenn etwas fällig wird", "Ausweise rechtzeitig verlängern", "Zahlen mit Bankdaten zum Kopieren und GiroCode"],
    href: "/funktionen#dokument", tone: { bg: "bg-positive", soft: "bg-positive/10", text: "text-positive-text" },
  },
  {
    id: "fragen", icon: MessageSquare, name: "Fragen mit Quelle", title: "Frag deine Unterlagen einfach",
    text: "Statt Ordner zu durchsuchen, fragst du in eigenen Worten. Die Antwort ist kurz und klar, mit Link auf das Dokument und die Stelle, aus der sie stammt.",
    points: ["Antwort mit Quelle und Seite", "Chat zu einem einzelnen Dokument", "Schreiben vorbereiten: Kündigung, Widerspruch", "Lebensprofil aus allen Dokumenten"],
    href: "/funktionen#fragen", tone: { bg: "bg-brand-700", soft: "bg-brand-700/10", text: "text-brand-700" },
  },
];

export function Pillars() {
  return (
    <ol className="grid grid-cols-1 gap-5 lg:grid-cols-3">
      {PILLARS.map(({ id, icon: Icon, name, title, text, points, href, tone }) => (
        <li key={id} className="relative flex min-w-0 flex-col rounded-3xl border border-card-line bg-surface p-7 md:p-8">
          <span className={`grid h-12 w-12 place-items-center rounded-2xl text-white ${tone.bg}`}><Icon size={22} strokeWidth={1.75} /></span>
          <div className={`mt-5 text-xs font-semibold tracking-wide uppercase ${tone.text}`}>{name}</div>
          <h3 className="mt-1.5 text-[21px] leading-7 font-semibold">{title}</h3>
          <p className="mt-2.5 text-[15px] leading-6 text-soft">{text}</p>
          <ul className="mt-5 space-y-2">
            {points.map((p) => (
              <li key={p} className="flex items-start gap-2.5 text-[14px] leading-5">
                <span className={`mt-px grid h-5 w-5 shrink-0 place-items-center rounded-full ${tone.soft} ${tone.text}`}><Check size={12} strokeWidth={2.75} /></span> {p}
              </li>
            ))}
          </ul>
          <Link href={href} className={`mt-auto inline-flex items-center gap-1.5 pt-6 text-sm font-semibold ${tone.text} hover:underline`}>
            Mehr dazu <ArrowRight size={15} />
          </Link>
        </li>
      ))}
    </ol>
  );
}

/* ---------- Chat (wie Finastrys ChatShowcase) ---------- */
const CAN = [
  { icon: MessageSquare, t: "Frei fragen", d: "„Wo bin ich haftpflichtversichert?“ – Folgefragen bleiben im Zusammenhang." },
  { icon: FileSearch, t: "Immer mit Quelle", d: "Jede Aussage verlinkt das Dokument. Ein Klick öffnet es an der richtigen Stelle." },
  { icon: CalendarClock, t: "Rechnet Fristen aus", d: "Vom heutigen Tag aus: wie lange noch, und bis wann etwas spätestens raus muss." },
  { icon: Sparkles, t: "Karten statt Textwand", d: "Zahlungen mit Bankdaten und GiroCode, Partner mit Kontakt, Verträge mit Konditionen." },
  { icon: PenLine, t: "Schreiben vorbereiten", d: "Kündigung, Widerspruch oder Rückfrage: die KI formuliert vor, du schickst per Mail oder Brief." },
  { icon: History, t: "Verlauf", d: "Alte Gespräche findest du wieder, anpinnen und umbenennen inklusive." },
  { icon: UserRound, t: "Lebensprofil", d: "Wo du arbeitest, wohnst, versichert bist und welche Verträge laufen, aus allen Dokumenten." },
  { icon: Mic, t: "Sprechen statt tippen", d: "Frage einfach diktieren, auch unterwegs am Handy." },
];
const RULES = ["Antwortet nur aus deinen Dokumenten", "Sagt ehrlich, wenn etwas nicht drinsteht", "Nennt bei jeder Aussage die Quelle", "Text in Dokumenten gilt als Daten, nie als Anweisung"];
const NEVER = ["Tresor-Dokumente, solange der Tresor zu ist", "Dein Tresor-Passwort (bleibt auf dem Gerät)", "Unterlagen anderer Nutzer", "Archiviertes ohne Hinweis, dass es nicht mehr gilt"];

export function ChatShowcase({ id = "fragen" }: { id?: string }) {
  return (
    <section id={id} className="scroll-mt-24 pb-16 md:pb-24">
      <Head kicker="Fragen" title="Frag einfach. Antwort mit Quelle und den nächsten Schritten" text="Ein Assistent, der deine Unterlagen kennt: kurze Antworten, die wichtigsten Details als Karten, und immer der Link zum Dokument." />
      <div className="mt-10 grid grid-cols-1 items-start gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        {/* Beispiel-Antwort (erfundene Daten) */}
        <div className="min-w-0 rounded-3xl border border-card-line bg-surface-2 p-4 sm:p-6">
          <div className="flex justify-center"><span className="rounded-full bg-fg px-3 py-1 text-[11px] font-semibold text-canvas">Heute, 08:40 Uhr</span></div>
          <div className="mt-4 ml-auto w-fit max-w-[85%] rounded-3xl bg-brand-500/10 px-4 py-2.5 text-[15px]">Was steht bei mir in den nächsten Wochen an?</div>
          <div className="mt-5 text-[15px] leading-6">
            <p>Du hast <b>vier Fristen</b> bis Mitte November. Zu zahlen sind zusammen <b>328,58 €</b>.</p>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <div className="rounded-2xl px-3.5 py-3 text-white" style={{ background: "var(--gradient-brand)" }}><div className="text-[11px] opacity-85">Offen zu zahlen</div><div className="tnum text-[17px] font-semibold">328,58 €</div></div>
              <div className="rounded-2xl px-3.5 py-3 text-white" style={{ background: "linear-gradient(120deg,#1f9688,#27a294)" }}><div className="text-[11px] opacity-85">Nächste Frist</div><div className="tnum text-[17px] font-semibold">in 9 Tagen</div></div>
            </div>
            <ul className="mt-2 divide-y divide-line overflow-hidden rounded-2xl border-[1.5px] border-card-line/70 bg-white text-[13px] dark:bg-surface">
              {([["steuer", "Einspruch Steuerbescheid", "09.11.", "optional"], ["rechnungen", "Heizungswartung zahlen", "10.11.", "186,40 €"], ["wohnen", "Nachzahlung Nebenkosten", "15.11.", "142,18 €"], ["gesundheit", "Physiotherapie beginnen", "18.11.", "Rezept"]] as const).map(([c, t, d, v]) => (
                <li key={t} className="flex items-center gap-3 px-3.5 py-2.5">
                  <ClusterIcon id={c} size={30} />
                  <span className="min-w-0 flex-1"><span className="block truncate font-semibold">{t}</span><span className="block text-[12px] text-muted">bis {d}</span></span>
                  <span className="tnum shrink-0 font-semibold">{v}</span>
                  <span className="shrink-0 rounded-md bg-brand-500/10 px-1 text-[11px] font-semibold text-brand-600">[S. 1]</span>
                </li>
              ))}
            </ul>
            <div className="mt-2 flex items-center gap-3 rounded-2xl border-[1.5px] border-positive/40 bg-positive/10 px-3.5 py-2.5">
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-white" style={{ background: "linear-gradient(120deg,#1f9688,#27a294)" }}><Check size={16} strokeWidth={2.6} /></span>
              <span className="min-w-0 flex-1 text-sm"><b>Mobilfunkvertrag: Kündigung bis 31.12.</b><span className="block text-xs text-soft">Läuft am 31.01.2027 aus · Kündigung vorbereiten?</span></span>
            </div>
          </div>
          <div className="mt-5 flex items-center gap-2 rounded-[24px] border border-card-line bg-white p-2 pl-3 text-muted dark:bg-surface">
            <Plus size={18} /> <span className="flex-1 text-sm">Frag etwas zu deinen Unterlagen …</span> <Mic size={18} />
            <span className="grid h-9 w-9 place-items-center rounded-full bg-brand-500 text-white"><ArrowUp size={17} /></span>
          </div>
        </div>
        {/* Was er kann, und worauf du dich verlassen kannst */}
        <div className="min-w-0 space-y-5">
          <ul className="grid gap-x-5 gap-y-4 sm:grid-cols-2">
            {CAN.map(({ icon: Icon, t, d }) => (
              <li key={t} className="flex gap-3">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-lavender text-brand-500"><Icon size={17} strokeWidth={1.9} /></span>
                <span className="min-w-0"><span className="block text-[15px] font-semibold">{t}</span><span className="mt-0.5 block text-[13px] leading-5 text-soft">{d}</span></span>
              </li>
            ))}
          </ul>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-2xl border border-card-line p-4">
              <div className="flex items-center gap-2 text-sm font-semibold"><ShieldCheck size={16} className="text-positive" /> So antwortet Lifevault</div>
              <ul className="mt-2 space-y-1.5 text-[13px] text-soft">{RULES.map((x) => <li key={x} className="flex gap-2"><Check size={14} className="mt-0.5 shrink-0 text-positive" /> {x}</li>)}</ul>
            </div>
            <div className="rounded-2xl border border-card-line p-4">
              <div className="flex items-center gap-2 text-sm font-semibold"><EyeOff size={16} className="text-negative-text" /> Das sieht die KI nie</div>
              <ul className="mt-2 space-y-1.5 text-[13px] text-soft">{NEVER.map((x) => <li key={x} className="flex gap-2"><X size={14} className="mt-0.5 shrink-0 text-negative-text" /> {x}</li>)}</ul>
            </div>
          </div>
          <p className="flex items-start gap-2 text-xs text-muted"><CheckCircle2 size={14} className="mt-0.5 shrink-0 text-positive" /> Verschlüsselte Tresor-Dokumente werden nur für eine Antwort im Browser entschlüsselt, wenn du den Tresor geöffnet hast.</p>
          <p className="flex items-start gap-2 text-xs text-muted"><Ban size={14} className="mt-0.5 shrink-0" /> Keine Rechts-, Steuer- oder medizinische Beratung. Im Zweifel fragst du besser eine Fachperson.</p>
        </div>
      </div>
    </section>
  );
}

/* ---------- Verbundene Apps (an der Stelle der Preise bei Finastry, gleicher Aufbau mit zwei Karten) ---------- */
const CONNECT = [
  { name: "Lesen", sub: "Für Apps, die deine Unterlagen nutzen", icon: FileSearch, highlight: false, points: ["Dokumente suchen und abrufen", "Beträge, Fristen und Vertragsdaten", "Nur die Arten, die du freigibst (z. B. Rechnungen)", "Nur aus den Projekten, die du wählst", "Persönliche Daten nur auf Wunsch, sonst entfernt"] },
  { name: "Hochladen", sub: "Für Apps, die dir Unterlagen schicken", icon: Plus, highlight: true, points: ["Neue Dokumente direkt in deinen Tresor", "Lifevault liest sie aus und sortiert sie ein", "Auf Wunsch in einem eigenen Projekt für die App", "Freigabe jederzeit anpassen oder widerrufen", "Tresor-Dokumente sind für Apps nie sichtbar"] },
];

export function ConnectApps() {
  return (
    <div className="mx-auto grid max-w-[880px] gap-5 md:grid-cols-2">
      {CONNECT.map(({ name, sub, icon: Icon, highlight, points }) => (
        <div key={name} className={`relative flex flex-col rounded-3xl border bg-surface p-6 md:p-7 ${highlight ? "border-brand-500" : "border-card-line"}`}>
          <span className={`grid h-11 w-11 place-items-center rounded-2xl ${highlight ? "bg-brand-500 text-white" : "bg-lavender text-brand-500"}`}><Icon size={20} /></span>
          <div className="mt-4 text-[13px] font-semibold text-selected">{name}</div>
          <div className="text-[13px] text-muted">{sub}</div>
          <ul className="mt-5 space-y-2.5">
            {points.map((p) => (
              <li key={p} className="flex items-start gap-2.5 text-[14px] leading-5">
                <span className={`mt-px grid h-5 w-5 shrink-0 place-items-center rounded-full ${highlight ? "bg-brand-500 text-white" : "bg-positive/10 text-positive-text"}`}><Check size={12} strokeWidth={2.75} /></span> {p}
              </li>
            ))}
          </ul>
        </div>
      ))}
      <div className="flex flex-col gap-3 rounded-3xl border border-card-line bg-surface-2 p-5 text-[14px] md:col-span-2 md:flex-row md:items-center md:justify-between md:px-7">
        <span className="flex items-start gap-3"><KeyRound size={18} className="mt-0.5 shrink-0 text-brand-500" /><span><b>„Mit Lifevault verbinden“</b> nach OAuth 2.1 mit PKCE: du meldest dich bei Lifevault an und entscheidest selbst, was die App sehen darf. Gespeichert werden nur Prüfwerte, keine Klartext-Schlüssel.</span></span>
        <Link href="/funktionen#api" className="inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-full bg-fg px-5 text-[14px] font-semibold text-canvas">Mehr dazu <ArrowRight size={15} /></Link>
      </div>
    </div>
  );
}

/* ---------- Geräte (Liste wie Finastrys App-Downloads) ---------- */
const DEVICES = [
  { icon: Laptop, name: "Computer", d: "Im Browser · Windows, macOS, Linux", tone: "bg-fg text-canvas" },
  { icon: Smartphone, name: "iPhone", d: "Im Browser · zum Home-Bildschirm hinzufügen", tone: "bg-brand-500 text-white" },
  { icon: Smartphone, name: "Android", d: "Im Browser · als App installieren", tone: "bg-positive text-white" },
  { icon: Tablet, name: "Tablet", d: "Im Browser · iPad und Android", tone: "bg-lavender text-brand-500" },
];

export function DeviceList() {
  return (
    <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-card-line bg-surface">
      {DEVICES.map(({ icon: Icon, name, d, tone }) => (
        <li key={name}>
          <Link href="/register" className="group flex items-center gap-4 px-4 py-3.5 transition hover:bg-surface-2 sm:px-5">
            <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl ${tone}`}><Icon size={21} /></span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[15px] font-semibold">{name}</span>
              <span className="mt-0.5 flex items-center gap-1.5 text-xs text-muted"><Globe size={13} /> {d}</span>
            </span>
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-surface-3 text-fg transition group-hover:brightness-95" aria-hidden><ArrowRight size={17} /></span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

/* ---------- Abschluss-Kachel (wie Finastrys Cta, in Lila) ---------- */
export function Cta({ title, text, points, image }: { title: string; text: string; points: string[]; image: string }) {
  return (
    <section className="relative overflow-hidden rounded-3xl text-white" style={{ background: "linear-gradient(135deg, #7c5cff 0%, #6d4aff 45%, #4a2fc4 100%)" }}>
      <div className="grid items-center gap-10 px-6 pt-12 md:grid-cols-[1.2fr_1fr] md:px-14 md:pt-0">
        <div className="md:py-16">
          <h2 className="text-[30px] leading-[38px] font-[650] tracking-tight md:text-[40px] md:leading-[48px]">{title}</h2>
          <p className="mt-3 max-w-lg text-[17px] leading-7 text-white/80">{text}</p>
          <ul className="mt-6 space-y-2.5">
            {points.map((p) => (
              <li key={p} className="flex items-center gap-2.5 text-[15px]">
                <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-white/20"><Check size={12} strokeWidth={3} /></span>
                {p}
              </li>
            ))}
          </ul>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Link href="/register" className="inline-flex h-[54px] items-center justify-center gap-2 rounded-full bg-white px-7 text-[15px] font-semibold text-brand-600 hover:bg-white/90">Kostenlos starten <ArrowRight size={17} /></Link>
            <Link href="/funktionen" className="inline-flex h-[54px] items-center justify-center gap-2 rounded-full bg-white/15 px-7 text-[15px] font-semibold ring-1 ring-white/30 hover:bg-white/20"><ScanLine size={17} /> Funktionen ansehen</Link>
          </div>
        </div>
        {/* Handy-Ansicht, unten angeschnitten */}
        <div className="relative mx-auto h-[300px] w-[240px] self-end md:h-[420px] md:w-[300px]">
          <div className="absolute inset-x-0 top-0 overflow-hidden rounded-t-[36px] border-[7px] border-b-0 border-[#160f33] bg-[#160f33] shadow-2xl md:top-12">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={image} alt="Lifevault auf dem Handy" className="block w-full rounded-t-[29px]" loading="lazy" />
          </div>
        </div>
      </div>
    </section>
  );
}

