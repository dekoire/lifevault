"use client";
import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, ArrowLeftRight, Check, FolderPlus, Link2, Loader2, ShieldCheck } from "lucide-react";
import { AppIcon } from "@/components/AppIcon";
import { LogoMark } from "@/components/Logo";
import { Dot } from "@/components/ProjectSwitcher";
import { CARD, Switch } from "@/components/ui";
import { KINDS } from "@/lib/kinds";
import { useProjects } from "@/lib/projects";
import { supabase } from "@/lib/supabase";

/**
 * Freigabe-Seite für „Mit Lifevault verbinden“ (OAuth 2.1, Authorization Code + PKCE).
 * Die App schickt: client_id, redirect_uri, state, code_challenge (S256) und scope, z. B.
 * „read write kinds:rechnung,mahnung,vertrag project:Finastry“. Der Nutzer sieht, was die App will, passt es an und bestätigt.
 * Erst die Datenbank (oauth_approve) prüft alles verbindlich und gibt den Einmal-Code aus – die Seite zeigt nur an.
 */
type App = { name: string; description: string | null; homepage: string | null };
type Grant = { can_read: boolean; can_write: boolean; project_ids: string[]; own_project: string | null; kinds: string[] | null; own_only: boolean; allow_personal: boolean; allow_health: boolean; revoked_at: string | null };
type Req = { clientId: string; redirect: string; state: string; challenge: string; read: boolean; write: boolean; kinds: string[] | null; project: string | null };

function parse(q: URLSearchParams): Req | string {
  const clientId = q.get("client_id") ?? "", redirect = q.get("redirect_uri") ?? "", challenge = q.get("code_challenge") ?? "";
  if (q.get("response_type") && q.get("response_type") !== "code") return "Nur response_type=code wird unterstützt.";
  if ((q.get("code_challenge_method") ?? "S256") !== "S256" || !/^[A-Za-z0-9_-]{43}$/.test(challenge)) return "Sichere Anmeldung (PKCE mit S256) fehlt.";
  if (!/^lva_[a-z0-9]{24}$/.test(clientId) || !redirect) return "Die Anfrage ist unvollständig.";
  const scope = (q.get("scope") ?? "read").split(/\s+/).filter(Boolean);
  const kinds = scope.find((s) => s.startsWith("kinds:"))?.slice(6).split(",").filter((k) => KINDS.some((x) => x.id === k)) ?? null;
  const project = scope.find((s) => s.startsWith("project:"))?.slice(8).replace(/[+_]/g, " ").trim().slice(0, 80) || null;
  return { clientId, redirect, state: (q.get("state") ?? "").slice(0, 500), challenge, read: scope.includes("read"), write: scope.includes("write"), kinds: kinds?.length ? kinds : null, project };
}

function back(redirect: string, params: Record<string, string>) {
  const u = new URL(redirect);
  for (const [k, v] of Object.entries(params)) if (v) u.searchParams.set(k, v);
  location.href = u.toString();
}

export default function ConnectPage() {
  const { projects, defaultProject, reload } = useProjects();
  const [req, setReq] = useState<Req | string>();
  const [app, setApp] = useState<App>();
  const [grant, setGrant] = useState<Grant | null>();
  const [read, setRead] = useState(true);
  const [write, setWrite] = useState(false);
  const [kinds, setKinds] = useState<string[] | null>(null);
  const [projectIds, setProjectIds] = useState<string[]>([]);
  const [ownProject, setOwnProject] = useState("");
  const [useOwn, setUseOwn] = useState(true);
  const [personal, setPersonal] = useState(false);
  const [health, setHealth] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  useEffect(() => {
    const r = parse(new URLSearchParams(location.search));
    setReq(r);
    if (typeof r === "string") return;
    void (async () => {
      const info = await supabase.rpc("oauth_app_info", { p_client_id: r.clientId, p_redirect: r.redirect });
      if (info.error) return setReq("Diese App ist bei Lifevault nicht (mehr) registriert oder die Rückleitungs-Adresse stimmt nicht. Aus Sicherheitsgründen geht es hier nicht weiter.");
      setApp(info.data as App);
      const { data: g } = await supabase.rpc("oauth_my_grant", { p_client_id: r.clientId });
      const had = g as Grant | null;
      setGrant(had && !had.revoked_at ? had : null);
      // vorausfüllen: bestehende Freigabe, sonst die Wünsche der App
      setRead(had && !had.revoked_at ? had.can_read : r.read);
      setWrite(had && !had.revoked_at ? had.can_write : r.write);
      setKinds(had && !had.revoked_at ? had.kinds : r.kinds);
      setPersonal(!!had?.allow_personal && !had.revoked_at);
      setHealth(!!had?.allow_health && !had.revoked_at);
      setOwnProject(r.project ?? (info.data as App).name);
      setUseOwn(!!(r.project || r.write || had?.own_project));
      if (had && !had.revoked_at) setProjectIds(had.project_ids);
    })();
  }, []);
  // „Meine Daten“ ist vorausgewählt, sobald die Projekte geladen sind (nur bei neuer Freigabe)
  useEffect(() => { if (grant === null && defaultProject && !projectIds.length) setProjectIds([defaultProject.id]); }, [grant, defaultProject]); // eslint-disable-line react-hooks/exhaustive-deps

  const ownExisting = useMemo(() => (grant?.own_project ? projects.find((p) => p.id === grant.own_project) : undefined), [grant, projects]);
  const toggle = <T,>(list: T[], v: T) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

  if (req === undefined || (typeof req !== "string" && (!app || grant === undefined))) return <div className="grid min-h-[50vh] place-items-center"><Loader2 className="animate-spin text-muted" /></div>;
  if (typeof req === "string") return (
    <div className={`${CARD} mx-auto mt-8 max-w-lg space-y-3 p-6 text-center`}>
      <span className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-negative/10 text-negative-text"><AlertTriangle size={22} /></span>
      <h1 className="text-[18px] font-semibold">Verbindung nicht möglich</h1>
      <p className="text-[14px] text-muted">{req}</p>
    </div>
  );

  const approve = async () => {
    if (!read && !write) return setError("Wähle mindestens Lesen oder Ablegen.");
    setBusy(true); setError(undefined);
    const { data, error: e } = await supabase.rpc("oauth_approve", {
      p_client_id: req.clientId, p_redirect: req.redirect, p_challenge: req.challenge, p_read: read, p_write: write,
      p_projects: projectIds, p_own_project: useOwn ? (ownExisting?.name ?? ownProject) : null, p_kinds: kinds, p_own_only: false,
      p_personal: personal, p_health: health,
    });
    if (e || !data) { setBusy(false); return setError("Das hat nicht geklappt. Bitte noch einmal versuchen."); }
    void reload();
    back(req.redirect, { code: data as string, state: req.state });
  };
  const deny = () => back(req.redirect, { error: "access_denied", state: req.state });
  const row = "flex items-center justify-between gap-3 py-3 text-[14px]";
  const chip = (on: boolean) => `inline-flex h-9 items-center gap-2 rounded-full border px-3.5 text-[13px] font-semibold ${on ? "border-fg bg-fg text-canvas" : "border-card-line bg-surface"}`;

  return (
    <div className="mx-auto max-w-xl space-y-4 pb-10">
      <div className="flex flex-col items-center gap-3 pt-4 text-center">
        <span className="flex items-center gap-3">
          <AppIcon name={app!.name} homepage={app!.homepage} size={56} />
          <ArrowLeftRight size={18} className="text-muted" />
          <LogoMark size={56} />
        </span>
        <h1 className="text-[22px] leading-7 font-[650] tracking-tight"><b>{app!.name}</b> möchte sich mit deinem Lifevault verbinden</h1>
        {app!.description && <p className="max-w-md text-[14px] text-muted">{app!.description}</p>}
        {app!.homepage && <a href={app!.homepage} target="_blank" rel="noreferrer noopener" className="text-[13px] font-semibold text-selected hover:underline">{new URL(app!.homepage).host}</a>}
        {grant && <span className="inline-flex items-center gap-1.5 rounded-full bg-positive/10 px-3 py-1 text-[12.5px] font-semibold text-positive-text"><Check size={14} /> Schon verbunden – du kannst die Freigabe hier anpassen</span>}
      </div>

      <section className={`${CARD} divide-y divide-line px-5`}>
        <label className={row}><span><b>Lesen</b><span className="block text-[12px] text-muted">Dokumente suchen und abrufen (Beträge, Fristen, Vertragsdaten)</span></span><Switch on={read} onChange={setRead} label="Lesen" /></label>
        <label className={row}><span><b>Ablegen</b><span className="block text-[12px] text-muted">Neue Dokumente hochladen – Lifevault liest sie aus und sortiert sie ein</span></span><Switch on={write} onChange={setWrite} label="Ablegen" /></label>
      </section>

      <section className={`${CARD} space-y-3 p-5`}>
        <h2 className="text-[14px] font-semibold">Welche Dokumente?</h2>
        <label className="flex items-center justify-between gap-3 text-[14px]"><b>Alle Arten</b><Switch on={kinds === null} onChange={(v) => setKinds(v ? null : req.kinds ?? ["rechnung"])} label="Alle Arten" /></label>
        {kinds !== null && (
          <div className="flex flex-wrap gap-2">
            {KINDS.map((k) => <button key={k.id} type="button" onClick={() => setKinds(toggle(kinds, k.id))} className={chip(kinds.includes(k.id))}>{kinds.includes(k.id) && <Check size={13} />}{k.short}</button>)}
          </div>
        )}
      </section>

      <section className={`${CARD} space-y-3 p-5`}>
        <h2 className="text-[14px] font-semibold">Aus welchen Projekten?</h2>
        <div className="flex flex-wrap gap-2">
          {projects.filter((p) => p.id !== grant?.own_project).map((p) => {
            const on = p.all_apps || projectIds.includes(p.id);
            return <button key={p.id} type="button" disabled={p.all_apps && !p.is_default} onClick={() => setProjectIds(toggle(projectIds, p.id))} className={chip(on)}><Dot color={p.color} size={8} /> {p.name}</button>;
          })}
        </div>
        <div className="rounded-xl border border-card-line p-3.5">
          <label className="flex items-center justify-between gap-3 text-[14px]">
            <span className="flex items-center gap-2"><FolderPlus size={16} className="text-muted" /><span><b>Eigenes Projekt für {app!.name}</b><span className="block text-[12px] text-muted">Hier landet alles, was {app!.name} ablegt – so siehst du sofort, was woher kam.</span></span></span>
            <Switch on={useOwn} onChange={setUseOwn} label="Eigenes Projekt" />
          </label>
          {useOwn && (ownExisting
            ? <p className="mt-2 flex items-center gap-2 text-[13px] text-soft"><Dot color={ownExisting.color} size={8} /> {ownExisting.name} (besteht schon)</p>
            : <input value={ownProject} onChange={(e) => setOwnProject(e.target.value)} maxLength={80} aria-label="Name des Projekts" className="mt-2.5 h-10 w-full rounded-xl border border-card-line bg-surface px-3 text-[14px] outline-none focus:border-brand-500" />)}
        </div>
      </section>

      <section className={`${CARD} divide-y divide-line px-5`}>
        <label className={row}><span><b>Persönliche Daten</b><span className="block text-[12px] text-muted">Name, Adresse, IBAN, Kunden- und Versichertennummern. Aus: werden entfernt.</span></span><Switch on={personal} onChange={setPersonal} label="Persönliche Daten" /></label>
        <label className={row}><span><b>Gesundheit</b><span className="block text-[12px] text-muted">Arztbriefe, Befunde, Rezepte. Aus: für die App unsichtbar.</span></span><Switch on={health} onChange={setHealth} label="Gesundheit" /></label>
        <p className="flex items-start gap-2 py-3 text-[12.5px] text-muted"><ShieldCheck size={15} className="mt-0.5 shrink-0 text-positive" /> Tresor-Dokumente sind Ende-zu-Ende verschlüsselt und für keine App lesbar. {app!.name} sieht nie dein Passwort. Jeder Zugriff wird protokolliert, und du kannst die Verbindung unter Einstellungen › Verbundene Apps jederzeit trennen.</p>
      </section>

      {error && <p role="alert" className="rounded-xl bg-negative/10 px-3.5 py-2.5 text-sm text-negative-text">{error}</p>}
      <div className="flex gap-2">
        <button type="button" onClick={deny} disabled={busy} className="h-12 flex-1 rounded-full border border-card-line bg-surface text-[15px] font-semibold hover:bg-surface-2">Ablehnen</button>
        <button type="button" onClick={() => void approve()} disabled={busy} className="flex h-12 flex-[2] items-center justify-center gap-2 rounded-full bg-brand-500 text-[15px] font-semibold text-white shadow-[0_8px_24px_rgba(109,74,255,.3)] hover:bg-brand-600 disabled:opacity-70">
          {busy ? <Loader2 size={18} className="animate-spin" /> : <Link2 size={18} />} {grant ? "Speichern und weiter" : "Verbinden"}
        </button>
      </div>
      <p className="text-center text-[12px] text-muted">Weiter geht es zurück zu {new URL(req.redirect).host}.</p>
    </div>
  );
}
