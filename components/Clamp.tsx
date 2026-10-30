"use client";
import { useLayoutEffect, useRef, useState } from "react";

/** Langer Text: zeigt zwei Zeilen (oder lines), darunter „Mehr anzeigen“ – nur wenn wirklich mehr da ist */
export function Clamp({ children, lines = 2, className = "" }: { children: React.ReactNode; lines?: number; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [open, setOpen] = useState(false);
  const [more, setMore] = useState(false);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const check = () => setMore(el.scrollHeight > el.clientHeight + 2);
    check();
    const ro = new ResizeObserver(check);
    ro.observe(el);
    return () => ro.disconnect();
  }, [children, open]);
  return (
    <span className={`block ${className}`}>
      <span ref={ref} className="block overflow-hidden" style={open ? undefined : { display: "-webkit-box", WebkitLineClamp: lines, WebkitBoxOrient: "vertical" }}>{children}</span>
      {(more || open) && <button type="button" onClick={(e) => { e.preventDefault(); e.stopPropagation(); setOpen(!open); }} className="mt-0.5 text-[13px] font-semibold text-selected hover:underline">{open ? "Weniger anzeigen" : "Mehr anzeigen"}</button>}
    </span>
  );
}
