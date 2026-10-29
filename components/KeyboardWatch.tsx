"use client";
import { useEffect } from "react";

/**
 * Bildschirmtastatur offen? Dann html[data-kb] setzen: die untere Menüleiste verschwindet (.hide-on-kb)
 * und das Chat-Eingabefeld dockt direkt über der Tastatur an (.kb-dock).
 */
export function KeyboardWatch() {
  useEffect(() => {
    const vv = window.visualViewport;
    const typing = () => { const a = document.activeElement as HTMLElement | null; return !!a && (a.tagName === "TEXTAREA" || (a.tagName === "INPUT" && !/checkbox|radio|button|submit|file|range|color/.test((a as HTMLInputElement).type)) || a.isContentEditable); };
    const update = () => {
      const touch = matchMedia("(pointer: coarse)").matches;
      const shrunk = vv ? window.innerHeight - vv.height > 120 : false;
      const open = touch && typing() && (shrunk || !vv);
      if (open) document.documentElement.dataset.kb = "1"; else delete document.documentElement.dataset.kb;
    };
    const later = () => setTimeout(update, 120);
    vv?.addEventListener("resize", update);
    window.addEventListener("focusin", later);
    window.addEventListener("focusout", later);
    return () => { vv?.removeEventListener("resize", update); window.removeEventListener("focusin", later); window.removeEventListener("focusout", later); delete document.documentElement.dataset.kb; };
  }, []);
  return null;
}
