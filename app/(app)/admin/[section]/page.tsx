"use client";
import { use, useEffect, useState } from "react";
import { BackLink, CARD, PageHeader, Switch } from "@/components/ui";
import { useMe, type DocSections } from "@/lib/me";
import { supabase, useSession } from "@/lib/supabase";

const TITLES: Record<string, string> = { benutzer: "Benutzer", sicherheit: "Zwei-Faktor", dokumente: "Dokumentansicht" };

export default function AdminSection({ params }: { params: Promise<{ section: string }> }) {
  const { section } = use(params);
  const { isAdmin } = useMe();
  if (!isAdmin) return <p className="py-20 text-center text-muted">Nur für Admins.</p>;
  return (
    <>
      <BackLink href="/admin" label="Admin" />
      <PageHeader title={TITLES[section] ?? "Admin"} />
      <div className="max-w-4xl space-y-4">
        {section === "benutzer" && <Users />}
        {section === "sicherheit" && <MfaPolicy />}
        {section === "dokumente" && <DocView />}
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
                <td className="px-5 py-3 font-medium">{p.email}{p.id === session?.user.id && <span className="ml-2 rounded-full border border-card-line px-2 py-0.5 text-[11px] text-soft">du</span>}</td>
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
