"use client";
import { useCallback, useRef } from "react";

/**
 * Wischreihen: am Rand weich ausblenden, aber nur dort, wo noch etwas kommt
 * (links erst nach dem Scrollen, rechts nicht mehr am Ende). Zusammen mit der Klasse „fade-x“.
 * Callback-Ref, damit es auch greift, wenn die Reihe erst später erscheint.
 */
export function useEdgeFade<T extends HTMLElement>() {
  const cleanup = useRef<() => void>(undefined);
  return useCallback((el: T | null) => {
    cleanup.current?.();
    cleanup.current = undefined;
    if (!el) return;
    const update = () => {
      const max = el.scrollWidth - el.clientWidth;
      el.style.setProperty("--fl", el.scrollLeft > 4 ? "32px" : "0px");
      el.style.setProperty("--fr", el.scrollLeft < max - 4 ? "32px" : "0px");
    };
    update();
    el.addEventListener("scroll", update, { passive: true });
    const ro = new ResizeObserver(update); ro.observe(el);
    for (const c of el.children) ro.observe(c);
    cleanup.current = () => { el.removeEventListener("scroll", update); ro.disconnect(); };
  }, []);
}
