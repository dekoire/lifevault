"use client";
import { dropDeviceKey } from "@/lib/devicekey";
import { DOWNLOADS_DB } from "@/lib/jobs";
import { supabase } from "@/lib/supabase";
import { lockVault } from "@/lib/vault";

/** Bleiben beim Abmelden: reine Einstellungen der Oberfläche, keine Inhalte */
const KEEP = new Set(["lifevault:theme", "lifevault:side-mini", "lifevault:chat-side", "lifevault:depth", "lifevault:scan", "lifevault:vault-keep"]);

/**
 * Abmelden und alles aus diesem Browser entfernen, was Inhalte verrät: Tresor-Schlüssel, Downloads, Geräteschlüssel,
 * Empfehlungen, Vorschläge, erledigte Aufgaben, Projekt-Auswahl. Der Server leert zusätzlich den Zwischenspeicher
 * des Browsers (Clear-Site-Data). Alle Dokumente liegen auf dem Server – nichts geht verloren.
 */
export async function signOutClean(to = "/login") {
  lockVault();
  for (const db of [DOWNLOADS_DB, "lifevault-vault"]) { try { indexedDB.deleteDatabase(db); } catch { /* egal */ } }
  await dropDeviceKey();
  try { indexedDB.deleteDatabase("lifevault-keys"); } catch { /* egal */ }
  try {
    for (const k of Object.keys(localStorage)) if (k.startsWith("lifevault:") && !KEEP.has(k)) localStorage.removeItem(k);
    sessionStorage.clear();
  } catch { /* egal */ }
  await fetch("/api/logout", { method: "POST" }).catch(() => undefined);
  await supabase.auth.signOut().catch(() => undefined);
  location.href = to;
}
