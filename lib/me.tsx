"use client";
import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { onVaultChange, vaultKey, type Sealed } from "@/lib/vault";

export type DocSections = Record<"summary" | "info" | "facts" | "deadlines" | "amounts" | "tags" | "content" | "original" | "chat", boolean>;
export type Settings = { mfa_required: boolean; doc_sections: DocSections };
export type Vault = { salt: string; verifier: Sealed; protected_clusters: string[] } | null;

type Me = { isAdmin: boolean; settings: Settings; vault: Vault; unlocked: boolean; reload: () => Promise<void> };
const Ctx = createContext<Me | null>(null);

const DEFAULT: Settings = { mfa_required: false, doc_sections: { summary: true, info: true, facts: true, deadlines: true, amounts: true, tags: true, content: true, original: true, chat: true } };

/** Wer bin ich (Admin?), App-Einstellungen und Tresor-Status */
export function MeProvider({ userId, children }: { userId: string; children: React.ReactNode }) {
  const [me, setMe] = useState<Omit<Me, "reload" | "unlocked">>({ isAdmin: false, settings: DEFAULT, vault: null });
  const [unlocked, setUnlocked] = useState(!!vaultKey());
  const reload = useCallback(async () => {
    const [p, s, v] = await Promise.all([
      supabase.from("profiles").select("is_admin").eq("id", userId).maybeSingle(),
      supabase.from("app_settings").select("mfa_required,doc_sections").eq("id", 1).maybeSingle(),
      supabase.from("vaults").select("salt,verifier,protected_clusters").eq("user_id", userId).maybeSingle(),
    ]);
    setMe({ isAdmin: !!p.data?.is_admin, settings: s.data ? { mfa_required: s.data.mfa_required, doc_sections: { ...DEFAULT.doc_sections, ...(s.data.doc_sections as Partial<DocSections>) } } : DEFAULT, vault: (v.data as Vault) ?? null });
  }, [userId]);
  useEffect(() => { void reload(); }, [reload]);
  useEffect(() => onVaultChange(() => setUnlocked(!!vaultKey())), []);
  return <Ctx.Provider value={{ ...me, unlocked, reload }}>{children}</Ctx.Provider>;
}

export function useMe() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useMe außerhalb von MeProvider");
  return v;
}
