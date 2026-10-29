"use client";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeft, FileSearch, HeartPulse, History, MessageSquare, PanelLeftClose, PanelLeftOpen, Receipt, SquarePen, Trash2, X } from "lucide-react";
import { Composer, MessageList, useChat } from "@/components/ChatPanel";
import { LogoMark } from "@/components/Logo";
import { VaultUnlock } from "@/components/VaultUnlock";
import { useDocs } from "@/lib/docs";
import { supabase, useSession } from "@/lib/supabase";
import { AvatarMenu } from "@/components/AvatarMenu";

type Thread = { id: string; title: string; updated_at: string };
const SUGGESTIONS = [
  { icon: Receipt, q: "Welche Rechnungen und Mahnungen sind noch offen?" },
  { icon: FileSearch, q: "Was steht in meinem Arbeitsvertrag zu Urlaub und Kündigung?" },
  { icon: HeartPulse, q: "Fasse meine letzten Arztbefunde zusammen." },
];

/** Chat wie bei Finastry: links der Verlauf (am Handy über „Verlauf“), rechts das Gespräch */
export default function ChatPage() {
  return <Suspense><Chat /></Suspense>;
}

function Chat() {
  const router = useRouter();
  const params = useSearchParams();
  const { docs } = useDocs();
  const session = useSession();
  const [threads, setThreads] = useState<Thread[]>([]);
  const [current, setCurrent] = useState<string>();
  const [drawer, setDrawer] = useState(false);
  // Desktop: Verlauf links ein-/ausklappen, startet zugeklappt (gemerkt)
  const [side, setSide] = useState(false);
  useEffect(() => { try { setSide(localStorage.getItem("lifevault:chat-side") === "1"); } catch { /* egal */ } }, []);
  const toggleSide = () => setSide((v) => { try { localStorage.setItem("lifevault:chat-side", v ? "0" : "1"); } catch { /* egal */ } return !v; });
  const loadThreads = useCallback(async () => {
    const { data } = await supabase.from("chats").select("id,title,updated_at").is("doc_id", null).order("updated_at", { ascending: false }).limit(100);
    setThreads((data as Thread[]) ?? []);
  }, []);
  useEffect(() => { void loadThreads(); }, [loadThreads]);
  const chat = useChat({ chatId: current, onSaved: (id) => { setCurrent(id); void loadThreads(); } });
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => { end.current?.scrollIntoView({ behavior: "smooth", block: "end" }); }, [chat.msgs]);
  // Frage aus Suche/Dokument: neuer Chat, gleich abschicken
  const asked = useRef(false);
  useEffect(() => {
    const q = params.get("q");
    if (q && !asked.current) { asked.current = true; router.replace("/chat"); setCurrent(undefined); void chat.send(q, []); }
  }, [params]); // eslint-disable-line react-hooks/exhaustive-deps

  const open = (id?: string) => { setCurrent(id); setDrawer(false); if (!id) chat.reset(); };
  const remove = async (id: string) => {
    await supabase.from("chats").delete().eq("id", id);
    if (id === current) open(undefined);
    void loadThreads();
  };
  const ready = docs.filter((d) => d.status === "ready").length;
  const empty = chat.msgs.length === 0;

  const list = (
    <div className="flex h-full flex-col">
      <button type="button" onClick={() => open(undefined)} className="mx-3 mt-3 mb-3 flex h-10 items-center gap-2.5 rounded-full px-3.5 text-[14.5px] font-medium hover:bg-surface-2"><SquarePen size={16} className="text-soft" /> Neuer Chat</button>
      <div className="px-5 pb-1 text-[12px] font-medium text-muted">Letzte</div>
      <div className="no-scrollbar flex-1 overflow-y-auto px-2 pb-4">
        {threads.length === 0 && <p className="px-3 py-2 text-[13px] text-muted">Noch keine Gespräche.</p>}
        {threads.map((t) => (
          <div key={t.id} className={`group flex items-center rounded-[6px] ${t.id === current ? "bg-black/[0.06]" : "hover:bg-black/[0.04]"}`}>
            <button type="button" onClick={() => open(t.id)} className="min-w-0 flex-1 truncate px-3 py-2.5 text-left text-[14.5px]">{t.title}</button>
            <button type="button" onClick={() => void remove(t.id)} aria-label="Chat löschen" className="mr-1 grid h-8 w-8 shrink-0 place-items-center rounded-full text-muted opacity-0 group-hover:opacity-100 hover:text-negative-text max-lg:opacity-100"><Trash2 size={14} /></button>
          </div>
        ))}
      </div>
    </div>
  );

  return (
    <div className="flex min-h-dvh bg-page">
      {/* Desktop: Verlauf links */}
      {side && <aside className="sticky top-0 hidden h-dvh w-72 shrink-0 border-r border-card-line bg-surface lg:block">{list}</aside>}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="pt-safe sticky top-0 z-20 bg-page/90 backdrop-blur-xl">
          <div className="mx-auto flex h-14 items-center justify-between gap-2 px-3 lg:h-16 lg:px-5">
            <button type="button" onClick={() => (history.length > 1 ? router.back() : router.push("/"))} className="inline-flex h-10 items-center gap-1 rounded-full pr-3 pl-1.5 text-[14.5px] font-semibold hover:bg-surface lg:hidden"><ChevronLeft size={18} /> Zurück</button>
            <span className="flex min-w-0 items-center gap-2 max-lg:hidden">
              <button type="button" onClick={toggleSide} aria-label={side ? "Verlauf ausblenden" : "Verlauf einblenden"} title={side ? "Verlauf ausblenden" : "Verlauf einblenden"} className="grid h-10 w-10 shrink-0 place-items-center rounded-full hover:bg-surface">{side ? <PanelLeftClose size={18} /> : <PanelLeftOpen size={18} />}</button>
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-surface text-fg shadow-card"><MessageSquare size={16} /></span>
              <span className="min-w-0"><b className="block truncate text-[15px] leading-5">{empty ? "Fragen" : threads.find((t) => t.id === current)?.title ?? "Chat"}</b><span className="block text-[12px] leading-4 text-muted">{empty ? "Neuer Chat" : `${threads.length} Gespräche im Verlauf`}</span></span>
            </span>
            <span className="flex items-center gap-1">
              <button type="button" onClick={() => setDrawer(true)} className="inline-flex h-10 items-center gap-1.5 rounded-full px-3 text-[14px] font-semibold hover:bg-surface lg:hidden"><History size={17} /> Verlauf</button>
              <button type="button" onClick={() => open(undefined)} aria-label="Neuer Chat" title="Neuer Chat" className="grid h-10 w-10 place-items-center rounded-full bg-surface shadow-card hover:bg-surface-2"><SquarePen size={18} /></button>
              {session?.user.email && <span className="ml-1 max-lg:hidden"><AvatarMenu email={session.user.email} /></span>}
            </span>
          </div>
        </header>

        <div className="mx-auto w-full max-w-3xl flex-1 px-4 pb-[calc(16rem+env(safe-area-inset-bottom))] lg:pb-48">
          {empty ? (
            <div className="flex flex-col items-center pt-[10vh] text-center">
              <LogoMark size={52} />
              <h1 className="mt-4 text-[24px] leading-8 font-[650] tracking-tight">Was möchtest du wissen?</h1>
              <p className="mt-1.5 text-[14px] text-muted">{ready ? `Ich kenne ${ready} ${ready === 1 ? "Dokument" : "Dokumente"} von dir und nenne dir immer die Quelle.` : "Lade zuerst ein paar Dokumente hoch – dann frag mich alles dazu."}</p>
              <div className="mt-6 grid w-full gap-2">
                {SUGGESTIONS.map(({ icon: Icon, q }) => (
                  <button key={q} type="button" onClick={() => void chat.send(q)} className="flex items-center gap-3 rounded-xl border border-card-line bg-surface px-4 py-3 text-left text-[14px] font-medium shadow-card hover:bg-surface-2"><Icon size={17} className="shrink-0 text-brand-500" /> {q}</button>
                ))}
              </div>
              {!ready && <Link href="/" className="mt-4 text-[14px] font-semibold text-selected">Dokumente hochladen</Link>}
            </div>
          ) : (
            <div className="pt-4"><MessageList msgs={chat.msgs} busy={chat.busy} onAsk={(q) => void chat.send(q)} onResearch={(i, y) => void chat.research(i, y)} onSave={(i, y) => void chat.saveFound(i, y)} />{/* Abstand zum Eingabefeld: beim Mitscrollen bleibt das Ende der Antwort darüber sichtbar */}<div ref={end} className="scroll-mb-[calc(15rem+env(safe-area-inset-bottom))] lg:scroll-mb-44" /></div>
          )}
        </div>

        <div className={`kb-dock fixed inset-x-0 bottom-[calc(4rem+env(safe-area-inset-bottom))] z-20 bg-gradient-to-t from-page via-page to-page/0 px-3 pt-6 pb-3 lg:bottom-0 lg:pb-6 ${side ? "lg:left-[calc(var(--side,15rem)+18rem)]" : "lg:left-[var(--side,15rem)]"}`}>
          {chat.gate && (
            <div className="mx-auto max-w-md">
              <VaultUnlock compact title="Tresor entsperren" onClose={chat.cancelGate}
                text={<>Für <b className="text-white">„{chat.gate.q}“</b> brauche ich wahrscheinlich verschlüsselte Unterlagen. Danach geht die Frage automatisch los.</>}
                footer={<button type="button" onClick={chat.skipGate} className="rounded-full border border-card-line bg-surface px-4 text-[13.5px] font-semibold text-fg hover:bg-surface-2">Ohne Tresor fragen</button>} />
            </div>
          )}
          <div className={`mx-auto max-w-3xl ${chat.gate ? "hidden" : ""}`}><Composer busy={chat.busy} onSend={(q) => void chat.send(q)} onStop={chat.stop} onFiles={(f) => void chat.attach(f)} attachments={chat.attachments} onRemoveAttachment={chat.removeAttachment} depth={chat.depth} onDepth={chat.setDepth} /></div>
        </div>
      </div>

      {drawer && (
        <div className="fixed inset-0 z-40 bg-black/40 lg:hidden" onClick={() => setDrawer(false)}>
          <div className="sheet-up pt-safe absolute inset-y-0 left-0 w-[86%] max-w-sm bg-surface" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-4 pt-3"><span className="flex items-center gap-2 text-[16px] font-semibold"><MessageSquare size={17} /> Verlauf</span><button type="button" onClick={() => setDrawer(false)} aria-label="Schließen" className="grid h-9 w-9 place-items-center rounded-full bg-surface-3"><X size={17} /></button></div>
            {list}
          </div>
        </div>
      )}
    </div>
  );
}
