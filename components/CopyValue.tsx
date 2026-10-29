"use client";
import { useState } from "react";
import { Check, Copy } from "lucide-react";

/** Wert mit Kopieren-Knopf (für Kundennummern, IBAN usw.) */
export function CopyValue({ value }: { value: string }) {
  const [done, setDone] = useState(false);
  return (
    <span className="inline-flex max-w-full items-center gap-1.5">
      <span className="tnum min-w-0 font-semibold break-all">{value}</span>
      <button type="button" onClick={(e) => { e.preventDefault(); void navigator.clipboard.writeText(value); setDone(true); setTimeout(() => setDone(false), 1500); }} aria-label={`${value} kopieren`} title="Kopieren" className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-muted hover:bg-surface-3 hover:text-fg">
        {done ? <Check size={14} className="text-positive-text" /> : <Copy size={14} />}
      </button>
    </span>
  );
}
