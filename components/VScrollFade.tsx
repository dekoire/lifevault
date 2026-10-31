"use client";
import { useEffect, useRef, useState } from "react";

/**
 * Senkrecht scrollender Bereich mit weichem Verlauf oben/unten (wie bei Finastry): zeigt, dass dahinter noch etwas ist.
 * Nur sichtbar, wenn wirklich Inhalt verborgen ist; am Anfang bzw. Ende blendet der jeweilige Verlauf aus.
 * from: Hintergrundfarbe des Bereichs als Tailwind-Klasse (z. B. "from-page").
 */
export function VScrollFade({ className = "", outer = "", from = "from-page", children }: { className?: string; outer?: string; from?: string; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [edge, setEdge] = useState({ top: true, bottom: true });
  const check = () => {
    const el = ref.current;
    if (!el) return;
    setEdge({ top: el.scrollTop < 4, bottom: el.scrollTop + el.clientHeight >= el.scrollHeight - 4 });
  };
  useEffect(() => {
    check();
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(check);
    ro.observe(el);
    if (el.firstElementChild) ro.observe(el.firstElementChild);
    return () => ro.disconnect();
  }, []);
  const fade = `pointer-events-none absolute inset-x-0 z-10 h-10 ${from} to-transparent transition-opacity duration-200`;
  return (
    <div className={`relative min-h-0 flex-1 ${outer}`}>
      <div ref={ref} onScroll={check} className={`h-full overflow-y-auto overscroll-contain ${className}`}>
        <div>{children}</div>
      </div>
      <div aria-hidden className={`${fade} top-0 bg-gradient-to-b ${edge.top ? "opacity-0" : "opacity-100"}`} />
      <div aria-hidden className={`${fade} bottom-0 bg-gradient-to-t ${edge.bottom ? "opacity-0" : "opacity-100"}`} />
    </div>
  );
}
