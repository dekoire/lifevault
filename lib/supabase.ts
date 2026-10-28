"use client";
import { createClient, type Session } from "@supabase/supabase-js";
import { useEffect, useState } from "react";

/** Browser-Client: Anmeldung bleibt im Gerät gespeichert, Zugriff auf Daten nur über RLS (eigene Zeilen). */
export const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
  auth: { persistSession: true, autoRefreshToken: true, storageKey: "lifevault-auth" },
});

/** Aktuelle Sitzung; undefined = wird noch geladen */
export function useSession() {
  const [session, setSession] = useState<Session | null>();
  useEffect(() => {
    void supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, []);
  return session;
}

/** API-Aufruf mit dem Zugangstoken des Nutzers */
export async function authFetch(path: string, init: RequestInit = {}) {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  return fetch(path, { ...init, headers: { "Content-Type": "application/json", ...(init.headers ?? {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) } });
}
