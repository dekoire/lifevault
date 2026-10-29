"use client";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Check, Copy, FileDown, Loader2, Mail, PenLine, RefreshCw, Sparkles, X } from "lucide-react";
import { SenderLogo } from "@/components/SenderLogo";
import { contactOf } from "@/lib/actions";
import { DRAFT_PURPOSES, suggestedPurposes, type DraftPurpose } from "@/lib/drafts";
import { saveFile } from "@/lib/jobs";
import { authFetch } from "@/lib/supabase";
import { openJson, vaultKey } from "@/lib/vault";
import type { Doc, SecretPart } from "@/lib/types";

/**
 * Schreiben vorbereiten: Zweck wählen (Widerspruch, Kündigung …), Mail oder Brief – ein einfaches Modell formuliert vor.
 * Öffnen überall per openDraft(doc, zweck); das Fenster hängt einmal im App-Rahmen (DraftHost).
 */
type Req = { doc: Doc; purpose?: DraftPurpose };
export const openDraft = (doc: Doc, purpose?: DraftPurpose) => window.dispatchEvent(new CustomEvent<Req>("lifevault:draft", { detail: { doc, purpose } }));

export function DraftHost() {
  const [req, setReq] = useState<Req>();
  useEffect(() => {
    const on = (e: Event) => setReq((e as CustomEvent<Req>).detail);
    window.addEventListener("lifevault:draft", on);
    return () => window.removeEventListener("lifevault:draft", on);
  }, []);
  return req ? <DraftSheet key={req.doc.id + (req.purpose ?? "")} doc={req.doc} initial={req.purpose} onClose={() => setReq(undefined)} /> : null;
}

type Draft = { subject: string; body: string; hints: string[] };

function DraftSheet({ doc, initial, onClose }: { doc: Doc; initial?: DraftPurpose; onClose: () => void }) {
  const order = suggestedPurposes(doc);
  const [purpose, setPurpose] = useState<DraftPurpose>(initial ?? order[0]);
  const [channel, setChannel] = useState<"mail" | "brief">("mail");
  const [note, setNote] = useState("");
  const [draft, setDraft] = useState<Draft>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const contact = contactOf(doc);
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    addEventListener("keydown", k); return () => removeEventListener("keydown", k);
  }, [onClose]);

  const write = async () => {
    setBusy(true); setError("");
    try {
      // verschlüsselt: Inhalt nur aus dem entsperrten Tresor, im Browser entschlüsselt
      let context: string | undefined;
      if (doc.encrypted && doc.secret && vaultKey()) { const s = await openJson<SecretPart>(doc.secret); context = `${s.summary ?? ""}\n${(s.key_facts ?? []).map((f) => `${f.label}: ${f.value}`).join("\n")}`; }
      const res = await authFetch("/api/draft", { method: "POST", body: JSON.stringify({ id: doc.id, purpose, channel, note, context }) });
      const j = (await res.json().catch(() => ({}))) as Draft & { error?: string };
      if (!res.ok || !j.body) throw new Error(j.error ?? "Das hat nicht geklappt.");
      setDraft(j);
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  };
  useEffect(() => { void write(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const full = draft ? `Betreff: ${draft.subject}\n\n${draft.body}` : "";
  const copy = async () => { await navigator.clipboard?.writeText(full); setCopied(true); setTimeout(() => setCopied(false), 1500); };
  const mail = () => { if (draft) location.href = `mailto:${contact.emails[0] ?? ""}?subject=${encodeURIComponent(draft.subject)}&body=${encodeURIComponent(draft.body)}`; };
  const letter = async () => { if (draft) saveFile(await letterPdf(draft, doc.sender ?? "", contact.addresses[0] ?? ""), `${draft.subject.replace(/[\\/:*?"<>|]+/g, " ").slice(0, 60)}.pdf`); };
  const pill = (on: boolean) => `h-8 rounded-full px-3 text-[12.5px] font-semibold transition-colors ${on ? "bg-fg text-canvas" : "bg-surface-3 text-soft hover:text-fg"}`;

  return createPortal(
    <div className="sheet-backdrop fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center sm:p-6" onClick={onClose}>
      <div role="dialog" aria-label="Schreiben vorbereiten" onClick={(e) => e.stopPropagation()} className="sheet-rise flex max-h-[92dvh] w-full max-w-xl flex-col overflow-hidden rounded-t-3xl bg-surface shadow-[0_24px_64px_rgba(16,24,40,.25)] sm:rounded-3xl">
        <div className="flex items-center gap-3 px-5 pt-5 pb-3">
          <SenderLogo domain={doc.sender_domain} sender={doc.sender} cluster={doc.cluster} size={36} />
          <span className="min-w-0 flex-1"><b className="block text-[16px]">Schreiben vorbereiten</b><span className="block truncate text-[12.5px] text-muted">an {doc.sender ?? "Absender"} · zu „{doc.title ?? doc.file_name}“</span></span>
          <button type="button" onClick={onClose} aria-label="Schließen" className="grid h-9 w-9 place-items-center rounded-full bg-surface-3"><X size={17} /></button>
        </div>
        <div className="space-y-2.5 border-b border-line px-5 pb-3">
          <div className="flex flex-wrap gap-1.5">
            {[...order, ...DRAFT_PURPOSES.map((p) => p.id).filter((p) => !order.includes(p))].map((id) => <button key={id} type="button" onClick={() => setPurpose(id)} aria-pressed={purpose === id} className={pill(purpose === id)}>{DRAFT_PURPOSES.find((p) => p.id === id)!.label}</button>)}
          </div>
          <div className="flex items-center gap-2">
            <span className="inline-flex rounded-full bg-surface-3 p-0.5">
              {(["mail", "brief"] as const).map((c) => <button key={c} type="button" onClick={() => setChannel(c)} aria-pressed={channel === c} className={`h-7 rounded-full px-3 text-[12.5px] font-semibold ${channel === c ? "bg-surface text-fg shadow-card" : "text-soft"}`}>{c === "mail" ? "E-Mail" : "Brief"}</button>)}
            </span>
            <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Zusatz (optional), z. B. „bitte in 3 Raten“" className="h-8 min-w-0 flex-1 rounded-full border border-card-line bg-surface px-3 text-[13px] outline-none placeholder:text-muted focus:border-line-strong" />
            <button type="button" onClick={() => void write()} disabled={busy} className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full bg-brand-500 px-3 text-[12.5px] font-semibold text-white disabled:opacity-50">{busy ? <Loader2 size={13} className="animate-spin" /> : draft ? <RefreshCw size={13} /> : <Sparkles size={13} />} {draft ? "Neu" : "Schreiben"}</button>
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {error && <p className="mb-3 rounded-xl bg-negative/10 px-3 py-2 text-[13px] text-negative-text">{error}</p>}
          {busy && !draft && <p className="flex items-center gap-2 py-10 text-[13.5px] text-muted"><Loader2 size={15} className="animate-spin" /> Wird vorformuliert …</p>}
          {draft && (
            <div className={`space-y-2.5 ${busy ? "opacity-50" : ""}`}>
              <label className="block"><span className="mb-1 block text-[12px] font-semibold text-muted">Betreff</span>
                <input value={draft.subject} onChange={(e) => setDraft({ ...draft, subject: e.target.value })} className="h-10 w-full rounded-xl border border-card-line bg-surface px-3 text-[14px] font-semibold outline-none focus:border-line-strong" /></label>
              <label className="block"><span className="mb-1 block text-[12px] font-semibold text-muted">Text – frei bearbeitbar</span>
                <textarea value={draft.body} onChange={(e) => setDraft({ ...draft, body: e.target.value })} rows={12} className="w-full resize-y rounded-xl border border-card-line bg-surface px-3 py-2.5 text-[14px] leading-6 outline-none focus:border-line-strong" /></label>
              {draft.hints.length > 0 && <ul className="space-y-1 rounded-xl bg-surface-2 px-3 py-2 text-[12.5px] text-soft">{draft.hints.map((h) => <li key={h} className="flex gap-1.5"><PenLine size={13} className="mt-0.5 shrink-0" />{h}</li>)}</ul>}
              <p className="text-[11.5px] text-muted">Vorschlag der KI, keine Rechtsberatung – bitte vor dem Absenden prüfen und [Platzhalter] ausfüllen.</p>
            </div>
          )}
        </div>
        {draft && (
          <div className="flex flex-wrap items-center gap-2 border-t border-line px-5 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))]">
            <button type="button" onClick={() => void copy()} className="inline-flex h-10 items-center gap-1.5 rounded-full border border-card-line px-3.5 text-[13px] font-semibold hover:bg-surface-2">{copied ? <Check size={15} /> : <Copy size={15} />} {copied ? "Kopiert" : "Kopieren"}</button>
            <button type="button" onClick={() => void letter()} className="inline-flex h-10 items-center gap-1.5 rounded-full border border-card-line px-3.5 text-[13px] font-semibold hover:bg-surface-2"><FileDown size={15} /> Brief als PDF</button>
            <button type="button" onClick={mail} className="ml-auto inline-flex h-10 items-center gap-1.5 rounded-full bg-fg px-4 text-[13px] font-semibold text-canvas"><Mail size={15} /> In Mail-App öffnen</button>
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}

/** Einfacher DIN-Brief als PDF: Empfänger, Datum, Betreff fett, Text mit Umbruch */
async function letterPdf(d: Draft, to: string, address: string) {
  const { PDFDocument, StandardFonts } = await import("pdf-lib");
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const safe = (s: string) => s.replace(/[^\n\x20-\x7e -ÿ€„“”‚‘’–—…•]/g, "");
  const [W, H, L, R] = [595.28, 841.89, 70, 60];
  let page = pdf.addPage([W, H]);
  let y = H - 150;
  const line = (t: string, f = font, size = 11) => {
    if (y < 70) { page = pdf.addPage([W, H]); y = H - 70; }
    page.drawText(safe(t), { x: L, y, size, font: f }); y -= size * 1.45;
  };
  const wrap = (text: string, f = font, size = 11) => {
    for (const para of text.split("\n")) {
      if (!para.trim()) { y -= size * 0.9; continue; }
      let cur = "";
      for (const w of para.split(/\s+/)) {
        const next = cur ? `${cur} ${w}` : w;
        if (f.widthOfTextAtSize(safe(next), size) > W - L - R) { line(cur, f, size); cur = w; } else cur = next;
      }
      if (cur) line(cur, f, size);
    }
  };
  page.drawText("[Ihr Name] · [Ihre Straße] · [PLZ Ort]", { x: L, y: H - 120, size: 7.5, font });
  y = H - 140;
  for (const t of [to, ...address.split(/,\s*/)].filter(Boolean)) line(t);
  y = H - 260;
  page.drawText(new Date().toLocaleDateString("de-DE"), { x: W - R - font.widthOfTextAtSize("00.00.0000", 11), y: y + 30, size: 11, font });
  wrap(d.subject, bold, 11.5);
  y -= 10;
  wrap(d.body);
  return new Blob([(await pdf.save()) as BlobPart], { type: "application/pdf" });
}
