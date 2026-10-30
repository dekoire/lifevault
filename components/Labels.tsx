"use client";
import { useState } from "react";
import { Check, Pencil, X } from "lucide-react";
import { useDocs } from "@/lib/docs";
import { groupOf, LABEL_GROUPS } from "@/lib/labels";
import { supabase } from "@/lib/supabase";
import type { Doc } from "@/lib/types";

/** Ein Tag als Pill in der Farbe seines Typs */
export function LabelChip({ tag, on = true, onClick }: { tag: string; on?: boolean; onClick?: () => void }) {
  const color = groupOf(tag)?.color ?? "#64748b";
  // ruhig: weiße Pill mit feinem Rand, die Farbe nur als Punkt (Typ des Tags)
  const cls = `inline-flex h-7 items-center gap-1.5 rounded-full border px-2.5 text-[12px] font-semibold transition-colors ${on ? "border-card-line bg-surface text-fg" : "border-dashed border-card-line text-muted hover:text-fg"}`;
  const dot = <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: on ? color : "var(--color-line-strong)" }} />;
  return onClick
    ? <button type="button" onClick={onClick} aria-pressed={on} className={cls}>{on ? <Check size={12} strokeWidth={3} /> : dot}{tag}</button>
    : <span className={cls}>{dot}{tag}</span>;
}

/** Tags eines Dokuments, nach Typ gruppiert; „Bearbeiten“ zeigt den ganzen Katalog zum An-/Abwählen */
export function DocLabels({ doc, onChange, inline = false }: { doc: Doc; onChange?: (d: Doc) => void; inline?: boolean }) {
  const { refresh } = useDocs();
  const [edit, setEdit] = useState(false);
  const labels = doc.labels ?? [];
  const toggle = async (t: string) => {
    const next = labels.includes(t) ? labels.filter((x) => x !== t) : [...labels, t];
    onChange?.({ ...doc, labels: next, topic_manual: true });
    await supabase.from("documents").update({ labels: next, topic_manual: true }).eq("id", doc.id);
    void refresh();
  };
  // im Kopf: nur die Tags als Pills, Bearbeiten klappt den Katalog auf
  // im Kopf: Pills reihen sich in die Chip-Zeile der Seite ein (kein eigener Block); Bearbeiten nimmt die ganze Breite
  if (inline && !edit) return (
    <>
      {LABEL_GROUPS.flatMap((g) => g.tags.filter((t) => labels.includes(t))).map((t) => <LabelChip key={t} tag={t} />)}
      <button type="button" onClick={() => setEdit(true)} title="Tags bearbeiten" aria-label="Tags bearbeiten" className="inline-flex h-7 items-center gap-1 rounded-full px-2 text-[12px] font-semibold text-muted hover:bg-surface-2 hover:text-fg"><Pencil size={12} />{labels.length ? "" : " Tags"}</button>
    </>
  );
  const groups = LABEL_GROUPS.map((g) => ({ g, tags: edit ? g.tags : g.tags.filter((t) => labels.includes(t)) })).filter((x) => x.tags.length);
  return (
    <div className={`space-y-2 ${inline ? "mt-1 basis-full rounded-xl border border-card-line bg-surface p-3" : ""}`}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-[12px] font-semibold text-muted">Tags</span>
        <button type="button" onClick={() => setEdit(!edit)} className="inline-flex h-7 items-center gap-1 rounded-full px-2 text-[12px] font-semibold text-soft hover:bg-surface-2 hover:text-fg">{edit ? <><X size={13} /> Fertig</> : <><Pencil size={12} /> Bearbeiten</>}</button>
      </div>
      {!groups.length && <p className="text-[12.5px] text-muted">{doc.labels ? "Keine Tags." : "Tags werden gerade vergeben …"}</p>}
      {groups.map(({ g, tags }) => (
        <div key={g.id} className="flex flex-wrap items-center gap-1.5">
          <span className="mr-0.5 inline-flex items-center gap-1.5 text-[11.5px] font-semibold text-muted"><span className="h-2 w-2 rounded-full" style={{ background: g.color }} />{g.label}</span>
          {tags.map((t) => <LabelChip key={t} tag={t} on={labels.includes(t)} onClick={edit ? () => void toggle(t) : undefined} />)}
        </div>
      ))}
    </div>
  );
}
