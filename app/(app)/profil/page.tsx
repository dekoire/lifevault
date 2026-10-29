"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Briefcase, Car, CircleAlert, HeartPulse, Home, Landmark, Loader2, RefreshCw, ScrollText, ShieldCheck, Sparkles, UserRound, type LucideIcon } from "lucide-react";
import { CARD, PageHeader } from "@/components/ui";
import type { LifeProfile } from "@/app/api/profile/route";
import { useDocs } from "@/lib/docs";
import { authFetch, supabase, useSession } from "@/lib/supabase";

const ICONS: Record<string, LucideIcon> = { person: UserRound, arbeit: Briefcase, wohnen: Home, versicherungen: ShieldCheck, vertraege: ScrollText, finanzen: Landmark, gesundheit: HeartPulse, mobilitaet: Car, offen: CircleAlert };

/** Lebensprofil: was gilt aktuell, was war früher – aus den Dokumenten, mit Quellen */
export default function ProfilPage() {
  const session = useSession();
  const { docs } = useDocs();
  const [profile, setProfile] = useState<LifeProfile | null>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [past, setPast] = useState(false);

  useEffect(() => {
    if (!session) return;
    void supabase.from("life_profiles").select("data").eq("user_id", session.user.id).maybeSingle().then(({ data }) => setProfile((data?.data as LifeProfile) ?? null));
  }, [session]);

  const build = async () => {
    setBusy(true);
    setError(undefined);
    try {
      const res = await authFetch("/api/profile", { method: "POST" });
      const json = await res.json().catch(() => ({ error: `Fehler ${res.status}` }));
      if (!res.ok || json.error) throw new Error(json.error ?? `Fehler ${res.status}`);
      setProfile(json as LifeProfile);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const titleOf = (id: string) => docs.find((d) => d.id === id)?.title;
  const ready = docs.filter((d) => d.status === "ready").length;
  const newer = profile ? ready - profile.docCount : 0;

  return (
    <>
      <PageHeader
        title="Dein Profil"
        subtitle="Was aktuell gilt – aus deinen Unterlagen zusammengestellt"
        action={<button type="button" onClick={() => void build()} disabled={busy || !ready} className="inline-flex h-10 items-center gap-2 rounded-full bg-fg px-4 text-[14px] font-semibold text-canvas disabled:opacity-50">{busy ? <Loader2 size={16} className="animate-spin" /> : profile ? <RefreshCw size={16} /> : <Sparkles size={16} />} {profile ? "Aktualisieren" : "Profil erstellen"}</button>}
      />
      {error && <p role="alert" className="mb-4 rounded-xl bg-negative/10 px-4 py-3 text-[14px] text-negative-text">{error}</p>}
      {profile === undefined ? (
        <div className="grid h-40 place-items-center"><Loader2 className="animate-spin text-muted" /></div>
      ) : !profile ? (
        <section className={`${CARD} p-8 text-center`}>
          <span className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-lavender text-selected"><UserRound size={26} /></span>
          <h2 className="mt-4 text-[18px] font-semibold">Noch kein Profil</h2>
          <p className="mx-auto mt-1 max-w-md text-[14px] text-muted">Die KI liest deine {ready} Dokumente und stellt zusammen: Arbeitgeber, Wohnung, Versicherungen, laufende Verträge, Fahrzeug – und was früher war.</p>
        </section>
      ) : (
        <div className="space-y-4">
          <section className={`${CARD} p-5`}>
            <p className="text-[15px] leading-relaxed">{profile.intro}</p>
            <p className="mt-2 text-[12px] text-muted">Stand {new Date(profile.generatedAt).toLocaleString("de-DE", { dateStyle: "medium", timeStyle: "short" })} · aus {profile.docCount} Dokumenten{newer > 0 && <> · <b className="text-selected">{newer} neue seitdem</b></>}</p>
          </section>
          <label className="flex w-fit items-center gap-2 text-[13px] text-soft"><input type="checkbox" checked={past} onChange={(e) => setPast(e.target.checked)} className="accent-brand-500" /> Frühere Angaben zeigen</label>
          <div className="grid gap-4 lg:grid-cols-2">
            {profile.sections.map((s) => {
              const items = s.items.filter((i) => past || i.status === "aktuell");
              if (!items.length) return null;
              const Icon = ICONS[s.id] ?? UserRound;
              return (
                <section key={s.id} className={`${CARD} overflow-hidden ${s.id === "offen" ? "lg:col-span-2" : ""}`}>
                  <h2 className="flex items-center gap-2.5 px-5 pt-4 pb-2 text-[16px] font-semibold"><span className={`grid h-8 w-8 place-items-center rounded-full ${s.id === "offen" ? "bg-negative/10 text-negative-text" : "bg-lavender text-selected"}`}><Icon size={16} /></span>{s.title}</h2>
                  <ul className="divide-y divide-line">
                    {items.map((it, i) => (
                      <li key={i} className={`grid grid-cols-[minmax(0,2fr)_minmax(0,3fr)] gap-3 px-5 py-3 text-[14px] ${it.status === "früher" ? "opacity-60" : ""}`}>
                        <span className="text-muted">{it.label}</span>
                        <span>
                          <b className="font-semibold">{it.value}</b>
                          {it.status === "früher" && <span className="ml-1.5 rounded-full border border-card-line px-2 py-0.5 text-[11px] text-soft">früher</span>}
                          {it.detail && <span className="block text-[12px] text-muted">{it.detail}</span>}
                          {it.docIds.length > 0 && <span className="mt-1 flex flex-wrap gap-1">{it.docIds.slice(0, 3).map((id) => titleOf(id) && <Link key={id} href={`/d/${id}`} className="max-w-[14rem] truncate rounded-full bg-lavender px-2 py-0.5 text-[11px] font-medium text-selected hover:underline">{titleOf(id)}</Link>)}</span>}
                        </span>
                      </li>
                    ))}
                  </ul>
                </section>
              );
            })}
          </div>
        </div>
      )}
    </>
  );
}
