import Link from "next/link";
import { ArrowRight, Check } from "lucide-react";

/**
 * Bausteine der Startseite – 1:1 wie bei Finastry (apps/web/components/landing/Stage.tsx), nur in Lila:
 * Abschnittskopf, Geräte-Rahmen für Ansichten der App (public/landing, 2× gerendert, erfundene Beispieldaten)
 * und Bühnen-Flächen, auf denen die Bilder liegen.
 * Bewegung nur über CSS (globals.css: .lp-rise, .lp-reveal, .lp-float) und nie bei „Bewegung reduzieren“.
 */

/** Kleine Überzeile als Pille mit Punkt – einheitlich in allen Abschnitten */
export function Kicker({ children, tone = "brand", className = "" }: { children: React.ReactNode; tone?: "brand" | "teal" | "light"; className?: string }) {
  const t = tone === "teal" ? "bg-positive/10 text-positive-text" : tone === "light" ? "bg-white/10 text-white ring-1 ring-white/15" : "bg-lavender text-selected";
  const dot = tone === "teal" ? "bg-positive" : tone === "light" ? "bg-white" : "bg-brand-500";
  return (
    <span className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-[13px] font-semibold ${t} ${className}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${dot}`} /> {children}
    </span>
  );
}

/** Abschnittskopf: Pille, große Überschrift, kurzer Text – zentriert oder linksbündig */
export function Head({ kicker, title, text, tone, align = "center" }: { kicker: string; title: React.ReactNode; text?: string; tone?: "brand" | "teal"; align?: "center" | "left" }) {
  return (
    <div className={align === "center" ? "mx-auto max-w-2xl text-center" : "max-w-xl"}>
      <Kicker tone={tone}>{kicker}</Kicker>
      <h2 className="mt-4 text-[32px] leading-[38px] font-[680] tracking-[-0.025em] text-balance md:text-[46px] md:leading-[52px]">{title}</h2>
      {text && <p className="mt-4 text-[17px] leading-7 text-pretty text-soft">{text}</p>}
    </div>
  );
}

const SHADOW = "shadow-[0_1px_2px_rgba(16,24,40,.05),0_28px_64px_-20px_rgba(16,24,40,.28)]";

/** Browserfenster mit echtem Desktop-Screenshot (1440 × 900 CSS-Pixel) */
export function BrowserShot({ src, alt, url = "lifevault.app", className = "", eager = false }: { src: string; alt: string; url?: string; className?: string; eager?: boolean }) {
  return (
    <figure className={`overflow-hidden rounded-[18px] border border-black/[.07] bg-surface ${SHADOW} dark:border-white/10 ${className}`}>
      <div className="flex h-7 items-center gap-1.5 border-b border-line bg-surface-2 px-3 md:h-9 md:px-4">
        <span className="h-2 w-2 rounded-full bg-[#ff5f57] md:h-2.5 md:w-2.5" />
        <span className="h-2 w-2 rounded-full bg-[#febc2e] md:h-2.5 md:w-2.5" />
        <span className="h-2 w-2 rounded-full bg-[#28c840] md:h-2.5 md:w-2.5" />
        <span className="mx-auto hidden rounded-md bg-surface px-10 py-0.5 text-[11px] text-muted sm:block">{url}</span>
        <span className="hidden w-[42px] sm:block" />
      </div>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt={alt} width={1440} height={900} loading={eager ? "eager" : "lazy"} fetchPriority={eager ? "high" : undefined} decoding="async" className="block aspect-[16/10] w-full object-cover object-top" />
    </figure>
  );
}

/** iPhone-Rahmen mit echtem Handy-Screenshot (390 × 844 CSS-Pixel), Statusleiste darüber */
export function PhoneShot({ src, alt, className = "", eager = false }: { src: string; alt: string; className?: string; eager?: boolean }) {
  return (
    <figure className={`rounded-[15%/7%] bg-[#0f1115] p-[2.4%] ${SHADOW} ring-1 ring-black/10 ${className}`}>
      <div className="relative overflow-hidden rounded-[13%/6%] bg-page">
        <div className="relative flex aspect-[390/46] items-center justify-between bg-page px-[11%] text-[clamp(6px,0.85vw,11px)] font-semibold text-fg">
          <span>9:41</span>
          <span aria-hidden className="absolute top-[58%] left-1/2 h-[62%] w-[30%] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#0f1115]" />
          <span aria-hidden className="h-[0.6em] w-[1.7em] rounded-[3px] border border-current p-px"><span className="block h-full w-3/4 rounded-[1px] bg-current" /></span>
        </div>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt={alt} width={390} height={844} loading={eager ? "eager" : "lazy"} decoding="async" className="block aspect-[390/780] w-full object-cover object-top" />
      </div>
    </figure>
  );
}

/** Getönte Bühne hinter Screenshots: weicher Verlauf und feines Punktraster, das zum Rand ausläuft */
export function StageBackdrop({ tone = "brand", className = "" }: { tone?: "brand" | "teal" | "indigo"; className?: string }) {
  const c = tone === "teal" ? "rgba(31,150,136,.16)" : tone === "indigo" ? "rgba(74,47,196,.16)" : "rgba(109,74,255,.16)";
  return (
    <div aria-hidden className={`pointer-events-none absolute inset-0 overflow-hidden ${className}`}>
      <div className="absolute inset-0" style={{ background: `radial-gradient(60% 70% at 50% 0%, ${c}, transparent 70%)` }} />
      <div className="absolute inset-0 opacity-60 [mask-image:radial-gradient(70%_60%_at_50%_30%,#000,transparent)] dark:opacity-25" style={{ backgroundImage: "radial-gradient(rgba(16,24,40,.13) 1px, transparent 1px)", backgroundSize: "22px 22px" }} />
    </div>
  );
}

/** Schwebende Info-Karte neben den Geräten (nur ab Tablet) */
export function FloatCard({ children, className = "", delay = 0 }: { children: React.ReactNode; className?: string; delay?: number }) {
  return (
    <div className={`lp-float absolute z-10 hidden rounded-2xl border border-black/[.06] bg-surface/95 p-3 pr-4 shadow-[0_18px_44px_-14px_rgba(16,24,40,.30)] backdrop-blur md:flex dark:border-white/10 ${className}`} style={{ animationDelay: `${delay}s` }}>
      {children}
    </div>
  );
}

/** Desktop und Handy zusammen: Handy überlappt unten rechts. Mobil nur das Handy (der Desktop wäre zu klein). */
export function DevicePair({ desktop, phone, altDesktop, altPhone, eager = false, url }: { desktop: string; phone: string; altDesktop: string; altPhone: string; eager?: boolean; url?: string }) {
  return (
    <>
      <div className="relative hidden pb-[7%] sm:block">
        <BrowserShot src={desktop} alt={altDesktop} eager={eager} url={url} className="w-[86%]" />
        <PhoneShot src={phone} alt={altPhone} eager={eager} className="absolute right-0 bottom-0 w-[24%]" />
      </div>
      <PhoneShot src={phone} alt={altPhone} eager={eager} className="mx-auto w-[72%] max-w-[300px] sm:hidden" />
    </>
  );
}

/** Funktion im Fokus: Text auf der einen, Bühne mit Geräten auf der anderen Seite (abwechselnd). */
export function Spotlight({ id, kicker, tone = "brand", title, text, points, href, linkLabel = "Mehr dazu", desktop, phone, altDesktop, altPhone, flip = false, url }: {
  id: string; kicker: string; tone?: "brand" | "teal" | "indigo"; title: string; text: string; points: string[]; href: string; linkLabel?: string;
  desktop: string; phone: string; altDesktop: string; altPhone: string; flip?: boolean; url?: string;
}) {
  const ink = tone === "teal" ? "text-positive-text" : tone === "indigo" ? "text-brand-700" : "text-selected";
  const soft = tone === "teal" ? "bg-positive/10" : tone === "indigo" ? "bg-brand-700/10" : "bg-lavender";
  return (
    <div id={id} className={`lp-reveal grid scroll-mt-24 grid-cols-1 items-center gap-10 lg:gap-16 ${flip ? "lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]" : "lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]"}`}>
      <div className={`min-w-0 ${flip ? "lg:order-2" : ""}`}>
        <Kicker tone={tone === "teal" ? "teal" : "brand"}>{kicker}</Kicker>
        <h3 className="mt-4 text-[28px] leading-[34px] font-[680] tracking-[-0.02em] text-balance md:text-[36px] md:leading-[42px]">{title}</h3>
        <p className="mt-4 text-[17px] leading-7 text-soft">{text}</p>
        <ul className="mt-6 space-y-3">
          {points.map((p) => (
            <li key={p} className="flex items-start gap-3 text-[15px] leading-6">
              <span className={`mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full ${soft} ${ink}`}><Check size={12} strokeWidth={3} /></span> {p}
            </li>
          ))}
        </ul>
        <Link href={href} className={`group mt-7 inline-flex items-center gap-1.5 text-[15px] font-semibold ${ink}`}>
          {linkLabel} <ArrowRight size={16} className="transition group-hover:translate-x-0.5" />
        </Link>
      </div>
      <div className={`relative min-w-0 overflow-hidden rounded-[28px] border border-card-line bg-surface-2 px-5 pt-8 pb-6 sm:px-8 sm:pt-10 md:px-10 ${flip ? "lg:order-1" : ""}`}>
        <StageBackdrop tone={tone} />
        <div className="relative"><DevicePair desktop={desktop} phone={phone} altDesktop={altDesktop} altPhone={altPhone} url={url} /></div>
      </div>
    </div>
  );
}
