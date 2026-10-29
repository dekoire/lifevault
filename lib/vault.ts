"use client";
/**
 * Tresor-Verschlüsselung im Browser (Ende-zu-Ende): Schlüssel aus deinem Tresor-Passwort (PBKDF2, 310.000 Runden, SHA-256)
 * → AES-GCM 256. Der Schlüssel verlässt nie das Gerät und liegt nur im Arbeitsspeicher, bis du sperrst oder neu lädst.
 * Auf dem Server liegen nur Salz, ein Prüfwert und verschlüsselte Daten – ohne Passwort nicht lesbar (auch nicht für uns).
 */
const enc = new TextEncoder();
const dec = new TextDecoder();
const b64 = (u: Uint8Array) => btoa(String.fromCharCode(...u));
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
export type Sealed = { iv: string; ct: string };

let key: CryptoKey | null = null;
const listeners = new Set<() => void>();
export const vaultKey = () => key;
export const onVaultChange = (fn: () => void) => { listeners.add(fn); return () => { listeners.delete(fn); }; };
const emit = () => listeners.forEach((f) => f());
let timer: ReturnType<typeof setTimeout> | undefined;
export function lockVault() { key = null; if (timer) clearTimeout(timer); void forget(); emit(); }

/*
 * „15 Minuten merken“: Der Schlüssel (nicht exportierbar) wird im IndexedDB dieses Browsers mit Ablaufzeit abgelegt,
 * damit Neuladen nicht sofort sperrt. Das Passwort selbst wird nie gespeichert; nach Ablauf ist der Schlüssel weg.
 */
export const REMEMBER_MIN = 15;
const DB = "lifevault-vault";
function idb<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T | undefined> {
  return new Promise((ok) => {
    try {
      const r = indexedDB.open(DB, 1);
      r.onupgradeneeded = () => r.result.createObjectStore("k");
      r.onerror = () => ok(undefined);
      r.onsuccess = () => {
        const tx = r.result.transaction("k", mode);
        const q = fn(tx.objectStore("k"));
        q.onsuccess = () => ok(q.result);
        q.onerror = () => ok(undefined);
      };
    } catch { ok(undefined); }
  });
}
const forget = () => idb("readwrite", (s) => s.delete("key"));
function schedule(until: number) {
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => lockVault(), Math.max(0, until - Date.now()));
}
/** Beim Start: gemerkten Schlüssel zurückholen, solange er nicht abgelaufen ist */
export async function restoreVault() {
  if (key || typeof indexedDB === "undefined") return;
  const v = await idb<{ key: CryptoKey; until: number }>("readonly", (s) => s.get("key"));
  if (!v?.key || v.until < Date.now()) { if (v) void forget(); return; }
  key = v.key;
  schedule(v.until);
  emit();
}
async function remember(k: CryptoKey, minutes: number) {
  const until = Date.now() + minutes * 60_000;
  await idb("readwrite", (s) => s.put({ key: k, until }, "key"));
  schedule(until);
}

async function derive(password: string, salt: Uint8Array) {
  const base = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey({ name: "PBKDF2", hash: "SHA-256", salt: salt as BufferSource, iterations: 310_000 }, base, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
}

export async function sealBytes(data: Uint8Array, k = key): Promise<Uint8Array> {
  if (!k) throw new Error("Tresor ist gesperrt.");
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, k, data as BufferSource));
  const out = new Uint8Array(12 + ct.length);
  out.set(iv);
  out.set(ct, 12);
  return out;
}
export async function openBytes(data: Uint8Array, k = key): Promise<Uint8Array> {
  if (!k) throw new Error("Tresor ist gesperrt.");
  return new Uint8Array(await crypto.subtle.decrypt({ name: "AES-GCM", iv: data.slice(0, 12) }, k, data.slice(12)));
}
export async function sealJson(v: unknown, k = key): Promise<Sealed> {
  if (!k) throw new Error("Tresor ist gesperrt.");
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, k, enc.encode(JSON.stringify(v))));
  return { iv: b64(iv), ct: b64(ct) };
}
export async function openJson<T>(s: Sealed, k = key): Promise<T> {
  if (!k) throw new Error("Tresor ist gesperrt.");
  const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv: unb64(s.iv) }, k, unb64(s.ct));
  return JSON.parse(dec.decode(pt)) as T;
}

/** Neuen Tresor anlegen: liefert Salz und Prüfwert zum Speichern */
export async function createVault(password: string) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const k = await derive(password, salt);
  const verifier = await sealJson({ ok: "lifevault" }, k);
  key = k;
  emit();
  return { salt: b64(salt), verifier };
}

/** Entsperren: Passwort prüfen (Prüfwert muss sich öffnen lassen) */
export async function unlockVault(password: string, salt: string, verifier: Sealed, rememberMinutes = 0) {
  const k = await derive(password, unb64(salt));
  const v = await openJson<{ ok: string }>(verifier, k).catch(() => null);
  if (v?.ok !== "lifevault") throw new Error("Das Tresor-Passwort stimmt nicht.");
  key = k;
  if (rememberMinutes > 0) await remember(k, rememberMinutes);
  else { void forget(); if (timer) clearTimeout(timer); }
  emit();
}
