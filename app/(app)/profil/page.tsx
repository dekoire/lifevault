"use client";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Briefcase, Car, CircleAlert, FileText, HeartPulse, Home, IdCard, Landmark, Loader2, RefreshCw, ScrollText, ShieldCheck, Sparkles, UserRound, type LucideIcon } from "lucide-react";
import { CARD, PageHeader } from "@/components/ui";
import { Avatar, nameFromEmail } from "@/components/AvatarMenu";
import { CopyValue } from "@/components/CopyValue";
import { HistoryTimeline } from "@/components/HistoryTimeline";
import { buildPerson } from "@/lib/person";
import { fmtDate } from "@/lib/docs";
import type { LifeProfile } from "@/app/api/profile/route";
import { useDocs } from "@/lib/docs";
import { authFetch, supabase, useSession } from "@/lib/supabase";

const ICONS: Record<string, LucideIcon> = { person: UserRound, arbeit: Briefcase, wohnen: Home, versicherungen: ShieldCheck, vertraege: ScrollText, finanzen: Landmark, gesundheit: HeartPulse, mobilitaet: Car, offen: CircleAlert };

/** Lebensprofil: was gilt aktuell, was war früher – aus den Dokumenten, mit Quellen */
export default function ProfilPage() {
  const session = useSession();
  const { docs } = useDocs();
  const person = useMemo(() => buildPerson(docs), [docs]);
  const [showEarlier, setShowEarlier] = useState(false);
  const [allFields, setAllFields] = useState(false);
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

  const email = session?.user.email ?? "";
  const field = (id: string) => person.find((f) => f.id === id)?.current[0];
  const fromMail = email ? nameFromEmail(email) : "";
  const nameFact = field("name")?.value ?? "";
  const fullName = fromMail.split(" ").length > 1 ? fromMail : nameFact || fromMail;
  const birth = field("birth")?.value;
  const age = (() => {
    const m = birth?.match(/(\d{1,2})\.(\d{1,2})\.(\d{4})/);
    if (!m) return null;
    const now = new Date(), b = new Date(+m[3], +m[2] - 1, +m[1]);
    return now.getFullYear() - b.getFullYear() - (now < new Date(now.getFullYear(), b.getMonth(), b.getDate()) ? 1 : 0);
  })();
  // Eckdaten bevorzugt aus dem KI-Profil (aktuell), sonst aus dem Steckbrief
  const fromProfile = (sec: string, re: RegExp) => profile?.sections.find((s) => s.id === sec)?.items.find((i) => i.status === "aktuell" && re.test(i.label))?.value;
  const firstPart = (v?: string) => v?.split(/,|\s\(/)[0].trim();
  const city = (fromProfile("wohnen", /adresse|wohn/i) ?? field("address")?.value)?.match(/\d{5}\s+([^,(]+)/)?.[1]?.trim();
  const chips = [
    { icon: Briefcase, v: firstPart(fromProfile("arbeit", /arbeitgeber/i) ?? field("employer")?.value) },
    { icon: Home, v: city },
    { icon: ShieldCheck, v: firstPart(fromProfile("versicherungen", /krankenkasse|krankenversicherung/i) ?? field("kk")?.value) },
  ].filter((c) => c.v) as { icon: LucideIcon; v: string }[];
  const steck = person.filter((f) => f.id !== "name");
  const shownSteck = allFields ? steck : steck.slice(0, 6);
  const sections = profile?.sections.map((s) => ({ ...s, items: s.items.filter((i) => past || i.status === "aktuell") })).filter((s) => s.items.length) ?? [];
  const earlierCount = profile?.sections.reduce((n, s) => n + s.items.filter((i) => i.status === "früher").length, 0) ?? 0;

  return (
    <>
      <PageHeader
        title="Dein Profil"
        subtitle="Was aktuell gilt – aus deinen Unterlagen zusammengestellt"
        action={<button type="button" onClick={() => void build()} disabled={busy || !ready} className="inline-flex h-10 items-center gap-2 rounded-full bg-fg px-4 text-[14px] font-semibold text-canvas disabled:opacity-50">{busy ? <Loader2 size={16} className="animate-spin" /> : profile ? <RefreshCw size={16} /> : <Sparkles size={16} />} {profile ? "Aktualisieren" : "Profil erstellen"}</button>}
      />

      {/* Kopf: Avatar, Name, Alter, Kurzfassung, wichtigste Eckdaten */}
      <section className={`${CARD} mb-4 overflow-hidden`}>
        <div className="h-24 bg-[linear-gradient(120deg,#6d4aff_0%,#8f72ff_55%,#c3b4ff_100%)]" />
        <div className="px-5 pb-5 md:px-6">
          <div className="-mt-11 flex items-end gap-4">
            {email && <span className="rounded-full ring-4 ring-surface"><Avatar email={email} size={88} /></span>}
          </div>
          <h2 className="mt-3 text-[24px] leading-8 font-[650] tracking-tight">{fullName || "Du"}</h2>
          {birth && <p className="text-[14px] text-muted">geboren am {birth}{age !== null ? ` · ${age} Jahre` : ""}</p>}
          {chips.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {chips.map((c) => <span key={c.v} className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-card-line bg-surface px-3 py-1 text-[13px] font-semibold"><c.icon size={14} className="shrink-0" /><span className="truncate">{c.v}</span></span>)}
            </div>
          )}
          {profile?.intro && <p className="mt-4 max-w-3xl text-[15px] leading-relaxed text-soft">{profile.intro}</p>}
          <dl className="mt-5 grid grid-cols-3 gap-2 border-t border-line pt-4">
            <div><dt className="text-[12px] text-muted">Dokumente</dt><dd className="tnum text-[22px] font-bold text-brand-500">{ready}</dd></div>
            <div><dt className="text-[12px] text-muted">Lebensbereiche</dt><dd className="tnum text-[22px] font-bold text-brand-500">{profile?.sections.length ?? "–"}</dd></div>
            <div><dt className="text-[12px] text-muted">Stand</dt><dd className="text-[15px] leading-8 font-semibold">{profile ? new Date(profile.generatedAt).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" }) : "–"}{newer > 0 && <span className="ml-1.5 rounded-full bg-brand-500/10 px-2 py-0.5 text-[11.5px] font-semibold text-brand-500">{newer} neu</span>}</dd></div>
          </dl>
        </div>
      </section>

      {steck.length > 0 && (
        <section className={`${CARD} mb-4 overflow-hidden`}>
          <div className="flex items-center justify-between gap-3 px-5 pt-4 pb-1">
            <h2 className="flex items-center gap-2.5 text-[16px] font-semibold"><span className="grid h-8 w-8 place-items-center rounded-full bg-surface-2"><IdCard size={16} /></span>Steckbrief</h2>
            {person.some((f) => f.earlier.length) && <button type="button" onClick={() => { setShowEarlier(!showEarlier); setAllFields(true); }} className="rounded-full border border-card-line px-3 py-1 text-[12.5px] font-semibold text-soft hover:text-fg">{showEarlier ? "Nur aktuell" : "Frühere Werte"}</button>}
          </div>
          <p className="px-5 pb-3 text-[12px] text-muted">Jeweils der neueste Stand aus deinen Dokumenten, mit Quelle.</p>
          <ul className="grid border-t border-line md:grid-cols-2">
            {shownSteck.map((f) => (
              <li key={f.id} className="flex flex-col gap-1 border-b border-line px-5 py-3 md:flex-row md:gap-3 md:odd:border-r">
                <span className="shrink-0 text-[13px] text-muted md:w-32">{f.label}</span>
                <span className="min-w-0 flex-1 space-y-1.5 text-[14px] font-semibold">
                  {[...f.current, ...(showEarlier ? f.earlier : [])].map((v, i) => (
                    <span key={i} className={`block ${i >= f.current.length ? "opacity-55" : ""}`}>
                      <CopyValue value={v.value} />
                      <Link href={`/d/${v.docId}`} className="block truncate text-[11.5px] font-normal text-muted hover:text-selected">{i >= f.current.length ? "früher · " : ""}{fmtDate(v.date)} · {v.docTitle}</Link>
                    </span>
                  ))}
                </span>
              </li>
            ))}
          </ul>
          {steck.length > 6 && <button type="button" onClick={() => setAllFields(!allFields)} className="-mt-px w-full border-t border-line px-5 py-3 text-left text-[13px] font-semibold text-selected hover:bg-surface-2">{allFields ? "Weniger anzeigen" : `Alle ${steck.length} Angaben anzeigen`}</button>}
        </section>
      )}
      {error && <p role="alert" className="mb-4 rounded-xl bg-negative/10 px-4 py-3 text-[14px] text-negative-text">{error}</p>}
      {profile === undefined ? (
        <div className="grid h-40 place-items-center"><Loader2 className="animate-spin text-muted" /></div>
      ) : !profile ? (
        <section className={`${CARD} p-8 text-center`}>
          <span className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-brand-500/10 text-brand-500"><Sparkles size={26} /></span>
          <h2 className="mt-4 text-[18px] font-semibold">Noch kein Lebensprofil</h2>
          <p className="mx-auto mt-1 max-w-md text-[14px] text-muted">Die KI liest deine {ready} Dokumente und stellt zusammen: Arbeitgeber, Wohnung, Versicherungen, laufende Verträge, Fahrzeug – und was früher war.</p>
        </section>
      ) : (
        <div className="space-y-4">
          {profile.history && <HistoryTimeline history={profile.history} docs={docs} />}
          <div className="flex flex-wrap items-center justify-between gap-2 pt-2">
            <h2 className="text-[18px] font-semibold">Lebensbereiche</h2>
            {earlierCount > 0 && (
              <button type="button" role="switch" aria-checked={past} onClick={() => setPast(!past)} className="inline-flex items-center gap-2 text-[13px] font-semibold text-soft">
                <span className={`relative h-5 w-9 rounded-full transition-colors ${past ? "bg-fg" : "bg-line-strong"}`}><span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all ${past ? "left-[18px]" : "left-0.5"}`} /></span>
                Frühere Angaben ({earlierCount})
              </button>
            )}
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            {sections.map((s) => {
              const Icon = ICONS[s.id] ?? UserRound;
              const open = s.id === "offen";
              return (
                <section key={s.id} className={`${CARD} overflow-hidden ${open ? "lg:col-span-2" : ""}`}>
                  <h3 className="flex items-center gap-2.5 px-5 pt-4 pb-3 text-[16px] font-semibold">
                    <span className={`grid h-9 w-9 place-items-center rounded-full ${open ? "bg-urgent text-white" : "bg-brand-500/10 text-brand-500"}`}><Icon size={17} /></span>
                    <span className="flex-1">{s.title}</span>
                    <span className="tnum rounded-full border border-card-line px-2 py-px text-[12px] font-semibold text-soft">{s.items.length}</span>
                  </h3>
                  <ul className="divide-y divide-line border-t border-line">
                    {s.items.map((it, i) => (
                      <li key={i} className={`flex flex-col gap-1 px-5 py-3 sm:flex-row sm:gap-3 ${it.status === "früher" ? "bg-surface-2/50" : ""}`}>
                        <span className="shrink-0 text-[13px] text-muted sm:w-36">{it.label}</span>
                        <span className="min-w-0 flex-1">
                          <span className={`text-[14px] font-semibold ${it.status === "früher" ? "text-soft" : ""}`}>{it.value}</span>
                          {it.status === "früher" && <span className="ml-1.5 rounded-full border border-card-line bg-surface px-2 py-0.5 text-[11px] font-semibold text-muted">früher</span>}
                          {it.detail && <span className="mt-0.5 block text-[12.5px] text-muted">{it.detail}</span>}
                          {it.docIds.length > 0 && <span className="mt-1.5 flex flex-wrap gap-1">{it.docIds.slice(0, 3).map((id) => titleOf(id) && <Link key={id} href={`/d/${id}`} className="inline-flex max-w-[15rem] items-center gap-1 truncate rounded-full border border-card-line bg-surface px-2 py-0.5 text-[11px] font-medium text-soft hover:text-fg"><FileText size={11} className="shrink-0" /><span className="truncate">{titleOf(id)}</span></Link>)}</span>}
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
