"use client";
import Link from "next/link";
import { use, useMemo, useState } from "react";
import { ArrowRight, CalendarClock, ExternalLink, GitBranch, Hash, History, MessageSquare, PanelRight, ShoppingBag } from "lucide-react";
import { CopyValue } from "@/components/CopyValue";
import { DocTable } from "@/components/DocTable";
import { PartnerSheet } from "@/components/PartnerInfo";
import { SenderLogo } from "@/components/SenderLogo";
import { BackLink, CARD, PageHeader } from "@/components/ui";
import { clusterOf } from "@/lib/clusters";
import { fmtDate, fmtMoney, useDocs } from "@/lib/docs";
import { buildPartners, docsWithValue, partnerKey, type PartnerId } from "@/lib/partners";
import { CHANGE_LABEL, span, useHistoryLinks } from "@/lib/history";

/** Ein Partner: alle Kennungen zum Kopieren, Fristen, Einkäufe und Dokumente */
export default function PartnerPage({ params }: { params: Promise<{ key: string }> }) {
  const { key } = use(params);
  const { docs, loading } = useDocs();
  const p = useMemo(() => buildPartners(docs).find((x) => x.key === key), [docs, key]);
  const { byPartner } = useHistoryLinks(docs);
  const link = byPartner.get(key);
  // angeklickte Kennung → rechts nur Dokumente, die sie enthalten
  const [pick, setPick] = useState<PartnerId | null>(null);
  const [info, setInfo] = useState(false);
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

  return (
    <div>
      <BackLink href="/partner" label="Partner" />
      <PageHeader
        icon={<SenderLogo domain={p.domain} sender={p.name} cluster={p.cluster} size={56} />}
        title={p.name}
        subtitle={<>{clusterOf(p.cluster).label} · {p.docs.length} {p.docs.length === 1 ? "Dokument" : "Dokumente"} · {fmtDate(p.first)}{p.first !== p.last ? ` – ${fmtDate(p.last)}` : ""}{(!p.active || link?.entry.status === "früher") && " · früher"}</>}
        action={<>
          <button type="button" onClick={() => setInfo(true)} className="inline-flex h-10 items-center gap-1.5 rounded-full border border-card-line bg-surface px-4 text-[13px] font-semibold hover:bg-surface-2"><PanelRight size={15} /> Kontakt & Infos</button>
          <Link href={`/chat?q=${encodeURIComponent(`Was habe ich alles mit ${p.name}? Verträge, Nummern, Kosten, Fristen.`)}`} className="inline-flex h-10 items-center gap-1.5 rounded-full bg-fg px-4 text-[13px] font-semibold text-canvas"><MessageSquare size={15} /> Fragen</Link>
        </>}
      />
      {link && (link.prev || link.next || link.current) && (
        <section className={`mb-4 flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-2xl border px-4 py-3 text-[13.5px] ${link.entry.status === "früher" ? "border-amber/30 bg-amber/5" : "border-card-line bg-surface"}`}>
          <History size={16} className="shrink-0 text-soft" />
          <span className="font-semibold">{link.role} · {span(link.entry)}</span>
          {link.entry.status === "früher" && (link.next ?? link.current) && (
            <span className="inline-flex items-center gap-1.5">Abgelöst durch <ArrowRight size={13} /> <Link href={`/partner/${partnerKey((link.next ?? link.current)!.name)}`} className="font-semibold underline">{(link.next ?? link.current)!.name}</Link>{link.next?.change && <span className="inline-flex items-center gap-1 rounded-full border border-card-line px-2 py-px text-[11px] font-semibold">{link.next.change === "uebergabe" && <GitBranch size={11} />}{CHANGE_LABEL[link.next.change]}</span>}</span>
          )}
          {link.prev && <span className="text-soft">Vorher: <Link href={`/partner/${partnerKey(link.prev.name)}`} className="font-medium underline">{link.prev.name}</Link> ({span(link.prev)})</span>}
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
              <ul className="divide-y divide-line">{deadlines.map((x, i) => <li key={i}><Link href={`/d/${x.d.id}`} className="flex gap-3 px-5 py-2.5 text-[14px] hover:bg-surface-2/70"><span className="tnum w-24 shrink-0 font-semibold">{fmtDate(x.date)}</span><span className="min-w-0 truncate">{x.what}</span></Link></li>)}</ul>
            </section>
          )}
        </div>
        <section className="space-y-3">
          <h2 className="text-[16px] font-semibold">Dokumente</h2>
          <DocTable docs={p.docs} sender={false} archiveToggle={false} restrict={restrict} onClearRestrict={() => setPick(null)} />
        </section>
      </div>
      {info && <PartnerSheet p={p} onClose={() => setInfo(false)} />}
    </div>
  );
}
