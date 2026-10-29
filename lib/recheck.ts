import type { Doc } from "@/lib/types";

/**
 * Aus dem Internet geholte Dokumente (Tarifverträge, Gesetze, AGB …) veralten. Neu prüfen am frühesten von:
 * halbes Jahr nach der letzten Prüfung · Jahreswechsel (1.1., da ändert sich vieles) · Laufzeitende/Änderung laut Dokument.
 */
const CHANGE = /gültig|laufzeit|endet|ende\b|außer kraft|in kraft|kündbar|kündigung|änderung|erhöhung|neufassung|befristet|ablauf/i;

export function recheckOf(d: Pick<Doc, "web_source" | "deadlines">): { date: string; reason: string } | null {
  const ws = d.web_source;
  if (!ws?.checked_at) return null;
  const last = new Date(ws.checked_at);
  const iso = (x: Date) => x.toISOString().slice(0, 10);
  const half = new Date(last); half.setMonth(half.getMonth() + 6);
  const jan = new Date(Date.UTC(last.getUTCFullYear() + 1, 0, 1));
  const options = [
    { date: iso(half), reason: "halbes Jahr seit der letzten Prüfung" },
    { date: iso(jan), reason: "Jahreswechsel" },
    ...(d.deadlines ?? []).filter((x) => /^\d{4}-\d{2}-\d{2}$/.test(x.date) && x.date > iso(last) && CHANGE.test(x.what)).map((x) => ({ date: x.date, reason: x.what.length > 60 ? `${x.what.slice(0, 58)}…` : x.what })),
  ];
  return options.sort((a, b) => a.date.localeCompare(b.date))[0];
}
