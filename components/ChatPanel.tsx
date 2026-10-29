"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ArrowUp, Check, FileDown, Globe, Loader2, Square } from "lucide-react";
import { LogoMark } from "@/components/Logo";
import { Markdown } from "@/components/Markdown";
import { SenderLogo } from "@/components/SenderLogo";
import { useDocs } from "@/lib/docs";
import { useProjects } from "@/lib/projects";
import { authFetch, supabase } from "@/lib/supabase";

/** Vorschlag, im Internet zu suchen (vom Chat erkannt, Nutzer muss zustimmen) */
export type Research = { query: string; reason: string; docId?: string; state: "ask" | "declined" | "running" | "done" | "failed"; error?: string };
/** Gefundenes Dokument ablegen? */
export type SaveOffer = { title: string; pdfUrl: string; markdown: string; relatedId?: string; state: "ask" | "declined" | "saving" | "saved" | "failed"; error?: string };
export type Msg = { role: "user" | "assistant"; content: string; research?: Research; save?: SaveOffer };

const MARKER = /\n?\[\[RECHERCHE:\s*([^|\]]+?)\s*\|\s*([^|\]]*?)\s*(?:\|\s*([^\]]*?)\s*)?\]\]\s*$/;
/** Recherche-Vorschlag aus der Antwort lösen (wird nicht angezeigt) */
function splitMarker(text: string): { text: string; research?: Research } {
  const m = MARKER.exec(text);
  if (!m) return { text: text.replace(/\[\[RECHERCHE[\s\S]*$/, "").trimEnd() };
  const id = /^[0-9a-f-]{36}$/i.test(m[3] ?? "") ? m[3] : undefined;
  return { text: text.slice(0, m.index).trimEnd(), research: { query: m[1].replace(/^[„"]|[“"]$/g, ""), reason: m[2], docId: id, state: "ask" } };
}

/** Quellen unter einer Antwort: verlinkte Dokumente als Kacheln mit Logo */
export function Sources({ text }: { text: string }) {
  const { docs } = useDocs();
  const ids = [...new Set([...text.matchAll(/\(\/d\/([0-9a-f-]{36})\)/gi)].map((m) => m[1]))];
  const list = ids.map((id) => docs.find((d) => d.id === id)).filter((d): d is NonNullable<typeof d> => !!d);
  if (!list.length) return null;
  return (
    <div className="mt-4">
      <div className="mb-2 text-[12px] font-semibold tracking-wide text-muted uppercase">Quellen</div>
      <div className="grid gap-2 sm:grid-cols-2">
        {list.map((d) => (
          <Link key={d.id} href={`/d/${d.id}`} className="flex items-center gap-3 rounded-xl border border-card-line bg-surface px-3 py-2.5 hover:bg-surface-2">
            <SenderLogo domain={d.sender_domain} sender={d.sender} cluster={d.cluster} size={34} />
            <span className="min-w-0"><span className="block truncate text-[14px] font-semibold">{d.title ?? d.file_name}</span><span className="block truncate text-[12px] text-muted">{[d.sender, d.doc_date].filter(Boolean).join(" · ")}</span></span>
          </Link>
        ))}
      </div>
    </div>
  );
}

export function Typing({ label = "Durchsuche deine Unterlagen" }: { label?: string }) {
  return (
    <div className="flex min-h-8 items-center gap-2.5" role="status" aria-live="polite">
      <span className="flex h-3 items-center gap-1" aria-hidden>{[0, 1, 2].map((k) => <span key={k} className="typing-dot h-1.5 w-1.5 rounded-full bg-fg" style={{ animationDelay: `${k * 0.15}s` }} />)}</span>
      <span className="text-shimmer text-[14px] font-medium">{label}</span>
    </div>
  );
}

const BTN = "inline-flex h-10 items-center justify-center gap-1.5 rounded-full px-4 text-[14px] font-semibold";

function ResearchCard({ r, onAnswer }: { r: Research; onAnswer?: (yes: boolean) => void }) {
  if (r.state === "running") return <div className="mt-3"><Typing label="Recherchiere im Internet …" /></div>;
  if (r.state === "declined") return <p className="mt-3 text-[13px] text-muted">Keine Internetrecherche.</p>;
  if (r.state === "done") return null;
  return (
    <div className="mt-4 rounded-2xl border border-card-line bg-surface p-4">
      <div className="flex items-start gap-3">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-fg text-canvas"><Globe size={17} /></span>
        <div className="min-w-0 flex-1">
          <b className="block text-[15px]">Soll ich im Internet recherchieren?</b>
          {r.reason && <span className="mt-0.5 block text-[13px] text-soft">Fehlt: {r.reason}</span>}
          <span className="mt-2 inline-block rounded-full border border-card-line px-2.5 py-1 text-[12px] font-medium">„{r.query}“</span>
          <span className="mt-2 block text-[12px] text-muted">Gesendet wird nur diese Suchanfrage – keine persönlichen Daten.</span>
          {r.state === "failed" && <span className="mt-2 block text-[13px] text-negative-text">{r.error ?? "Das hat nicht geklappt."}</span>}
        </div>
      </div>
      <div className="mt-3 flex gap-2">
        <button type="button" onClick={() => onAnswer?.(true)} className={`${BTN} bg-brand-500 text-white hover:bg-brand-600`}>{r.state === "failed" ? "Erneut versuchen" : "Ja, recherchieren"}</button>
        <button type="button" onClick={() => onAnswer?.(false)} className={`${BTN} border border-card-line bg-surface hover:bg-surface-2`}>Nein</button>
      </div>
    </div>
  );
}

function SaveCard({ o, onAnswer }: { o: SaveOffer; onAnswer?: (yes: boolean) => void }) {
  const { allDocs } = useDocs();
  const related = o.relatedId ? allDocs.find((d) => d.id === o.relatedId) : undefined;
  if (o.state === "declined") return <p className="mt-3 text-[13px] text-muted">Nicht abgelegt.</p>;
  if (o.state === "saved") return <p className="mt-3 inline-flex items-center gap-1.5 text-[13px] font-semibold text-positive-text"><Check size={15} /> Abgelegt{related ? ` – zu „${related.title}“` : ""}. Wird jetzt ausgelesen.</p>;
  return (
    <div className="mt-4 rounded-2xl border border-card-line bg-surface p-4">
      <div className="flex items-start gap-3">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-fg text-canvas"><FileDown size={17} /></span>
        <div className="min-w-0 flex-1">
          <b className="block text-[15px]">Soll ich das in Lifevault ablegen?</b>
          <span className="mt-0.5 block text-[13px] text-soft">„{o.title}“ {o.pdfUrl ? "als PDF (Original aus dem Internet)" : "als Notiz mit Quellen"}{related ? <> – als Ergänzung zu <Link href={`/d/${related.id}`} className="font-semibold text-selected">{related.title}</Link></> : null}</span>
          {o.state === "failed" && <span className="mt-2 block text-[13px] text-negative-text">{o.error ?? "Das hat nicht geklappt."}</span>}
        </div>
      </div>
      <div className="mt-3 flex gap-2">
        <button type="button" disabled={o.state === "saving"} onClick={() => onAnswer?.(true)} className={`${BTN} bg-brand-500 text-white hover:bg-brand-600 disabled:opacity-60`}>{o.state === "saving" ? <><Loader2 size={15} className="animate-spin" /> Lege ab …</> : "Ja, ablegen"}</button>
        <button type="button" disabled={o.state === "saving"} onClick={() => onAnswer?.(false)} className={`${BTN} border border-card-line bg-surface hover:bg-surface-2`}>Nein</button>
      </div>
    </div>
  );
}

export function MessageList({ msgs, compact, onResearch, onSave }: { msgs: Msg[]; compact?: boolean; onResearch?: (i: number, yes: boolean) => void; onSave?: (i: number, yes: boolean) => void }) {
  return (
    <div className={compact ? "space-y-5" : "space-y-6"}>
      {msgs.map((m, i) =>
        m.role === "user" ? (
          <div key={i} className="flex justify-end"><div className="max-w-[85%] rounded-[20px] rounded-br-md bg-surface-3 px-4 py-2.5 text-[15px] leading-6 whitespace-pre-wrap">{m.content}</div></div>
        ) : (
          <div key={i} className="flex gap-3">
            <span className="mt-0.5 shrink-0"><LogoMark size={26} /></span>
            <div className="min-w-0 flex-1">
              {m.content ? <><Markdown text={splitMarker(m.content).text.replace(/\n#{1,4}\s*Quellen\s*\n[\s\S]*$/i, "")} /><Sources text={m.content} /></> : <Typing />}
              {m.research && <ResearchCard r={m.research} onAnswer={(yes) => onResearch?.(i, yes)} />}
              {m.save && <SaveCard o={m.save} onAnswer={(yes) => onSave?.(i, yes)} />}
            </div>
          </div>
        ),
      )}
    </div>
  );
}

/** Eingabe wie bei Finastry: abgerundetes Feld mit feinem Rahmen, runder Senden-Knopf */
export function Composer({ busy, onSend, onStop, placeholder = "Frag etwas zu deinen Unterlagen …" }: { busy: boolean; onSend: (q: string) => void; onStop: () => void; placeholder?: string }) {
  const [text, setText] = useState("");
  const send = () => { if (text.trim() && !busy) { onSend(text); setText(""); } };
  return (
    <form onSubmit={(e) => { e.preventDefault(); send(); }} className="chat-box flex items-end gap-2 rounded-[22px] border bg-surface p-2 pl-4">
      <textarea
        value={text}
        onChange={(e) => { setText(e.target.value); e.target.style.height = "auto"; e.target.style.height = `${Math.min(160, e.target.scrollHeight)}px`; }}
        onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); send(); } }}
        rows={1}
        maxLength={2000}
        placeholder={placeholder}
        className="max-h-40 min-h-10 flex-1 resize-none bg-transparent py-2 text-[16px] leading-6 outline-none placeholder:text-muted"
      />
      {busy ? (
        <button type="button" onClick={onStop} aria-label="Stoppen" className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-fg text-canvas"><Square size={14} fill="currentColor" /></button>
      ) : (
        <button type="submit" disabled={!text.trim()} aria-label="Senden" className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-brand-500 text-white transition disabled:bg-surface-3 disabled:text-muted"><ArrowUp size={19} strokeWidth={2.4} /></button>
      )}
    </form>
  );
}

/**
 * Chat-Logik: Frage senden, Antwort streamen, Verlauf in der Datenbank speichern (Tabelle chats).
 * docId: Chat zu einem Dokument (docText = entschlüsselter Inhalt bei verschlüsselten Dokumenten).
 */
export function useChat({ chatId, docId, docText, onSaved }: { chatId?: string; docId?: string; docText?: string; onSaved?: (id: string) => void }) {
  const { current } = useProjects();
  const { upload } = useDocs();
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [busy, setBusy] = useState(false);
  const [id, setId] = useState(chatId);
  const abort = useRef<AbortController>(null);
  // gespeicherten Chat laden
  useEffect(() => {
    setId(chatId);
    if (!chatId) { setMsgs([]); return; }
    void supabase.from("chats").select("messages").eq("id", chatId).maybeSingle().then(({ data }) => setMsgs((data?.messages as Msg[]) ?? []));
  }, [chatId]);
  // Dokument-Chat: letzten Verlauf zu diesem Dokument laden
  useEffect(() => {
    if (!docId || chatId) return;
    void supabase.from("chats").select("id,messages").eq("doc_id", docId).order("updated_at", { ascending: false }).limit(1).maybeSingle().then(({ data }) => { if (data) { setId(data.id); setMsgs(data.messages as Msg[]); } });
  }, [docId, chatId]);

  const save = async (all: Msg[]) => {
    const title = (all.find((m) => m.role === "user")?.content ?? "Neuer Chat").slice(0, 80);
    if (id) await supabase.from("chats").update({ messages: all, updated_at: new Date().toISOString() }).eq("id", id);
    else {
      const { data } = await supabase.from("chats").insert({ title, messages: all, doc_id: docId ?? null }).select("id").single();
      if (data) { setId(data.id); onSaved?.(data.id); }
    }
  };

  const send = async (q: string, base = msgs) => {
    const question = q.trim();
    if (!question || busy) return;
    const next: Msg[] = [...base, { role: "user", content: question }];
    setMsgs([...next, { role: "assistant", content: "" }]);
    setBusy(true);
    const ctrl = new AbortController();
    abort.current = ctrl;
    let out = "";
    try {
      const res = await authFetch("/api/chat", { method: "POST", body: JSON.stringify({ messages: next, docId, docText, projectId: current !== "all" ? current : undefined }), signal: ctrl.signal });
      if (!res.ok || !res.body) throw new Error((await res.json().catch(() => ({}))).error ?? `Fehler ${res.status}`);
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        out += dec.decode(value, { stream: true });
        setMsgs([...next, { role: "assistant", content: out }]);
      }
      if (!out.trim()) out = "Dazu habe ich gerade keine Antwort bekommen. Bitte noch einmal fragen.";
    } catch (e) {
      if ((e as Error).name === "AbortError") out = out || "(abgebrochen)";
      else { const m = (e as Error).message; out = /load failed|failed to fetch|network/i.test(m) ? "Die Verbindung ist abgebrochen. Bitte die Frage noch einmal senden." : m; }
    } finally {
      const { text, research } = splitMarker(out);
      const all: Msg[] = [...next, { role: "assistant", content: text, ...(research ? { research: { ...research, docId: research.docId ?? docId } } : {}) }];
      setMsgs(all);
      setBusy(false);
      abort.current = null;
      await save(all).catch(() => undefined);
    }
  };
  const reset = () => { abort.current?.abort(); setMsgs([]); setId(undefined); };

  // Nachricht i ändern und speichern
  const update = async (list: Msg[]) => { setMsgs(list); await save(list).catch(() => undefined); };

  /** Internetrecherche nach Zustimmung: Ergebnis als neue Antwort, danach Angebot zum Ablegen */
  const research = async (i: number, yes: boolean) => {
    const m = msgs[i];
    if (!m?.research || busy) return;
    if (!yes) return update(msgs.map((x, k) => (k === i ? { ...x, research: { ...m.research!, state: "declined" } } : x)));
    const running = msgs.map((x, k) => (k === i ? { ...x, research: { ...m.research!, state: "running" as const } } : x));
    setMsgs(running);
    setBusy(true);
    try {
      const question = [...msgs.slice(0, i)].reverse().find((x) => x.role === "user")?.content ?? "";
      const res = await authFetch("/api/research", { method: "POST", body: JSON.stringify({ query: m.research.query, reason: m.research.reason, question }) });
      const r = (await res.json().catch(() => ({}))) as { error?: string; answer?: string; sources?: { title: string; url: string }[]; document?: { title: string; pdfUrl: string; markdown: string } | null };
      if (!res.ok || !r.answer) throw new Error(r.error ?? `Fehler ${res.status}`);
      const sources = (r.sources ?? []).map((s) => `- [${s.title.replace(/[[\]]/g, "")}](${s.url})`).join("\n");
      const answer: Msg = {
        role: "assistant",
        content: `${r.answer}${sources ? `\n\n### Quellen im Internet\n${sources}` : ""}`,
        ...(r.document ? { save: { ...r.document, relatedId: m.research.docId, state: "ask" as const } } : {}),
      };
      await update([...running.map((x, k) => (k === i ? { ...x, research: { ...m.research!, state: "done" as const } } : x)), answer]);
    } catch (e) {
      await update(msgs.map((x, k) => (k === i ? { ...x, research: { ...m.research!, state: "failed", error: (e as Error).message } } : x)));
    } finally {
      setBusy(false);
    }
  };

  /** Gefundenes Dokument ablegen: Original-PDF, sonst Notiz mit Quellen und Bezug */
  const saveFound = async (i: number, yes: boolean) => {
    const m = msgs[i];
    if (!m?.save) return;
    if (!yes) return update(msgs.map((x, k) => (k === i ? { ...x, save: { ...m.save!, state: "declined" } } : x)));
    setMsgs(msgs.map((x, k) => (k === i ? { ...x, save: { ...m.save!, state: "saving" } } : x)));
    const name = m.save.title.replace(/[\\/:*?"<>|]/g, "").slice(0, 120) || "Recherche";
    try {
      let file: File | undefined;
      if (m.save.pdfUrl) {
        const res = await authFetch("/api/research/fetch", { method: "POST", body: JSON.stringify({ url: m.save.pdfUrl }) });
        if (res.ok) file = new File([await res.blob()], `${name}.pdf`, { type: "application/pdf" });
      }
      if (!file) {
        const head = `# ${m.save.title}\n\n_Internetrecherche vom ${new Date().toLocaleDateString("de-DE")}${m.save.relatedId ? ` · Ergänzung zu Dokument /d/${m.save.relatedId}` : ""}_\n\n`;
        file = new File([head + m.save.markdown], `${name}.md`, { type: "text/markdown" });
      }
      await upload([file]);
      await update(msgs.map((x, k) => (k === i ? { ...x, save: { ...m.save!, state: "saved" } } : x)));
    } catch (e) {
      await update(msgs.map((x, k) => (k === i ? { ...x, save: { ...m.save!, state: "failed", error: (e as Error).message } } : x)));
    }
  };

  return { msgs, busy, send, stop: () => abort.current?.abort(), reset, id, research, saveFound };
}
