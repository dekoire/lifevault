"use client";
import { useEffect, useState } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronDown, Search, SlidersHorizontal, X } from "lucide-react";

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

/** Filter-Auswahl im Seitenpanel: Überschrift + Auswahlfeld (nativ, am Handy gut bedienbar) */
export function FilterSelect({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: { value: string; label: string }[] }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[13px] font-semibold text-soft">{label}</span>
      <span className="relative block">
        <select value={value} onChange={(e) => onChange(e.target.value)} className={`h-11 w-full appearance-none rounded-xl border bg-surface pr-9 pl-3.5 text-[14.5px] ${value ? "border-fg font-semibold" : "border-card-line"}`}>
          <option value="">Alle</option>
          {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <ChevronDown size={16} className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-muted" />
      </span>
    </label>
  );
}

/** Filter An/Aus im Seitenpanel */
export function FilterToggle({ label, on, onChange }: { label: string; on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button type="button" role="switch" aria-checked={on} onClick={() => onChange(!on)} className="flex w-full items-center justify-between gap-3 py-1 text-left text-[14.5px] font-medium">
      {label}
      <span className={`relative h-6 w-10 shrink-0 rounded-full transition ${on ? "bg-fg" : "bg-surface-3 ring-1 ring-card-line"}`}><span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${on ? "left-[1.125rem]" : "left-0.5"}`} /></span>
    </button>
  );
}

/** Suchfeld + ein „Filter“-Knopf; die Filter öffnen sich als Seitenpanel von rechts */
export function FilterBar({ q, onQ, placeholder, children, activeCount, onReset, count }: { q?: string; onQ?: (v: string) => void; placeholder?: string; children?: React.ReactNode; activeCount: number; onReset: () => void; count?: string }) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [open]);
  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2">
        {onQ && (
          <label className="flex h-11 min-w-0 flex-1 items-center gap-2.5 rounded-full border border-card-line bg-surface px-4 focus-within:border-brand-500">
            <Search size={17} className="shrink-0 text-muted" />
            <input value={q} onChange={(e) => onQ(e.target.value)} placeholder={placeholder} className="h-full min-w-0 flex-1 bg-transparent text-[15px] outline-none placeholder:text-muted" />
            {q && <button type="button" onClick={() => onQ("")} aria-label="Suche leeren" className="text-muted hover:text-fg"><X size={16} /></button>}
          </label>
        )}
        {children && (
          <button type="button" onClick={() => setOpen(true)} aria-haspopup="dialog" className={`inline-flex h-11 shrink-0 items-center gap-2 rounded-full border px-4 text-[14px] font-semibold ${activeCount ? "border-fg bg-fg text-canvas" : "border-card-line bg-surface text-fg hover:bg-surface-2"} ${onQ ? "" : "ml-auto"}`}>
            <SlidersHorizontal size={16} /> Filter
            {activeCount > 0 && <span className="tnum grid h-5 min-w-5 place-items-center rounded-full bg-canvas px-1.5 text-[11.5px] font-bold text-fg">{activeCount}</span>}
          </button>
        )}
      </div>
      {count && <p className="text-right text-[12.5px] text-muted">{count}{activeCount > 0 && <> · <button type="button" onClick={onReset} className="font-semibold text-selected">Filter zurücksetzen</button></>}</p>}
      {open && (
        <div className="fixed inset-0 z-50 bg-black/30" onClick={() => setOpen(false)}>
          <aside role="dialog" aria-label="Filter" onClick={(e) => e.stopPropagation()} className="panel-in pt-safe absolute inset-y-0 right-0 flex w-full max-w-sm flex-col bg-surface shadow-[-12px_0_32px_rgba(16,24,40,.12)]">
            <div className="flex items-center justify-between border-b border-line px-5 py-4">
              <span className="flex items-center gap-2 text-[17px] font-semibold"><SlidersHorizontal size={18} /> Filter</span>
              <button type="button" onClick={() => setOpen(false)} aria-label="Schließen" className="grid h-9 w-9 place-items-center rounded-full bg-surface-3"><X size={17} /></button>
            </div>
            <div className="flex-1 space-y-5 overflow-y-auto px-5 py-5">{children}</div>
            <div className="pb-safe flex items-center gap-2 border-t border-line px-5 py-4">
              <button type="button" onClick={onReset} disabled={!activeCount} className="h-11 rounded-full px-4 text-[14px] font-semibold text-soft hover:bg-surface-2 disabled:opacity-40">Zurücksetzen</button>
              <button type="button" onClick={() => setOpen(false)} className="ml-auto h-11 rounded-full bg-fg px-5 text-[14px] font-semibold text-canvas">{count ? `${count} anzeigen` : "Anzeigen"}</button>
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}
