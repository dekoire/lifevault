"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { AlertCircle, Check, ChevronDown, CloudUpload, FileSearch, FileText, FolderCheck, Loader2, RefreshCw, Scissors , X } from "lucide-react";
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
  // per X ausgeblendet (läuft im Hintergrund weiter); bei neuen Dateien wieder sichtbar
  const [hidden, setHidden] = useState(0);
  if (!batch.length || (min && hidden === batch.length)) return null;

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
    <div className="hide-on-kb sheet-up fixed right-4 bottom-24 z-40 inline-flex h-11 items-center gap-1 rounded-full bg-brand-500 pr-1.5 pl-4 text-[13px] font-semibold text-white shadow-[0_8px_24px_rgba(85,48,201,.35)] lg:bottom-6">
      <button type="button" onClick={() => setMin(false)} className="inline-flex h-full items-center gap-2 pr-1.5">
        {done ? <Check size={16} /> : <Loader2 size={16} className="animate-spin" />} {done ? "Fertig – ansehen" : `${working} ${working === 1 ? "wird" : "werden"} verarbeitet`}
      </button>
      <button type="button" onClick={() => (done ? close(false) : setHidden(batch.length))} aria-label="Ausblenden" className="grid h-8 w-8 place-items-center rounded-full bg-white/20 text-white hover:bg-white/30"><X size={15} strokeWidth={2.5} /></button>
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center" role="dialog" aria-modal="true" aria-label="Hochladen">
      <div className="sheet-up pb-safe flex max-h-[88dvh] w-full max-w-lg flex-col rounded-t-3xl bg-surface sm:rounded-3xl">
        <div className="flex items-start justify-between gap-4 px-6 pt-6 pb-4 sm:px-8 sm:pt-8">
          <div>
            <h2 className="text-[18px] font-semibold">{!done ? "Wird verarbeitet …" : failed ? (failed === rows.length ? "Das hat nicht geklappt" : "Fast alles einsortiert") : "Fertig einsortiert"}</h2>
            <p className="mt-1 text-[13px] text-muted">{done ? (failed ? `${failed} von ${rows.length} konnte${failed === 1 ? "" : "n"} nicht ausgelesen werden.` : `${rows.reduce((n, r) => n + r.docs.length, 0)} ${rows.length === 1 && rows[0].docs.length === 1 ? "Dokument" : "Dokumente"} in deinem Tresor`) : "Du kannst das Fenster schließen – es läuft im Hintergrund weiter."}</p>
          </div>
          {!done && <button type="button" onClick={() => setMin(true)} aria-label="Im Hintergrund weiter" className="grid h-9 w-9 place-items-center rounded-full bg-surface-3"><ChevronDown size={18} /></button>}
        </div>
        <ul className="flex-1 space-y-3 overflow-y-auto px-6 pb-5 sm:px-8">
          {rows.map(({ b, docs, split, step }) => (
            <li key={b.key} className="rounded-2xl border border-card-line p-5">
              {step !== 2 && <FileHead name={b.name} step={step} split={split} />}
              <Steps step={step} split={split} />
              {step === 3 && (
                <p className="mt-2 flex items-start gap-1.5 text-[13px] text-negative-text"><AlertCircle size={15} className="mt-0.5 shrink-0" /> {b.error ?? docs.find((d) => d.error)?.error ?? "Das hat nicht geklappt."}
                  {docs[0] && <button type="button" onClick={() => void reprocess(docs[0].id)} className="ml-auto inline-flex shrink-0 items-center gap-1 font-semibold text-fg"><RefreshCw size={13} /> Erneut</button>}
                </p>
              )}
              {step === 2 && <div className="mt-3 space-y-2">{docs.map((d) => <Preview key={d.id} d={d} onOpen={() => clearBatch()} />)}</div>}
            </li>
          ))}
        </ul>
        <div className="flex gap-2.5 border-t border-line px-6 pt-5 pb-6 sm:px-8 sm:pb-8">
          {done
            ? <button type="button" onClick={() => close(true)} className="h-12 flex-1 rounded-full bg-brand-500 text-[15px] font-semibold text-white">Zur Startseite</button>
            : <span className="inline-flex h-12 flex-1 items-center justify-center gap-2 rounded-full border border-card-line text-[14px] font-semibold text-muted"><Loader2 size={16} className="animate-spin" /> In Arbeit – {working} von {rows.length}</span>}
          {!done && <button type="button" onClick={() => setMin(true)} className="h-12 rounded-full bg-surface-3 px-5 text-[14px] font-semibold">Ausblenden</button>}
        </div>
      </div>
    </div>
  );
}

const LABELS = (split: boolean) => [
  { icon: CloudUpload, label: "Hochgeladen", doing: "Wird hochgeladen …" },
  { icon: split ? Scissors : FileSearch, label: split ? "Getrennt" : "Ausgelesen", doing: split ? "Wird getrennt …" : "Wird ausgelesen …" },
  { icon: FolderCheck, label: "Einsortiert", doing: "Wird einsortiert …" },
];

/** Datei-Kopf: Symbol, Name, aktueller Schritt in Worten */
function FileHead({ name, step, split }: { name: string; step: Step; split: boolean }) {
  return (
    <div className="mb-3.5 flex items-center gap-3">
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-surface-2 text-fg"><FileText size={19} strokeWidth={1.8} /></span>
      <span className="min-w-0 flex-1">
        <b className="block truncate text-[15px] leading-5">{name}</b>
        {step === 3
          ? <span className="block text-[13px] font-medium text-negative-text">Fehlgeschlagen</span>
          : <span className="text-shimmer block text-[13px] font-medium">Schritt {step + 1} von 3 · {LABELS(split)[step].doing}</span>}
      </span>
    </div>
  );
}

/** Drei schmale Fortschritts-Abschnitte mit Beschriftung – keine Linien durch Symbole */
function Steps({ step, split }: { step: Step; split: boolean }) {
  return (
    <ol className="grid grid-cols-3 gap-1.5">
      {LABELS(split).map(({ icon: Icon, label }, i) => {
        const state = step === 3 ? (i === 0 ? "done" : "fail") : i < step || step === 2 ? "done" : i === step ? "active" : "todo";
        return (
          <li key={label} className="min-w-0">
            <span aria-hidden className={`relative block h-1.5 overflow-hidden rounded-full ${state === "done" ? "bg-fg" : state === "fail" ? "bg-negative/25" : "bg-surface-3"}`}>
              {state === "active" && <span className="progress-run absolute inset-y-0 w-1/2 rounded-full bg-fg" />}
            </span>
            <span className={`mt-2 flex items-center gap-1 text-[12px] font-semibold ${state === "todo" ? "text-muted" : state === "fail" ? "text-negative-text" : "text-fg"}`}>
              {state === "done" ? <Check size={13} strokeWidth={2.6} className="shrink-0" /> : <Icon size={13} className="shrink-0" />}
              <span className="truncate">{label}</span>
            </span>
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
          <span className="rounded-full px-3 py-1 font-semibold border border-card-line text-fg">{c.label}</span>
          {fmtDate(d.doc_date ?? d.received_at)}{d.sender ? ` · ${d.sender}` : ""}
        </span>
        {d.summary && <span className="mt-1 line-clamp-2 block text-[12px] leading-4 text-soft">{d.summary}</span>}
      </span>
    </Link>
  );
}
