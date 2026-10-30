"use client";
import { useEffect, useState } from "react";
import { Ban, Check, Copy, History, KeyRound, Loader2, Plus, RotateCw, ShieldAlert, Trash2 } from "lucide-react";
import { Dot } from "@/components/ProjectSwitcher";
import { CARD, ICON_BTN, Switch } from "@/components/ui";
import { CLUSTERS } from "@/lib/clusters";
import { KINDS } from "@/lib/kinds";
import { AppIcon } from "@/components/AppIcon";
import { ConnectDocs } from "@/components/settings/ConnectDocs";
import { useProjects } from "@/lib/projects";
import { supabase } from "@/lib/supabase";

type Client = {
  id: string; name: string; client_id: string; can_read: boolean; can_write: boolean; all_projects: boolean; project_ids: string[]; clusters: string[] | null;
  allow_personal: boolean; allow_health: boolean; allow_full_text: boolean; expires_at: string | null; revoked_at: string | null; last_used_at: string | null; created_at: string;
  /** über „Mit Lifevault verbinden“ (OAuth) entstanden */ app_id: string | null; own_project: string | null; kinds: string[] | null;
};
type Audit = { at: string; action: string; detail: string | null };

const field = "h-11 w-full rounded-xl border border-card-line bg-surface px-3.5 text-[15px] outline-none focus:border-brand-500";
const when = (iso?: string | null) => (iso ? new Date(iso).toLocaleString("de-DE", { dateStyle: "medium", timeStyle: "short" }) : "nie");

/** Zufällige Zugangsdaten im Browser erzeugen; gespeichert wird nur der Hash des Geheimnisses */
const rand = (n: number, alphabet: string) => Array.from(crypto.getRandomValues(new Uint8Array(n)), (b) => alphabet[b % alphabet.length]).join("");
const newClientId = () => `lv_${rand(24, "abcdefghijklmnopqrstuvwxyz0123456789")}`;
const newSecret = () => `lvs_${btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32)))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")}`;
const sha256 = async (s: string) => Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s))), (b) => b.toString(16).padStart(2, "0")).join("");

/** Verbundene Apps (API & MCP): registrieren, Rechte festlegen, Zugang erneuern oder widerrufen, Protokoll ansehen */
export function ApiSettings() {
  const [clients, setClients] = useState<Client[]>();
  const [creating, setCreating] = useState(false);
  const [shown, setShown] = useState<{ name: string; clientId: string; secret: string }>();
  const [homes, setHomes] = useState<Record<string, string | null>>({});
  const load = async () => {
    const [{ data }, { data: apps }] = await Promise.all([supabase.from("api_clients").select("*").order("created_at", { ascending: false }), supabase.rpc("oauth_my_apps")]);
    setClients((data as Client[]) ?? []);
    setHomes(Object.fromEntries(((apps as { app_id: string; homepage: string | null }[] | null) ?? []).map((a) => [a.app_id, a.homepage])));
  };
  useEffect(() => { void load(); }, []);

  const rotate = async (c: Client) => {
    if (!confirm(`Neues Geheimnis für „${c.name}“ erzeugen? Das alte funktioniert dann nicht mehr.`)) return;
    const secret = newSecret();
    const { error } = await supabase.from("api_clients").update({ secret_hash: await sha256(secret) }).eq("id", c.id);
    if (error) return alert(error.message);
    setShown({ name: c.name, clientId: c.client_id, secret });
  };
  const revoke = async (c: Client) => {
    if (!confirm(c.app_id ? `Verbindung mit „${c.name}“ trennen? Die App kommt sofort nicht mehr an deine Daten.` : `Zugang für „${c.name}“ sofort sperren?`)) return;
    await supabase.from("api_clients").update({ revoked_at: new Date().toISOString() }).eq("id", c.id);
    void load();
  };
  const remove = async (c: Client) => {
    if (!confirm(`„${c.name}“ endgültig löschen (inkl. Protokoll)?`)) return;
    await supabase.from("api_clients").delete().eq("id", c.id);
    void load();
  };

  return (
    <>
      <p className="text-[14px] leading-6 text-soft">Hier verbindest du andere Apps (z. B. Finastry, eine Steuer-App) oder einen KI-Agenten. Jede App bekommt eigene Zugangsdaten und nur die Projekte, Bereiche und Daten, die du freigibst. Jeder Zugriff wird protokolliert, und du kannst den Zugang jederzeit sperren.</p>
      {shown && <Credentials {...shown} onClose={() => { setShown(undefined); void load(); }} />}
      {creating ? <ClientForm onCancel={() => setCreating(false)} onCreated={(x) => { setCreating(false); setShown(x); void load(); }} /> : !shown && (
        <button type="button" onClick={() => setCreating(true)} className="inline-flex h-11 items-center gap-2 rounded-full bg-brand-500 px-5 text-[14px] font-semibold text-white hover:bg-brand-600"><Plus size={17} /> App verbinden</button>
      )}
      {clients === undefined ? <Loader2 className="animate-spin text-muted" /> : clients.length === 0 ? null : (
        <section className={`${CARD} divide-y divide-line`}>
          {clients.map((c) => <ClientRow key={c.id} c={c} homepage={c.app_id ? homes[c.app_id] : undefined} onRotate={() => void rotate(c)} onRevoke={() => void revoke(c)} onRemove={() => void remove(c)} />)}
        </section>
      )}
      <OwnApps />
      <ConnectDocs />
      <ApiDocs />
    </>
  );
}

function ClientRow({ c, homepage, onRotate, onRevoke, onRemove }: { c: Client; homepage?: string | null; onRotate: () => void; onRevoke: () => void; onRemove: () => void }) {
  const { projects } = useProjects();
  const [log, setLog] = useState<Audit[]>();
  const dead = !!c.revoked_at || (!!c.expires_at && c.expires_at < new Date().toISOString());
  const own = c.own_project ? projects.find((p) => p.id === c.own_project) : undefined;
  const scope = c.all_projects ? "Alle Projekte" : [...projects.filter((p) => p.all_apps).map((p) => p.name), ...projects.filter((p) => c.project_ids.includes(p.id) && !p.all_apps && p.id !== c.own_project).map((p) => p.name)].join(", ") || "keine weiteren Projekte";
  const kinds = c.kinds ? c.kinds.map((k) => KINDS.find((x) => x.id === k)?.short ?? k).join(", ") : "alle Arten";
  const pill = "rounded-full border border-card-line px-2 py-0.5 text-[11px] font-semibold text-soft";
  const showLog = async () => {
    if (log) return setLog(undefined);
    const { data } = await supabase.from("api_audit").select("at,action,detail").eq("client", c.id).order("at", { ascending: false }).limit(25);
    setLog((data as Audit[]) ?? []);
  };
  return (
    <div className={`px-5 py-4 ${dead ? "opacity-60" : ""}`}>
      <div className="flex items-start gap-3">
        {c.app_id ? <AppIcon name={c.name} homepage={homepage} size={40} /> : <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-fg text-canvas"><KeyRound size={18} /></span>}
        <span className="min-w-0 flex-1">
          <b className="flex flex-wrap items-center gap-2 text-[15px]">{c.name}{c.revoked_at && <span className="rounded-full bg-negative/10 px-2 py-0.5 text-[11px] text-negative-text">getrennt</span>}{c.app_id && !c.revoked_at && <span className="rounded-full bg-positive/10 px-2 py-0.5 text-[11px] text-positive-text">per Anmeldung verbunden</span>}</b>
          {!c.app_id && <code className="block truncate text-[12px] text-muted">{c.client_id}</code>}
          <span className="mt-2 flex flex-wrap gap-1.5">
            {c.can_read && <span className={pill}>Lesen</span>}{c.can_write && <span className={pill}>Hochladen</span>}
            {own && <span className={pill}>Eigenes Projekt: {own.name}</span>}
            <span className={pill}>{scope}</span>
            <span className={pill}>{kinds}</span>
            <span className={pill}>{c.clusters ? `${c.clusters.length} Bereiche` : "Alle Bereiche"}</span>
            <span className={pill}>{c.allow_personal ? "mit persönlichen Daten" : "ohne persönliche Daten"}</span>
            <span className={pill}>{c.allow_health ? "mit Gesundheit" : "ohne Gesundheit"}</span>
            {c.allow_personal && c.allow_full_text && <span className={pill}>Volltext</span>}
          </span>
          <span className="mt-1.5 block text-[12px] text-muted">Zuletzt genutzt: {when(c.last_used_at)}{c.expires_at ? ` · gültig bis ${when(c.expires_at)}` : ""}</span>
        </span>
        <span className="flex shrink-0 gap-1.5">
          <button type="button" onClick={() => void showLog()} aria-label="Protokoll" title="Protokoll" className={ICON_BTN}><History size={16} /></button>
          {!c.revoked_at && !c.app_id && <button type="button" onClick={onRotate} aria-label="Neues Geheimnis" title="Neues Geheimnis" className={ICON_BTN}><RotateCw size={16} /></button>}
          {!c.revoked_at && <button type="button" onClick={onRevoke} aria-label={c.app_id ? "Trennen" : "Sperren"} title={c.app_id ? "Verbindung trennen" : "Sperren"} className={ICON_BTN}><Ban size={16} /></button>}
          <button type="button" onClick={onRemove} aria-label="Löschen" title="Löschen" className={`${ICON_BTN} hover:text-negative-text`}><Trash2 size={16} /></button>
        </span>
      </div>
      {log && (
        <ul className="mt-3 max-h-64 overflow-auto rounded-xl border border-line text-[12px]">
          {log.length ? log.map((l, i) => <li key={i} className="flex gap-3 border-b border-line px-3 py-1.5 last:border-0"><span className="tnum text-muted">{when(l.at)}</span><b className="font-semibold">{l.action}</b><span className="truncate text-muted">{l.detail}</span></li>) : <li className="px-3 py-2 text-muted">Noch keine Zugriffe.</li>}
        </ul>
      )}
    </div>
  );
}

function ClientForm({ onCancel, onCreated }: { onCancel: () => void; onCreated: (x: { name: string; clientId: string; secret: string }) => void }) {
  const { projects } = useProjects();
  const [name, setName] = useState("");
  const [read, setRead] = useState(true);
  const [write, setWrite] = useState(false);
  const [allProjects, setAllProjects] = useState(false);
  const [projectIds, setProjectIds] = useState<string[]>([]);
  const [clusters, setClusters] = useState<string[] | null>(null);
  const [personal, setPersonal] = useState(false);
  const [health, setHealth] = useState(false);
  const [fullText, setFullText] = useState(false);
  const [days, setDays] = useState(365);
  const [busy, setBusy] = useState(false);
  const toggle = <T,>(list: T[], v: T) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!read && !write) return alert("Wähle mindestens Lesen oder Hochladen.");
    setBusy(true);
    const clientId = newClientId();
    const secret = newSecret();
    const { error } = await supabase.from("api_clients").insert({
      name: name.trim(), client_id: clientId, secret_hash: await sha256(secret), can_read: read, can_write: write,
      all_projects: allProjects, project_ids: allProjects ? [] : projectIds, clusters,
      allow_personal: personal, allow_health: health, allow_full_text: personal && fullText,
      expires_at: days ? new Date(Date.now() + days * 864e5).toISOString() : null,
    });
    setBusy(false);
    if (error) return alert(error.message);
    onCreated({ name: name.trim(), clientId, secret });
  };

  const row = "flex items-center justify-between gap-3 py-2.5 text-[14px]";
  return (
    <form onSubmit={submit} className={`${CARD} space-y-5 p-5`}>
      <label className="block"><span className="mb-1.5 block text-[13px] font-semibold text-soft">Name der App</span><input required maxLength={80} value={name} onChange={(e) => setName(e.target.value)} placeholder="z. B. Finastry" className={field} autoFocus /></label>

      <fieldset><legend className="mb-1 text-[13px] font-semibold text-soft">Was darf die App?</legend>
        <div className="divide-y divide-line">
          <label className={row}><span><b>Lesen</b><span className="block text-[12px] text-muted">Dokumente suchen und abrufen</span></span><Switch on={read} onChange={setRead} label="Lesen" /></label>
          <label className={row}><span><b>Hochladen</b><span className="block text-[12px] text-muted">Neue Dokumente ablegen (werden sofort ausgelesen)</span></span><Switch on={write} onChange={setWrite} label="Hochladen" /></label>
        </div>
      </fieldset>

      <fieldset><legend className="mb-2 text-[13px] font-semibold text-soft">Projekte</legend>
        <label className={row}><b>Alle Projekte</b><Switch on={allProjects} onChange={setAllProjects} label="Alle Projekte" /></label>
        {!allProjects && (
          <div className="flex flex-wrap gap-2">
            {projects.map((p) => {
              const on = p.all_apps || projectIds.includes(p.id);
              return (
                <button key={p.id} type="button" disabled={p.all_apps} onClick={() => setProjectIds(toggle(projectIds, p.id))} title={p.all_apps ? "Für alle Apps freigegeben" : undefined}
                  className={`inline-flex h-9 items-center gap-2 rounded-full border px-3.5 text-[13px] font-semibold ${on ? "border-fg bg-fg text-canvas" : "border-card-line bg-surface"} disabled:cursor-default`}>
                  <Dot color={p.color} size={8} /> {p.name}{p.all_apps && " · für alle"}
                </button>
              );
            })}
          </div>
        )}
      </fieldset>

      <fieldset><legend className="mb-2 text-[13px] font-semibold text-soft">Bereiche</legend>
        <label className={row}><b>Alle Bereiche</b><Switch on={clusters === null} onChange={(v) => setClusters(v ? null : [])} label="Alle Bereiche" /></label>
        {clusters !== null && (
          <div className="flex flex-wrap gap-2">
            {CLUSTERS.filter((c) => c.id !== "gesundheit" || health).map((c) => <button key={c.id} type="button" onClick={() => setClusters(toggle(clusters, c.id))} className={`h-9 rounded-full border px-3.5 text-[13px] font-semibold ${clusters.includes(c.id) ? "border-fg bg-fg text-canvas" : "border-card-line bg-surface"}`}>{c.label}</button>)}
          </div>
        )}
      </fieldset>

      <fieldset><legend className="mb-1 text-[13px] font-semibold text-soft">Datenschutz</legend>
        <div className="divide-y divide-line">
          <label className={row}><span><b>Persönliche Daten</b><span className="block text-[12px] text-muted">Name, Adresse, Geburtsdatum, IBAN, Kunden- und Versichertennummern. Aus: werden entfernt (z. B. für Kassenbons).</span></span><Switch on={personal} onChange={setPersonal} label="Persönliche Daten" /></label>
          <label className={row}><span><b>Gesundheit</b><span className="block text-[12px] text-muted">Arztbriefe, Befunde, Rezepte. Aus: Bereich ist für die App unsichtbar.</span></span><Switch on={health} onChange={setHealth} label="Gesundheit" /></label>
          <label className={`${row} ${personal ? "" : "opacity-50"}`}><span><b>Vollständiger Text</b><span className="block text-[12px] text-muted">Nur zusammen mit persönlichen Daten möglich.</span></span><Switch on={personal && fullText} onChange={setFullText} label="Vollständiger Text" disabled={!personal} /></label>
        </div>
      </fieldset>

      <label className="block"><span className="mb-1.5 block text-[13px] font-semibold text-soft">Gültig für</span>
        <select value={days} onChange={(e) => setDays(Number(e.target.value))} className={field}>
          <option value={30}>30 Tage</option><option value={90}>90 Tage</option><option value={365}>1 Jahr</option><option value={0}>unbegrenzt</option>
        </select>
      </label>

      <div className="flex gap-2">
        <button type="submit" disabled={busy || !name.trim()} className="inline-flex h-11 items-center gap-2 rounded-full bg-fg px-5 text-[14px] font-semibold text-canvas disabled:opacity-50">{busy && <Loader2 size={16} className="animate-spin" />} Zugangsdaten erstellen</button>
        <button type="button" onClick={onCancel} className="h-11 rounded-full px-4 text-[14px] font-semibold text-soft hover:bg-surface-2">Abbrechen</button>
      </div>
    </form>
  );
}

function CopyField({ label, value }: { label: string; value: string }) {
  const [done, setDone] = useState(false);
  return (
    <label className="block">
      <span className="mb-1 block text-[12px] font-semibold text-soft">{label}</span>
      <span className="flex items-center gap-2 rounded-xl border border-card-line bg-surface-2 py-1.5 pr-1.5 pl-3">
        <code className="min-w-0 flex-1 truncate text-[13px]">{value}</code>
        <button type="button" onClick={() => { void navigator.clipboard.writeText(value); setDone(true); setTimeout(() => setDone(false), 1500); }} className="inline-flex h-8 items-center gap-1.5 rounded-full bg-surface px-3 text-[12px] font-semibold">{done ? <Check size={14} /> : <Copy size={14} />} {done ? "Kopiert" : "Kopieren"}</button>
      </span>
    </label>
  );
}

function Credentials({ name, clientId, secret, onClose }: { name: string; clientId: string; secret: string; onClose: () => void }) {
  const base = typeof location !== "undefined" ? location.origin : "";
  return (
    <section className={`${CARD} space-y-3 border-brand-500/50 p-5`}>
      <h2 className="text-[16px] font-semibold">Zugangsdaten für „{name}“</h2>
      <p className="flex items-start gap-2 rounded-xl bg-[#fff7e6] px-3 py-2.5 text-[13px] text-[#8a5a00]"><ShieldAlert size={16} className="mt-0.5 shrink-0" /> Das Geheimnis wird nur jetzt angezeigt. Trage es direkt in der anderen App ein (dort als geheime Umgebungsvariable), nicht im Code. Verloren? Einfach ein neues erzeugen.</p>
      <CopyField label="Client-ID" value={clientId} />
      <CopyField label="Client-Secret" value={secret} />
      <CopyField label="API-Adresse" value={`${base}/api/v1`} />
      <CopyField label="MCP-Adresse" value={`${base}/api/mcp`} />
      <button type="button" onClick={onClose} className="h-11 rounded-full bg-fg px-5 text-[14px] font-semibold text-canvas">Fertig, gespeichert</button>
    </section>
  );
}

function ApiDocs() {
  const base = typeof location !== "undefined" ? location.origin : "https://…";
  const code = "block overflow-x-auto whitespace-pre rounded-xl bg-[#14121f] p-3.5 text-[12px] leading-5 text-[#e9e6ff]";
  return (
    <details className={`${CARD} p-5`}>
      <summary className="cursor-pointer text-[15px] font-semibold">So nutzt eine App die Schnittstelle</summary>
      <div className="mt-4 space-y-4 text-[13px] leading-6 text-soft">
        <p><b>1. Token holen</b> (OAuth2 Client Credentials, gilt 1 Stunde):</p>
        <code className={code}>{`curl -X POST ${base}/api/v1/token \\
  -d grant_type=client_credentials \\
  -d client_id=$LIFEVAULT_CLIENT_ID \\
  -d client_secret=$LIFEVAULT_CLIENT_SECRET`}</code>
        <p><b>2. Daten abrufen</b> – mit <code>Authorization: Bearer &lt;token&gt;</code>:</p>
        <code className={code}>{`GET  ${base}/api/v1/me                 # Rechte & Projekte
GET  ${base}/api/v1/projects
GET  ${base}/api/v1/documents?q=Telekom&cluster=rechnungen&since=2026-01-01
GET  ${base}/api/v1/documents/<id>
POST ${base}/api/v1/documents          # multipart: file, project_id
GET  ${base}/api/v1/documents/changes?cursor=…   # nur Änderungen seit der Lesemarke
PUT  ${base}/api/v1/webhook            # { url, secret }: Stups bei Änderungen`}</code>
        <p><b>3. MCP</b> für KI-Agenten (z. B. Claude): Server-Adresse <code>{base}/api/mcp</code>, Header <code>Authorization: Bearer &lt;client_id&gt;:&lt;client_secret&gt;</code>. Werkzeuge: whoami, list_projects, search_documents, get_document, upload_document.</p>
        <p>Grenzen: 120 Anfragen pro Minute, 60 Uploads pro Stunde, Dateien bis 4 MB. Original-Dateien aus der API übernimmt Lifevault beim nächsten Öffnen der App in deinen Speicher.</p>
      </div>
    </details>
  );
}

/* ---------- Eigene App registrieren (für „Mit Lifevault verbinden“) ---------- */
type OAuthApp = { id: string; name: string; description: string | null; homepage: string | null; client_id: string; redirect_uris: string[]; revoked_at: string | null; created_at: string };
const newAppId = () => `lva_${rand(24, "abcdefghijklmnopqrstuvwxyz0123456789")}`;

/**
 * Wer eine App baut (z. B. Finastry), registriert sie hier einmal: Name, Rückleitungs-Adresse(n) → Client-ID und Geheimnis.
 * Danach können sich beliebige Lifevault-Nutzer über die Freigabe-Seite (/connect) mit dieser App verbinden – jeder
 * entscheidet selbst, was sie sehen darf. Das Geheimnis gehört nur auf den Server der App.
 */
function OwnApps() {
  const [apps, setApps] = useState<OAuthApp[]>();
  const [open, setOpen] = useState(false);
  const [shown, setShown] = useState<{ name: string; clientId: string; secret: string; redirect: string }>();
  const [name, setName] = useState("");
  const [homepage, setHomepage] = useState("");
  const [description, setDescription] = useState("");
  const [redirects, setRedirects] = useState("");
  const [busy, setBusy] = useState(false);
  const load = async () => { const { data } = await supabase.from("oauth_apps").select("id,name,description,homepage,client_id,redirect_uris,revoked_at,created_at").order("created_at", { ascending: false }); setApps((data as OAuthApp[]) ?? []); };
  useEffect(() => { void load(); }, []);

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    const uris = redirects.split(/[\s,]+/).map((u) => u.trim()).filter(Boolean);
    if (!uris.length) return alert("Mindestens eine Rückleitungs-Adresse (https://…) angeben.");
    setBusy(true);
    const clientId = newAppId(), secret = newSecret();
    const { error } = await supabase.from("oauth_apps").insert({ name: name.trim(), description: description.trim() || null, homepage: homepage.trim() || null, client_id: clientId, secret_hash: await sha256(secret), redirect_uris: uris });
    setBusy(false);
    if (error) return alert(error.message.includes("Rückleitungs") ? error.message : `Speichern hat nicht geklappt: ${error.message}`);
    setOpen(false); setName(""); setHomepage(""); setDescription(""); setRedirects("");
    setShown({ name: name.trim(), clientId, secret, redirect: uris[0] });
    void load();
  };
  const rotate = async (a: OAuthApp) => {
    if (!confirm(`Neues Geheimnis für „${a.name}“? Das alte funktioniert dann sofort nicht mehr – die App muss das neue bekommen.`)) return;
    const secret = newSecret();
    const { error } = await supabase.from("oauth_apps").update({ secret_hash: await sha256(secret) }).eq("id", a.id);
    if (error) return alert(error.message);
    setShown({ name: a.name, clientId: a.client_id, secret, redirect: a.redirect_uris[0] });
  };
  const toggleRevoke = async (a: OAuthApp) => {
    if (!a.revoked_at && !confirm(`„${a.name}“ sperren? Alle Nutzer dieser App verlieren sofort den Zugriff.`)) return;
    await supabase.from("oauth_apps").update({ revoked_at: a.revoked_at ? null : new Date().toISOString() }).eq("id", a.id);
    void load();
  };
  const remove = async (a: OAuthApp) => {
    if (!confirm(`„${a.name}“ endgültig löschen? Alle Verbindungen zu dieser App werden mit gelöscht.`)) return;
    await supabase.from("oauth_apps").delete().eq("id", a.id);
    void load();
  };

  return (
    <section className={`${CARD} space-y-4 p-5`}>
      <div>
        <h2 className="text-[16px] font-semibold">Eigene App anbinden</h2>
        <p className="mt-1 text-[13px] leading-5 text-muted">Für Entwickler: Registriere deine App einmal. Danach erscheint bei Nutzern „Mit Lifevault verbinden“ – sie melden sich bei Lifevault an und geben selbst frei, was deine App sehen darf.</p>
      </div>
      {shown && (
        <div className="space-y-3 rounded-2xl border border-brand-500/50 p-4">
          <h3 className="text-[15px] font-semibold">Zugangsdaten für „{shown.name}“</h3>
          <p className="flex items-start gap-2 rounded-xl bg-[#fff7e6] px-3 py-2.5 text-[13px] text-[#8a5a00]"><ShieldAlert size={16} className="mt-0.5 shrink-0" /> Das Geheimnis wird nur jetzt angezeigt. Trage es nur auf dem Server der App ein (geheime Umgebungsvariable), nie im Browser oder im Code.</p>
          <CopyField label="Client-ID" value={shown.clientId} />
          <CopyField label="Client-Secret" value={shown.secret} />
          <CopyField label="Freigabe-Seite (authorization_endpoint)" value={`${location.origin}/connect`} />
          <CopyField label="Token (token_endpoint)" value={`${location.origin}/api/v1/oauth/token`} />
          <button type="button" onClick={() => setShown(undefined)} className="h-10 rounded-full bg-fg px-4 text-[13px] font-semibold text-canvas">Fertig, gespeichert</button>
        </div>
      )}
      {apps?.length ? (
        <div className="divide-y divide-line rounded-2xl border border-card-line">
          {apps.map((a) => (
            <div key={a.id} className={`flex items-start gap-3 px-4 py-3 ${a.revoked_at ? "opacity-60" : ""}`}>
              <AppIcon name={a.name} homepage={a.homepage} size={36} />
              <span className="min-w-0 flex-1">
                <b className="flex items-center gap-2 text-[14px]">{a.name}{a.revoked_at && <span className="rounded-full bg-negative/10 px-2 py-0.5 text-[11px] text-negative-text">gesperrt</span>}</b>
                <code className="block truncate text-[12px] text-muted">{a.client_id}</code>
                <span className="block truncate text-[12px] text-muted">→ {a.redirect_uris.join(", ")}</span>
              </span>
              <span className="flex shrink-0 gap-1.5">
                <button type="button" onClick={() => void rotate(a)} aria-label="Neues Geheimnis" title="Neues Geheimnis" className={ICON_BTN}><RotateCw size={16} /></button>
                <button type="button" onClick={() => void toggleRevoke(a)} aria-label={a.revoked_at ? "Entsperren" : "Sperren"} title={a.revoked_at ? "Entsperren" : "Sperren"} className={ICON_BTN}><Ban size={16} /></button>
                <button type="button" onClick={() => void remove(a)} aria-label="Löschen" title="Löschen" className={`${ICON_BTN} hover:text-negative-text`}><Trash2 size={16} /></button>
              </span>
            </div>
          ))}
        </div>
      ) : null}
      {open ? (
        <form onSubmit={create} className="space-y-3">
          <label className="block"><span className="mb-1.5 block text-[13px] font-semibold text-soft">Name der App</span><input required maxLength={60} value={name} onChange={(e) => setName(e.target.value)} placeholder="z. B. Finastry" className={field} /></label>
          <label className="block"><span className="mb-1.5 block text-[13px] font-semibold text-soft">Kurzbeschreibung (sieht der Nutzer beim Verbinden)</span><input maxLength={300} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="z. B. Finanz-App: liest Rechnungen und Verträge, legt Belege ab" className={field} /></label>
          <label className="block"><span className="mb-1.5 block text-[13px] font-semibold text-soft">Webseite (https://…)</span><input type="url" value={homepage} onChange={(e) => setHomepage(e.target.value)} placeholder="https://finastry.com" className={field} /></label>
          <label className="block"><span className="mb-1.5 block text-[13px] font-semibold text-soft">Rückleitungs-Adresse(n), je Zeile eine</span><textarea required rows={2} value={redirects} onChange={(e) => setRedirects(e.target.value)} placeholder="https://finastry.com/api/lifevault/callback" className={`${field} h-auto py-2.5`} /></label>
          <div className="flex gap-2">
            <button type="submit" disabled={busy || !name.trim()} className="inline-flex h-11 items-center gap-2 rounded-full bg-fg px-5 text-[14px] font-semibold text-canvas disabled:opacity-50">{busy && <Loader2 size={16} className="animate-spin" />} App registrieren</button>
            <button type="button" onClick={() => setOpen(false)} className="h-11 rounded-full px-4 text-[14px] font-semibold text-soft hover:bg-surface-2">Abbrechen</button>
          </div>
        </form>
      ) : (
        <button type="button" onClick={() => setOpen(true)} className="inline-flex h-10 items-center gap-2 rounded-full border border-card-line bg-surface px-4 text-[13px] font-semibold hover:bg-surface-2"><Plus size={15} /> App registrieren</button>
      )}
    </section>
  );
}
