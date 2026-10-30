"use client";
import { useState } from "react";
import { Check, ChevronDown, Copy, type LucideIcon } from "lucide-react";
import { IconTile } from "@/components/ClusterIcon";
import { CARD } from "@/components/ui";

/**
 * Einheitliche Kachel für Detailseiten: Symbol-Kachel, Überschrift (18 px), optional Anzahl und Unterzeile,
 * aufklappbar. Gesteuert (open/onToggle) oder selbst gemerkt (defaultOpen).
 */
export function Panel({ title, icon, color, count, sub, aside, open: given, onToggle, defaultOpen = true, children }: {
  title: React.ReactNode; icon: LucideIcon; color?: string; count?: number; sub?: React.ReactNode; aside?: React.ReactNode;
  open?: boolean; onToggle?: () => void; defaultOpen?: boolean; children: React.ReactNode;
}) {
  const [own, setOwn] = useState(defaultOpen);
  const open = given ?? own;
  const toggle = onToggle ?? (() => setOwn(!own));
  return (
    <section className={`${CARD} overflow-hidden`}>
      <div className="flex items-center gap-3 px-5 py-4">
        <button type="button" onClick={toggle} aria-expanded={open} className="flex min-w-0 flex-1 items-center gap-3 text-left">
          <IconTile icon={icon} color={color} size={36} />
          <span className="min-w-0 flex-1">
            <span className="flex items-center gap-2 text-[18px] leading-[26px] font-semibold">
              <span className="truncate">{title}</span>
              {count !== undefined && <span className="tnum shrink-0 rounded-full border border-card-line px-3 py-1 text-[12px] leading-4 font-semibold text-soft">{count}</span>}
            </span>
            {sub && <span className="block truncate text-[13px] text-muted">{sub}</span>}
          </span>
        </button>
        {aside}
        <button type="button" onClick={toggle} aria-label={open ? "Zuklappen" : "Aufklappen"} className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-muted hover:bg-surface-2">
          <ChevronDown size={18} className={`transition-transform ${open ? "rotate-180" : ""}`} />
        </button>
      </div>
      {open && <div className="border-t border-line">{children}</div>}
    </section>
  );
}

/** Kopieren-Knopf: zeigt kurz einen Haken */
export function CopyButton({ value, className = "" }: { value: string; className?: string }) {
  const [ok, setOk] = useState(false);
  return (
    <button type="button" onClick={(e) => { e.preventDefault(); e.stopPropagation(); void navigator.clipboard?.writeText(value); setOk(true); setTimeout(() => setOk(false), 1200); }} aria-label="Kopieren" title="Kopieren"
      className={`grid h-8 w-8 shrink-0 place-items-center rounded-full text-muted transition hover:bg-surface-2 hover:text-fg ${ok ? "text-positive-text" : ""} ${className}`}>
      {ok ? <Check size={14} strokeWidth={3} /> : <Copy size={14} />}
    </button>
  );
}

/** Zeilen „Bezeichnung – Wert“ ohne Trennlinien, jede mit Kopieren (wenn der Wert Text ist) */
export function InfoRows({ rows }: { rows: { label: string; value: React.ReactNode; copy?: string | false }[] }) {
  return (
    <dl className="px-2 py-2">
      {rows.map((r, i) => {
        const copy = r.copy === false ? undefined : r.copy ?? (typeof r.value === "string" || typeof r.value === "number" ? String(r.value) : undefined);
        return (
          <div key={i} className="flex items-center gap-3 rounded-xl px-3 py-2.5 hover:bg-canvas">
            <dt className="w-[38%] shrink-0 text-[13px] text-muted">{r.label}</dt>
            <dd className="min-w-0 flex-1 text-[14px] font-medium break-words">{r.value}</dd>
            {copy && copy !== "–" ? <CopyButton value={copy} /> : <span className="w-8 shrink-0" />}
          </div>
        );
      })}
    </dl>
  );
}

/** Angaben als kleine Kacheln (statt Tabelle mit Strichen), jede mit Kopieren */
export function InfoTiles({ items }: { items: { label: string; value: string }[] }) {
  return (
    <div className="grid gap-2 p-4 sm:grid-cols-2">
      {items.map((f, i) => (
        <div key={i} className="flex min-w-0 items-start gap-2 rounded-xl bg-canvas px-3.5 py-3">
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[12px] text-muted" title={f.label}>{f.label}</span>
            <span className="block text-[14px] font-semibold break-words">{f.value}</span>
          </span>
          <CopyButton value={f.value} className="-mt-1 -mr-1.5" />
        </div>
      ))}
    </div>
  );
}
