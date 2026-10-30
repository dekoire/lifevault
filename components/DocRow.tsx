import Link from "next/link";
import { AlertCircle, Archive, ChevronRight, Lock } from "lucide-react";
import { ImportanceDots } from "@/components/Importance";
import { KindTag } from "@/components/KindTag";
import { SenderLogo } from "@/components/SenderLogo";
import { clusterOf } from "@/lib/clusters";
import { isUrgent, fmtDate } from "@/lib/docs";
import type { Doc } from "@/lib/types";

export { CARD } from "@/components/ui";

/** Eine Zeile: Logo bzw. Bereichs-Symbol, Titel, Absender · Datum, Kennzeichen (verschlüsselt, archiviert, Grundlage), Wichtigkeit */
export function DocRow({ d }: { d: Doc }) {
  const processing = d.status === "processing";
  return (
    <Link href={`/d/${d.id}`} className={`flex items-center gap-3 px-4 py-3 transition-colors hover:bg-surface-2/70 active:bg-surface-2 ${d.archived ? "opacity-60" : ""}`}>
      {processing ? (
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-[10px] bg-brand-500"><span className="flex gap-0.5">{[0, 1, 2].map((i) => <span key={i} className="typing-dot h-1.5 w-1.5 rounded-full bg-canvas" style={{ animationDelay: `${i * 0.15}s` }} />)}</span></span>
      ) : <SenderLogo domain={d.sender_domain} sender={d.sender} cluster={d.cluster} urgent={isUrgent(d)} />}
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5">
          <span className="truncate text-[15px] font-semibold">{processing ? d.file_name : d.title ?? d.file_name}</span>
          {d.encrypted && <Lock size={13} className="shrink-0 text-brand-500" aria-label="verschlüsselt" />}
          {d.archived && <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-card-line px-3 py-1 text-[12px] font-semibold text-soft"><Archive size={11} /> Archiv</span>}
          {d.partner_role === "grundlage" && !d.archived && <span className="shrink-0 rounded-full border border-brand-500/30 px-3 py-1 text-[12px] font-semibold text-brand-500" title="Grundlage beim Partner (z. B. Vertrag)">Grundlage</span>}
        </span>
        <span className="flex min-w-0 items-center gap-1.5 text-[13px] text-muted">
          {processing ? <span className="text-shimmer font-medium">Wird ausgelesen</span> : d.status === "error" ? <span className="inline-flex items-center gap-1 text-negative-text"><AlertCircle size={13} /> {d.error ?? "Fehler"}</span> : <><KindTag d={d} /><span className="truncate">{[d.sender, fmtDate(d.doc_date ?? d.received_at)].filter(Boolean).join(" · ")}{d.cluster && <> · {clusterOf(d.cluster).label}</>}</span></>}
        </span>
      </span>
      {!processing && d.importance != null && <ImportanceDots value={d.importance} />}
      <ChevronRight size={16} className="shrink-0 text-muted" />
    </Link>
  );
}
