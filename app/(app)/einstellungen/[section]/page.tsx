"use client";
import { Suspense, use, useEffect, useState } from "react";
import { ApiSettings } from "@/components/settings/ApiClients";
import { ProjectsSettings } from "@/components/settings/Projects";
import { NotificationSettings } from "@/components/settings/Notifications";
import { AppLockSettings } from "@/components/settings/AppLock";
import { AppearanceSettings } from "@/components/settings/Appearance";
import { RankingSettings } from "@/components/settings/Ranking";
import { unprotectDoc } from "@/lib/protect";
import { Loader2, Lock, LockOpen } from "lucide-react";
import { ClusterIcon } from "@/components/ClusterIcon";
import { MfaEnroll } from "@/components/Mfa";
import { BackLink, CARD, PageHeader, Switch } from "@/components/ui";
import { VaultUnlock } from "@/components/VaultUnlock";
import { CLUSTERS } from "@/lib/clusters";
import { useDocs } from "@/lib/docs";
import { useMe } from "@/lib/me";
import { supabase, useSession } from "@/lib/supabase";
import { createVault, lockVault } from "@/lib/vault";

const TITLES: Record<string, string> = { sicherheit: "Zwei-Faktor", tresor: "Tresor & Verschlüsselung", konto: "Konto", projekte: "Projekte", api: "API & MCP", mitteilungen: "Mitteilungen", sperre: "App-Sperre (PIN)", darstellung: "Darstellung", bewertung: "Wichtigkeit & Zusammenhang" };

export default function SettingsSection({ params }: { params: Promise<{ section: string }> }) {
  const { section } = use(params);
  return (
    <>
      <BackLink href="/einstellungen" label="Einstellungen" />
      <PageHeader title={TITLES[section] ?? "Einstellungen"} />
      <div className="max-w-3xl space-y-4">
        {section === "sicherheit" && <Mfa />}
        {section === "tresor" && <Vault />}
        {section === "konto" && <Account />}
        {section === "projekte" && <Suspense><ProjectsSettings /></Suspense>}
        {section === "api" && <ApiSettings />}
        {section === "mitteilungen" && <NotificationSettings />}
        {section === "sperre" && <AppLockSettings />}
        {section === "darstellung" && <AppearanceSettings />}
        {section === "bewertung" && <RankingSettings />}
      </div>
    </>
  );
}

function Mfa() {
  const { settings } = useMe();
  const [factors, setFactors] = useState<{ id: string; friendly_name?: string; created_at: string }[]>();
  const [adding, setAdding] = useState(false);
  const load = async () => { const { data } = await supabase.auth.mfa.listFactors(); setFactors((data?.totp ?? []).filter((f) => f.status === "verified")); };
  useEffect(() => { void load(); }, []);
  const remove = async (id: string) => {
    if (settings.mfa_required && (factors?.length ?? 0) <= 1) return alert("Zwei-Faktor ist vorgeschrieben – du brauchst mindestens einen Authenticator.");
    if (!confirm("Diesen Authenticator entfernen?")) return;
    await supabase.auth.mfa.unenroll({ factorId: id });
    await supabase.auth.refreshSession();
    void load();
  };
  return (
    <section className={`${CARD} p-5`}>
      <p className="text-[14px] text-soft">Beim Anmelden fragt Lifevault zusätzlich nach einem 6-stelligen Code aus deiner Authenticator-App.{settings.mfa_required && " Vom Admin vorgeschrieben."}</p>
      {factors === undefined ? <Loader2 className="mt-4 animate-spin text-muted" /> : factors.length ? (
        <ul className="mt-4 divide-y divide-line rounded-xl border border-card-line">
          {factors.map((f) => <li key={f.id} className="flex items-center justify-between gap-3 px-4 py-3 text-[14px]"><span><b>{f.friendly_name ?? "Authenticator"}</b><span className="block text-[12px] text-muted">seit {new Date(f.created_at).toLocaleDateString("de-DE")}</span></span><button type="button" onClick={() => void remove(f.id)} className="text-[13px] font-semibold text-negative-text">Entfernen</button></li>)}
        </ul>
      ) : <p className="mt-4 rounded-xl bg-surface-2 px-4 py-3 text-[14px]">Noch kein Authenticator eingerichtet.</p>}
      {adding ? <div className="mt-5"><MfaEnroll onDone={() => { setAdding(false); void supabase.auth.refreshSession().then(load); }} /></div> : !factors?.length && <button type="button" onClick={() => setAdding(true)} className="mt-4 inline-flex h-11 items-center rounded-full bg-brand-500 px-5 text-[14px] font-semibold text-white">Zwei-Faktor einrichten</button>}
    </section>
  );
}

function Vault() {
  const { vault, unlocked, reload } = useMe();
  const { docs, pendingProtect } = useDocs();
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const setup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (pw.length < 10) return setError("Mindestens 10 Zeichen.");
    if (pw !== pw2) return setError("Die Passwörter stimmen nicht überein.");
    setBusy(true);
    try {
      const v = await createVault(pw);
      const { error } = await supabase.from("vaults").insert({ salt: v.salt, verifier: v.verifier });
      if (error) throw error;
      await reload();
    } catch (err) { setError((err as Error).message); } finally { setBusy(false); }
  };
  const setProtected = async (id: string, on: boolean) => {
    if (!vault) return;
    const next = on ? [...new Set([...vault.protected_clusters, id])] : vault.protected_clusters.filter((x) => x !== id);
    await supabase.from("vaults").update({ protected_clusters: next }).eq("user_id", (await supabase.auth.getUser()).data.user!.id);
    await reload();
  };
  const encryptedCount = docs.filter((d) => d.encrypted).length;
  const { allDocs, refresh } = useDocs();
  const [progress, setProgress] = useState<string>();
  // Tresor auflösen: alle verschlüsselten Dokumente entschlüsseln, dann Tresor löschen
  const disable = async () => {
    const enc = allDocs.filter((d) => d.encrypted);
    if (!confirm(enc.length ? `Tresor deaktivieren? ${enc.length} verschlüsselte ${enc.length === 1 ? "Datei wird" : "Dateien werden"} entschlüsselt und liegen danach wieder normal (geschützt durch dein Konto) auf dem Server.` : "Tresor deaktivieren?")) return;
    setBusy(true); setError(undefined);
    try {
      for (const [i, d] of enc.entries()) { setProgress(`Entschlüssele ${i + 1} von ${enc.length} …`); await unprotectDoc(d); }
      const uid = (await supabase.auth.getUser()).data.user!.id;
      const { error } = await supabase.from("vaults").delete().eq("user_id", uid);
      if (error) throw error;
      lockVault();
      await refresh(); await reload();
    } catch (err) { setError(`Das hat nicht ganz geklappt: ${(err as Error).message}. Bereits entschlüsselte Dateien bleiben entschlüsselt – einfach erneut versuchen.`); }
    finally { setBusy(false); setProgress(undefined); }
  };
  return (
    <>
      <section className={`${CARD} p-5 text-[14px] leading-6 text-soft`}>
        <p><b className="text-fg">So funktioniert es:</b> Aus deinem Tresor-Passwort wird auf deinem Gerät ein Schlüssel erzeugt (AES-256). Verschlüsselte Dokumente – Datei und Inhalt – liegen danach nur noch unlesbar auf dem Server. Ohne dein Passwort kann sie niemand öffnen, auch wir nicht.</p>
        <p className="mt-2"><b className="text-fg">Wichtig:</b> Vergisst du das Tresor-Passwort, sind verschlüsselte Dokumente verloren. Lesbar bleiben nur Titel, Bereich, Absender und Datum. Zum Auslesen und für Fragen wird der Inhalt kurz entschlüsselt an die KI geschickt und nicht gespeichert.</p>
      </section>
      {!vault ? (
        <form onSubmit={setup} className={`${CARD} space-y-3 p-5`}>
          <h2 className="text-[16px] font-semibold">Tresor einrichten</h2>
          <input type="password" autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} placeholder="Tresor-Passwort (mind. 10 Zeichen)" className="h-11 w-full rounded-xl border border-card-line px-4 outline-none focus:border-brand-500" />
          <input type="password" autoComplete="new-password" value={pw2} onChange={(e) => setPw2(e.target.value)} placeholder="Tresor-Passwort wiederholen" className="h-11 w-full rounded-xl border border-card-line px-4 outline-none focus:border-brand-500" />
          {error && <p className="text-[13px] text-negative-text">{error}</p>}
          <button type="submit" disabled={busy} className="inline-flex h-11 items-center gap-2 rounded-full bg-brand-500 px-5 text-[14px] font-semibold text-white disabled:opacity-60">{busy && <Loader2 size={16} className="animate-spin" />} Tresor anlegen</button>
        </form>
      ) : (
        <>
          <section className={`${CARD} flex items-center justify-between gap-3 p-5`}>
            <span className="flex items-center gap-3">{unlocked ? <LockOpen className="text-positive" /> : <Lock className="text-brand-500" />}<span><b>{unlocked ? "Tresor entsperrt" : "Tresor gesperrt"}</b><span className="block text-[13px] text-muted">{encryptedCount} verschlüsselte {encryptedCount === 1 ? "Datei" : "Dateien"}{pendingProtect ? ` · ${pendingProtect} warten auf Verschlüsselung` : ""}</span></span></span>
            {unlocked && <button type="button" onClick={lockVault} className="inline-flex h-10 items-center rounded-full bg-surface-3 px-4 text-[14px] font-semibold">Sperren</button>}
          </section>
          {!unlocked && <VaultUnlock compact title="Tresor entsperren" text="Zum Öffnen verschlüsselter Dokumente, zum automatischen Verschlüsseln – und um den Tresor zu deaktivieren." />}
          <section className={CARD}>
            <h2 className="px-5 pt-5 text-[16px] font-semibold">Ganze Bereiche verschlüsseln</h2>
            <p className="px-5 pb-2 text-[13px] text-muted">Neue Dokumente in diesen Bereichen werden nach dem Erkennen automatisch verschlüsselt. Einzelne Dateien verschlüsselst du über das Schloss auf der Dokumentseite.</p>
            <ul className="divide-y divide-line">
              {CLUSTERS.map((c) => (
                <li key={c.id} className="flex items-center gap-3 px-5 py-3">
                  <ClusterIcon id={c.id} size={34} tone="plain" />
                  <span className="min-w-0 flex-1"><span className="block text-[14px] font-semibold">{c.label}</span><span className="block truncate text-[12px] text-muted">{c.hint}</span></span>
                  <Switch on={vault.protected_clusters.includes(c.id)} onChange={(v) => void setProtected(c.id, v)} label={`${c.label} verschlüsseln`} />
                </li>
              ))}
            </ul>
          </section>
          <section className={`${CARD} flex flex-wrap items-center justify-between gap-3 p-5`}>
            <span><b className="text-[15px]">Tresor deaktivieren</b><span className="mt-0.5 block text-[13px] text-muted">Entschlüsselt alle Dateien und löscht das Tresor-Passwort. {unlocked ? "" : "Dafür zuerst oben entsperren."}</span></span>
            <button type="button" disabled={!unlocked || busy} onClick={() => void disable()} className="inline-flex h-10 items-center gap-2 rounded-full border border-negative/40 px-4 text-[14px] font-semibold text-negative-text disabled:opacity-40">{busy && <Loader2 size={15} className="animate-spin" />} Deaktivieren</button>
            {(progress || error) && <p className={`basis-full text-[13px] ${error ? "text-negative-text" : "text-muted"}`}>{error ?? progress}</p>}
          </section>
        </>
      )}
    </>
  );
}

function Account() {
  const session = useSession();
  const [pw, setPw] = useState("");
  const [msg, setMsg] = useState<string>();
  const change = async (e: React.FormEvent) => {
    e.preventDefault();
    if (pw.length < 10) return setMsg("Mindestens 10 Zeichen.");
    const { error } = await supabase.auth.updateUser({ password: pw });
    setMsg(error ? error.message : "Passwort geändert.");
    setPw("");
  };
  return (
    <>
      <section className={`${CARD} p-5 text-[14px]`}><span className="text-muted">Angemeldet als</span><b className="mt-0.5 block text-[15px]">{session?.user.email}</b></section>
      <form onSubmit={change} className={`${CARD} space-y-3 p-5`}>
        <h2 className="text-[16px] font-semibold">Passwort ändern</h2>
        <input type="password" autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} placeholder="Neues Passwort (mind. 10 Zeichen)" className="h-11 w-full rounded-xl border border-card-line px-4 outline-none focus:border-brand-500" />
        {msg && <p className="text-[13px] text-soft">{msg}</p>}
        <button type="submit" className="inline-flex h-11 items-center rounded-full bg-brand-500 px-5 text-[14px] font-semibold text-white">Ändern</button>
      </form>
    </>
  );
}
