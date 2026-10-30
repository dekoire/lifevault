"use client";
import { IconTile } from "@/components/ClusterIcon";
import { useDetail } from "@/components/DetailPanel";
import { CardWallet } from "@/components/CardWallet";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Briefcase, Car, CircleAlert, FileText, HeartPulse, Home, IdCard, Landmark, Loader2, RefreshCw, ScrollText, ShieldCheck, Sparkles, UserRound, type LucideIcon, Check, Copy } from "lucide-react";
import { CARD, PageHeader } from "@/components/ui";
import { Avatar, nameFromEmail } from "@/components/AvatarMenu";
import { CopyValue } from "@/components/CopyValue";
import { HistoryTimeline } from "@/components/HistoryTimeline";
import { buildPerson } from "@/lib/person";
import { buildPartners, partnerKey } from "@/lib/partners";
import { SenderLogo } from "@/components/SenderLogo";
import { Clamp } from "@/components/Clamp";
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
  const partners = useMemo(() => buildPartners(docs), [docs]);
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
  // Logo zu einem Wert: Partner, dessen Name im Wert vorkommt (bevorzugt Absender der Quelldokumente)
  const logoFor = (value: string, docIds: string[]) => {
    const v = partnerKey(value);
    const fromDocs = docIds.map((id) => docs.find((d) => d.id === id)?.sender).filter(Boolean).map((s) => partnerKey(s!));
    const cands = partners.filter((p) => p.key.length >= 3 && (v === p.key || v.startsWith(`${p.key}-`) || v.includes(`-${p.key}-`) || v.endsWith(`-${p.key}`)));
    const best = cands.sort((a, b) => Number(fromDocs.includes(b.key)) - Number(fromDocs.includes(a.key)) || b.key.length - a.key.length)[0];
    // nichts im Text erkannt (z. B. Befund, OP): Logo des Absenders aus dem Beleg, etwa Klinik oder Praxis
    return best ?? (fromDocs[0] ? partners.find((p) => p.key === fromDocs[0]) : undefined);
  };
  const [openSec, setOpenSec] = useState<string[]>([]);
  const openDetail = useDetail();
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
      <section className="mb-4 overflow-hidden rounded-2xl p-4 text-white shadow-card md:p-5" style={{ background: "linear-gradient(135deg, #2f3947 0%, #3b4555 100%)" }}>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
          {email && <span className="rounded-full ring-2 ring-white/25"><Avatar email={email} size={52} /></span>}
          <div className="min-w-0 flex-1">
            <h2 className="text-[18px] leading-6 font-semibold">{fullName || "Du"}</h2>
            {birth && <p className="text-[13px] text-white/70">geboren am {birth}{age !== null ? ` · ${age} Jahre` : ""}</p>}
          </div>
        </div>
        {chips.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {chips.map((c) => { const lp = c.icon === Home ? undefined : logoFor(c.v, []); return <span key={c.v} className="inline-flex max-w-full items-center gap-1.5 rounded-full bg-white/10 py-1 text-white ring-1 ring-white/15 pr-2.5 pl-1.5 text-[13px] font-semibold">{lp ? <span className="grid h-[22px] w-[22px] shrink-0 place-items-center overflow-hidden rounded-full bg-white"><SenderLogo domain={lp.domain} sender={lp.name} cluster={lp.cluster} size={16} bare /></span> : <c.icon size={13} className="mx-0.5 shrink-0" />}<span className="truncate">{c.v}</span></span>; })}
          </div>
        )}
        {/* Kennzahlen in einer Leiste, durch Striche getrennt */}
        <dl className="-mx-4 mt-4 -mb-4 grid grid-cols-3 divide-x divide-white/15 border-t border-white/15 md:-mx-5 md:-mb-5">
          <div className="px-4 py-3 md:px-5"><dt className="text-[12px] text-white/65">Dokumente</dt><dd className="tnum text-[18px] font-bold">{ready}</dd></div>
          <div className="px-4 py-3 md:px-5"><dt className="text-[12px] text-white/65">Bereiche</dt><dd className="tnum text-[18px] font-bold">{profile?.sections.length ?? "–"}</dd></div>
          <div className="px-4 py-3 md:px-5"><dt className="text-[12px] text-white/65">Stand</dt><dd className="tnum text-[18px] font-bold">{profile ? new Date(profile.generatedAt).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "2-digit" }) : "–"}</dd></div>
        </dl>
      </section>

      <div className="mb-4"><CardWallet /></div>

      {steck.length > 0 && (
        <section className={`${CARD} mb-4 overflow-hidden`}>
          <div className="flex items-center justify-between gap-3 px-5 pt-4 pb-1">
            <h2 className="flex items-center gap-2.5 text-[16px] font-semibold"><IconTile icon={IdCard} size={36} />Steckbrief</h2>
            {person.some((f) => f.earlier.length) && <button type="button" onClick={() => { setShowEarlier(!showEarlier); setAllFields(true); }} className="rounded-full border border-card-line px-3 py-1 text-[13px] font-semibold text-soft hover:text-fg">{showEarlier ? "Nur aktuell" : "Frühere Werte"}</button>}
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
                      <Link href={`/d/${v.docId}`} className="block truncate text-[12px] font-normal text-muted hover:text-selected">{i >= f.current.length ? "früher · " : ""}{fmtDate(v.date)} · {v.docTitle}</Link>
                    </span>
                  ))}
                </span>
              </li>
            ))}
          </ul>
          {steck.length > 6 && <button type="button" onClick={() => setAllFields(!allFields)} className="-mt-px w-full bg-surface border-t border-line px-5 py-5 text-center text-[14px] font-semibold text-fg transition-colors hover:bg-canvas">{allFields ? "Weniger anzeigen" : `Alle ${steck.length} Angaben anzeigen`}</button>}
        </section>
      )}
      {error && <p role="alert" className="mb-4 rounded-xl bg-negative/10 px-4 py-3 text-[14px] text-negative-text">{error}</p>}
      {profile === undefined ? (
        <div className="grid h-40 place-items-center"><Loader2 className="animate-spin text-muted" /></div>
      ) : !profile ? (
        <section className={`${CARD} p-8 text-center`}>
          <IconTile icon={Sparkles} size={56} className="mx-auto" />
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
                <section key={s.id} className={`${CARD} flex flex-col overflow-hidden ${open ? "lg:col-span-2" : ""}`}>
                  <h3 className="flex items-center gap-2.5 px-5 pt-4 pb-3 text-[16px] font-semibold">
                    <IconTile icon={Icon} size={36} color={open ? "#b42318" : "#6d4aff"} />
                    <span className="flex-1">{s.title}</span>
                    <span className="tnum rounded-full border border-card-line px-3 py-1 text-[12px] font-semibold text-soft">{s.items.length}</span>
                  </h3>
                  <ul className="flex-1 divide-y divide-line border-t border-line">
                    {(openSec.includes(s.id) ? s.items : s.items.slice(0, 4)).map((it, i) => (
                      <li key={i} className={`flex flex-col gap-1 px-5 py-3 sm:flex-row sm:gap-3 ${it.status === "früher" ? "bg-surface-2/50" : ""}`}>
                        <span lang="de" className="shrink-0 text-[13px] break-words hyphens-auto text-muted sm:w-36">{it.label}</span>
                        <span className="flex min-w-0 flex-1 items-start gap-3">
                        {(() => { const lp = (/wohn/i.test(s.id) ? undefined : logoFor(it.value, it.docIds)); return lp ? <button type="button" onClick={() => openDetail?.({ kind: "partner", key: lp.key })} title={`${lp.name} – Details rechts`} className="shrink-0 rounded-lg transition-opacity hover:opacity-80"><SenderLogo domain={lp.domain} sender={lp.name} cluster={lp.cluster} size={32} bare /></button> : null; })()}
                        <span className="min-w-0 flex-1">
                          {/* Klick auf den Namen öffnet den Partner rechts (nicht auf „Mehr anzeigen“) */}
                          <span onClick={(e) => { if ((e.target as HTMLElement).closest("button")) return; const lp = (/wohn/i.test(s.id) ? undefined : logoFor(it.value, it.docIds)); if (lp) openDetail?.({ kind: "partner", key: lp.key }); }} className={(/wohn/i.test(s.id) ? undefined : logoFor(it.value, it.docIds)) ? "block cursor-pointer hover:[&_*]:underline-offset-2" : "block"}>
                          <Clamp className={`text-[14px] font-semibold ${it.status === "früher" ? "text-soft" : ""}`}>{it.value}<CopyBtn value={it.value} />{it.status === "früher" && <span className="ml-1.5 rounded-full border border-card-line bg-surface px-3 py-1 text-[12px] font-semibold text-muted">früher</span>}</Clamp>
                          </span>
                          {it.detail && <Clamp className="mt-0.5 text-[13px] text-muted">{it.detail}</Clamp>}
                          {it.docIds.length > 0 && <span className="mt-1.5 flex flex-wrap gap-1">{it.docIds.slice(0, 3).map((id) => titleOf(id) && <Link key={id} href={`/d/${id}`} className="inline-flex max-w-[15rem] items-center gap-1 truncate rounded-full border border-card-line bg-surface px-2 py-0.5 text-[11px] font-medium text-soft hover:text-fg"><FileText size={11} className="shrink-0" /><span className="truncate">{titleOf(id)}</span></Link>)}</span>}
                        </span>
                        </span>
                      </li>
                    ))}
                  </ul>
                  {s.items.length > 4 && <button type="button" aria-expanded={openSec.includes(s.id)} onClick={() => setOpenSec((c) => (c.includes(s.id) ? c.filter((x) => x !== s.id) : [...c, s.id]))} className="w-full bg-surface border-t border-line px-5 py-5 text-center text-[14px] font-semibold text-fg transition-colors hover:bg-canvas">{openSec.includes(s.id) ? "Weniger anzeigen" : `Alle ${s.items.length} anzeigen`}</button>}
                </section>
              );
            })}
          </div>
        </div>
      )}
    </>
  );
}

/** kleiner Kopier-Knopf direkt hinter einem Wert */
function CopyBtn({ value }: { value: string }) {
  const [done, setDone] = useState(false);
  return (
    <button type="button" onClick={(e) => { e.stopPropagation(); void navigator.clipboard.writeText(value); setDone(true); setTimeout(() => setDone(false), 1400); }} aria-label="Kopieren" title="Kopieren" className="ml-1 inline-grid h-6 w-6 place-items-center rounded-full align-middle text-muted hover:bg-surface-3 hover:text-fg">
      {done ? <Check size={13} className="text-positive-text" /> : <Copy size={13} />}
    </button>
  );
}
