"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ArrowUp, Square } from "lucide-react";
import { LogoMark } from "@/components/Logo";
import { Markdown } from "@/components/Markdown";
import { SenderLogo } from "@/components/SenderLogo";
import { useDocs } from "@/lib/docs";
import { authFetch, supabase } from "@/lib/supabase";

export type Msg = { role: "user" | "assistant"; content: string };

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
            <SenderLogo domain={d.sender_domain} cluster={d.cluster} size={34} />
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
      <span className="flex h-3 items-center gap-1" aria-hidden>{[0, 1, 2].map((k) => <span key={k} className="typing-dot h-1.5 w-1.5 rounded-full bg-brand-500" style={{ animationDelay: `${k * 0.15}s` }} />)}</span>
      <span className="text-shimmer text-[14px] font-medium">{label}</span>
    </div>
  );
}

export function MessageList({ msgs, compact }: { msgs: Msg[]; compact?: boolean }) {
  return (
    <div className={compact ? "space-y-5" : "space-y-6"}>
      {msgs.map((m, i) =>
        m.role === "user" ? (
          <div key={i} className="flex justify-end"><div className="max-w-[85%] rounded-[20px] rounded-br-md bg-surface-3 px-4 py-2.5 text-[15px] leading-6 whitespace-pre-wrap">{m.content}</div></div>
        ) : (
          <div key={i} className="flex gap-3">
            <span className="mt-0.5 shrink-0"><LogoMark size={26} /></span>
            <div className="min-w-0 flex-1">{m.content ? <><Markdown text={m.content.replace(/\n#{1,4}\s*Quellen[\s\S]*$/i, "")} /><Sources text={m.content} /></> : <Typing />}</div>
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
      const res = await authFetch("/api/chat", { method: "POST", body: JSON.stringify({ messages: next, docId, docText }), signal: ctrl.signal });
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
      const all: Msg[] = [...next, { role: "assistant", content: out }];
      setMsgs(all);
      setBusy(false);
      abort.current = null;
      await save(all).catch(() => undefined);
    }
  };
  const reset = () => { abort.current?.abort(); setMsgs([]); setId(undefined); };
  return { msgs, busy, send, stop: () => abort.current?.abort(), reset, id };
}
