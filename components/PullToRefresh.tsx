"use client";
import { useEffect, useRef, useState } from "react";

/**
 * Ganz oben nach unten ziehen lädt neu: ein Kreis in der App-Farbe kommt herunter, sein Ring füllt sich beim Ziehen,
 * ab der Schwelle dreht er sich, bis das Neuladen fertig ist – ohne Pfeil. Auf jeder Seite; nicht in Fenstern oder
 * scrollbaren Listen. Am Handy per Touch, am Desktop per Trackpad (ganz oben weiter nach oben wischen).
 * `activity`: läuft im Hintergrund etwas (Dokumente auslesen), steht derselbe Kreis oben und
 * dreht sich, in der Mitte wie viele noch offen sind (ab 100 kleiner, über 999 „999+“). Gleiche Komponente in Finastry.
 */
const THRESHOLD = 72;
export function PullToRefresh({ color, onRefresh = () => window.location.reload(), activity = 0, activityLabel, onActivity }: { color: string; onRefresh?: () => void | Promise<void>; activity?: number; activityLabel?: string; onActivity?: () => void }) {
  const [pull, setPull] = useState(0);
  const [busy, setBusy] = useState(false);
  const start = useRef<number | null>(null);
  const cur = useRef(0);
  useEffect(() => {
    const scrolledParent = (el: EventTarget | null) => {
      for (let n = el as HTMLElement | null; n && n !== document.body; n = n.parentElement) if (n.scrollTop > 0) return true;
      return false;
    };
    const set = (p: number) => { cur.current = p; setPull(p); };
    const down = (e: TouchEvent) => {
      start.current = !busy && window.scrollY <= 0 && e.touches.length === 1 && document.body.style.overflow !== "hidden" && !scrolledParent(e.target) ? e.touches[0].clientY : null;
    };
    const move = (e: TouchEvent) => {
      if (start.current === null) return;
      const dy = e.touches[0].clientY - start.current;
      if (dy <= 0 || window.scrollY > 0) { set(0); return; }
      set(Math.min(130, dy * 0.45));
    };
    const release = () => {
      if (cur.current >= THRESHOLD) {
        setBusy(true); set(THRESHOLD);
        if (navigator.vibrate) navigator.vibrate(10);
        void Promise.resolve(onRefresh()).finally(() => setTimeout(() => { setBusy(false); set(0); }, 600));
      } else set(0);
    };
    const up = () => {
      if (start.current === null) return;
      start.current = null;
      release();
    };
    // Desktop: Trackpad/Mausrad ganz oben weiter nach oben. Zählt nur, wenn die Geste oben beginnt –
    // der Schwung vom Hochscrollen löst nichts aus; Strg + Rad (Zoomen) wird ignoriert
    let gesture = false, last = 0, idle: number | undefined;
    const wheel = (e: WheelEvent) => {
      if (busy || e.ctrlKey) return;
      const now = performance.now();
      if (now - last > 300) gesture = window.scrollY <= 0 && document.body.style.overflow !== "hidden" && !scrolledParent(e.target);
      last = now;
      if (!gesture) return;
      if (e.deltaY >= 0 || window.scrollY > 0) { gesture = false; set(0); return; }
      set(Math.min(130, cur.current - e.deltaY * (e.deltaMode === 1 ? 12 : 0.35)));
      clearTimeout(idle);
      idle = window.setTimeout(() => { gesture = false; release(); }, 200);
    };
    window.addEventListener("wheel", wheel, { passive: true });
    window.addEventListener("touchstart", down, { passive: true });
    window.addEventListener("touchmove", move, { passive: true });
    window.addEventListener("touchend", up);
    window.addEventListener("touchcancel", up);
    return () => { clearTimeout(idle); window.removeEventListener("wheel", wheel); window.removeEventListener("touchstart", down); window.removeEventListener("touchmove", move); window.removeEventListener("touchend", up); window.removeEventListener("touchcancel", up); };
  }, [busy, onRefresh]);

  const working = activity > 0 && !pull && !busy;
  if (!pull && !busy && !working) return null;
  const p = working ? 1 : Math.min(1, pull / THRESHOLD);
  const r = 9, len = 2 * Math.PI * r;
  const spin = busy || working;
  const count = activity > 999 ? "999+" : String(activity);
  // im Hintergrund: Kreis bleibt oben stehen (unter dem Statusbereich), sonst folgt er dem Finger
  const y = working ? 12 : pull - 44;
  const circle = (
    <span className="relative grid h-10 w-10 place-items-center rounded-full shadow-[0_6px_20px_rgba(16,24,40,.22)]" style={{ background: color, opacity: working ? 1 : Math.max(0.2, p), transform: `scale(${0.7 + 0.3 * p})` }}>
      <svg width="30" height="30" viewBox="0 0 24 24" className={spin ? "animate-spin" : ""} style={spin ? undefined : { transform: `rotate(${p * 270}deg)` }}>
        <circle cx="12" cy="12" r={r} fill="none" stroke="#fff" strokeOpacity=".3" strokeWidth="2.2" />
        <circle cx="12" cy="12" r={r} fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeDasharray={len} strokeDashoffset={spin ? len * 0.7 : len * (1 - p * 0.85)} transform="rotate(-90 12 12)" />
      </svg>
      {working && <span className={`tnum absolute inset-0 grid place-items-center font-bold text-white ${count.length >= 4 ? "text-[8px]" : count.length === 3 ? "text-[9px]" : "text-[11px]"}`}>{count}</span>}
    </span>
  );
  return (
    <div className="pointer-events-none fixed inset-x-0 top-0 z-[60] flex justify-center" style={{ transform: `translateY(calc(env(safe-area-inset-top) + ${y}px))`, transition: start.current === null ? "transform .25s ease" : undefined }}>
      {working ? (
        <button type="button" onClick={onActivity} disabled={!onActivity} title={activityLabel} aria-label={activityLabel ? `${activityLabel}: ${count}` : count} role="status" className="pointer-events-auto rounded-full">{circle}</button>
      ) : (
        <span aria-hidden>{circle}</span>
      )}
    </div>
  );
}
