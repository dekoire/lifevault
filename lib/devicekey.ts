"use client";
/**
 * Verschlüsselung für alles, was im Browser liegen bleibt (Downloads, Empfehlungen, Vorschläge):
 * AES-GCM mit einem Schlüssel, den der Browser selbst erzeugt und in IndexedDB ablegt – „nicht exportierbar“,
 * d. h. Code kann damit ver- und entschlüsseln, ihn aber nie auslesen. Wer nur die Dateien des Browser-Profils
 * kopiert, sieht keine Inhalte. Beim Abmelden wird der Schlüssel gelöscht – Reste sind danach unlesbar.
 * Nicht zu verwechseln mit dem Tresor (lib/vault.ts): dessen Schlüssel entsteht aus dem Tresor-Passwort.
 */
const DB = "lifevault-keys";
let cache: Promise<CryptoKey | undefined> | undefined;

function open(): Promise<IDBDatabase> {
  return new Promise((ok, no) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore("k");
    r.onsuccess = () => ok(r.result);
    r.onerror = () => no(r.error);
  });
}
function req<T>(r: IDBRequest<T>): Promise<T> {
  return new Promise((ok, no) => { r.onsuccess = () => ok(r.result); r.onerror = () => no(r.error); });
}

/** Schlüssel holen; fehlt er, neu anlegen (`create`). undefined = Browser kann es nicht (sehr alt, privater Modus). */
export async function deviceKey(create = true): Promise<CryptoKey | undefined> {
  if (typeof indexedDB === "undefined" || !globalThis.crypto?.subtle) return undefined;
  const found = await (cache ??= (async () => {
    try { return (await req((await open()).transaction("k").objectStore("k").get("device"))) as CryptoKey | undefined; } catch { return undefined; }
  })());
  if (found || !create) return found;
  try {
    const key = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
    await req((await open()).transaction("k", "readwrite").objectStore("k").put(key, "device"));
    cache = Promise.resolve(key);
    return key;
  } catch { return undefined; }
}

export async function dropDeviceKey() {
  cache = undefined;
  try { await req((await open()).transaction("k", "readwrite").objectStore("k").delete("device")); } catch { /* egal */ }
}

export async function sealDevice(data: Uint8Array): Promise<Uint8Array> {
  const key = await deviceKey();
  if (!key) throw new Error("Verschlüsselung im Browser nicht verfügbar.");
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, data as BufferSource));
  const out = new Uint8Array(12 + ct.length);
  out.set(iv);
  out.set(ct, 12);
  return out;
}
export async function openDevice(data: Uint8Array): Promise<Uint8Array> {
  const key = await deviceKey(false);
  if (!key) throw new Error("Schlüssel fehlt – Daten nicht mehr lesbar.");
  return new Uint8Array(await crypto.subtle.decrypt({ name: "AES-GCM", iv: data.slice(0, 12) as BufferSource }, key, data.slice(12) as BufferSource));
}

/* JSON verschlüsselt im localStorage („enc1:<base64>“); alte Klartext-Werte werden beim Lesen umgestellt */
const ENC = "enc1:";
const b64 = (u: Uint8Array) => { let s = ""; for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode(...u.subarray(i, i + 0x8000)); return btoa(s); };
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

export async function secureGet<T>(k: string): Promise<T | null> {
  try {
    const raw = localStorage.getItem(k);
    if (!raw) return null;
    if (!raw.startsWith(ENC)) { const v = JSON.parse(raw) as T; await secureSet(k, v); return v; }
    return JSON.parse(new TextDecoder().decode(await openDevice(unb64(raw.slice(ENC.length))))) as T;
  } catch { return null; }
}
export async function secureSet(k: string, v: unknown) {
  try { localStorage.setItem(k, ENC + b64(await sealDevice(new TextEncoder().encode(JSON.stringify(v))))); } catch { /* voll oder nicht verfügbar */ }
}
