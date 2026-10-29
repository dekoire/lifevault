"use client";
import { useCallback, useEffect, useState } from "react";
import { todoKind, todos, type TodoKind } from "@/lib/actions";
import { authFetch, supabase } from "@/lib/supabase";
import type { Doc } from "@/lib/types";

/**
 * Mitteilungen bei Fristen. Der Browser berechnet aus deinen Dokumenten, wann was erinnert wird (Warteschlange push_queue),
 * Supabase stößt stündlich den Versand an. Auf dem iPhone nur in der Web-App vom Home-Bildschirm (ab iOS 16.4).
 */
export type NotifyPrefs = { daysBefore: number[]; time: string; overdueWeekly: boolean; kinds: TodoKind[] };
export const ALL_KINDS: TodoKind[] = ["zahlung", "formular", "widerspruch", "angebot", "vertrag", "termin", "frist"];
export const DEFAULT_PREFS: NotifyPrefs = { daysBefore: [7, 1, 0], time: "08:00", overdueWeekly: true, kinds: ALL_KINDS };

export const pushSupported = () => typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
export const isStandalone = () => typeof window !== "undefined" && (window.matchMedia?.("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true);
export const isIos = () => typeof navigator !== "undefined" && /iphone|ipad|ipod/i.test(navigator.userAgent);

const toKey = (b64: string) => {
  const s = atob(b64.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (b64.length % 4)) % 4));
  return Uint8Array.from(s, (c) => c.charCodeAt(0));
};
const register = () => navigator.serviceWorker.register("/sw.js", { scope: "/" });

/** Einschalten (nur nach Tipp möglich): Erlaubnis, Gerät beim Push-Dienst anmelden, Abo speichern */
export async function enablePush(): Promise<string | undefined> {
  if (!pushSupported()) return "Dieses Gerät oder dieser Browser unterstützt keine Mitteilungen.";
  if (isIos() && !isStandalone()) return "Auf dem iPhone gehen Mitteilungen nur in der App vom Home-Bildschirm: In Safari Teilen › „Zum Home-Bildschirm“, dann Lifevault von dort öffnen.";
  const permission = await Notification.requestPermission();
  if (permission !== "granted") return "Mitteilungen sind nicht erlaubt. Ändern kannst du das in den Einstellungen des Geräts (Mitteilungen › Lifevault).";
  const reg = await register();
  await navigator.serviceWorker.ready;
  const res = await authFetch("/api/push");
  const { publicKey } = (await res.json().catch(() => ({}))) as { publicKey?: string | null };
  if (!publicKey) return "Mitteilungen sind auf dem Server noch nicht eingerichtet (Schlüssel fehlt).";
  const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: toKey(publicKey) }));
  const j = sub.toJSON();
  const { error } = await supabase.from("push_subscriptions").upsert({ endpoint: sub.endpoint, p256dh: j.keys?.p256dh ?? "", auth: j.keys?.auth ?? "" });
  if (error) return "Das Gerät konnte nicht gespeichert werden. Bitte erneut versuchen.";
  window.dispatchEvent(new Event("lifevault:push"));
  return undefined;
}

export async function disablePush() {
  const reg = await navigator.serviceWorker?.getRegistration("/");
  const sub = await reg?.pushManager.getSubscription();
  if (sub) {
    await supabase.from("push_subscriptions").delete().eq("endpoint", sub.endpoint);
    await sub.unsubscribe().catch(() => undefined);
  }
  window.dispatchEvent(new Event("lifevault:push"));
}

/** Ist dieses Gerät angemeldet? */
export function usePushOn() {
  const [on, setOn] = useState<boolean | null>(null);
  useEffect(() => {
    const check = async () => {
      if (!pushSupported()) return setOn(false);
      const reg = await navigator.serviceWorker.getRegistration("/");
      const sub = await reg?.pushManager.getSubscription();
      setOn(!!sub && Notification.permission === "granted");
    };
    void check();
    window.addEventListener("lifevault:push", check);
    return () => window.removeEventListener("lifevault:push", check);
  }, []);
  return on;
}

export function useNotifyPrefs() {
  const [prefs, setPrefs] = useState<NotifyPrefs>();
  useEffect(() => {
    void supabase.from("notify_settings").select("prefs").maybeSingle().then(({ data }) => setPrefs({ ...DEFAULT_PREFS, ...((data?.prefs as Partial<NotifyPrefs>) ?? {}) }));
  }, []);
  const save = useCallback(async (next: NotifyPrefs) => {
    setPrefs(next);
    await supabase.from("notify_settings").upsert({ prefs: next, updated_at: new Date().toISOString() });
  }, []);
  return { prefs, save };
}

/** Zeitpunkt: Datum (YYYY-MM-DD) minus Tage, zur gewählten Uhrzeit in der Zeit des Geräts */
function at(date: string, minusDays: number, time: string) {
  const [h, m] = time.split(":").map(Number);
  const d = new Date(`${date}T00:00:00`);
  d.setDate(d.getDate() - minusDays);
  d.setHours(h || 8, m || 0, 0, 0);
  return d;
}
const when = (n: number) => (n === 0 ? "Heute fällig" : n === 1 ? "Morgen fällig" : `In ${n} Tagen fällig`);
const LABEL: Record<TodoKind, string> = { zahlung: "Zahlung", formular: "Formular", widerspruch: "Widerspruch", angebot: "Angebot läuft ab", vertrag: "Vertrag", termin: "Termin", frist: "Frist" };

/** Warteschlange neu berechnen: offene, ungesendete Einträge ersetzen; schon gesendete bleiben (kein Doppelversand) */
export async function syncQueue(docs: Doc[], prefs: NotifyPrefs, done: string[] = []) {
  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const list = todos(docs, today, { pastDays: 365, aheadDays: 60 }).filter((t) => !done.includes(`${t.doc.id}|${t.date}`)).map((t) => ({ ...t, kind: todoKind(t) })).filter((t) => prefs.kinds.includes(t.kind));
  const rows: { key: string; send_at: string; title: string; body: string; url: string }[] = [];
  for (const t of list) {
    if (t.days < 0) continue;
    for (const n of prefs.daysBefore) {
      const send = at(t.date, n, prefs.time);
      if (send <= now || n > t.days) continue;
      const amount = t.payment?.amount !== undefined ? ` · ${t.payment.amount.toLocaleString("de-DE", { style: "currency", currency: t.payment.currency || "EUR" })}` : "";
      rows.push({ key: `${t.doc.id}|${t.date}|${n}`, send_at: send.toISOString(), title: `${when(n)}: ${LABEL[t.kind]}`.slice(0, 120), body: `${t.doc.sender ? `${t.doc.sender}: ` : ""}${t.what}${amount}`.slice(0, 300), url: `/d/${t.doc.id}` });
    }
  }
  const overdue = list.filter((t) => t.days < 0);
  if (prefs.overdueWeekly && overdue.length) {
    // nächster Montag zur gewählten Uhrzeit
    const mon = new Date(now); mon.setDate(now.getDate() + ((8 - now.getDay()) % 7 || 7));
    const send = at(mon.toISOString().slice(0, 10), 0, prefs.time);
    rows.push({ key: `overdue|${send.toISOString().slice(0, 10)}`, send_at: send.toISOString(), title: `${overdue.length} ${overdue.length === 1 ? "Frist ist" : "Fristen sind"} überfällig`, body: overdue.slice(0, 3).map((t) => t.what).join(" · ").slice(0, 300), url: "/" });
  }
  await supabase.from("push_queue").delete().is("sent_at", null);
  if (rows.length) await supabase.from("push_queue").upsert(rows.slice(0, 300), { onConflict: "user_id,key", ignoreDuplicates: true });
  return rows.length;
}

/** Läuft im App-Rahmen: hält die Warteschlange aktuell, sobald mindestens ein Gerät angemeldet ist */
export function NotifySync({ docs }: { docs: Doc[] }) {
  const sig = docs.map((d) => `${d.id}:${d.status}:${d.archived}:${(d.deadlines ?? []).length}`).join(",");
  useEffect(() => {
    if (!docs.length) return;
    const t = setTimeout(async () => {
      const { count } = await supabase.from("push_subscriptions").select("endpoint", { count: "exact", head: true });
      if (!count) return;
      const { data } = await supabase.from("notify_settings").select("prefs").maybeSingle();
      let done: string[] = [];
      try { done = JSON.parse(localStorage.getItem("lifevault:todo-done") ?? "[]"); } catch { /* egal */ }
      await syncQueue(docs, { ...DEFAULT_PREFS, ...((data?.prefs as Partial<NotifyPrefs>) ?? {}) }, done);
    }, 3000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sig]);
  return null;
}
