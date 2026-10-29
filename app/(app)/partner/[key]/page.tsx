"use client";
import Link from "next/link";
import { use, useEffect, useMemo, useState } from "react";
import { ArrowRight, CalendarClock, ExternalLink, GitBranch, Hash, History, MessageSquare, PanelRight, PencilLine, ShoppingBag, X, Loader2 } from "lucide-react";
import { CopyValue } from "@/components/CopyValue";
import { DocTable } from "@/components/DocTable";
import { PartnerSheet } from "@/components/PartnerInfo";
import { MergeHistory } from "@/components/PartnerDupes";
import { SenderLogo } from "@/components/SenderLogo";
import { ClusterIcon } from "@/components/ClusterIcon";
import { BackLink, CARD, PageHeader } from "@/components/ui";
import { clusterOf } from "@/lib/clusters";
import { fmtDate, fmtMoney, useDocs } from "@/lib/docs";
import { supabase } from "@/lib/supabase";
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
  const [renaming, setRenaming] = useState(false);
  const restrict = useMemo(() => {
    if (!pick || !p) return null;
    const ids = docsWithValue(p.docs, pick.value);
    ids.add(pick.docId);
    return { label: `${pick.label}: ${pick.value}`, ids };
  }, [pick, p]);
  const today = new Date().toISOString().slice(0, 10);
  if (!p) return <p className="py-20 text-center text-muted">{loading ? "Lädt …" : "Nicht gefunden."}</p>;

  // gleiche Bezeichnung mit anderem Wert in älterem Dokument → „früher“
  const latestByLabel = new Map<string, string>();
  for (const i of p.ids) if (!latestByLabel.has(i.label.toLowerCase())) latestByLabel.set(i.label.toLowerCase(), i.value);
  const deadlines = p.docs.flatMap((d) => (d.deadlines ?? []).filter((x) => x.date >= today).map((x) => ({ ...x, d }))).sort((a, b) => a.date.localeCompare(b.date));
  const total = p.docs.map((d) => d.amounts?.find((a) => /summe|gesamt|betrag|total/i.test(a.label)) ?? d.amounts?.[0]).filter(Boolean) as { value: number; currency: string }[];
  const spent = total.reduce((s, a) => s + a.value, 0);

  // Umbenennen: alle Dokumente bekommen den neuen Absender; alter Name bleibt im Verlauf (rückgängig machbar)
  const rename = async (raw: string) => {
    const name = raw.trim();
    if (!name || name === p.name) { setRenaming(false); return; }
    const entries = p.docs.map((d) => ({ doc_id: d.id, sender: d.sender, sender_domain: d.sender_domain }));
    const { data: log } = await supabase.from("partner_merges").insert({ target_name: name.slice(0, 300), target_domain: p.domain, kind: "rename", entries }).select("id").single();
    const { error } = await supabase.from("documents").update({ sender: name.slice(0, 300) }).in("id", entries.map((e) => e.doc_id));
    if (error) { if (log) await supabase.from("partner_merges").delete().eq("id", log.id); throw new Error("Umbenennen hat nicht geklappt. Bitte erneut versuchen."); }
    setRenaming(false);
    await refresh();
    router.replace(`/partner/${partnerKey(name)}`);
  };

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
        <section className={`mb-4 flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-2xl border px-4 py-3 text-[13.5px] ${link.entry.status === "früher" ? "border-amber/30 bg-amber/5" : "border-card-line bg-surface"}`}>
          <span className="inline-flex items-center gap-2 font-semibold"><ClusterIcon id={p.cluster} size={26} tone="plain" />{link.role} · {span(link.entry)}</span>
          {link.entry.status === "früher" && (link.next ?? link.current) && (
            <span className="inline-flex items-center gap-1.5">Abgelöst durch <ArrowRight size={13} /> <PLink name={(link.next ?? link.current)!.name} strong />{link.next?.change && <span className="inline-flex items-center gap-1 rounded-full border border-card-line px-2 py-px text-[11px] font-semibold">{link.next.change === "uebergabe" && <GitBranch size={11} />}{CHANGE_LABEL[link.next.change]}</span>}</span>
          )}
          {link.prev && <span className="inline-flex flex-wrap items-center gap-1.5 text-soft">Vorher: <PLink name={link.prev.name} /> <span className="text-muted">({span(link.prev)})</span></span>}
          {(link.entry.note || link.next?.note) && <span className="basis-full text-[12.5px] text-muted">{link.next?.note ?? link.entry.note}</span>}
        </section>
      )}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:items-start">
        <div className="space-y-4">
          {p.isShop ? (
            <section className={`${CARD} grid grid-cols-3 divide-x divide-line`}>
              {[["Zuletzt dort", fmtDate(p.last)], ["Einkäufe", String(p.docs.length)], ["Zusammen", spent ? fmtMoney(spent, total[0]?.currency) : "–"]].map(([l, v]) => <div key={l} className="p-4"><span className="flex items-center gap-1 text-[12px] text-muted">{l === "Zuletzt dort" && <ShoppingBag size={13} />}{l}</span><b className="tnum mt-1 block text-[18px]">{v}</b></div>)}
            </section>
          ) : null}
          <section className={CARD}>
            <h2 className="flex items-center gap-2 px-5 pt-4 pb-2 text-[16px] font-semibold"><Hash size={17} /> Kennungen & Nummern</h2>
            {p.ids.length ? (
              <>
                <p className="px-5 pb-2 text-[12.5px] text-muted">Antippen zeigt rechts die Dokumente mit dieser Nummer.</p>
                {[...new Set(p.ids.map((i) => i.topic))].map((topic) => (
                  <div key={topic}>
                    <h3 className="border-t border-line bg-surface-2/60 px-5 py-1.5 text-[12px] font-semibold tracking-wide text-soft uppercase">{topic}</h3>
                    <ul className="divide-y divide-line">
                      {p.ids.filter((i) => i.topic === topic).map((i) => {
                        const old = latestByLabel.get(i.label.toLowerCase()) !== i.value;
                        const on = pick?.value === i.value && pick.label === i.label;
                        return (
                          <li key={`${i.label}|${i.value}|${i.docId}`} role="button" tabIndex={0} aria-pressed={on}
                            onClick={() => setPick(on ? null : i)} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setPick(on ? null : i); } }}
                            className={`grid cursor-pointer grid-cols-[minmax(0,2fr)_minmax(0,3fr)] gap-3 px-5 py-2.5 text-[14px] transition-colors ${on ? "bg-lavender shadow-[inset_3px_0_0_var(--color-brand-500)]" : "hover:bg-surface-2/70"} ${old && !on ? "opacity-55" : ""}`}>
                            <span className="min-w-0 break-words hyphens-auto text-muted" lang="de">{i.label}{old && <span className="ml-1.5 rounded-full border border-card-line px-1.5 text-[10px]">früher</span>}</span>
                            <span className="min-w-0">
                              <CopyValue value={i.value} />
                              <Link href={`/d/${i.docId}`} onClick={(e) => e.stopPropagation()} className="block truncate text-[11px] text-muted hover:text-selected">aus {i.docTitle} · {fmtDate(i.date)}</Link>
                            </span>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                ))}
              </>
            ) : <p className="px-5 pb-4 text-[13px] text-muted">Keine Nummern gefunden. Neu ausgelesene Dokumente sammeln Kunden-, Vertrags- und Versicherungsnummern automatisch.</p>}
          </section>
          {deadlines.length > 0 && (
            <section className={CARD}>
              <h2 className="flex items-center gap-2 px-5 pt-4 pb-2 text-[16px] font-semibold"><CalendarClock size={17} /> Anstehend</h2>
              <ul className="grid gap-2.5 px-4 pb-4 sm:grid-cols-2">{deadlines.map((x, i) => { const days = Math.round((Date.parse(x.date) - Date.now()) / 86_400_000); return (
                <li key={i}><Link href={`/d/${x.d.id}`} className="flex h-full flex-col gap-1.5 rounded-xl bg-surface-2 p-3.5 transition-colors hover:bg-surface-3">
                  <span className="flex items-baseline justify-between gap-2"><b className="tnum text-[17px]">{fmtDate(x.date)}</b><span className={`text-[12px] font-semibold ${days < 0 ? "text-negative-text" : days <= 30 ? "text-amber" : "text-muted"}`}>{days < 0 ? `seit ${-days} Tagen` : days === 0 ? "heute" : days < 60 ? `in ${days} Tagen` : `in ${Math.round(days / 30)} Monaten`}</span></span>
                  <span className="line-clamp-2 text-[13.5px] leading-5 text-soft">{x.what}</span>
                </Link></li>
              ); })}</ul>
            </section>
          )}
          <MergeHistory pkey={p.key} compact />
        </div>
        <DocTable title="Dokumente" limit={8} docs={p.docs} sender={false} archiveToggle={false} restrict={restrict} onClearRestrict={() => setPick(null)} />
      </div>
      {info && <PartnerSheet p={p} onClose={() => setInfo(false)} />}
      {renaming && <RenameModal p={p} onSave={rename} onClose={() => setRenaming(false)} />}
    </div>
  );
}

/** Umbenennen als eigenes Fenster: Logo, neuer Name, was passiert */
function RenameModal({ p, onSave, onClose }: { p: { name: string; domain: string | null; cluster: string | null; docs: unknown[] }; onSave: (name: string) => Promise<void>; onClose: () => void }) {
  const [name, setName] = useState(p.name);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  useEffect(() => { const k = (e: KeyboardEvent) => e.key === "Escape" && onClose(); addEventListener("keydown", k); return () => removeEventListener("keydown", k); }, [onClose]);
  const save = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true); setError(undefined);
    try { await onSave(name); } catch (err) { setError((err as Error).message); setBusy(false); }
  };
  const changed = name.trim() && name.trim() !== p.name;
  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4" onClick={onClose}>
      <form onSubmit={save} onClick={(e) => e.stopPropagation()} className="sheet-rise pb-safe w-full max-w-md rounded-t-3xl bg-surface p-5 shadow-xl sm:rounded-3xl" role="dialog" aria-label="Partner umbenennen">
        <div className="flex items-center gap-3">
          <SenderLogo domain={p.domain} sender={name || p.name} cluster={p.cluster} size={44} />
          <div className="min-w-0 flex-1"><h2 className="text-[17px] font-semibold">Partner umbenennen</h2><p className="truncate text-[12.5px] text-muted">bisher „{p.name}“</p></div>
          <button type="button" onClick={onClose} aria-label="Schließen" className="grid h-9 w-9 place-items-center rounded-full hover:bg-surface-2"><X size={17} /></button>
        </div>
        <label className="mt-4 block text-[12.5px] font-semibold text-soft">Neuer Name
          <input autoFocus value={name} onChange={(e) => setName(e.target.value)} onFocus={(e) => e.currentTarget.select()} maxLength={300} className="mt-1.5 h-11 w-full rounded-xl border border-card-line bg-surface px-3.5 text-[15px] font-normal text-fg outline-none focus:border-brand-500" />
        </label>
        <p className="mt-2 text-[12.5px] text-muted">{p.docs.length} {p.docs.length === 1 ? "Dokument bekommt" : "Dokumente bekommen"} den neuen Absendernamen. Der alte Name bleibt im Verlauf und lässt sich zurückholen.</p>
        {error && <p role="alert" className="mt-2 text-[13px] text-negative-text">{error}</p>}
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="inline-flex h-10 items-center rounded-full border border-card-line px-4 text-[14px] font-semibold hover:bg-surface-2">Abbrechen</button>
          <button type="submit" disabled={busy || !changed} className="inline-flex h-10 items-center gap-1.5 rounded-full bg-fg px-5 text-[14px] font-semibold text-canvas disabled:opacity-40">{busy && <Loader2 size={15} className="animate-spin" />} Umbenennen</button>
        </div>
      </form>
    </div>
  );
}
