"use client";
import Link from "next/link";
import { Link2 } from "lucide-react";
import { IMPORTANCE, importanceLabel, importanceOf, roleLabel } from "@/lib/importance";
import { useDocs } from "@/lib/docs";
import { supabase } from "@/lib/supabase";
import type { Doc } from "@/lib/types";

/** Fünf kleine Punkte: wie wichtig das Dokument ist */
export function ImportanceDots({ value, size = 5 }: { value: number; size?: number }) {
  return (
    <span className="inline-flex shrink-0 items-center gap-[2px]" role="img" aria-label={`Wichtigkeit ${value} von 5: ${importanceLabel(value)}`} title={`${importanceLabel(value)} (${value}/5)`}>
      {[1, 2, 3, 4, 5].map((i) => <span key={i} className={`rounded-full ${i <= value ? "bg-brand-500" : "bg-line"}`} style={{ width: size, height: size }} />)}
    </span>
  );
}

/** Wichtigkeit (änderbar), Grund, Rolle beim Partner und Bezug zur Grundlage */
export function DocImportance({ doc, onChange }: { doc: Doc; onChange: (d: Doc) => void }) {
  const { allDocs, refresh } = useDocs();
  if (doc.importance === undefined) return null; // Datenbank noch ohne Wichtigkeit
  const value = importanceOf(doc);
  const basis = doc.basis_id ? allDocs.find((d) => d.id === doc.basis_id) : undefined;
  // Dokumente, die auf dieses als Grundlage verweisen (Rechnungen, Nachträge …)
  const children = allDocs.filter((d) => d.basis_id === doc.id);
  const save = async (n: number) => {
    const patch = { importance: n, importance_reason: "von dir festgelegt", importance_manual: true };
    onChange({ ...doc, ...patch });
    await supabase.from("documents").update(patch).eq("id", doc.id);
    void refresh();
  };
  return (
    <div className="space-y-1.5 text-[12px] text-muted">
      <div className="flex flex-wrap items-center gap-2">
        <span>Wichtigkeit</span>
        <ImportanceDots value={value} size={6} />
        <select aria-label="Wichtigkeit" value={value} onChange={(e) => void save(Number(e.target.value))} className="h-8 min-w-0 rounded-full border border-card-line bg-surface px-2.5 text-[12.5px] font-semibold text-fg">
          {IMPORTANCE.map((x) => <option key={x.value} value={x.value}>{x.value} – {x.label}</option>)}
        </select>
        {doc.partner_role && <span className="rounded-full border border-card-line px-2 py-px font-semibold text-fg" title="Rolle beim Partner">{roleLabel(doc.partner_role)}</span>}
      </div>
      {doc.importance === null ? <p>Wird noch bewertet …</p> : doc.importance_reason && <p>{doc.importance_reason}</p>}
      {basis && <p className="flex items-center gap-1"><Link2 size={12} /> Gehört zu <Link href={`/d/${basis.id}`} className="font-semibold text-selected hover:underline">{basis.title ?? basis.file_name}</Link></p>}
      {children.length > 0 && <p className="flex items-center gap-1"><Link2 size={12} /> Grundlage für {children.length} {children.length === 1 ? "Dokument" : "Dokumente"}</p>}
    </div>
  );
}
