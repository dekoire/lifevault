"use client";
import { useEffect, useState } from "react";
import { Check } from "lucide-react";
import { CARD } from "@/components/ui";

/** Farbe der App: Lila (Standard) oder Schwarz-Weiß – gilt sofort und bleibt auf diesem Gerät gespeichert */
const KEY = "lifevault:accent";
type Accent = "lila" | "mono";
const OPTIONS: { id: Accent; title: string; text: string; grad: string; dot: string }[] = [
  { id: "lila", title: "Lila", text: "Standard – Knöpfe, Links und Kennzahlen in Lila", grad: "linear-gradient(120deg,#5530c9 0%,#6438da 55%,#7650e6 100%)", dot: "#6d4aff" },
  { id: "mono", title: "Schwarz-Weiß", text: "Ruhig und neutral – alles in Schwarz, Weiß und Grau", grad: "linear-gradient(120deg,#18181b 0%,#2e2e33 55%,#44444a 100%)", dot: "#18181b" },
];

export function applyAccent(a: Accent) {
  if (a === "mono") document.documentElement.dataset.accent = "mono";
  else delete document.documentElement.dataset.accent;
}

export function AppearanceSettings() {
  const [accent, setAccent] = useState<Accent>("lila");
  useEffect(() => { try { setAccent(localStorage.getItem(KEY) === "mono" ? "mono" : "lila"); } catch { /* egal */ } }, []);
  const pick = (a: Accent) => { setAccent(a); applyAccent(a); try { localStorage.setItem(KEY, a); } catch { /* egal */ } };
  return (
    <section className={`${CARD} p-5`}>
      <h2 className="text-[16px] font-semibold">Farbe</h2>
      <p className="mt-0.5 text-[13px] text-muted">Gilt sofort und bleibt auf diesem Gerät gespeichert.</p>
      <div role="radiogroup" className="mt-4 grid gap-3 sm:grid-cols-2">
        {OPTIONS.map((o) => {
          const on = accent === o.id;
          return (
            <button key={o.id} type="button" role="radio" aria-checked={on} onClick={() => pick(o.id)} className={`overflow-hidden rounded-2xl border text-left ${on ? "border-fg ring-1 ring-fg" : "border-card-line hover:bg-surface-2"}`}>
              {/* kleine Vorschau: Kennzahl-Kachel und Knopf */}
              <span className="block p-3" style={{ background: o.grad }}>
                <span className="block text-[11px] text-white/70">Dokumente</span>
                <b className="block text-[20px] leading-6 text-white">128</b>
              </span>
              <span className="flex items-center gap-3 p-3.5">
                <span className="min-w-0 flex-1"><b className="block text-[14px]">{o.title}</b><span className="block text-[12px] text-muted">{o.text}</span></span>
                <span className={`grid h-6 w-6 shrink-0 place-items-center rounded-full ${on ? "text-white" : "border border-card-line"}`} style={on ? { background: o.dot } : undefined}>{on && <Check size={14} />}</span>
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
