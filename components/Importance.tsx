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
export function ImportanceChips({ doc, onChange, relation = false }: { doc: Doc; onChange: (d: Doc) => void; relation?: boolean }) {
  const { allDocs, refresh } = useDocs();
  if (doc.importance === undefined || doc.status !== "ready") return null; // Datenbank noch ohne Wichtigkeit
  const value = importanceOf(doc);
  const save = async (n: number) => {
    const patch = { importance: n, importance_reason: "von dir festgelegt", importance_manual: true };
    onChange({ ...doc, ...patch });
    await supabase.from("documents").update(patch).eq("id", doc.id);
    void refresh();
  };
  const reason = doc.importance_reason && doc.importance_reason !== "von dir festgelegt" ? doc.importance_reason : "";
  // relation: Bezug zur Grundlage als kleiner Link-Chip in derselben Zeile (statt eigener Textzeile)
  const basis = relation && doc.basis_id ? allDocs.find((d) => d.id === doc.basis_id) : undefined;
  const children = relation ? allDocs.filter((d) => d.basis_id === doc.id).length : 0;
  return (
    <>
      <label className={`${CHIP} relative cursor-pointer text-fg hover:bg-surface-2`} title={`${reason ? `${reason} – ` : ""}antippen zum Ändern`}>
        <ImportanceDots value={value} />
        {doc.importance === null ? "Wird bewertet" : importanceLabel(value)}
        <ChevronDown size={12} className="text-muted" />
        <select aria-label="Wichtigkeit" value={value} onChange={(e) => void save(Number(e.target.value))} className="absolute inset-0 cursor-pointer opacity-0">
          {IMPORTANCE.map((x) => <option key={x.value} value={x.value}>{x.value} – {x.label}</option>)}
        </select>
      </label>
      {(relation ? doc.partner_role === "grundlage" : doc.partner_role) && <span className={`${CHIP} text-soft`} title={children ? `Grundlage für ${children} ${children === 1 ? "Dokument" : "Dokumente"}` : "Rolle beim Partner"}>{roleLabel(doc.partner_role)}{relation && children > 0 && <span className="tnum text-muted">· {children}</span>}</span>}
      {basis && <Link href={`/d/${basis.id}`} className={`${CHIP} max-w-[16rem] text-selected hover:bg-surface-2`} title={`Gehört zu ${basis.title ?? basis.file_name}`}><Link2 size={12} className="shrink-0" /><span className="truncate">{basis.title ?? basis.file_name}</span></Link>}
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
    <p className={`flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[13px] leading-5 text-muted ${className}`}>
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

/** Eigene Kachel (rechts unter dem Original): Wichtigkeit mit Grund, Rolle beim Partner, Bezug zur Grundlage und was dazugehört */
export function ImportanceCard({ doc, onChange }: { doc: Doc; onChange: (d: Doc) => void }) {
  const { allDocs, refresh } = useDocs();
  if (doc.importance === undefined || doc.status !== "ready") return null;
  const value = importanceOf(doc);
  const save = async (n: number) => {
    const patch = { importance: n, importance_reason: "von dir festgelegt", importance_manual: true };
    onChange({ ...doc, ...patch });
    await supabase.from("documents").update(patch).eq("id", doc.id);
    void refresh();
  };
  const basis = doc.basis_id ? allDocs.find((d) => d.id === doc.basis_id) : undefined;
  const children = allDocs.filter((d) => d.basis_id === doc.id).sort((a, b) => (b.doc_date ?? b.received_at).localeCompare(a.doc_date ?? a.received_at));
  const reason = doc.importance === null ? "Wird gerade bewertet …" : doc.importance_reason === "von dir festgelegt" ? "" : doc.importance_reason ?? "";
  const docLink = (d: Doc) => <Link key={d.id} href={`/d/${d.id}`} className="block truncate font-semibold text-selected hover:underline">{d.title ?? d.file_name}</Link>;
  const rows = [
    doc.partner_role && { k: "Rolle", v: <span className="font-semibold">{roleLabel(doc.partner_role)}</span> },
    basis && { k: "Gehört zu", v: docLink(basis) },
    children.length > 0 && { k: "Grundlage für", v: <>{children.slice(0, 3).map(docLink)}{children.length > 3 && <span className="text-muted">+ {children.length - 3} weitere</span>}</> },
  ].filter((r): r is { k: string; v: React.JSX.Element } => !!r);
  return (
    <section className="rounded-2xl border border-card-line bg-surface shadow-card">
      <div className="px-4 pt-3.5 pb-3">
        <div className="flex items-start gap-3">
          <span className="min-w-0 flex-1">
            <span className="block text-[12px] font-semibold tracking-wide text-muted uppercase">Wichtigkeit</span>
            <b className="block text-[19px] leading-7">{importanceLabel(value)}</b>
          </span>
          <label className={`${CHIP} relative mt-1 shrink-0 cursor-pointer text-soft hover:bg-surface-2`} title="Wichtigkeit ändern">
            Ändern
            <ChevronDown size={12} className="text-muted" />
          <select aria-label="Wichtigkeit" value={value} onChange={(e) => void save(Number(e.target.value))} className="absolute inset-0 cursor-pointer opacity-0">
            {IMPORTANCE.map((x) => <option key={x.value} value={x.value}>{x.value} – {x.label}</option>)}
            </select>
          </label>
        </div>
        {/* Stufe als Balken: 1 Unwichtig … 5 Unverzichtbar */}
        <div className="mt-2 grid grid-cols-5 gap-1" aria-hidden>
          {[1, 2, 3, 4, 5].map((i) => <span key={i} className="h-1.5 rounded-full" style={{ background: i <= value ? `color-mix(in srgb, var(--color-brand-500) ${40 + i * 12}%, transparent)` : "var(--color-line)" }} />)}
        </div>
        <div className="mt-1 flex justify-between text-[11px] text-muted"><span>unwichtig</span><span>unverzichtbar</span></div>
        {reason && <p className="mt-2 text-[13px] leading-5 text-soft"><b className="font-semibold text-fg">Warum: </b>{reason}</p>}
        {doc.importance_manual && <p className="mt-1 text-[12px] text-muted">Von dir festgelegt – bleibt beim Neubewerten.</p>}
      </div>
      {rows.length > 0 && (
        <dl className="divide-y divide-line border-t border-line text-[13px]">
          {rows.map((r) => <div key={r.k} className="grid grid-cols-[7rem_minmax(0,1fr)] gap-2 px-4 py-2.5"><dt className="text-muted">{r.k}</dt><dd className="min-w-0 space-y-0.5">{r.v}</dd></div>)}
        </dl>
      )}
    </section>
  );
}
