"use client";
import { createPortal } from "react-dom";
import { useEffect, useRef, useState } from "react";
import { ArrowDown, ArrowDownWideNarrow, ArrowUp, ArrowUpDown, ArrowUpNarrowWide, Check, ChevronDown, Search, SlidersHorizontal, X, type LucideIcon } from "lucide-react";

export type Sort<K extends string> = { key: K; dir: "asc" | "desc" };
export type Col<K extends string> = { key: K; label: string; icon?: LucideIcon; className?: string; defaultDir?: "asc" | "desc" };

/** Nach Spalte sortieren: gleiche Spalte dreht die Richtung, neue Spalte startet mit ihrer Standardrichtung */
export function nextSort<K extends string>(s: Sort<K>, col: Col<K>): Sort<K> {
  return s.key === col.key ? { key: col.key, dir: s.dir === "asc" ? "desc" : "asc" } : { key: col.key, dir: col.defaultDir ?? "asc" };
}

/** Vergleich für Text (deutsch) und Zahlen, Richtung inklusive */
export function compare(a: string | number, b: string | number, dir: "asc" | "desc") {
  const r = typeof a === "number" && typeof b === "number" ? a - b : String(a).localeCompare(String(b), "de", { sensitivity: "base", numeric: true });
  return dir === "asc" ? r : -r;
}

/**
 * Kopfzeile einer Liste: Spalten anklicken zum Sortieren.
 * `grid` muss dieselben Spalten haben wie die Zeilen darunter (ab md). Am Handy sortiert man über das Sortier-Menü (SortMenu).
 */
export function SortHeader<K extends string>({ cols, sort, onSort, grid }: { cols: Col<K>[]; sort: Sort<K>; onSort: (s: Sort<K>) => void; grid: string }) {
  const Arrow = ({ k }: { k: K }) => sort.key !== k ? <ArrowUpDown size={13} className="text-muted/70" /> : sort.dir === "asc" ? <ArrowUp size={13} /> : <ArrowDown size={13} />;
  return (
    <>
      <div className={`hidden border-b border-line px-4 py-3.5 md:px-6 md:grid ${grid}`} role="row">
        {cols.map((c) => (
          <button key={c.key} type="button" role="columnheader" aria-sort={sort.key === c.key ? (sort.dir === "asc" ? "ascending" : "descending") : "none"} onClick={() => onSort(nextSort(sort, c))}
            className={`inline-flex min-w-0 items-center gap-1 text-left text-[12px] font-semibold ${sort.key === c.key ? "text-fg" : "text-muted hover:text-fg"} ${c.className ?? ""}`}>
            <span className="truncate">{c.label}</span> <Arrow k={c.key} />
          </button>
        ))}
      </div>
    </>
  );
}

/** Sortieren als Auswahlmenü mit Symbolen: Spalte wählen, Richtung umschalten */
export function SortMenu<K extends string>({ cols, sort, onSort }: { cols: Col<K>[]; sort: Sort<K>; onSort: (s: Sort<K>) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", close); window.addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousedown", close); window.removeEventListener("keydown", esc); };
  }, [open]);
  const cur = cols.find((c) => c.key === sort.key) ?? cols[0];
  const CurIcon = cur.icon ?? ArrowUpDown;
  const Dir = sort.dir === "asc" ? ArrowUp : ArrowDown;
  return (
    <div ref={ref} className="relative shrink-0">
      <button type="button" onClick={() => setOpen(!open)} aria-haspopup="listbox" aria-expanded={open} aria-label={`Sortieren nach ${cur.label}`}
        className="inline-flex h-11 items-center gap-2 rounded-full border border-card-line bg-surface px-3.5 text-[14px] font-semibold text-fg hover:bg-surface-2">
        <CurIcon size={16} /> <span className="hidden sm:inline">{cur.label}</span> <Dir size={14} className="text-soft" /> <ChevronDown size={14} className="text-muted" />
      </button>
      {open && (
        <div role="listbox" aria-label="Sortieren" className="sheet-up absolute right-0 z-40 mt-1.5 w-64 rounded-2xl border border-card-line bg-surface p-1.5 shadow-[0_12px_32px_rgba(16,24,40,.14)]">
          <div className="px-2.5 pt-1.5 pb-1 text-[12px] font-semibold text-muted">Sortieren nach</div>
          {cols.map((c) => {
            const Icon = c.icon ?? ArrowUpDown;
            const on = c.key === sort.key;
            return (
              <button key={c.key} type="button" role="option" aria-selected={on} onClick={() => { onSort(on ? sort : { key: c.key, dir: c.defaultDir ?? "asc" }); setOpen(false); }}
                className={`flex h-10 w-full items-center gap-2.5 rounded-xl px-2.5 text-left text-[14px] hover:bg-surface-2 ${on ? "font-semibold" : ""}`}>
                <Icon size={16} className="text-fg" /> <span className="flex-1">{c.label}</span> {on && <Check size={15} />}
              </button>
            );
          })}
          <div className="my-1 h-px bg-line" />
          <div className="grid grid-cols-2 gap-1 p-1">
            {([["asc", "Aufsteigend", ArrowUpNarrowWide], ["desc", "Absteigend", ArrowDownWideNarrow]] as const).map(([d, l, Icon]) => (
              <button key={d} type="button" onClick={() => onSort({ key: sort.key, dir: d })} aria-pressed={sort.dir === d}
                className={`inline-flex h-9 items-center justify-center gap-1.5 rounded-full text-[13px] font-semibold ${sort.dir === d ? "bg-fg text-canvas" : "text-soft hover:bg-surface-2"}`}><Icon size={15} /> {l}</button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/** Filter-Auswahl im Seitenpanel: Überschrift + Auswahlfeld (nativ, am Handy gut bedienbar) */
export type FilterOption = { value: string; label: string; icon?: React.ReactNode; n?: number; group?: string };

/** Runder Avatar mit Symbol: ohne Farbe schwarz/weiß, mit Farbe zart getönt */
export function IconAvatar({ icon: Icon, color, size = 30, text }: { icon?: LucideIcon; color?: string; size?: number; text?: string }) {
  return (
    <span className={`grid shrink-0 place-items-center rounded-full ${color ? "" : "bg-fg text-canvas"}`} style={{ width: size, height: size, ...(color ? { background: `${color}1f`, color } : {}) }}>
      {Icon ? <Icon size={Math.round(size * 0.5)} strokeWidth={2} /> : <b className="tnum text-[11px]">{text}</b>}
    </span>
  );
}

/**
 * Auswahlfeld im Filterpanel: zugeklappt die Wahl mit Avatar, aufgeklappt eine Liste mit Avatar je Option,
 * Anzahl rechts, Häkchen an der gewählten; ab 9 Optionen mit Suche, `group` setzt Zwischenüberschriften.
 */
export function FilterSelect({ label, value, onChange, options, empty = "Alle", icon = SlidersHorizontal }: { label: string; value: string; onChange: (v: string) => void; options: FilterOption[]; empty?: string; icon?: LucideIcon }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const cur = options.find((o) => o.value === value);
  const term = q.trim().toLowerCase();
  const list = options.filter((o) => !term || o.label.toLowerCase().includes(term));
  const pick = (v: string) => { onChange(v); setOpen(false); setQ(""); };
  const none = <IconAvatar icon={icon} />;
  const row = (sel: boolean) => `flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-left text-[14px] hover:bg-surface-2 ${sel ? "bg-surface-2 font-semibold" : ""}`;
  return (
    <div>
      <span className="mb-2 block text-[13px] font-semibold text-soft">{label}</span>
      <div className={`overflow-hidden rounded-2xl border ${value ? "border-fg" : "border-card-line"} bg-surface`}>
        <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} className="flex w-full items-center gap-3 px-3 py-2.5 text-left">
          {cur?.icon ?? none}
          <span className="min-w-0 flex-1 truncate text-[15px] font-semibold">{cur?.label ?? empty}</span>
          <ChevronDown size={17} className={`shrink-0 text-muted transition-transform ${open ? "rotate-180" : ""}`} />
        </button>
        {open && (
          <div className="border-t border-line p-1.5">
            {options.length > 8 && (
              <label className="mb-1 flex h-9 items-center gap-2 rounded-full bg-surface-2 px-3">
                <Search size={14} className="text-muted" />
                <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={`${label} suchen`} className="min-w-0 flex-1 bg-transparent text-[14px] outline-none placeholder:text-muted" />
              </label>
            )}
            <div className="max-h-72 overflow-y-auto">
              {!term && <button type="button" onClick={() => pick("")} className={row(!value)}>{none}<span className="flex-1">{empty}</span>{!value && <Check size={16} />}</button>}
              {list.map((o, i) => (
                <div key={o.value}>
                  {o.group && o.group !== list[i - 1]?.group && <p className="px-2.5 pt-2.5 pb-1 text-[12px] font-semibold text-muted">{o.group}</p>}
                  <button type="button" onClick={() => pick(o.value)} className={row(o.value === value)}>
                    {o.icon ?? none}
                    <span className="min-w-0 flex-1 truncate">{o.label}</span>
                    {o.n != null && <span className="tnum text-[12px] text-muted">{o.n}</span>}
                    {o.value === value && <Check size={16} />}
                  </button>
                </div>
              ))}
              {!list.length && <p className="px-3 py-2 text-[13px] text-muted">Nichts gefunden.</p>}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/** Filter An/Aus im Seitenpanel */
export function FilterToggle({ label, on, onChange }: { label: string; on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button type="button" role="switch" aria-checked={on} onClick={() => onChange(!on)} className="flex w-full items-center justify-between gap-3 py-1 text-left text-[15px] font-medium">
      {label}
      <span className={`relative h-6 w-10 shrink-0 rounded-full transition ${on ? "bg-fg" : "bg-surface-3 ring-1 ring-card-line"}`}><span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${on ? "left-[1.125rem]" : "left-0.5"}`} /></span>
    </button>
  );
}

/** Suchfeld + ein „Filter“-Knopf; die Filter öffnen sich als Seitenpanel von rechts */
export function FilterBar({ q, onQ, placeholder, children, actions, activeCount, onReset, count }: { q?: string; onQ?: (v: string) => void; placeholder?: string; children?: React.ReactNode; actions?: React.ReactNode; activeCount: number; onReset: () => void; count?: string }) {
  const [open, setOpen] = useState(false);
  // mobil: Suche als Lupe, aufgeklappt über die ganze Breite (Export/Filter weichen, bis ✕)
  const collapsible = !!onQ && !!(actions || children);
  const [searching, setSearching] = useState(!!q);
  const input = useRef<HTMLInputElement>(null);
  const close = () => { onQ?.(""); setSearching(false); };
  useEffect(() => {
    if (!open) return;
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [open]);
  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2">
        {collapsible && !searching && (
          <button type="button" onClick={() => { setSearching(true); setTimeout(() => input.current?.focus(), 0); }} aria-label="Suchen" className="grid h-11 w-11 shrink-0 place-items-center rounded-full border border-card-line bg-surface text-fg hover:bg-surface-2 sm:hidden"><Search size={18} /></button>
        )}
        {onQ && (
          <label className={`${collapsible && !searching ? "hidden sm:flex" : "flex"} search-open h-11 min-w-0 flex-1 items-center gap-2.5 rounded-full border border-card-line bg-surface px-4 focus-within:border-brand-500`}>
            <Search size={17} className="shrink-0 text-muted" />
            <input ref={input} value={q} onChange={(e) => onQ(e.target.value)} onKeyDown={(e) => e.key === "Escape" && close()} placeholder={placeholder} className="h-full min-w-0 flex-1 bg-transparent text-[15px] outline-none placeholder:text-muted" />
            {(q || collapsible) && <button type="button" onClick={close} aria-label="Suche schließen" className={`text-muted hover:text-fg ${q ? "" : "sm:hidden"}`}><X size={16} /></button>}
          </label>
        )}
        <div className={`${searching ? "hidden sm:flex" : "flex"} ml-auto shrink-0 items-center gap-2 sm:ml-0`}>
          {actions}
          {children && (
            <button type="button" onClick={() => setOpen(true)} aria-haspopup="dialog" className={`inline-flex h-11 shrink-0 items-center gap-2 rounded-full border px-4 text-[14px] font-semibold ${activeCount ? "border-fg bg-fg text-canvas" : "border-card-line bg-surface text-fg hover:bg-surface-2"}`}>
              <SlidersHorizontal size={16} /> Filter
              {activeCount > 0 && <span className="tnum grid h-5 min-w-5 place-items-center rounded-full bg-canvas px-1.5 text-[12px] font-bold text-fg">{activeCount}</span>}
            </button>
          )}
        </div>
      </div>
      {count && <p className="text-right text-[13px] text-muted">{count}{activeCount > 0 && <> · <button type="button" onClick={onReset} className="font-semibold text-selected">Filter zurücksetzen</button></>}</p>}
      {/* ins body: sonst schneidet ein Elternteil mit transform/Animation das Panel ab */}
      {open && createPortal(
        <div className="fixed inset-0 z-50 bg-surface sm:bg-black/30" onClick={() => setOpen(false)}>
          <aside role="dialog" aria-label="Filter" onClick={(e) => e.stopPropagation()} className="panel-in pt-safe absolute inset-y-0 right-0 flex h-dvh w-full flex-col bg-surface sm:max-w-sm sm:shadow-[-12px_0_32px_rgba(16,24,40,.12)]">
            <div className="flex items-center justify-between border-b border-line px-5 py-4">
              <span className="flex items-center gap-2 text-[17px] font-semibold"><SlidersHorizontal size={18} /> Filter</span>
              <button type="button" onClick={() => setOpen(false)} aria-label="Schließen" className="grid h-9 w-9 place-items-center rounded-full bg-surface-3"><X size={17} /></button>
            </div>
            <div className="flex-1 space-y-5 overflow-y-auto px-5 py-5">{children}</div>
            <div className="flex items-center gap-2 border-t border-line px-5 pt-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
              <button type="button" onClick={onReset} disabled={!activeCount} className="h-11 rounded-full px-4 text-[14px] font-semibold text-soft hover:bg-surface-2 disabled:opacity-40">Zurücksetzen</button>
              <button type="button" onClick={() => setOpen(false)} className="ml-auto h-11 rounded-full bg-fg px-5 text-[14px] font-semibold text-canvas">Anzeigen</button>
            </div>
          </aside>
        </div>,
        document.body,
      )}
    </div>
  );
}
