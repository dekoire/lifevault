"use client";
import { useState } from "react";
import { Loader2, RefreshCw, Sparkles } from "lucide-react";
import { ImportanceDots } from "@/components/Importance";
import { CARD } from "@/components/ui";
import { useDocs } from "@/lib/docs";
import { IMPORTANCE } from "@/lib/importance";
import { authFetch } from "@/lib/supabase";

const BTN = "inline-flex h-10 items-center gap-2 rounded-full px-4 text-[14px] font-semibold disabled:opacity-50";

/** Rückwirkend: Wichtigkeit und Zusammenhang für vorhandene Dokumente bewerten, Fehlgeschlagene erneut auslesen */
export function RankingSettings() {
  const { allDocs, refresh, reprocess } = useDocs();
  const [busy, setBusy] = useState<"" | "open" | "all" | "retry">("");
  const [progress, setProgress] = useState("");
  const ready = allDocs.filter((d) => d.status === "ready" && !d.merged_into);
  const rated = ready.filter((d) => d.importance != null).length;
  const failed = allDocs.filter((d) => d.status === "error" && !d.merged_into);
  const missingColumn = ready.length > 0 && ready.every((d) => d.importance === undefined);

  const rateOpen = async () => {
    setBusy("open");
    for (let i = 0; i < 40; i++) {
      const r = await authFetch("/api/rank", { method: "POST" }).then((x) => x.json()).catch(() => null) as { left?: number } | null;
      if (!r) { setProgress("Bewerten hat nicht geklappt – bitte später erneut."); break; }
      setProgress(r.left ? `Noch ${r.left} offen …` : "Fertig.");
      if (!r.left) break;
    }
    await refresh();
    setBusy("");
  };
  const rateAll = async () => {
    if (!confirm("Alle Dokumente neu bewerten? Von dir festgelegte Wichtigkeit bleibt erhalten. Das kann bei vielen Dokumenten ein paar Minuten dauern.")) return;
    setBusy("all");
    let cursor = 0;
    for (let i = 0; i < 200; i++) {
      const r = await authFetch("/api/rank", { method: "POST", body: JSON.stringify({ all: true, cursor }) }).then((x) => x.json()).catch(() => null) as { next?: number; total?: number } | null;
      if (!r || r.next === undefined || !r.total) { setProgress(r ? "Fertig." : "Bewerten hat nicht geklappt – bitte später erneut."); break; }
      setProgress(`Partner ${r.next} von ${r.total} bewertet …`);
      if (r.next >= r.total || r.next === cursor) { setProgress("Fertig."); break; }
      cursor = r.next;
    }
    await refresh();
    setBusy("");
  };
  const retryFailed = async () => {
    setBusy("retry");
    for (const [i, d] of failed.entries()) {
      setProgress(`Lese ${i + 1} von ${failed.length} erneut aus …`);
      await reprocess(d.id).catch(() => undefined);
    }
    setProgress("Fertig.");
    setBusy("");
  };

  const counts = IMPORTANCE.map((x) => ({ ...x, n: ready.filter((d) => d.importance === x.value).length }));
  return (
    <>
      <section className={`${CARD} space-y-4 p-5`}>
        <div>
          <h2 className="text-[16px] font-semibold">Wichtigkeit & Zusammenhang</h2>
          <p className="mt-1 text-[14px] text-soft">Neue Dokumente werden beim Hochladen bewertet: wie wichtig sie sind (1–5) und wozu sie beim Partner gehören, z. B. Rechnung → Vertrag. Vorhandene Dokumente kannst du hier rückwirkend bewerten lassen. Suche und Chat nutzen das, um Wichtiges zuerst zu zeigen.</p>
        </div>
        {missingColumn ? (
          <p className="rounded-xl bg-surface-3 px-4 py-3 text-[13px] text-soft">Die Datenbank kennt die Wichtigkeit noch nicht (Migration 0013 fehlt).</p>
        ) : (
          <>
            <div>
              <div className="flex items-baseline justify-between text-[13px]"><span className="font-semibold">{rated} von {ready.length} bewertet</span><span className="text-muted">{ready.length ? Math.round((rated / ready.length) * 100) : 0} %</span></div>
              <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-line"><div className="h-full rounded-full bg-brand-500 transition-[width]" style={{ width: `${ready.length ? (rated / ready.length) * 100 : 0}%` }} /></div>
            </div>
            {rated > 0 && (
              <ul className="divide-y divide-line rounded-xl border border-card-line text-[13px]">
                {counts.map((x) => <li key={x.value} className="flex items-center gap-3 px-3 py-2"><ImportanceDots value={x.value} /><span className="flex-1">{x.label}</span><b className="tnum">{x.n}</b></li>)}
              </ul>
            )}
            <div className="flex flex-wrap gap-2">
              <button type="button" disabled={!!busy || rated === ready.length} onClick={() => void rateOpen()} className={`${BTN} bg-brand-500 text-white hover:bg-brand-600`}>{busy === "open" ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />} {rated === ready.length ? "Alles bewertet" : `${ready.length - rated} jetzt bewerten`}</button>
              <button type="button" disabled={!!busy || !ready.length} onClick={() => void rateAll()} className={`${BTN} border border-card-line hover:bg-surface-2`}>{busy === "all" ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />} Alle neu bewerten</button>
            </div>
          </>
        )}
        {progress && busy !== "retry" && <p className="text-[13px] text-muted" aria-live="polite">{progress}</p>}
      </section>
      {failed.length > 0 && (
        <section className={`${CARD} space-y-3 p-5`}>
          <div>
            <h2 className="text-[16px] font-semibold">Nicht ausgelesen</h2>
            <p className="mt-1 text-[14px] text-soft">{failed.length} {failed.length === 1 ? "Dokument konnte" : "Dokumente konnten"} nicht ausgelesen werden. Dateien ohne Endung (z. B. aus Kundenportalen) erkennt Lifevault jetzt am Inhalt.</p>
          </div>
          <ul className="divide-y divide-line rounded-xl border border-card-line text-[13px]">
            {failed.slice(0, 8).map((d) => <li key={d.id} className="px-3 py-2"><b className="block truncate">{d.file_name}</b><span className="text-negative-text">{d.error}</span></li>)}
          </ul>
          <button type="button" disabled={!!busy} onClick={() => void retryFailed()} className={`${BTN} border border-card-line hover:bg-surface-2`}>{busy === "retry" ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />} Alle erneut auslesen</button>
          {progress && busy === "retry" && <p className="text-[13px] text-muted" aria-live="polite">{progress}</p>}
        </section>
      )}
    </>
  );
}
