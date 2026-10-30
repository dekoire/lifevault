"use client";
import { AlertCircle, CalendarClock, CheckCircle2, ChevronRight, CircleHelp, FileText, ShieldCheck, ShieldX, XCircle } from "lucide-react";
import { useDetail } from "@/components/DetailPanel";
import { SenderLogo } from "@/components/SenderLogo";
import { fmtDate, useDocs } from "@/lib/docs";
import type { Doc } from "@/lib/types";

/**
 * Karten aus dem Chat für Verträge und Versicherungen – die KI liest die Dokumente und füllt die Felder, die App zeigt
 * sie einheitlich mit Logo und Link zum Dokument:
 * - ```konditionen  je Zeile ein JSON: {"id","art","beitrag","laufzeit","kuendigung","kuendbarBis","selbstbeteiligung","leistungen":[],"ausschluesse":[]}
 * - ```deckung      ein JSON: {"frage","urteil":"ja|teilweise|nein|unklar","id","gruende":[],"bedingungen":[],"quelle","naechster"}
 */
const str = (v: unknown, n = 200) => (typeof v === "string" ? v.trim().slice(0, n) : "");
const list = (v: unknown, n = 8) => (Array.isArray(v) ? v.map((x) => str(x, 200)).filter(Boolean).slice(0, n) : []);
const objects = (body: string): Record<string, unknown>[] => {
  const t = body.trim();
  if (t.startsWith("[")) { try { return JSON.parse(t) as Record<string, unknown>[]; } catch { return []; } }
  return t.split("\n").map((l) => { try { return JSON.parse(l) as Record<string, unknown>; } catch { return null; } }).filter((x): x is Record<string, unknown> => !!x && typeof x === "object");
};

function DocHead({ d, title, sub }: { d?: Doc; title: string; sub?: string }) {
  const open = useDetail();
  return (
    <button type="button" disabled={!d} onClick={() => d && open?.({ kind: "doc", id: d.id })} className="flex w-full items-center gap-3 px-4 pt-3.5 pb-3 text-left enabled:hover:bg-surface-2/60">
      <SenderLogo domain={d?.sender_domain} sender={d?.sender ?? title} cluster={d?.cluster ?? "versicherungen"} size={40} bare />
      <span className="min-w-0 flex-1"><b className="block truncate text-[15px] leading-5">{title}</b>{sub && <span className="block truncate text-[12px] text-muted">{sub}</span>}</span>
      {d && <ChevronRight size={16} className="shrink-0 text-muted" />}
    </button>
  );
}

/** Konditionen je Vertrag: oben die Eckdaten als Kacheln, darunter Leistungen und Ausschlüsse */
export function ConditionsWidget({ body }: { body: string }) {
  const { allDocs } = useDocs();
  const items = objects(body).slice(0, 8);
  if (!items.length) return null;
  return (
    <div className={`grid grid-cols-[minmax(0,1fr)] gap-3 ${items.length > 1 ? "lg:grid-cols-2" : ""}`}>
      {items.map((x, i) => {
        const d = allDocs.find((y) => y.id === str(x.id, 40));
        const facts = [["Beitrag", str(x.beitrag, 60)], ["Laufzeit", str(x.laufzeit, 80)], ["Kündigung", str(x.kuendigung, 80)], ["Selbstbeteiligung", str(x.selbstbeteiligung, 60)]].filter(([, v]) => v);
        const until = /^\d{4}-\d{2}-\d{2}$/.test(str(x.kuendbarBis, 10)) ? str(x.kuendbarBis, 10) : "";
        const leistungen = list(x.leistungen), aus = list(x.ausschluesse, 5);
        return (
          <article key={i} className="overflow-hidden rounded-2xl border border-card-line bg-surface shadow-card">
            <DocHead d={d} title={str(x.art, 80) || d?.title || "Vertrag"} sub={[d?.sender, d && fmtDate(d.doc_date ?? d.received_at)].filter(Boolean).join(" · ")} />
            {facts.length > 0 && (
              <div className="grid grid-cols-2 gap-px border-t border-line bg-line">
                {facts.map(([l, v]) => <div key={l} className="min-w-0 bg-surface px-4 py-2.5"><span className="block text-[11.5px] text-muted">{l}</span><b className="tnum block text-[14px] leading-5 break-words">{v}</b></div>)}
              </div>
            )}
            {until && <p className="flex items-center gap-2 border-t border-line bg-amber/5 px-4 py-2 text-[12.5px]"><CalendarClock size={14} className="shrink-0 text-amber" /> Kündbar bis <b className="tnum">{fmtDate(until)}</b></p>}
            {leistungen.length > 0 && (
              <div className="border-t border-line px-4 py-3">
                <p className="mb-1.5 text-[11.5px] font-semibold tracking-wide text-muted uppercase">Abgedeckt</p>
                <ul className="space-y-1 text-[13.5px] leading-5">{leistungen.map((l) => <li key={l} className="flex gap-2"><CheckCircle2 size={15} className="mt-0.5 shrink-0 text-positive-text" />{l}</li>)}</ul>
              </div>
            )}
            {aus.length > 0 && (
              <div className="border-t border-line px-4 py-3">
                <p className="mb-1.5 text-[11.5px] font-semibold tracking-wide text-muted uppercase">Nicht abgedeckt</p>
                <ul className="space-y-1 text-[13.5px] leading-5">{aus.map((l) => <li key={l} className="flex gap-2"><XCircle size={15} className="mt-0.5 shrink-0 text-negative-text" />{l}</li>)}</ul>
              </div>
            )}
          </article>
        );
      })}
    </div>
  );
}

const VERDICT = {
  ja: { label: "Abgedeckt", icon: ShieldCheck, cls: "bg-positive/10 text-positive-text border-positive/30" },
  teilweise: { label: "Teilweise abgedeckt", icon: AlertCircle, cls: "bg-amber/10 text-amber border-amber/30" },
  nein: { label: "Nicht abgedeckt", icon: ShieldX, cls: "bg-negative/10 text-negative-text border-negative/30" },
  unklar: { label: "Unklar", icon: CircleHelp, cls: "bg-surface-2 text-soft border-card-line" },
} as const;

/** Deckungs-Check für einen Fall („Bin ich bei einem Mietstreit abgedeckt?“): Urteil groß, darunter Gründe und Bedingungen */
export function CoverageWidget({ body }: { body: string }) {
  const { allDocs } = useDocs();
  const x = objects(body)[0];
  if (!x) return null;
  const v = VERDICT[(str(x.urteil, 12).toLowerCase() as keyof typeof VERDICT)] ?? VERDICT.unklar;
  const d = allDocs.find((y) => y.id === str(x.id, 40));
  const gruende = list(x.gruende, 5), bed = list(x.bedingungen, 5);
  const Icon = v.icon;
  return (
    <article className="overflow-hidden rounded-2xl border border-card-line bg-surface shadow-card">
      <div className={`flex items-start gap-3 border-b px-4 py-3.5 ${v.cls}`}>
        <Icon size={26} className="shrink-0" />
        <span className="min-w-0"><b className="block text-[17px] leading-6">{v.label}</b>{str(x.frage) && <span className="block text-[13px] text-soft">{str(x.frage)}</span>}</span>
      </div>
      {(d || str(x.vertrag)) && <DocHead d={d} title={d?.title ?? str(x.vertrag, 80)} sub={d?.sender ?? undefined} />}
      {gruende.length > 0 && (
        <div className="border-t border-line px-4 py-3">
          <p className="mb-1.5 text-[11.5px] font-semibold tracking-wide text-muted uppercase">Warum</p>
          <ul className="space-y-1 text-[13.5px] leading-5">{gruende.map((g) => <li key={g} className="flex gap-2"><span className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-brand-500" />{g}</li>)}</ul>
        </div>
      )}
      {bed.length > 0 && (
        <div className="border-t border-line px-4 py-3">
          <p className="mb-1.5 text-[11.5px] font-semibold tracking-wide text-muted uppercase">Bedingungen</p>
          <ul className="space-y-1 text-[13.5px] leading-5">{bed.map((b) => <li key={b} className="flex gap-2"><AlertCircle size={14} className="mt-0.5 shrink-0 text-amber" />{b}</li>)}</ul>
        </div>
      )}
      {(str(x.quelle) || str(x.naechster)) && (
        <div className="space-y-1 border-t border-line px-4 py-3 text-[12.5px]">
          {str(x.quelle) && <p className="flex items-center gap-1.5 text-muted"><FileText size={13} className="shrink-0" /> {str(x.quelle)}</p>}
          {str(x.naechster) && <p className="font-semibold">→ {str(x.naechster)}</p>}
        </div>
      )}
    </article>
  );
}
