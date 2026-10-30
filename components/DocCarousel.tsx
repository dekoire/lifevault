"use client";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Lock, LockKeyhole, ShieldCheck } from "lucide-react";
import { KindTag } from "@/components/KindTag";
import { SenderLogo } from "@/components/SenderLogo";
import { dateOf, fmtDate, fmtMoney, isUrgent } from "@/lib/docs";
import type { Doc, SecretPart } from "@/lib/types";
import { useMe } from "@/lib/me";
import { useEdgeFade } from "@/lib/edgefade";
import { openJson } from "@/lib/vault";

/** Dokumente als Karten zum Wischen, zeitlich sortiert (links älter, rechts neuer) – startet beim neuesten */
export function DocCarousel({ docs, grid = false }: { docs: Doc[]; grid?: boolean }) {
  const ref = useRef<HTMLDivElement | null>(null);
  const fade = useEdgeFade<HTMLDivElement>();
  const setRef = useCallback((el: HTMLDivElement | null) => { ref.current = el; fade(el); }, [fade]);
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
  // untereinander als Raster (Bereichsseiten), sonst zum Wischen
  if (grid) return <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{docs.map((d) => <DocCard key={d.id} d={d} wide />)}</div>;
  return (
    <section>
      <div className="mb-2.5 flex items-center justify-between">
        <span className="text-[13px] font-semibold text-muted">{cur ? `${new Date(`${dateOf(cur)}T00:00:00`).toLocaleDateString("de-DE", { month: "long", year: "numeric" })} · ${index + 1} von ${docs.length}` : ""}</span>
        <span className="hidden gap-1.5 sm:flex">
          <button type="button" onClick={() => go(-1)} aria-label="Älter" className="grid h-9 w-9 place-items-center rounded-full border border-card-line bg-surface hover:bg-surface-2"><ChevronLeft size={17} /></button>
          <button type="button" onClick={() => go(1)} aria-label="Neuer" className="grid h-9 w-9 place-items-center rounded-full border border-card-line bg-surface hover:bg-surface-2"><ChevronRight size={17} /></button>
        </span>
      </div>
      <div ref={setRef} onScroll={onScroll} className="fade-x -mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto scroll-smooth px-4 pb-2 [scrollbar-width:none] md:mx-0 md:px-0">
        {docs.map((d) => <DocCard key={d.id} d={d} />)}
      </div>
    </section>
  );
}

/** Eine Dokument-Karte: Logo, Titel, Kurzfassung, wichtigste Angaben */
function DocCard({ d, wide = false }: { d: Doc; wide?: boolean }) {
  return (
          <Link href={`/d/${d.id}`} className={`flex flex-col ${wide ? "w-full" : "w-[84%] shrink-0 snap-center sm:w-[340px] sm:snap-start"} rounded-2xl border border-card-line bg-surface p-4 transition hover:border-brand-500/40`}>
            <span className="flex items-center gap-3">
              <SenderLogo domain={d.sender_domain} sender={d.sender} cluster={d.cluster} urgent={isUrgent(d)} size={40} />
              <span className="min-w-0 flex-1">
                <b className="line-clamp-2 text-[15px] leading-5">{d.title ?? d.file_name}</b>
                <span className="mt-0.5 flex min-w-0 items-center gap-1.5 text-[12px] text-muted"><KindTag d={d} /><span className="truncate">{fmtDate(dateOf(d))}{d.sender ? ` · ${d.sender}` : ""}</span></span>
              </span>
              {d.encrypted && <Lock size={14} className="shrink-0 text-fg" />}
            </span>
            {d.encrypted && !d.summary ? <EncryptedPreview d={d} /> : d.status === "processing" ? <p className="mt-3 text-[13px] text-muted">Wird ausgelesen …</p> : (
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
  );
}

/** Verschlüsseltes Dokument: bei entsperrtem Tresor die Zusammenfassung entschlüsselt zeigen, sonst ein schöner Platzhalter */
function EncryptedPreview({ d }: { d: Doc }) {
  const { unlocked } = useMe();
  const [summary, setSummary] = useState<string | null>(null);
  useEffect(() => {
    if (!unlocked || !d.secret) { setSummary(null); return; }
    void openJson<SecretPart>(d.secret).then((p) => setSummary(p.summary ?? null)).catch(() => setSummary(null));
  }, [unlocked, d.secret]);
  if (summary) return <p className="mt-3 line-clamp-6 text-[13px] leading-5 text-soft">{summary}</p>;
  return (
    <div className="mt-3 flex flex-1 flex-col items-center justify-center rounded-xl bg-lavender/60 px-4 py-6 text-center">
      <span className="grid h-11 w-11 place-items-center rounded-2xl bg-brand-500 text-white"><LockKeyhole size={20} /></span>
      <b className="mt-3 text-[14px]">Verschlüsselt</b>
      <span className="mt-0.5 text-[13px] text-soft">{d.doc_type ?? "Dokument"} · Inhalt sichtbar nach dem Entsperren des Tresors</span>
      <span className="mt-3 inline-flex items-center gap-1 rounded-full bg-surface px-3 py-2 text-[12px] leading-4 font-semibold text-brand-600"><ShieldCheck size={13} /> Ende-zu-Ende geschützt</span>
    </div>
  );
}
