"use client";
import { useState } from "react";
import { CalendarClock, Check, ExternalLink, Globe, Loader2, RefreshCw } from "lucide-react";
import { Markdown } from "@/components/Markdown";
import { fmtDate, useDocs } from "@/lib/docs";
import { recheckOf } from "@/lib/recheck";
import { authFetch, supabase } from "@/lib/supabase";
import type { Doc, WebSource } from "@/lib/types";

type Result = { answer: string; status: "aktuell" | "neuer" | "unklar" | null; document: { title: string; pdfUrl: string; markdown: string } | null; sources?: { title: string; url: string }[] };
const LAW = /tarifvertrag|gesetz|verordnung|richtlinie|agb|geschäftsbedingungen|merkblatt|satzung|tarif|leitfaden|regelwerk/i;

/** Dokument aus dem Internet: Stand, nächste Prüfung, jetzt prüfen und ggf. neue Fassung ablegen */
export function WebSourceCard({ doc, onChanged }: { doc: Doc; onChanged?: () => void }) {
  const { upload } = useDocs();
  const [busy, setBusy] = useState<string>();
  const [res, setRes] = useState<Result>();
  const [error, setError] = useState<string>();
  const ws = doc.web_source;
  const today = new Date().toISOString().slice(0, 10);

  const setSource = async (patch: Partial<WebSource>) => {
    const now = new Date().toISOString();
    const next: WebSource = { query: ws?.query ?? doc.title ?? "", imported_at: ws?.imported_at ?? now, checked_at: now, ...(ws ?? {}), ...patch };
    await supabase.from("documents").update({ web_source: next }).eq("id", doc.id);
    onChanged?.();
  };

  // noch nicht markiert: nur bei Gesetzen, Tarifverträgen, AGB & Co. anbieten
  if (!ws) {
    if (!LAW.test(`${doc.doc_type ?? ""} ${doc.title ?? ""}`)) return null;
    return (
      <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-card-line bg-surface px-4 py-3 text-[13px]">
        <Globe size={18} className="shrink-0 text-muted" />
        <span className="min-w-0 flex-1 text-soft">Aus dem Internet geholt? Dann prüft Lifevault regelmäßig, ob es noch aktuell ist (halbjährlich, zum Jahreswechsel, zum Laufzeitende).</span>
        <button type="button" onClick={() => void setSource({ query: `${doc.title ?? ""} aktuelle Fassung` })} className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border border-card-line px-3.5 font-semibold hover:bg-surface-2"><Check size={14} /> Markieren</button>
      </div>
    );
  }

  const next = recheckOf(doc);
  const due = next && next.date <= today;
  const check = async () => {
    setBusy("prüft"); setError(undefined); setRes(undefined);
    try {
      const r = await authFetch("/api/research", { method: "POST", body: JSON.stringify({ query: ws.query, reason: "Aktualität prüfen", question: `Ist „${doc.title}“ noch aktuell?`, stand: `${doc.title ?? ""}, gespeichert am ${fmtDate(ws.imported_at)}${doc.doc_date ? `, Stand ${fmtDate(doc.doc_date)}` : ""}` }) });
      const j = (await r.json().catch(() => ({}))) as Result & { error?: string };
      if (!r.ok || !j.answer) throw new Error(j.error ?? `Fehler ${r.status}`);
      setRes(j);
      if (j.status === "aktuell") await setSource({});
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(undefined); }
  };
  // neue Fassung ablegen, die alte archivieren (bleibt auffindbar)
  const saveNew = async () => {
    if (!res?.document) return;
    setBusy("legt ab");
    try {
      const name = res.document.title.replace(/[\\/:*?"<>|]/g, "").slice(0, 120) || "Neue Fassung";
      let file: File | undefined;
      if (res.document.pdfUrl) {
        const r = await authFetch("/api/research/fetch", { method: "POST", body: JSON.stringify({ url: res.document.pdfUrl }) });
        if (r.ok) file = new File([await r.blob()], `${name}.pdf`, { type: "application/pdf" });
      }
      file ??= new File([`# ${res.document.title}\n\n_Internetrecherche vom ${new Date().toLocaleDateString("de-DE")} · ersetzt /d/${doc.id}_\n\n${res.document.markdown}`], `${name}.md`, { type: "text/markdown" });
      const ids = await upload([file]);
      const now = new Date().toISOString();
      if (ids.length) {
        await supabase.from("documents").update({ web_source: { query: ws.query, url: res.document.pdfUrl || res.sources?.[0]?.url, title: res.document.title, imported_at: now, checked_at: now } }).in("id", ids);
        await supabase.from("documents").update({ archived: true, archived_reason: "Neuere Fassung aus dem Internet abgelegt" }).eq("id", doc.id);
      }
      onChanged?.();
      setRes(undefined);
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(undefined); }
  };

  return (
    <section className="overflow-hidden rounded-2xl border border-card-line bg-surface">
      <div className="flex flex-wrap items-center gap-3 px-4 py-3">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-surface-2"><Globe size={17} /></span>
        <span className="min-w-0 flex-1 text-[13px]">
          <b className="block text-[14px]">Aus dem Internet · zuletzt geprüft {fmtDate(ws.checked_at)}</b>
          {next && <span className={`flex items-center gap-1 ${due ? "font-semibold text-negative-text" : "text-muted"}`}><CalendarClock size={12} /> {due ? "Prüfung fällig" : "Nächste Prüfung"}: {fmtDate(next.date)} · {next.reason}</span>}
        </span>
        {ws.url && <a href={ws.url} target="_blank" rel="noopener noreferrer" className="inline-flex h-9 items-center gap-1 rounded-full border border-card-line px-3 text-[13px] font-semibold hover:bg-surface-2">Quelle <ExternalLink size={12} /></a>}
        <button type="button" disabled={!!busy} onClick={() => void check()} className={`inline-flex h-9 items-center gap-1.5 rounded-full px-3.5 text-[13px] font-semibold disabled:opacity-60 ${due ? "bg-fg text-canvas" : "border border-card-line hover:bg-surface-2"}`}>{busy === "prüft" ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />} Jetzt prüfen</button>
      </div>
      {(res || error) && (
        <div className="border-t border-line px-4 py-3 text-[13px]">
          {error && <p role="alert" className="text-negative-text">{error}</p>}
          {res && (
            <>
              <p className={`mb-2 font-semibold ${res.status === "neuer" ? "text-negative-text" : res.status === "aktuell" ? "text-positive-text" : ""}`}>{res.status === "aktuell" ? "✓ Noch aktuell – Prüfdatum aktualisiert." : res.status === "neuer" ? "Es gibt eine neuere Fassung." : "Nicht eindeutig – bitte selbst kurz ansehen."}</p>
              <div className="max-h-64 overflow-y-auto"><Markdown text={res.answer} /></div>
              <div className="mt-3 flex flex-wrap gap-2">
                {res.status !== "aktuell" && res.document && <button type="button" disabled={!!busy} onClick={() => void saveNew()} className="inline-flex h-9 items-center gap-1.5 rounded-full bg-fg px-3.5 text-[13px] font-semibold text-canvas disabled:opacity-60">{busy === "legt ab" && <Loader2 size={13} className="animate-spin" />} Neue Fassung ablegen (alte archivieren)</button>}
                {res.status !== "aktuell" && <button type="button" onClick={() => { void setSource({}); setRes(undefined); }} className="inline-flex h-9 items-center gap-1.5 rounded-full border border-card-line px-3.5 text-[13px] font-semibold hover:bg-surface-2"><Check size={13} /> Als geprüft markieren</button>}
              </div>
            </>
          )}
        </div>
      )}
    </section>
  );
}
