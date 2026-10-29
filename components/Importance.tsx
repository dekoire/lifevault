"use client";
import Link from "next/link";
import { ChevronDown, Link2 } from "lucide-react";
import { IMPORTANCE, importanceLabel, importanceOf, roleLabel } from "@/lib/importance";
import { useDocs } from "@/lib/docs";
import { supabase } from "@/lib/supabase";
import type { Doc } from "@/lib/types";

/** Fünf kleine Punkte: wie wichtig das Dokument ist */
export function ImportanceDots({ value, size = 5 }: { value: number; size?: number }) {
  return (
    <span className="inline-flex shrink-0 items-center gap-[2px]" role="img" aria-label={`Wichtigkeit ${value} von 5: ${importanceLabel(value)}`} title={`${importanceLabel(value)} (${value}/5)`}>
      {[1, 2, 3, 4, 5].map((i) => <span key={i} className={`rounded-full ${i <= value ? "bg-brand-500" : "bg-line-strong/60"}`} style={{ width: size, height: size }} />)}
    </span>
  );
}

const CHIP = "inline-flex h-7 items-center gap-1.5 rounded-full border border-card-line px-2.5 text-[12px] font-semibold";

/**
 * Wichtigkeit als Chip (gleich hoch wie Bereich/Status/Tags) und, falls bekannt, die Rolle beim Partner.
 * Antippen öffnet die Auswahl; von Hand gesetzt bleibt sie beim Neubewerten.
 */
export function ImportanceChips({ doc, onChange }: { doc: Doc; onChange: (d: Doc) => void }) {
  const { refresh } = useDocs();
  if (doc.importance === undefined || doc.status !== "ready") return null; // Datenbank noch ohne Wichtigkeit
  const value = importanceOf(doc);
  const save = async (n: number) => {
    const patch = { importance: n, importance_reason: "von dir festgelegt", importance_manual: true };
    onChange({ ...doc, ...patch });
    await supabase.from("documents").update(patch).eq("id", doc.id);
    void refresh();
  };
  return (
    <>
      <label className={`${CHIP} relative cursor-pointer text-fg hover:bg-surface-2`} title="Wichtigkeit ändern">
        <ImportanceDots value={value} />
        {doc.importance === null ? "Wird bewertet" : importanceLabel(value)}
        <ChevronDown size={12} className="text-muted" />
        <select aria-label="Wichtigkeit" value={value} onChange={(e) => void save(Number(e.target.value))} className="absolute inset-0 cursor-pointer opacity-0">
          {IMPORTANCE.map((x) => <option key={x.value} value={x.value}>{x.value} – {x.label}</option>)}
        </select>
      </label>
      {doc.partner_role && <span className={`${CHIP} text-soft`} title="Rolle beim Partner">{roleLabel(doc.partner_role)}</span>}
    </>
  );
}

/** Eine dezente Zeile: warum so wichtig, wozu es gehört, wofür es Grundlage ist */
export function RelationNote({ doc, className = "" }: { doc: Doc; className?: string }) {
  const { allDocs } = useDocs();
  if (doc.importance === undefined) return null;
  const basis = doc.basis_id ? allDocs.find((d) => d.id === doc.basis_id) : undefined;
  const children = allDocs.filter((d) => d.basis_id === doc.id).length;
  const reason = doc.importance_reason && doc.importance_reason !== "von dir festgelegt" ? doc.importance_reason : "";
  if (!reason && !basis && !children) return null;
  return (
    <p className={`flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[12.5px] leading-5 text-muted ${className}`}>
      {reason && <span>{reason}</span>}
      {reason && (basis || children > 0) && <span aria-hidden>·</span>}
      {basis && <span className="inline-flex min-w-0 items-center gap-1"><Link2 size={12} className="shrink-0" /> Gehört zu <Link href={`/d/${basis.id}`} className="truncate font-semibold text-selected hover:underline">{basis.title ?? basis.file_name}</Link></span>}
      {children > 0 && <span className="inline-flex items-center gap-1"><Link2 size={12} /> Grundlage für {children} {children === 1 ? "Dokument" : "Dokumente"}</span>}
    </p>
  );
}

/** Seitenpanel: Wichtigkeit + Rolle als Chips, darunter der Zusammenhang */
export function DocImportance({ doc, onChange }: { doc: Doc; onChange: (d: Doc) => void }) {
  if (doc.importance === undefined || doc.status !== "ready") return null;
  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap items-center gap-1.5"><ImportanceChips doc={doc} onChange={onChange} /></div>
      <RelationNote doc={doc} />
    </div>
  );
}
