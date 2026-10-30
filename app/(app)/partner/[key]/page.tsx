"use client";
import { NotFound } from "@/components/NotFound";
import Link from "next/link";
import { use, useEffect, useMemo, useState } from "react";
import { ArrowRight, CalendarClock, ExternalLink, GitBranch, Hash, History, MessageSquare, PanelRight, PencilLine, ShoppingBag, X, Loader2, ChevronDown, Sparkles, Check } from "lucide-react";
import { CopyValue } from "@/components/CopyValue";
import { PartnerRelevance } from "@/components/PartnerRelevance";
import { todoKey, useTodoDone } from "@/lib/todoDone";
import { DocTable } from "@/components/DocTable";
import { PartnerSheet } from "@/components/PartnerInfo";
import { MergeHistory } from "@/components/PartnerDupes";
import { SenderLogo } from "@/components/SenderLogo";
import { ClusterIcon } from "@/components/ClusterIcon";
import { BackLink, CARD, PageHeader } from "@/components/ui";
import { clusterOf } from "@/lib/clusters";
import { fmtDate, fmtMoney, useDocs } from "@/lib/docs";
import { authFetch, supabase } from "@/lib/supabase";
import { useRouter } from "next/navigation";
import { buildPartners, docsWithValue, partnerKey, type PartnerId } from "@/lib/partners";
import { CHANGE_LABEL, span, useHistoryLinks } from "@/lib/history";

/** Ein Partner: alle Kennungen zum Kopieren, Fristen, Einkäufe und Dokumente */
export default function PartnerPage({ params }: { params: Promise<{ key: string }> }) {
  const { key } = use(params);
  const { docs, loading, refresh } = useDocs();
  const router = useRouter();
  const partners = useMemo(() => buildPartners(docs), [docs]);
  const p = partners.find((x) => x.key === key);
  // verlinkter Partner mit Logo (auch wenn er keine eigenen Dokumente hat: Logo über den Namen)
  const PLink = ({ name, strong }: { name: string; strong?: boolean }) => {
    const other = partners.find((x) => x.key === partnerKey(name));
    return (
      <Link href={`/partner/${partnerKey(name)}`} className={`inline-flex items-center gap-1.5 underline-offset-2 hover:underline ${strong ? "font-semibold" : "font-medium"}`}>
        <SenderLogo domain={other?.domain} sender={name} cluster={other?.cluster ?? p?.cluster} size={22} bare />{name}
      </Link>
    );
  };
  const { byPartner } = useHistoryLinks(docs);
  const link = byPartner.get(key);
  // angeklickte Kennung → rechts nur Dokumente, die sie enthalten
  const [pick, setPick] = useState<PartnerId | null>(null);
  const [info, setInfo] = useState(false);
  const [openTopic, setOpenTopic] = useState<string | null>(null);
  const [renaming, setRenaming] = useState(false);
  const { done } = useTodoDone();
  const restrict = useMemo(() => {
    if (!pick || !p) return null;
    const ids = docsWithValue(p.docs, pick.value);
    ids.add(pick.docId);
    return { label: `${pick.label}: ${pick.value}`, ids };
  }, [pick, p]);
  const today = new Date().toISOString().slice(0, 10);
  if (!p) return loading ? <p className="py-20 text-center text-muted">Lädt …</p> : <NotFound title="Partner nicht gefunden" text="Den Partner gibt es nicht mehr – vielleicht wurde er umbenannt oder mit einem anderen zusammengeführt." />;

  // gleiche Bezeichnung mit anderem Wert in älterem Dokument → „früher“
  const topics = [...new Set(p.ids.map((i) => i.topic))];
  const shownTopic = openTopic; // anfangs alles zugeklappt
  const latestByLabel = new Map<string, string>();
  for (const i of p.ids) if (!latestByLabel.has(i.label.toLowerCase())) latestByLabel.set(i.label.toLowerCase(), i.value);
  const deadlines = p.docs.flatMap((d) => (d.deadlines ?? []).filter((x) => x.date >= today && !done.includes(todoKey(d.id, x.date))).map((x) => ({ ...x, d }))).sort((a, b) => a.date.localeCompare(b.date));
  const total = p.docs.map((d) => d.amounts?.find((a) => /summe|gesamt|betrag|total/i.test(a.label)) ?? d.amounts?.[0]).filter(Boolean) as { value: number; currency: string }[];
  const spent = total.reduce((s, a) => s + a.value, 0);

  // Umbenennen: alle Dokumente (auch die zusammengelegter Partner) bekommen den neuen Absender und ggf. die geprüfte Webadresse (Logo);
  // alte Namen bleiben im Verlauf (rückgängig machbar)
  const rename = async (raw: string, domain: string | null, mergeKeys: string[]) => {
    const name = raw.trim();
    const merged = partners.filter((x) => mergeKeys.includes(x.key) && x.key !== p.key);
    if (!name || (name === p.name && !merged.length && (!domain || domain === p.domain))) { setRenaming(false); return; }
    const all = [...p.docs, ...merged.flatMap((x) => x.docs)];
    const entries = all.map((d) => ({ doc_id: d.id, sender: d.sender, sender_domain: d.sender_domain }));
    const target = domain ?? p.domain;
    const { data: log } = await supabase.from("partner_merges").insert({ target_name: name.slice(0, 300), target_domain: target, kind: merged.length ? "merge" : "rename", entries }).select("id").single();
    const { error } = await supabase.from("documents").update({ sender: name.slice(0, 300), ...(target ? { sender_domain: target } : {}) }).in("id", entries.map((e) => e.doc_id));
    if (error) { if (log) await supabase.from("partner_merges").delete().eq("id", log.id); throw new Error("Umbenennen hat nicht geklappt. Bitte erneut versuchen."); }
    setRenaming(false);
    await refresh();
    router.replace(`/partner/${partnerKey(name)}`);
  };

  // Anstehendes (Kündigungsfrist, Zahlung …) ganz oben links, direkt unter dem Hauptdokument
  const upcoming = deadlines.length > 0 && (
            <section className={CARD}>
              <h2 className="flex items-center gap-2 px-4 pt-5 pb-2 md:px-6 text-[18px] leading-[26px] font-semibold"><CalendarClock size={17} /> Anstehend <span className="text-[13px] font-normal text-muted">– Fristen, Kündigung, Zahlungen</span></h2>
              <ul className="grid gap-2.5 px-4 pb-4 md:px-6 sm:grid-cols-2">{deadlines.map((x, i) => { const days = Math.round((Date.parse(x.date) - Date.now()) / 86_400_000); return (
                <li key={i}><Link href={`/d/${x.d.id}`} className="flex h-full flex-col gap-1.5 rounded-xl bg-surface-2 p-3.5 transition-colors hover:bg-surface-3">
                  <span className="flex items-baseline justify-between gap-2"><b className="tnum text-[17px]">{fmtDate(x.date)}</b><span className={`text-[12px] font-semibold ${days < 0 ? "text-negative-text" : days <= 30 ? "text-amber" : "text-muted"}`}>{days < 0 ? `seit ${-days} Tagen` : days === 0 ? "heute" : days < 60 ? `in ${days} Tagen` : `in ${Math.round(days / 30)} Monaten`}</span></span>
                  <span className="line-clamp-2 text-[14px] leading-5 text-soft">{x.what}</span>
                </Link></li>
              ); })}</ul>
            </section>
          );

  return (
    <div>
      <BackLink href="/partner" label="Partner" />
      <PageHeader
        icon={<SenderLogo domain={p.domain} sender={p.name} cluster={p.cluster} size={56} />}
        title={p.name}
        subtitle={<>{clusterOf(p.cluster).label} · {p.docs.length} {p.docs.length === 1 ? "Dokument" : "Dokumente"} · {fmtDate(p.first)}{p.first !== p.last ? ` – ${fmtDate(p.last)}` : ""}{(!p.active || link?.entry.status === "früher") && " · früher"}</>}
        action={<>
          <button type="button" onClick={() => setRenaming(true)} title="Umbenennen" aria-label="Umbenennen" className="grid h-10 w-10 place-items-center rounded-full border border-card-line bg-surface hover:bg-surface-2"><PencilLine size={15} /></button>
          <button type="button" onClick={() => setInfo(true)} className="inline-flex h-10 items-center gap-1.5 rounded-full border border-card-line bg-surface px-4 text-[13px] font-semibold hover:bg-surface-2"><PanelRight size={15} /> Kontakt & Infos</button>
          <Link href={`/chat?q=${encodeURIComponent(`Was habe ich alles mit ${p.name}? Verträge, Nummern, Kosten, Fristen.`)}`} className="inline-flex h-10 items-center gap-1.5 rounded-full bg-fg px-4 text-[13px] font-semibold text-canvas"><MessageSquare size={15} /> Fragen</Link>
        </>}
      />
      {link && (link.prev || link.next || link.current) && (
        <section className={`mb-4 flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-2xl border px-4 py-3 text-[14px] ${link.entry.status === "früher" ? "border-amber/30 bg-amber/5" : "border-card-line bg-surface"}`}>
          <span className="inline-flex items-center gap-2 font-semibold"><ClusterIcon id={p.cluster} size={26} tone="plain" />{link.role} · {span(link.entry)}</span>
          {link.entry.status === "früher" && (link.next ?? link.current) && (
            <span className="inline-flex items-center gap-1.5">Abgelöst durch <ArrowRight size={13} /> <PLink name={(link.next ?? link.current)!.name} strong />{link.next?.change && <span className="inline-flex items-center gap-1 rounded-full border border-card-line px-3 py-1 text-[12px] font-semibold">{link.next.change === "uebergabe" && <GitBranch size={11} />}{CHANGE_LABEL[link.next.change]}</span>}</span>
          )}
          {link.prev && <span className="inline-flex flex-wrap items-center gap-1.5 text-soft">Vorher: <PLink name={link.prev.name} /> <span className="text-muted">({span(link.prev)})</span></span>}
          {(link.entry.note || link.next?.note) && <span className="basis-full text-[13px] text-muted">{link.next?.note ?? link.entry.note}</span>}
        </section>
      )}
      {/* links: worum es geht – Hauptdokument, Überblick, alle Dokumente, Gruppen; rechts: Nummern (zugeklappt) und Fristen */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)] lg:items-start">
        {/* nach Relevanz gegliedert (Hauptdokument, Wichtiges, Laufendes, Info, Erledigtes, Doppeltes); Nummer angetippt → Tabelle mit Treffern */}
        {restrict || p.isShop ? <div className="space-y-4">{upcoming}<DocTable title="Dokumente" limit={8} docs={p.docs} sender={false} archiveToggle={false} restrict={restrict} onClearRestrict={() => setPick(null)} /></div> : <PartnerRelevance docs={p.docs} afterMain={upcoming} />}
        <div className="space-y-4">
          {p.isShop ? (
            <section className={`${CARD} grid grid-cols-3 divide-x divide-line`}>
              {[["Zuletzt dort", fmtDate(p.last)], ["Einkäufe", String(p.docs.length)], ["Zusammen", spent ? fmtMoney(spent, total[0]?.currency) : "–"]].map(([l, v]) => <div key={l} className="p-4"><span className="flex items-center gap-1 text-[12px] text-muted">{l === "Zuletzt dort" && <ShoppingBag size={13} />}{l}</span><b className="tnum mt-1 block text-[18px]">{v}</b></div>)}
            </section>
          ) : null}
          <section className={CARD}>
            <h2 className="flex items-center gap-2 px-4 pt-5 pb-2 md:px-6 text-[18px] leading-[26px] font-semibold"><Hash size={17} /> Kennungen & Nummern</h2>
            {p.ids.length ? (
              <>
                <p className="px-4 pb-2 text-[13px] md:px-6 text-muted">Antippen zeigt links die Dokumente mit dieser Nummer.</p>
                {/* Themen zum Auf-/Zuklappen – immer nur eins offen, anfangs alle zu */}
                {topics.map((topic) => { const isOpen = shownTopic === topic; const n = p.ids.filter((i) => i.topic === topic).length; return (
                  <div key={topic}>
                    <h3 className="border-t border-line">
                      <button type="button" aria-expanded={isOpen} onClick={() => setOpenTopic(isOpen ? null : topic)} className="flex w-full items-center gap-2 px-4 py-3.5 md:px-6 text-left text-[15px] font-semibold transition-colors hover:bg-surface-2">
                        <span className="min-w-0 flex-1">{topic}</span>
                        <span className="tnum rounded-full bg-surface px-3 py-1 text-[12px] font-semibold text-soft">{n}</span>
                        <ChevronDown size={17} className={`shrink-0 text-muted transition-transform ${isOpen ? "rotate-180" : ""}`} />
                      </button>
                    </h3>
                    {isOpen && <ul className="divide-y divide-line border-t border-line">
                      {p.ids.filter((i) => i.topic === topic).map((i) => {
                        const old = latestByLabel.get(i.label.toLowerCase()) !== i.value;
                        const on = pick?.value === i.value && pick.label === i.label;
                        return (
                          <li key={`${i.label}|${i.value}|${i.docId}`} role="button" tabIndex={0} aria-pressed={on}
                            onClick={() => setPick(on ? null : i)} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setPick(on ? null : i); } }}
                            className={`grid cursor-pointer grid-cols-[minmax(0,2fr)_minmax(0,3fr)] gap-3 px-4 py-3 md:px-6 text-[14px] transition-colors ${on ? "bg-lavender shadow-[inset_3px_0_0_var(--color-brand-500)]" : "hover:bg-canvas"} ${old && !on ? "opacity-55" : ""}`}>
                            <span className="min-w-0 break-words hyphens-auto text-muted" lang="de">{i.label}{old && <span className="ml-1.5 rounded-full border border-card-line px-3 text-[10px]">früher</span>}</span>
                            <span className="min-w-0">
                              <CopyValue value={i.value} />
                              <Link href={`/d/${i.docId}`} onClick={(e) => e.stopPropagation()} className="block truncate text-[11px] text-muted hover:text-selected">aus {i.docTitle} · {fmtDate(i.date)}</Link>
                            </span>
                          </li>
                        );
                      })}
                    </ul>}
                  </div>
                ); })}
              </>
            ) : <p className="px-4 pb-4 text-[13px] md:px-6 text-muted">Keine Nummern gefunden. Neu ausgelesene Dokumente sammeln Kunden-, Vertrags- und Versicherungsnummern automatisch.</p>}
          </section>
          <MergeHistory pkey={p.key} compact />
        </div>
      </div>
      {info && <PartnerSheet p={p} onClose={() => setInfo(false)} />}
      {renaming && <RenameModal p={p} others={partners.filter((x) => x.key !== p.key).map((x) => ({ key: x.key, name: x.name, domain: x.domain, cluster: x.cluster, n: x.docs.length }))} onSave={rename} onClose={() => setRenaming(false)} />}
    </div>
  );
}

type Other = { key: string; name: string; domain: string | null; cluster: string | null; n: number };

/**
 * Umbenennen als eigenes Fenster in zwei Schritten: Namen eingeben → prüfen (richtiger Name, Webadresse fürs Logo,
 * ähnliche Partner zum Zusammenlegen) → übernehmen.
 */
function RenameModal({ p, others, onSave, onClose }: { p: { key: string; name: string; domain: string | null; cluster: string | null; docs: unknown[] }; others: Other[]; onSave: (name: string, domain: string | null, merge: string[]) => Promise<void>; onClose: () => void }) {
  const [name, setName] = useState(p.name);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [check, setCheck] = useState<{ suggested: string; domain: string | null; similar: Other[] } | null>(null);
  const [merge, setMerge] = useState<string[]>([]);
  useEffect(() => { const k = (e: KeyboardEvent) => e.key === "Escape" && onClose(); addEventListener("keydown", k); return () => removeEventListener("keydown", k); }, [onClose]);
  const verify = async () => {
    const res = await authFetch("/api/partner/resolve", { method: "POST", body: JSON.stringify({ name: name.trim(), old: p.name, others: others.map((o) => o.name) }) });
    const j = (await res.json().catch(() => ({}))) as { name?: string; domain?: string | null; same?: string[] };
    // ähnlich: von der KI erkannt, gleiche Webadresse oder gleiches erstes Namenswort
    const first = (k: string) => k.split("-")[0];
    const nk = partnerKey(j.name ?? name);
    const sure = new Set(others.filter((o) => (j.same ?? []).includes(o.name) || (j.domain && o.domain === j.domain)).map((o) => o.key));
    const maybe = others.filter((o) => !sure.has(o.key) && first(o.key).length >= 3 && (first(o.key) === first(nk) || first(o.key) === first(partnerKey(name))));
    const similar = [...others.filter((o) => sure.has(o.key)), ...maybe].slice(0, 8);
    setCheck({ suggested: j.name ?? name.trim(), domain: j.domain ?? null, similar });
    setMerge([...sure]);
  };
  const save = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true); setError(undefined);
    try { if (!check) await verify(); else await onSave(name, check.domain, merge); } catch (err) { setError((err as Error).message); }
    setBusy(false);
  };
  const changed = !!name.trim();
  const docsN = p.docs.length + others.filter((o) => merge.includes(o.key)).reduce((n, o) => n + o.n, 0);
  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4" onClick={onClose}>
      <form onSubmit={save} onClick={(e) => e.stopPropagation()} className="sheet-rise max-h-[92dvh] w-full max-w-md overflow-y-auto rounded-t-3xl bg-surface p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-xl sm:rounded-3xl" role="dialog" aria-label="Partner umbenennen">
        <div className="flex items-center gap-3">
          <SenderLogo domain={check?.domain ?? p.domain} sender={name || p.name} cluster={p.cluster} size={44} />
          <div className="min-w-0 flex-1"><h2 className="text-[17px] font-semibold">Partner umbenennen</h2><p className="truncate text-[13px] text-muted">bisher „{p.name}“</p></div>
          <button type="button" onClick={onClose} aria-label="Schließen" className="grid h-9 w-9 place-items-center rounded-full hover:bg-surface-2"><X size={17} /></button>
        </div>
        <label className="mt-4 block text-[13px] font-semibold text-soft">Neuer Name
          <input autoFocus value={name} onChange={(e) => { setName(e.target.value); setCheck(null); }} onFocus={(e) => e.currentTarget.select()} maxLength={300} className="mt-1.5 h-11 w-full rounded-xl border border-card-line bg-surface px-3.5 text-[15px] font-normal text-fg outline-none focus:border-brand-500" />
        </label>
        {check && (
          <div className="mt-3 space-y-3">
            {check.suggested && check.suggested !== name.trim() && (
              <button type="button" onClick={() => setName(check.suggested)} className="flex w-full items-center gap-2 rounded-xl border border-card-line px-3 py-2 text-left text-[13px] hover:bg-surface-2"><Sparkles size={14} className="shrink-0 text-brand-500" /><span className="min-w-0 flex-1">Vorschlag: <b>{check.suggested}</b></span><span className="text-[12px] font-semibold text-selected">Übernehmen</span></button>
            )}
            <p className="flex items-center gap-2 text-[13px] text-muted">{check.domain ? <><Check size={14} className="text-positive-text" /> Logo von <b className="text-fg">{check.domain}</b></> : "Keine Webadresse gefunden – Logo bleibt wie es ist."}</p>
            {check.similar.length > 0 && (
              <div>
                <p className="mb-1.5 text-[13px] font-semibold text-soft">Ähnliche Partner – mit zusammenlegen?</p>
                <div className="divide-y divide-line rounded-xl border border-card-line">
                  {check.similar.map((o) => { const on = merge.includes(o.key); return (
                    <label key={o.key} className="flex cursor-pointer items-center gap-2.5 px-3 py-2">
                      <input type="checkbox" checked={on} onChange={() => setMerge(on ? merge.filter((k) => k !== o.key) : [...merge, o.key])} className="h-4 w-4 accent-brand-500" />
                      <SenderLogo domain={o.domain} sender={o.name} cluster={o.cluster} size={26} bare />
                      <span className="min-w-0 flex-1 truncate text-[14px] font-semibold">{o.name}</span>
                      <span className="text-[12px] text-muted">{o.n} Dok.</span>
                    </label>
                  ); })}
                </div>
              </div>
            )}
          </div>
        )}
        <p className="mt-3 text-[13px] text-muted">{check ? `${docsN} ${docsN === 1 ? "Dokument bekommt" : "Dokumente bekommen"} den Namen „${name.trim()}“.` : "Wir prüfen den Namen, laden das passende Logo und suchen ähnliche Partner."} Alte Namen bleiben im Verlauf und lassen sich zurückholen.</p>
        {error && <p role="alert" className="mt-2 text-[13px] text-negative-text">{error}</p>}
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="inline-flex h-10 items-center rounded-full border border-card-line px-4 text-[14px] font-semibold hover:bg-surface-2">Abbrechen</button>
          <button type="submit" disabled={busy || !changed} className="inline-flex h-10 items-center gap-1.5 rounded-full bg-fg px-5 text-[14px] font-semibold text-canvas disabled:opacity-40">{busy && <Loader2 size={15} className="animate-spin" />} {check ? "Übernehmen" : "Prüfen"}</button>
        </div>
      </form>
    </div>
  );
}
