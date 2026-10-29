import Link from "next/link";
import { ChevronDown } from "lucide-react";

/** Karte wie bei Finastry: weiß, feiner Rahmen, kaum Schatten, moderater Radius */
export const CARD = "rounded-2xl border border-card-line bg-surface shadow-card";
/** Runder Knopf (Pill), grau */
export const PILL = "inline-flex h-10 items-center justify-center gap-2 rounded-full bg-surface-3 px-4 text-[14px] font-semibold text-fg transition hover:brightness-95 disabled:opacity-50";
/** Runder Symbol-Knopf */
export const ICON_BTN = "grid h-10 w-10 shrink-0 place-items-center rounded-full border border-card-line bg-surface text-soft transition hover:bg-surface-2 hover:text-fg";

/** Seitenkopf wie bei Finastry: große Überschrift, Untertitel, Aktionen rechts */
export function PageHeader({ title, subtitle, action, icon }: { title: React.ReactNode; subtitle?: React.ReactNode; action?: React.ReactNode; icon?: React.ReactNode }) {
  return (
    <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
      <div className="flex min-w-0 items-center gap-3.5">
        {icon}
        <div className="min-w-0">
          <h1 className="text-[28px] leading-9 font-[650] tracking-tight md:text-[32px] md:leading-10">{title}</h1>
          {subtitle && <p className="mt-1 text-[14px] text-muted">{subtitle}</p>}
        </div>
      </div>
      {action && <div className="flex shrink-0 flex-wrap items-center gap-2">{action}</div>}
    </div>
  );
}

/** Aufklappbarer Abschnitt in einer Karte */
export function Section({ title, icon, count, open, onToggle, children }: { title: string; icon?: React.ReactNode; count?: number; open: boolean; onToggle: () => void; children: React.ReactNode }) {
  return (
    <section className={CARD}>
      <button type="button" onClick={onToggle} aria-expanded={open} className="flex w-full items-center gap-2.5 px-4 py-3.5 text-left">
        {icon && <span className="text-muted">{icon}</span>}
        <span className="flex-1 text-[15px] font-semibold">{title}</span>
        {count !== undefined && <span className="tnum rounded-full border border-card-line px-2 py-0.5 text-[12px] font-semibold text-soft">{count}</span>}
        <ChevronDown size={18} className={`text-muted transition ${open ? "rotate-180" : ""}`} />
      </button>
      {open && <div className="border-t border-line">{children}</div>}
    </section>
  );
}

/** Zwei-Spalten-Tabelle (Bezeichnung | Wert) */
export function KeyValueTable({ rows }: { rows: { label: string; value: React.ReactNode }[] }) {
  return (
    <dl className="divide-y divide-line">
      {rows.map((r, i) => (
        <div key={i} className="grid grid-cols-[minmax(0,2fr)_minmax(0,3fr)] gap-3 px-4 py-2.5 text-[14px]">
          <dt className="text-muted">{r.label}</dt>
          <dd className="font-medium break-words">{r.value}</dd>
        </div>
      ))}
    </dl>
  );
}

/** Kachel-Menü wie bei Finastry (Einstellungen, Admin) */
export function TileMenu({ tiles }: { tiles: { href: string; title: string; text: string; icon: React.ReactNode }[] }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {tiles.map((t) => (
        <Link key={t.href} href={t.href} className="group flex items-center gap-4 rounded-2xl border border-card-line bg-surface px-5 py-5 transition hover:bg-surface-2">
          <span className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-fg text-canvas">{t.icon}</span>
          <span className="min-w-0 flex-1"><span className="block font-semibold">{t.title}</span><span className="block text-sm text-muted">{t.text}</span></span>
          <span className="shrink-0 text-muted transition group-hover:translate-x-0.5">›</span>
        </Link>
      ))}
    </div>
  );
}

/** Schalter */
export function Switch({ on, onChange, label, disabled }: { on: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean }) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={label} disabled={disabled} onClick={() => onChange(!on)} className={`relative h-7 w-12 shrink-0 rounded-full transition disabled:opacity-50 ${on ? "bg-brand-500" : "bg-surface-3 ring-1 ring-card-line"}`}>
      <span className={`absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition-all ${on ? "left-[22px]" : "left-0.5"}`} />
    </button>
  );
}

export function BackLink({ href, label }: { href: string; label: string }) {
  return <Link href={href} className="mb-4 inline-flex h-10 items-center gap-2 rounded-full border border-card-line bg-surface pr-5 pl-4 text-sm font-semibold text-fg hover:bg-surface-2">‹ {label}</Link>;
}
