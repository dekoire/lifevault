"use client";
import { use, useEffect, useState } from "react";
import { Check, ChevronDown, Search } from "lucide-react";
import { SenderLogo } from "@/components/SenderLogo";
import { BackLink, CARD, PageHeader, Switch } from "@/components/ui";
import { useMe, type DocSections } from "@/lib/me";
import { authFetch, supabase, useSession } from "@/lib/supabase";

const TITLES: Record<string, string> = { benutzer: "Benutzer", sicherheit: "Zwei-Faktor", dokumente: "Dokumentansicht", ki: "KI-Modelle" };

export default function AdminSection({ params }: { params: Promise<{ section: string }> }) {
  const { section } = use(params);
  const { isAdmin } = useMe();
  if (!isAdmin) return <p className="py-20 text-center text-muted">Nur für Admins.</p>;
  return (
    <>
      <BackLink href="/admin" label="Admin" />
      <PageHeader title={TITLES[section] ?? "Admin"} />
      <div className={`space-y-4 ${section === "ki" ? "w-full" : "max-w-4xl"}`}>
        {section === "benutzer" && <Users />}
        {section === "sicherheit" && <MfaPolicy />}
        {section === "dokumente" && <DocView />}
        {section === "ki" && <AiModels />}
      </div>
    </>
  );
}

type Profile = { id: string; email: string | null; is_admin: boolean; created_at: string; last_sign_in_at: string | null };
const when = (iso?: string | null) => (iso ? new Date(iso).toLocaleString("de-DE", { dateStyle: "medium", timeStyle: "short" }) : "–");

function Users() {
  const session = useSession();
  const [rows, setRows] = useState<Profile[]>([]);
  const load = async () => { const { data } = await supabase.from("profiles").select("id,email,is_admin,created_at,last_sign_in_at").order("last_sign_in_at", { ascending: false, nullsFirst: false }); setRows((data as Profile[]) ?? []); };
  useEffect(() => { void load(); }, []);
  const setAdmin = async (p: Profile, v: boolean) => {
    const { error } = await supabase.from("profiles").update({ is_admin: v }).eq("id", p.id);
    if (error) alert(error.message);
    void load();
  };
  return (
    <section className={`${CARD} overflow-hidden`}>
      <div className="flex items-center justify-between px-5 py-4"><h2 className="text-[16px] font-semibold">{rows.length} {rows.length === 1 ? "Benutzer" : "Benutzer"}</h2></div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[560px] text-[14px]">
          <thead className="border-y border-line bg-surface-2 text-left text-[12px] text-muted"><tr><th className="px-5 py-2.5 font-medium">E-Mail</th><th className="px-3 py-2.5 font-medium">Registriert</th><th className="px-3 py-2.5 font-medium">Zuletzt angemeldet</th><th className="px-5 py-2.5 text-right font-medium">Admin</th></tr></thead>
          <tbody className="divide-y divide-line">
            {rows.map((p) => (
              <tr key={p.id}>
                <td className="px-5 py-3 font-medium">{p.email}{p.id === session?.user.id && <span className="ml-2 rounded-full border border-card-line px-3 py-2 text-[12px] leading-4 text-soft">du</span>}</td>
                <td className="px-3 py-3 text-muted">{when(p.created_at)}</td>
                <td className="px-3 py-3 text-muted">{when(p.last_sign_in_at)}</td>
                <td className="px-5 py-3"><span className="flex justify-end"><Switch on={p.is_admin} onChange={(v) => void setAdmin(p, v)} label={`Admin ${p.email}`} disabled={p.id === session?.user.id} /></span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function MfaPolicy() {
  const { settings, reload } = useMe();
  const set = async (v: boolean) => {
    if (v && !confirm("Zwei-Faktor für alle vorschreiben? Wer noch keinen Authenticator hat, muss ihn beim nächsten Öffnen einrichten.")) return;
    const { error } = await supabase.from("app_settings").update({ mfa_required: v, updated_at: new Date().toISOString() }).eq("id", 1);
    if (error) alert(error.message);
    await reload();
  };
  return (
    <section className={`${CARD} flex items-center justify-between gap-4 p-5`}>
      <span><b className="text-[15px]">Zwei-Faktor für alle vorschreiben</b><span className="mt-0.5 block text-[13px] text-muted">An: Ohne Code aus der Authenticator-App kommt niemand an Dokumente – auch die Datenbank lässt sonst nichts heraus. Aus: freiwillig in den Einstellungen.</span></span>
      <Switch on={settings.mfa_required} onChange={(v) => void set(v)} label="Zwei-Faktor vorschreiben" />
    </section>
  );
}

const SECTIONS: { id: keyof DocSections; label: string; text: string }[] = [
  { id: "summary", label: "Zusammenfassung", text: "2–3 Sätze oben" },
  { id: "info", label: "Überblick", text: "Art, Absender, Datum, Eingang, Bereich, Datei" },
  { id: "facts", label: "Fakten in Gruppen", text: "z. B. Persönliche Daten, Bezüge, Abzüge, Gültigkeit" },
  { id: "deadlines", label: "Fristen & Termine", text: "" },
  { id: "amounts", label: "Beträge", text: "" },
  { id: "tags", label: "Schlagworte", text: "im Überblick" },
  { id: "content", label: "Vollständiger Text", text: "zum Aufklappen" },
  { id: "original", label: "Original-Vorschau", text: "Foto bzw. PDF" },
  { id: "chat", label: "Chat zum Dokument", text: "Fragen zu genau diesem Dokument" },
];

function DocView() {
  const { settings, reload } = useMe();
  const set = async (id: keyof DocSections, v: boolean) => {
    const { error } = await supabase.from("app_settings").update({ doc_sections: { ...settings.doc_sections, [id]: v }, updated_at: new Date().toISOString() }).eq("id", 1);
    if (error) alert(error.message);
    await reload();
  };
  return (
    <section className={CARD}>
      <p className="px-5 pt-5 pb-2 text-[13px] text-muted">Was in der Ansicht eines Dokuments zu sehen ist – gilt für alle Benutzer.</p>
      <ul className="divide-y divide-line">
        {SECTIONS.map((s) => (
          <li key={s.id} className="flex items-center justify-between gap-3 px-5 py-3.5">
            <span><b className="text-[14px]">{s.label}</b>{s.text && <span className="block text-[12px] text-muted">{s.text}</span>}</span>
            <Switch on={settings.doc_sections[s.id]} onChange={(v) => void set(s.id, v)} label={s.label} />
          </li>
        ))}
      </ul>
    </section>
  );
}

const TASKS: { id: string; label: string; text: string }[] = [
  { id: "mail", label: "Mail-Vorprüfung", text: "Entscheidet beim E-Mail-Import, welche Anhänge relevant sind – viele kleine Aufrufe, günstig wählen" },
  { id: "classify", label: "Einordnen & Archiv", text: "Prüft, ob neue Dokumente ältere ersetzen" },
  { id: "read", label: "Dokumente auslesen", text: "Liest PDFs/Fotos und füllt Fakten, Fristen, Beträge – Qualität zählt" },
  { id: "chat", label: "Chat & Recherche", text: "Antworten im Chat" },
  { id: "profile", label: "Lebensprofil", text: "Erstellt das Profil und den Verlauf" },
];
type GwModel = { id: string; name: string; input: number | null; output: number | null };
// Anbieter → Webadresse fürs Logo (über /api/logo)
const PROVIDER_DOMAIN: Record<string, string> = {
  anthropic: "anthropic.com", openai: "openai.com", google: "google.com", xai: "x.ai", mistral: "mistral.ai", meta: "meta.com",
  deepseek: "deepseek.com", cohere: "cohere.com", amazon: "aws.amazon.com", perplexity: "perplexity.ai", alibaba: "alibabacloud.com",
  moonshotai: "moonshot.ai", zai: "z.ai", vercel: "vercel.com", inception: "inceptionlabs.ai", morph: "morphllm.com", meituan: "meituan.com", minimax: "minimax.io",
};
const providerOf = (id: string) => id.split("/")[0] ?? "";
const ModelLogo = ({ id, size = 28 }: { id: string; size?: number }) => <SenderLogo domain={PROVIDER_DOMAIN[providerOf(id)]} sender={providerOf(id)} size={size} />;

/** Modell wählen: Knopf mit Logo, Name und Preis; aufgeklappt Suche und Liste nach Anbieter */
function ModelPick({ value, models, standard, onPick }: { value: string; models: GwModel[]; standard: string; onPick: (id: string) => void }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const cur = models.find((x) => x.id === value);
  const term = q.trim().toLowerCase();
  const list = models.filter((x) => !term || `${x.id} ${x.name}`.toLowerCase().includes(term));
  const cost = (x?: GwModel) => (x && x.input !== null ? `$${x.input} / $${x.output}` : "Preis unbekannt");
  const pick = (id: string) => { onPick(id); setOpen(false); setQ(""); };
  return (
    <span className="relative block">
      <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} className="flex h-12 w-full items-center gap-2.5 rounded-2xl border border-card-line bg-surface pr-3 pl-2.5 text-left hover:bg-surface-2">
        <ModelLogo id={value} />
        <span className="min-w-0 flex-1"><b className="block truncate text-[14px] leading-5">{value.split("/").slice(1).join("/") || value}</b><span className="block truncate text-[12px] text-muted">{providerOf(value)} · {cost(cur)}{value === standard ? " · Standard" : ""}</span></span>
        <ChevronDown size={16} className={`shrink-0 text-muted transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <>
          <button type="button" aria-label="Schließen" onClick={() => setOpen(false)} className="fixed inset-0 z-10 cursor-default" />
          <span className="absolute right-0 left-0 z-20 mt-1.5 block overflow-hidden rounded-2xl border border-card-line bg-surface shadow-[0_16px_40px_rgba(16,24,40,.16)]">
            <label className="m-2 flex h-10 items-center gap-2 rounded-full bg-surface-2 px-3.5">
              <Search size={15} className="text-muted" />
              <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Modell oder Anbieter suchen, z. B. sonnet, gpt, gemini" className="min-w-0 flex-1 bg-transparent text-[14px] outline-none placeholder:text-muted" />
            </label>
            <span className="block max-h-80 overflow-y-auto px-1.5 pb-1.5">
              {list.map((x, i) => (
                <span key={x.id} className="block">
                  {providerOf(x.id) !== providerOf(list[i - 1]?.id ?? "") && <span className="block px-2.5 pt-2.5 pb-1 text-[11px] font-semibold tracking-wide text-muted uppercase">{providerOf(x.id)}</span>}
                  <button type="button" onClick={() => pick(x.id)} className={`flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left hover:bg-surface-2 ${x.id === value ? "bg-surface-2" : ""}`}>
                    <ModelLogo id={x.id} size={24} />
                    <span className="min-w-0 flex-1 truncate text-[14px] font-medium">{x.id.split("/").slice(1).join("/")}{x.id === standard && <span className="ml-1.5 rounded-full border border-card-line px-3 text-[12px] font-semibold text-soft">Standard</span>}</span>
                    <span className="tnum shrink-0 text-[12px] text-muted">{cost(x)}</span>
                    {x.id === value && <Check size={15} className="shrink-0" />}
                  </button>
                </span>
              ))}
              {!list.length && <span className="block px-3 py-3 text-[13px] text-muted">Kein Modell gefunden.</span>}
            </span>
          </span>
        </>
      )}
    </span>
  );
}

const price = (m?: GwModel) => (m && m.input !== null ? `$${m.input} / $${m.output} pro 1 Mio. Tokens (Ein/Aus)` : "Preis unbekannt");

function AiModels() {
  const [data, setData] = useState<{ defaults: Record<string, string>; models: GwModel[] }>();
  const [chosen, setChosen] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState<string>();
  useEffect(() => {
    void authFetch("/api/models").then((r) => r.json()).then(setData);
    void supabase.from("app_settings").select("ai_models").eq("id", 1).maybeSingle().then(({ data }) => setChosen((data?.ai_models as Record<string, string>) ?? {}));
  }, []);
  const save = async (task: string, model: string) => {
    const next = { ...chosen };
    if (!model || model === data?.defaults[task]) delete next[task]; else next[task] = model;
    const { error } = await supabase.from("app_settings").update({ ai_models: next, updated_at: new Date().toISOString() }).eq("id", 1);
    if (error) { alert(error.message); return; }
    setChosen(next);
    setSaved(task);
    setTimeout(() => setSaved(undefined), 1500);
  };
  if (!data) return <p className="text-[14px] text-muted">Lädt Modelle …</p>;
  const byProvider = [...data.models].sort((a, b) => a.id.localeCompare(b.id));
  return (
    <section className={CARD}>
      <p className="px-5 pt-5 pb-2 text-[13px] text-muted">Welches Modell welche Aufgabe übernimmt – gilt für alle Benutzer, wirkt nach spätestens einer Minute. Fällt ein gewähltes Modell aus, springt der Standard ein. Alle Modelle laufen über das Vercel AI Gateway, ohne Training mit deinen Daten.</p>
      <ul className="divide-y divide-line">
        {TASKS.map((t) => {
          const current = chosen[t.id] ?? data.defaults[t.id];
          const m = data.models.find((x) => x.id === current);
          return (
            <li key={t.id} className="flex flex-col gap-2 px-5 py-4 md:flex-row md:items-center md:gap-4">
              <span className="min-w-0 flex-1"><b className="text-[14px]">{t.label}</b>{saved === t.id && <span className="ml-2 text-[12px] font-semibold text-positive-text">gespeichert</span>}<span className="block text-[12px] text-muted">{t.text}</span></span>
              <span className="flex w-full flex-col gap-1 md:w-[28rem]">
                <ModelPick value={current} models={byProvider} standard={data.defaults[t.id]} onPick={(id) => void save(t.id, id)} />
                <span className="px-3 text-[12px] text-muted">{price(m)}{chosen[t.id] && <> · <button type="button" onClick={() => void save(t.id, "")} className="font-semibold text-selected">Standard ({data.defaults[t.id]})</button></>}</span>
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
