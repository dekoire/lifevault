"use client";
import Link from "next/link";
import { AlertCircle, Archive, ChevronRight, Lock } from "lucide-react";
import { ClusterTag } from "@/components/ClusterIcon";
import { SenderLogo } from "@/components/SenderLogo";
import { fmtDate, isUrgent } from "@/lib/docs";
import type { Doc } from "@/lib/types";

const GRID = "md:grid md:grid-cols-[minmax(0,1fr)_14rem_11rem_6.5rem_1rem] md:items-center md:gap-4";
const HEAD = "text-[12px] font-semibold text-muted";

/** „Zuletzt hinzugefügt“ als Tabelle: Dokument · Absender · Bereich · Datum (am Handy kompakt) */
export function RecentTable({ docs }: { docs: Doc[] }) {
  return (
    <>
      <div className={`hidden border-b border-line px-4 py-[18px] md:px-6 ${GRID}`} role="row">
        <span className={HEAD}>Dokument</span><span className={HEAD}>Absender</span><span className={HEAD}>Bereich</span><span className={`${HEAD} text-right`}>Datum</span><span />
      </div>
      <div className="divide-y divide-line border-t border-line md:border-t-0">
        {docs.map((d) => {
          const processing = d.status === "processing";
          return (
            <Link key={d.id} href={`/d/${d.id}`} className={`flex items-center gap-3 px-4 py-3.5 md:px-6 transition-colors hover:bg-canvas ${GRID} ${d.archived ? "opacity-60" : ""}`}>
              <span className="flex min-w-0 flex-1 items-center gap-3">
                {processing
                  ? <span className="grid h-9 w-9 shrink-0 place-items-center rounded-[10px] bg-brand-500"><span className="flex gap-0.5">{[0, 1, 2].map((i) => <span key={i} className="typing-dot h-1.5 w-1.5 rounded-full bg-canvas" style={{ animationDelay: `${i * 0.15}s` }} />)}</span></span>
                  : <SenderLogo domain={d.sender_domain} sender={d.sender} cluster={d.cluster} urgent={isUrgent(d)} size={36} />}
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5">
                    <span className="truncate text-[14px] font-semibold">{processing ? d.file_name : d.title ?? d.file_name}</span>
                    {d.encrypted && <Lock size={13} className="shrink-0 text-brand-500" aria-label="verschlüsselt" />}
                    {d.archived && <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-card-line px-3 py-1 text-[12px] font-semibold text-soft"><Archive size={11} /> Archiv</span>}
                  </span>
                  <span className="block truncate text-[12px] text-muted">
                    {processing ? <span className="text-shimmer font-medium">Wird ausgelesen</span> : d.status === "error" ? <span className="inline-flex items-center gap-1 text-negative-text"><AlertCircle size={12} /> {d.error ?? "Fehler"}</span> : <>{d.doc_type ?? "Dokument"}<span className="md:hidden">{d.sender ? ` · ${d.sender}` : ""} · {fmtDate(d.doc_date ?? d.received_at)}</span></>}
                  </span>
                </span>
              </span>
              <span className="hidden truncate text-[13px] text-soft md:block">{d.sender ?? "–"}</span>
              <span className="hidden text-[13px] md:block"><ClusterTag id={d.cluster} /></span>
              <span className="tnum hidden text-right text-[13px] text-soft md:block">{fmtDate(d.doc_date ?? d.received_at)}</span>
              <ChevronRight size={16} className="shrink-0 text-muted" />
            </Link>
          );
        })}
      </div>
    </>
  );
}
