"use client";
import { useEffect } from "react";

const reducedMotion = () => typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;

/* Druck-Feedback wie in Finastry (lib/motion.tsx): gleiche Werte, gleiche Kurven */
const PRESSABLE = "button, a[href], [role='button'], [role='link'], [role='radio'], [role='tab'], summary, label[for]";

/**
 * Antippen lässt Knöpfe und Karten kurz nachgeben. Über die Web Animations API, damit es die Übergänge
 * der Elemente (transition-colors usw.) nicht überschreibt. Erst nach 60 ms, damit beim Scrollen nichts zuckt.
 */
export function PressFeedback() {
  useEffect(() => {
    if (typeof Element === "undefined" || !("animate" in Element.prototype)) return;
    let el: HTMLElement | undefined;
    let anim: Animation | undefined;
    let timer = 0;
    let start = { x: 0, y: 0 };
    const release = () => {
      window.clearTimeout(timer);
      if (el && anim) {
        const scale = getComputedStyle(el).scale;
        anim.cancel();
        el.animate([{ scale: scale === "none" ? "1" : scale }, { scale: "1" }], { duration: 260, easing: "cubic-bezier(.3,1.5,.5,1)" });
      }
      el = undefined;
      anim = undefined;
    };
    const down = (e: PointerEvent) => {
      if (e.button !== 0 || reducedMotion()) return;
      const hit = (e.target as Element | null)?.closest<HTMLElement>(PRESSABLE);
      if (!hit || hit.closest("[data-no-press]") || hit.matches(":disabled, [aria-disabled='true']")) return;
      release();
      el = hit;
      start = { x: e.clientX, y: e.clientY };
      const w = hit.offsetWidth;
      // große Flächen (Karten, Zeilen) nur ein Hauch, kleine Knöpfe deutlicher
      const to = w > 320 ? 0.985 : w > 140 ? 0.97 : 0.92;
      timer = window.setTimeout(() => {
        if (el === hit) anim = hit.animate([{ scale: "1" }, { scale: String(to) }], { duration: 120, easing: "ease-out", fill: "forwards" });
      }, e.pointerType === "mouse" ? 0 : 60);
    };
    const move = (e: PointerEvent) => {
      if (el && Math.hypot(e.clientX - start.x, e.clientY - start.y) > 8) release();
    };
    window.addEventListener("pointerdown", down, { passive: true });
    window.addEventListener("pointermove", move, { passive: true });
    window.addEventListener("pointerup", release, { passive: true });
    window.addEventListener("pointercancel", release, { passive: true });
    window.addEventListener("scroll", release, { passive: true, capture: true });
    return () => {
      window.removeEventListener("pointerdown", down);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", release);
      window.removeEventListener("pointercancel", release);
      window.removeEventListener("scroll", release, { capture: true });
    };
  }, []);
  return null;
}
