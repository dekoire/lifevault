"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { AlertCircle, Check, ChevronDown, CloudUpload, FileSearch, FolderCheck, Loader2, RefreshCw, Scissors } from "lucide-react";
import { SenderLogo } from "@/components/SenderLogo";
import { clusterOf } from "@/lib/clusters";
import { fmtDate, useDocs, type BatchItem } from "@/lib/docs";
import type { Doc } from "@/lib/types";

type Step = 0 | 1 | 2 | 3; // 0 hochladen, 1 auslesen, 2 einsortieren (fertig), 3 Fehler

/** Fortschritt nach dem Hochladen: hochgeladen → ausgelesen → einsortiert, danach Vorschau und zurück zur Startseite */
export function UploadProgress() {
  const { batch, clearBatch, allDocs, reprocess } = useDocs();
  const router = useRouter();
  const [min, setMin] = useState(false);
  if (!batch.length) return null;

  const rows = batch.map((b) => {
    const doc = b.id ? allDocs.find((d) => d.id === b.id) : undefined;
    const parts = b.id && !doc ? allDocs.filter((d) => d.split_from === b.id) : [];
    const docs = doc ? [doc] : parts;
    const step: Step = b.state === "failed" || docs.some((d) => d.status === "error") ? 3 : b.state === "uploading" || !docs.length ? 0 : docs.every((d) => d.status === "ready") ? 2 : 1;
    return { b, docs, split: parts.length > 0, step };
  });
  const done = rows.every((r) => r.step >= 2);
  const failed = rows.filter((r) => r.step === 3).length;
  const working = rows.filter((r) => r.step < 2).length;
  const close = (home: boolean) => { clearBatch(); setMin(false); if (home) router.push("/"); };

  if (min) return (
    <button type="button" onClick={() => setMin(false)} className="sheet-up fixed right-4 bottom-24 z-40 inline-flex h-11 items-center gap-2 rounded-full bg-fg px-4 text-[13px] font-semibold text-canvas shadow-[0_8px_24px_rgba(16,24,40,.25)] lg:bottom-6">
      {done ? <Check size={16} /> : <Loader2 size={16} className="animate-spin" />} {done ? "Fertig – ansehen" : `${working} ${working === 1 ? "wird" : "werden"} verarbeitet`}
    </button>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center" role="dialog" aria-modal="true" aria-label="Hochladen">
      <div className="sheet-up pb-safe flex max-h-[88dvh] w-full max-w-lg flex-col rounded-t-3xl bg-surface sm:rounded-3xl">
        <div className="flex items-center justify-between px-5 pt-5 pb-3">
          <div>
            <h2 className="text-[18px] font-semibold">{!done ? "Wird verarbeitet …" : failed ? (failed === rows.length ? "Das hat nicht geklappt" : "Fast alles einsortiert") : "Fertig einsortiert"}</h2>
            <p className="text-[13px] text-muted">{done ? (failed ? `${failed} von ${rows.length} konnte${failed === 1 ? "" : "n"} nicht ausgelesen werden.` : `${rows.reduce((n, r) => n + r.docs.length, 0)} ${rows.length === 1 && rows[0].docs.length === 1 ? "Dokument" : "Dokumente"} in deinem Tresor`) : "Du kannst das Fenster schließen – es läuft im Hintergrund weiter."}</p>
          </div>
          {!done && <button type="button" onClick={() => setMin(true)} aria-label="Im Hintergrund weiter" className="grid h-9 w-9 place-items-center rounded-full bg-surface-3"><ChevronDown size={18} /></button>}
        </div>
        <ul className="flex-1 space-y-3 overflow-y-auto px-5 pb-4">
          {rows.map(({ b, docs, split, step }) => (
            <li key={b.key} className="rounded-2xl border border-card-line p-4">
              <Steps step={step} split={split} />
              {step < 2 && <p className="mt-3 truncate text-[14px] font-semibold">{b.name}</p>}
              {step === 3 && (
                <p className="mt-2 flex items-start gap-1.5 text-[13px] text-negative-text"><AlertCircle size={15} className="mt-0.5 shrink-0" /> {b.error ?? docs.find((d) => d.error)?.error ?? "Das hat nicht geklappt."}
                  {docs[0] && <button type="button" onClick={() => void reprocess(docs[0].id)} className="ml-auto inline-flex shrink-0 items-center gap-1 font-semibold text-fg"><RefreshCw size={13} /> Erneut</button>}
                </p>
              )}
              {step === 2 && <div className="mt-3 space-y-2">{docs.map((d) => <Preview key={d.id} d={d} onOpen={() => clearBatch()} />)}</div>}
            </li>
          ))}
        </ul>
        <div className="flex gap-2 border-t border-line px-5 py-4">
          <button type="button" onClick={() => close(true)} disabled={!done} className="h-12 flex-1 rounded-full bg-brand-500 text-[15px] font-semibold text-white disabled:opacity-40">{done ? "Zur Startseite" : "Bitte warten …"}</button>
          {!done && <button type="button" onClick={() => setMin(true)} className="h-12 rounded-full bg-surface-3 px-5 text-[14px] font-semibold">Ausblenden</button>}
        </div>
      </div>
    </div>
  );
}

function Steps({ step, split }: { step: Step; split: boolean }) {
  const list = [
    { icon: CloudUpload, label: "Hochgeladen" },
    { icon: split ? Scissors : FileSearch, label: split ? "Getrennt" : "Ausgelesen" },
    { icon: FolderCheck, label: "Einsortiert" },
  ];
  return (
    <ol className="grid grid-cols-3">
      {list.map(({ icon: Icon, label }, i) => {
        const state = step === 3 ? (i === 0 ? "done" : "fail") : i < step || step === 2 ? "done" : i === step ? "active" : "todo";
        return (
          <li key={label} className="relative flex flex-col items-center gap-1.5 text-center">
            {i > 0 && <span aria-hidden className={`absolute top-3.5 right-1/2 h-0.5 w-full ${state === "done" ? "bg-positive" : "bg-line"}`} />}
            <span className={`relative grid h-7 w-7 place-items-center rounded-full ${state === "done" ? "bg-positive text-white" : state === "active" ? "bg-lavender text-selected" : state === "fail" ? "bg-negative/10 text-negative-text" : "bg-surface-3 text-muted"}`}>
              {state === "done" ? <Check size={14} strokeWidth={2.6} /> : state === "active" ? <Loader2 size={14} className="animate-spin" /> : <Icon size={14} />}
            </span>
            <span className={`text-[11px] font-semibold ${state === "active" ? "text-shimmer" : state === "todo" ? "text-muted" : state === "fail" ? "text-negative-text" : ""}`}>{label}</span>
          </li>
        );
      })}
    </ol>
  );
}

function Preview({ d, onOpen }: { d: Doc; onOpen: () => void }) {
  const c = clusterOf(d.cluster);
  return (
    <Link href={`/d/${d.id}`} onClick={onOpen} className="flex gap-3 rounded-xl bg-surface-2 p-3 hover:bg-surface-3">
      <SenderLogo domain={d.sender_domain} sender={d.sender} cluster={d.cluster} size={42} />
      <span className="min-w-0 flex-1">
        <b className="line-clamp-2 text-[14px] leading-5">{d.title ?? d.file_name}</b>
        <span className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[12px] text-muted">
          <span className="rounded-full px-2 py-px font-semibold" style={{ color: c.color, background: `color-mix(in srgb, ${c.color} 12%, transparent)` }}>{c.label}</span>
          {fmtDate(d.doc_date ?? d.received_at)}{d.sender ? ` · ${d.sender}` : ""}
        </span>
        {d.summary && <span className="mt-1 line-clamp-2 block text-[12px] leading-4 text-soft">{d.summary}</span>}
      </span>
    </Link>
  );
}
