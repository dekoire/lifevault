"use client";
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronDown, Search, X } from "lucide-react";

export type Sort<K extends string> = { key: K; dir: "asc" | "desc" };
export type Col<K extends string> = { key: K; label: string; className?: string; defaultDir?: "asc" | "desc" };

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
 * `grid` muss dieselben Spalten haben wie die Zeilen darunter (ab md). Am Handy: eine kompakte Sortier-Zeile.
 */
export function SortHeader<K extends string>({ cols, sort, onSort, grid }: { cols: Col<K>[]; sort: Sort<K>; onSort: (s: Sort<K>) => void; grid: string }) {
  const Arrow = ({ k }: { k: K }) => sort.key !== k ? <ArrowUpDown size={13} className="text-muted/70" /> : sort.dir === "asc" ? <ArrowUp size={13} /> : <ArrowDown size={13} />;
  return (
    <>
      <div className={`hidden border-b border-line bg-surface-2/60 px-4 py-2 md:grid ${grid}`} role="row">
        {cols.map((c) => (
          <button key={c.key} type="button" role="columnheader" aria-sort={sort.key === c.key ? (sort.dir === "asc" ? "ascending" : "descending") : "none"} onClick={() => onSort(nextSort(sort, c))}
            className={`inline-flex min-w-0 items-center gap-1 text-left text-[12px] font-semibold tracking-wide uppercase ${sort.key === c.key ? "text-fg" : "text-muted hover:text-fg"} ${c.className ?? ""}`}>
            <span className="truncate">{c.label}</span> <Arrow k={c.key} />
          </button>
        ))}
      </div>
      <div className="no-scrollbar flex items-center gap-1.5 overflow-x-auto border-b border-line px-3 py-2 md:hidden">
        <span className="shrink-0 text-[12px] font-semibold text-muted">Sortieren:</span>
        {cols.map((c) => (
          <button key={c.key} type="button" onClick={() => onSort(nextSort(sort, c))} aria-pressed={sort.key === c.key}
            className={`inline-flex h-8 shrink-0 items-center gap-1 rounded-full px-3 text-[12.5px] font-semibold ${sort.key === c.key ? "bg-fg text-canvas" : "border border-card-line text-soft"}`}>
            {c.label} {sort.key === c.key && (sort.dir === "asc" ? <ArrowUp size={12} /> : <ArrowDown size={12} />)}
          </button>
        ))}
      </div>
    </>
  );
}

/** Filter als Auswahl-Pill (nativ, dadurch am Handy gut bedienbar) */
export function FilterSelect({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: { value: string; label: string }[] }) {
  const active = value !== "";
  return (
    <label data-btn className={`relative inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border pr-8 pl-3.5 text-[13px] font-semibold ${active ? "border-fg bg-fg text-canvas" : "border-card-line bg-surface text-soft hover:text-fg"}`}>
      <span className="pointer-events-none whitespace-nowrap">{label}{active ? `: ${options.find((o) => o.value === value)?.label ?? value}` : ""}</span>
      <ChevronDown size={14} className="pointer-events-none absolute right-3" />
      <select value={value} onChange={(e) => onChange(e.target.value)} aria-label={label} className="absolute inset-0 cursor-pointer opacity-0">
        <option value="">Alle</option>
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </label>
  );
}

/** Filter als An/Aus-Pill */
export function FilterToggle({ label, on, onChange }: { label: string; on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button type="button" aria-pressed={on} onClick={() => onChange(!on)}
      className={`inline-flex h-9 shrink-0 items-center rounded-full border px-3.5 text-[13px] font-semibold ${on ? "border-fg bg-fg text-canvas" : "border-card-line bg-surface text-soft hover:text-fg"}`}>{label}</button>
  );
}

/** Suchfeld + Filter-Pills über einer Liste; „Zurücksetzen“, sobald etwas gefiltert ist */
export function FilterBar({ q, onQ, placeholder, children, active, onReset, count }: { q?: string; onQ?: (v: string) => void; placeholder?: string; children?: React.ReactNode; active: boolean; onReset: () => void; count?: string }) {
  return (
    <div className="space-y-2.5">
      {onQ && (
        <label className="flex h-11 items-center gap-2.5 rounded-full border border-card-line bg-surface px-4 focus-within:border-brand-500">
          <Search size={17} className="text-muted" />
          <input value={q} onChange={(e) => onQ(e.target.value)} placeholder={placeholder} className="h-full min-w-0 flex-1 bg-transparent text-[15px] outline-none placeholder:text-muted" />
          {q && <button type="button" onClick={() => onQ("")} aria-label="Suche leeren" className="text-muted hover:text-fg"><X size={16} /></button>}
        </label>
      )}
      <div className="flex flex-wrap items-center gap-2">
        {children}
        {active && <button type="button" onClick={onReset} className="inline-flex h-9 items-center gap-1 rounded-full px-2.5 text-[13px] font-semibold text-selected"><X size={14} /> Zurücksetzen</button>}
        {count && <span className="ml-auto text-[13px] text-muted">{count}</span>}
      </div>
    </div>
  );
}
