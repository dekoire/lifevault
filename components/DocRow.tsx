import Link from "next/link";
import { AlertCircle, Archive, ChevronRight, Lock } from "lucide-react";
import { SenderLogo } from "@/components/SenderLogo";
import { clusterOf } from "@/lib/clusters";
import { fmtDate } from "@/lib/docs";
import type { Doc } from "@/lib/types";

export { CARD } from "@/components/ui";

/** Eine Zeile: Logo bzw. Bereichs-Symbol, Titel, Absender · Datum, Kennzeichen (verschlüsselt, archiviert) */
export function DocRow({ d }: { d: Doc }) {
  const processing = d.status === "processing";
  return (
    <Link href={`/d/${d.id}`} className={`flex items-center gap-3 px-4 py-3 transition-colors hover:bg-surface-2/70 active:bg-surface-2 ${d.archived ? "opacity-60" : ""}`}>
      {processing ? (
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-lavender"><span className="flex gap-0.5">{[0, 1, 2].map((i) => <span key={i} className="typing-dot h-1.5 w-1.5 rounded-full bg-brand-500" style={{ animationDelay: `${i * 0.15}s` }} />)}</span></span>
      ) : <SenderLogo domain={d.sender_domain} sender={d.sender} cluster={d.cluster} />}
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5">
          <span className="truncate text-[15px] font-semibold">{processing ? d.file_name : d.title ?? d.file_name}</span>
          {d.encrypted && <Lock size={13} className="shrink-0 text-brand-500" aria-label="verschlüsselt" />}
          {d.archived && <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-surface-3 px-1.5 py-px text-[11px] font-semibold text-soft"><Archive size={11} /> Archiv</span>}
        </span>
        <span className="block truncate text-[13px] text-muted">
          {processing ? <span className="text-shimmer font-medium">Wird ausgelesen</span> : d.status === "error" ? <span className="inline-flex items-center gap-1 text-negative-text"><AlertCircle size={13} /> {d.error ?? "Fehler"}</span> : <>{[d.sender, fmtDate(d.doc_date ?? d.received_at)].filter(Boolean).join(" · ")}{d.cluster && <> · {clusterOf(d.cluster).label}</>}</>}
        </span>
      </span>
      <ChevronRight size={16} className="shrink-0 text-muted" />
    </Link>
  );
}
