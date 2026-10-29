"use client";
import Link from "next/link";
import { use, useMemo } from "react";
import { CalendarClock, ExternalLink, Hash, MessageSquare, ShoppingBag } from "lucide-react";
import { CopyValue } from "@/components/CopyValue";
import { DocTable } from "@/components/DocTable";
import { SenderLogo } from "@/components/SenderLogo";
import { BackLink, CARD, PageHeader } from "@/components/ui";
import { clusterOf } from "@/lib/clusters";
import { fmtDate, fmtMoney, useDocs } from "@/lib/docs";
import { buildPartners } from "@/lib/partners";

/** Ein Partner: alle Kennungen zum Kopieren, Fristen, Einkäufe und Dokumente */
export default function PartnerPage({ params }: { params: Promise<{ key: string }> }) {
  const { key } = use(params);
  const { docs, loading } = useDocs();
  const p = useMemo(() => buildPartners(docs).find((x) => x.key === key), [docs, key]);
  const today = new Date().toISOString().slice(0, 10);
  if (!p) return <p className="py-20 text-center text-muted">{loading ? "Lädt …" : "Nicht gefunden."}</p>;

  // gleiche Bezeichnung mit anderem Wert in älterem Dokument → „früher“
  const latestByLabel = new Map<string, string>();
  for (const i of p.ids) if (!latestByLabel.has(i.label.toLowerCase())) latestByLabel.set(i.label.toLowerCase(), i.value);
  const deadlines = p.docs.flatMap((d) => (d.deadlines ?? []).filter((x) => x.date >= today).map((x) => ({ ...x, d }))).sort((a, b) => a.date.localeCompare(b.date));
  const total = p.docs.map((d) => d.amounts?.find((a) => /summe|gesamt|betrag|total/i.test(a.label)) ?? d.amounts?.[0]).filter(Boolean) as { value: number; currency: string }[];
  const spent = total.reduce((s, a) => s + a.value, 0);

  return (
    <div className="max-w-5xl">
      <BackLink href="/partner" label="Partner" />
      <PageHeader
        icon={<SenderLogo domain={p.domain} sender={p.name} cluster={p.cluster} size={56} />}
        title={p.name}
        subtitle={<>{clusterOf(p.cluster).label} · {p.docs.length} {p.docs.length === 1 ? "Dokument" : "Dokumente"} · {fmtDate(p.first)}{p.first !== p.last ? ` – ${fmtDate(p.last)}` : ""}{!p.active && " · früher"}</>}
        action={<>
          {p.domain && <a href={`https://${p.domain}`} target="_blank" rel="noopener noreferrer" className="inline-flex h-10 items-center gap-1.5 rounded-full border border-card-line bg-surface px-4 text-[13px] font-semibold hover:bg-surface-2"><ExternalLink size={15} /> {p.domain}</a>}
          <Link href={`/chat?q=${encodeURIComponent(`Was habe ich alles mit ${p.name}? Verträge, Nummern, Kosten, Fristen.`)}`} className="inline-flex h-10 items-center gap-1.5 rounded-full bg-fg px-4 text-[13px] font-semibold text-canvas"><MessageSquare size={15} /> Fragen</Link>
        </>}
      />
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
              <ul className="divide-y divide-line">
                {p.ids.map((i, n) => {
                  const old = latestByLabel.get(i.label.toLowerCase()) !== i.value;
                  return (
                    <li key={n} className={`grid grid-cols-[minmax(0,2fr)_minmax(0,3fr)] gap-3 px-5 py-2.5 text-[14px] ${old ? "opacity-55" : ""}`}>
                      <span className="min-w-0 break-words hyphens-auto text-muted" lang="de">{i.label}{old && <span className="ml-1.5 rounded-full border border-card-line px-1.5 text-[10px]">früher</span>}</span>
                      <span className="min-w-0">
                        <CopyValue value={i.value} />
                        <Link href={`/d/${i.docId}`} className="block truncate text-[11px] text-muted hover:text-selected">aus {i.docTitle} · {fmtDate(i.date)}</Link>
                      </span>
                    </li>
                  );
                })}
              </ul>
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
          <DocTable docs={p.docs} sender={false} archiveToggle={false} />
        </section>
      </div>
    </div>
  );
}
