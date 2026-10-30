"use client";
import { IconTile } from "@/components/ClusterIcon";
import Link from "next/link";
import { ArrowRight, FileClock, GitBranch, History as HistoryIcon, Repeat, Home } from "lucide-react";
import { SenderLogo } from "@/components/SenderLogo";
import { CopyValue } from "@/components/CopyValue";
import { CARD } from "@/components/ui";
import { CHANGE_LABEL, span, type History } from "@/lib/history";
import { domainFor, partnerKey } from "@/lib/partners";
import type { Doc } from "@/lib/types";

/** Verlauf je Rolle (Hausarzt, Urologe, Arbeitgeber …): früher → aktuell, mit Übergaben; dazu alte → neue Verträge */
export function HistoryTimeline({ history, docs }: { history: History; docs: Doc[] }) {
  const roles = history.roles.filter((r) => r.chain.length > 0).sort((a, b) => b.chain.length - a.chain.length);
  const title = (id: string | null) => (id ? docs.find((d) => d.id === id)?.title ?? null : null);
  if (!roles.length && !history.contracts.length) return null;
  return (
    <section className={`${CARD} overflow-hidden`}>
      <h2 className="flex items-center gap-2.5 px-5 pt-4 pb-1 text-[16px] font-semibold"><IconTile icon={HistoryIcon} size={36} />Verlauf & Wechsel</h2>
      <p className="px-5 pb-3 text-[13px] text-muted">Wer früher zuständig war und wer es jetzt ist – erkannt aus deinen Unterlagen. Übergaben ohne ausdrücklichen Beleg sind als „wahrscheinlich“ markiert.</p>
      <div className="divide-y divide-line border-t border-line">
        {roles.map((r) => (
          <div key={r.role} className="px-5 py-4">
            <h3 className="mb-3 text-[12px] font-semibold tracking-wide text-soft uppercase">{r.role}</h3>
            <ol className="relative space-y-3">
              {r.chain.map((e, i) => {
                // Wohnung/Adresse: kein Firmenlogo (der Beleg kommt z. B. vom Arbeitgeber), sondern ein Haus – Adresse zum Kopieren
                const home = /wohn|adresse|anschrift|umzug/i.test(r.role);
                const now = e.status === "aktuell";
                const sender = docs.find((d) => e.docIds.includes(d.id));
                return (
                  <li key={i} className="relative flex gap-3">
                    {/* Verbindungslinie zwischen den Einträgen, hinter den Logos */}
                    {i < r.chain.length - 1 && <span aria-hidden className="absolute top-10 bottom-[-0.75rem] left-[17px] w-0.5 bg-line" />}
                    {home ? (
                      <IconTile icon={Home} size={36} color="#65a30d" className={now ? "" : "opacity-60"} />
                    ) : (
                      <Link href={`/partner/${partnerKey(sender?.sender ?? e.name)}`} className={`relative shrink-0 ${now ? "" : "opacity-60"}`}>
                        <SenderLogo domain={logoDomain(e.name, docs) ?? (sender?.sender && !r.chain.some((x) => x !== e && partnerKey(x.name) === partnerKey(sender.sender!)) ? sender.sender_domain : null)} sender={e.name} cluster={sender?.cluster} size={36} />
                      </Link>
                    )}
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-1.5">
                        {home ? <span className={`text-[15px] ${now ? "" : "text-soft"}`}><CopyValue value={e.name} /></span> : <Link href={`/partner/${partnerKey(sender?.sender ?? e.name)}`} className={`text-[15px] font-semibold hover:underline ${now ? "" : "text-soft"}`}>{e.name}</Link>}
                        {now ? <span className="rounded-full bg-positive/10 px-3 py-1 text-[12px] font-semibold text-positive-text">aktuell</span> : <span className="rounded-full border border-card-line px-3 py-1 text-[12px] font-semibold text-soft">früher</span>}
                        {e.change && e.change !== "start" && i > 0 && (
                          <span className="inline-flex items-center gap-1 rounded-full border border-card-line px-3 py-1 text-[12px] font-semibold text-fg">{e.change === "uebergabe" ? <GitBranch size={11} /> : <Repeat size={11} />}{CHANGE_LABEL[e.change]}</span>
                        )}
                      </span>
                      <span className="block text-[13px] text-muted">{span(e)}{e.note ? ` · ${e.note}` : ""}</span>
                    </span>
                  </li>
                );
              })}
            </ol>
          </div>
        ))}
        {history.contracts.length > 0 && (
          <div className="px-5 py-4">
            <h3 className="mb-3 text-[12px] font-semibold tracking-wide text-soft uppercase">Alte und neue Verträge</h3>
            <ul className="space-y-2.5">
              {history.contracts.map((c, i) => (
                <li key={i} className="rounded-xl bg-surface-2 px-3.5 py-3 text-[14px]">
                  <b className="mb-1 flex items-center gap-1.5 font-semibold"><FileClock size={14} /> {c.topic}</b>
                  <span className="flex flex-wrap items-center gap-1.5">
                    {c.oldDocIds.map((id) => title(id) && <Link key={id} href={`/d/${id}`} className="max-w-[16rem] truncate rounded-full border border-card-line bg-surface px-2.5 py-0.5 text-[12px] text-soft line-through decoration-muted/60 hover:underline">{title(id)}</Link>)}
                    {c.currentDocId && title(c.currentDocId) && <><ArrowRight size={14} className="text-muted" /><Link href={`/d/${c.currentDocId}`} className="max-w-[16rem] truncate rounded-full border border-fg bg-surface px-2.5 py-0.5 text-[12px] font-semibold hover:underline">{title(c.currentDocId)}</Link></>}
                  </span>
                  {c.note && <span className="mt-1 block text-[12px] text-muted">{c.note}</span>}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </section>
  );
}

/**
 * Logo-Adresse für einen Eintrag: die Webadresse, die dieser Absender in deinen Dokumenten am häufigsten hat,
 * sonst bekannte Adresse (AOK → aok.de); erst danach die des Belegs – aber nie, wenn der Beleg von einem anderen
 * Eintrag derselben Kette stammt (z. B. BKK-Brief, der die frühere AOK erwähnt).
 */
function logoDomain(name: string, docs: Doc[]) {
  const key = partnerKey(name);
  const count = new Map<string, number>();
  for (const d of docs) if (d.sender && d.sender_domain && partnerKey(d.sender) === key) count.set(d.sender_domain, (count.get(d.sender_domain) ?? 0) + 1);
  const best = [...count.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
  return domainFor(name, null) ?? best ?? null;
}
