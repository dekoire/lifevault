"use client";
/**
 * Wohin nach der Anmeldung? Kommt jemand über „Mit Lifevault verbinden“ (/connect?…), merkt sich der Browser das Ziel
 * eine Stunde lang – auch über Registrieren und den Bestätigungslink hinweg – und führt nach dem Anmelden dorthin.
 * Nur Pfade dieser Seite (kein //, kein fremder Host).
 */
const KEY = "lifevault:next";
export const safeNext = (v?: string | null) => (v && v.startsWith("/") && !v.startsWith("//") && !v.includes("\\") ? v.slice(0, 2000) : undefined);

export function rememberNext(v?: string | null) {
  const n = safeNext(v);
  try { if (n) localStorage.setItem(KEY, JSON.stringify({ n, until: Date.now() + 3_600_000 })); } catch { /* egal */ }
}
export function peekNext(): string | undefined {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? "null") as { n: string; until: number } | null;
    if (!v || v.until < Date.now()) { localStorage.removeItem(KEY); return undefined; }
    return safeNext(v.n);
  } catch { return undefined; }
}
export function takeNext(): string | undefined {
  const n = peekNext();
  try { localStorage.removeItem(KEY); } catch { /* egal */ }
  return n;
}
