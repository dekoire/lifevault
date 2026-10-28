"use client";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";
import { ArrowUp, ChevronLeft, FileSearch, HeartPulse, Receipt, SquarePen, Square } from "lucide-react";
import { LogoMark } from "@/components/Logo";
import { Markdown } from "@/components/Markdown";
import { useDocs } from "@/lib/docs";
import { authFetch } from "@/lib/supabase";

type Msg = { role: "user" | "assistant"; content: string };
const KEY = "lifevault:chat";
const SUGGESTIONS = [
  { icon: Receipt, q: "Welche Rechnungen sind noch offen?" },
  { icon: FileSearch, q: "Was steht in meinem Arbeitsvertrag zu Urlaub und Kündigung?" },
  { icon: HeartPulse, q: "Fasse meine letzten Arztbefunde zusammen." },
];

/** Chat wie bei Finastry: leer mit Logo und Vorschlägen, Antworten mit Quellen, Eingabe unten */
export default function ChatPage() {
  return <Suspense><Chat /></Suspense>;
}

function Chat() {
  const router = useRouter();
  const params = useSearchParams();
  const { docs } = useDocs();
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const abort = useRef<AbortController>(null);
  const end = useRef<HTMLDivElement>(null);
  const area = useRef<HTMLTextAreaElement>(null);
  const asked = useRef(false);

  useEffect(() => {
    try { setMsgs(JSON.parse(localStorage.getItem(KEY) ?? "[]")); } catch { /* leer */ }
  }, []);
  useEffect(() => {
    try { localStorage.setItem(KEY, JSON.stringify(msgs.slice(-40))); } catch { /* privat */ }
    end.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [msgs]);
  // Frage aus der Suche bzw. einem Dokument: neuer Chat, gleich abschicken
  useEffect(() => {
    const q = params.get("q");
    if (q && !asked.current) {
      asked.current = true;
      router.replace("/chat");
      void send(q, []);
    }
  }, [params]); // eslint-disable-line react-hooks/exhaustive-deps

  const send = async (q: string, base = msgs) => {
    const question = q.trim();
    if (!question || busy) return;
    const next: Msg[] = [...base, { role: "user", content: question }];
    setMsgs([...next, { role: "assistant", content: "" }]);
    setText("");
    setBusy(true);
    const ctrl = new AbortController();
    abort.current = ctrl;
    try {
      const res = await authFetch("/api/chat", { method: "POST", body: JSON.stringify({ messages: next }), signal: ctrl.signal });
      if (!res.ok || !res.body) throw new Error((await res.json().catch(() => ({}))).error ?? `Fehler ${res.status}`);
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let out = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        out += dec.decode(value, { stream: true });
        setMsgs([...next, { role: "assistant", content: out }]);
      }
      if (!out.trim()) setMsgs([...next, { role: "assistant", content: "Dazu habe ich gerade keine Antwort bekommen. Bitte noch einmal fragen." }]);
    } catch (e) {
      if ((e as Error).name === "AbortError") return;
      const m = (e as Error).message;
      setMsgs([...next, { role: "assistant", content: /load failed|failed to fetch|network/i.test(m) ? "Die Verbindung ist abgebrochen. Bitte die Frage noch einmal senden." : m }]);
    } finally {
      setBusy(false);
      abort.current = null;
    }
  };

  const empty = msgs.length === 0;
  const ready = docs.filter((d) => d.status === "ready").length;
  return (
    <div className="flex min-h-dvh flex-col bg-canvas">
      <header className="pt-safe sticky top-0 z-20 bg-canvas/90 backdrop-blur-xl">
        <div className="mx-auto flex h-14 max-w-3xl items-center justify-between px-3">
          <button type="button" onClick={() => (history.length > 1 ? router.back() : router.push("/"))} className="inline-flex h-10 items-center gap-1 rounded-full pr-3 pl-1.5 text-[14.5px] font-semibold hover:bg-surface-3"><ChevronLeft size={18} /> Zurück</button>
          <span className="text-[15px] font-semibold">{empty ? "Neuer Chat" : "Chat"}</span>
          <button type="button" onClick={() => { abort.current?.abort(); setMsgs([]); }} aria-label="Neuer Chat" title="Neuer Chat" className="grid h-10 w-10 place-items-center rounded-full hover:bg-surface-3"><SquarePen size={18} /></button>
        </div>
      </header>

      <div className="mx-auto w-full max-w-3xl flex-1 px-4 pb-48">
        {empty ? (
          <div className="flex flex-col items-center pt-[12vh] text-center">
            <LogoMark size={52} />
            <h1 className="mt-4 text-[24px] leading-8 font-[650] tracking-tight">Was möchtest du wissen?</h1>
            <p className="mt-1.5 text-[14px] text-muted">{ready ? `Ich kenne ${ready} ${ready === 1 ? "Dokument" : "Dokumente"} von dir und nenne dir immer die Quelle.` : "Lade zuerst ein paar Dokumente hoch – dann frag mich alles dazu."}</p>
            <div className="mt-6 grid w-full gap-2">
              {SUGGESTIONS.map(({ icon: Icon, q }) => (
                <button key={q} type="button" onClick={() => void send(q)} className="flex items-center gap-3 rounded-2xl border border-card-line bg-surface px-4 py-3 text-left text-[14px] font-medium hover:bg-surface-2"><Icon size={17} className="shrink-0 text-brand-500" /> {q}</button>
              ))}
            </div>
            {!ready && <Link href="/" className="mt-4 text-[14px] font-semibold text-selected">Dokumente hochladen</Link>}
          </div>
        ) : (
          <div className="space-y-6 pt-4">
            {msgs.map((m, i) =>
              m.role === "user" ? (
                <div key={i} className="flex justify-end"><div className="max-w-[85%] rounded-[20px] rounded-br-md bg-surface-3 px-4 py-2.5 text-[15px] leading-6 whitespace-pre-wrap">{m.content}</div></div>
              ) : (
                <div key={i} className="flex gap-3">
                  <span className="mt-0.5 shrink-0"><LogoMark size={26} /></span>
                  <div className="min-w-0 flex-1">
                    {m.content ? <Markdown text={m.content} /> : (
                      <div className="flex min-h-8 items-center gap-2.5" role="status" aria-live="polite">
                        <span className="flex h-3 items-center gap-1" aria-hidden>{[0, 1, 2].map((k) => <span key={k} className="typing-dot h-1.5 w-1.5 rounded-full bg-brand-500" style={{ animationDelay: `${k * 0.15}s` }} />)}</span>
                        <span className="text-shimmer text-[14px] font-medium">Durchsuche deine Unterlagen</span>
                      </div>
                    )}
                  </div>
                </div>
              ),
            )}
            <div ref={end} />
          </div>
        )}
      </div>

      {/* Eingabe über der unteren Leiste */}
      <div className="fixed inset-x-0 bottom-[calc(4rem+env(safe-area-inset-bottom))] z-20 bg-gradient-to-t from-canvas via-canvas to-canvas/0 px-3 pt-6 pb-3">
        <form onSubmit={(e) => { e.preventDefault(); void send(text); }} className="chat-box mx-auto flex max-w-3xl items-end gap-2 rounded-[24px] border bg-surface p-2 pl-4">
          <textarea
            ref={area}
            value={text}
            onChange={(e) => { setText(e.target.value); e.target.style.height = "auto"; e.target.style.height = `${Math.min(160, e.target.scrollHeight)}px`; }}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); void send(text); } }}
            rows={1}
            maxLength={2000}
            placeholder="Frag etwas zu deinen Unterlagen …"
            className="max-h-40 min-h-10 flex-1 resize-none bg-transparent py-2 text-[16px] leading-6 outline-none placeholder:text-muted"
          />
          {busy ? (
            <button type="button" onClick={() => abort.current?.abort()} aria-label="Stoppen" className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-fg text-canvas"><Square size={14} fill="currentColor" /></button>
          ) : (
            <button type="submit" disabled={!text.trim()} aria-label="Senden" className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-brand-500 text-white transition disabled:bg-surface-3 disabled:text-muted"><ArrowUp size={19} strokeWidth={2.4} /></button>
          )}
        </form>
      </div>
    </div>
  );
}
