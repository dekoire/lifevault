"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Lock } from "lucide-react";
import { SenderLogo } from "@/components/SenderLogo";
import { dateOf, fmtDate, fmtMoney, isUrgent } from "@/lib/docs";
import type { Doc } from "@/lib/types";

/** Dokumente als Karten zum Wischen, zeitlich sortiert (links älter, rechts neuer) – startet beim neuesten */
export function DocCarousel({ docs }: { docs: Doc[] }) {
  const ref = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(docs.length - 1);
  const card = () => (ref.current?.firstElementChild as HTMLElement | null)?.offsetWidth ?? 300;
  useEffect(() => {
    const el = ref.current;
    if (el) el.scrollLeft = el.scrollWidth;
  }, [docs.length]);
  const onScroll = () => {
    const el = ref.current;
    if (!el) return;
    setIndex(Math.min(docs.length - 1, Math.round(el.scrollLeft / (card() + 12))));
  };
  const go = (dir: number) => ref.current?.scrollBy({ left: dir * (card() + 12), behavior: "smooth" });
  const cur = docs[Math.max(0, index)];
  if (!docs.length) return null;
  return (
    <section>
      <div className="mb-2.5 flex items-center justify-between">
        <span className="text-[13px] font-semibold text-muted">{cur ? `${new Date(`${dateOf(cur)}T00:00:00`).toLocaleDateString("de-DE", { month: "long", year: "numeric" })} · ${index + 1} von ${docs.length}` : ""}</span>
        <span className="hidden gap-1.5 sm:flex">
          <button type="button" onClick={() => go(-1)} aria-label="Älter" className="grid h-9 w-9 place-items-center rounded-full border border-card-line bg-surface hover:bg-surface-2"><ChevronLeft size={17} /></button>
          <button type="button" onClick={() => go(1)} aria-label="Neuer" className="grid h-9 w-9 place-items-center rounded-full border border-card-line bg-surface hover:bg-surface-2"><ChevronRight size={17} /></button>
        </span>
      </div>
      <div ref={ref} onScroll={onScroll} className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto scroll-smooth px-4 pb-2 [scrollbar-width:none] md:mx-0 md:px-0">
        {docs.map((d) => (
          <Link key={d.id} href={`/d/${d.id}`} className="flex w-[84%] shrink-0 snap-center flex-col rounded-2xl border border-card-line bg-surface p-4 transition hover:border-brand-500/40 sm:w-[340px] sm:snap-start">
            <span className="flex items-center gap-3">
              <SenderLogo domain={d.sender_domain} sender={d.sender} cluster={d.cluster} urgent={isUrgent(d)} size={40} />
              <span className="min-w-0 flex-1">
                <b className="line-clamp-2 text-[15px] leading-5">{d.title ?? d.file_name}</b>
                <span className="block truncate text-[12px] text-muted">{fmtDate(dateOf(d))}{d.sender ? ` · ${d.sender}` : ""}</span>
              </span>
              {d.encrypted && <Lock size={14} className="shrink-0 text-fg" />}
            </span>
            {d.status === "processing" ? <p className="mt-3 text-[13px] text-muted">Wird ausgelesen …</p> : (
              <>
                {d.summary && <p className="mt-3 line-clamp-4 text-[13px] leading-5 text-soft">{d.summary}</p>}
                {(d.key_facts?.length ?? 0) > 0 && (
                  <dl className="mt-3 divide-y divide-line rounded-xl border border-line text-[12px]">
                    {d.key_facts.slice(0, 4).map((f, i) => <div key={i} className="grid grid-cols-2 gap-2 px-3 py-1.5"><dt className="truncate text-muted">{f.label}</dt><dd className="truncate font-semibold">{f.value}</dd></div>)}
                  </dl>
                )}
                {d.amounts?.[0] && <p className="mt-auto pt-3 text-[13px]"><span className="text-muted">{d.amounts[0].label}: </span><b>{fmtMoney(d.amounts[0].value, d.amounts[0].currency)}</b></p>}
              </>
            )}
          </Link>
        ))}
      </div>
    </section>
  );
}
