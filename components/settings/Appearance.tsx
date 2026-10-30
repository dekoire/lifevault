"use client";
import { useEffect, useState } from "react";
import { Check, Monitor, Moon, Sun } from "lucide-react";
import { CARD } from "@/components/ui";

/** Design: Hell, Dunkel oder wie das Gerät – gilt sofort und bleibt auf diesem Gerät gespeichert */
const KEY = "lifevault:theme";
type Theme = "light" | "dark" | "system";
const OPTIONS: { id: Theme; title: string; icon: typeof Sun; preview: { bg: string; card: string; line: string; text: string } }[] = [
  { id: "light", title: "Hell", icon: Sun, preview: { bg: "#f7f7f8", card: "#ffffff", line: "#e6e8ec", text: "#111111" } },
  { id: "dark", title: "Dunkel", icon: Moon, preview: { bg: "#0b0b0e", card: "#17171c", line: "#2a2a32", text: "#f4f4f6" } },
  { id: "system", title: "Wie das Gerät", icon: Monitor, preview: { bg: "linear-gradient(90deg,#f7f7f8 50%,#0b0b0e 50%)", card: "linear-gradient(90deg,#ffffff 50%,#17171c 50%)", line: "#8a8a94", text: "#777" } },
];

export function applyTheme(t: Theme) {
  const dark = t === "dark" || (t === "system" && matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.dataset.theme = dark ? "dark" : "light";
}

export function AppearanceSettings() {
  const [theme, setTheme] = useState<Theme>("light");
  useEffect(() => { try { const v = localStorage.getItem(KEY); setTheme(v === "dark" || v === "system" ? v : "light"); } catch { /* egal */ } }, []);
  const pick = (t: Theme) => { setTheme(t); applyTheme(t); try { localStorage.setItem(KEY, t); } catch { /* egal */ } };
  return (
    <section className={`${CARD} p-5`}>
      <h2 className="text-[16px] font-semibold">Design</h2>
      <p className="mt-0.5 text-[13px] text-muted">Gilt sofort und bleibt auf diesem Gerät gespeichert.</p>
      <div role="radiogroup" className="mt-4 grid gap-3 sm:grid-cols-3">
        {OPTIONS.map((o) => {
          const on = theme === o.id;
          return (
            <button key={o.id} type="button" role="radio" aria-checked={on} onClick={() => pick(o.id)} className={`overflow-hidden rounded-2xl border text-left ${on ? "border-fg ring-1 ring-fg" : "border-card-line hover:bg-surface-2"}`}>
              {/* kleine Vorschau: Seite mit Kachel */}
              <span className="block p-3" style={{ background: o.preview.bg }}>
                <span className="block rounded-lg border p-2.5" style={{ background: o.preview.card, borderColor: o.preview.line }}>
                  <span className="block h-2 w-16 rounded-full" style={{ background: o.preview.text, opacity: 0.8 }} />
                  <span className="mt-1.5 block h-2 w-10 rounded-full" style={{ background: o.preview.text, opacity: 0.35 }} />
                </span>
              </span>
              <span className="flex items-center gap-2.5 px-3.5 py-3">
                <o.icon size={16} className="shrink-0" />
                <b className="min-w-0 flex-1 text-[14px]">{o.title}</b>
                <span className={`grid h-5 w-5 shrink-0 place-items-center rounded-full ${on ? "bg-fg text-canvas" : "border border-card-line"}`}>{on && <Check size={12} />}</span>
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
