"use client";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { CalendarClock, ChevronLeft, FileSearch, HeartPulse, MoreHorizontal, PanelLeftClose, PanelLeftOpen, Pencil, Pin, PinOff, Receipt, SquarePen, Star, StarOff, Trash2 } from "lucide-react";
import { Composer, MessageList, useChat } from "@/components/ChatPanel";
import { AiAvatar } from "@/components/AiAvatar";
import { VaultUnlock } from "@/components/VaultUnlock";
import { useDocs } from "@/lib/docs";
import { supabase, useSession } from "@/lib/supabase";
import { AvatarMenu } from "@/components/AvatarMenu";

type Thread = { id: string; title: string; updated_at: string; pinned?: boolean; starred?: boolean };
const SUGGESTIONS = [
  { icon: Receipt, title: "Was ist noch offen?", sub: "Rechnungen und Mahnungen", q: "Welche Rechnungen und Mahnungen sind noch offen?" },
  { icon: CalendarClock, title: "Welche Fristen laufen?", sub: "Kündigung, Zahlung, Widerspruch", q: "Welche Fristen laufen in den nächsten Wochen ab – Kündigungen, Zahlungen, Widersprüche?" },
  { icon: FileSearch, title: "Mein Arbeitsvertrag", sub: "Urlaub und Kündigung", q: "Was steht in meinem Arbeitsvertrag zu Urlaub und Kündigung?" },
  { icon: HeartPulse, title: "Meine Befunde", sub: "Kurz zusammengefasst", q: "Fasse meine letzten Arztbefunde zusammen." },
];
/** Startkacheln wie bei Finastry, in Lila: zwei Lila-Töne im Wechsel, leichtes Leuchten, wenig Schatten */
const TILE_BG = ["linear-gradient(135deg, #5a36e6 0%, #6d4aff 55%, #8466ff 100%)", "linear-gradient(135deg, #7b3fd6 0%, #9356ea 55%, #a874f5 100%)"];
const TILE_GLOW = ["0 6px 16px -10px rgba(15,23,42,.35), 0 0 22px -6px rgba(109,74,255,.5), inset 0 1px 0 rgba(255,255,255,.18)", "0 6px 16px -10px rgba(15,23,42,.35), 0 0 22px -6px rgba(147,86,234,.5), inset 0 1px 0 rgba(255,255,255,.18)"];

/** Chat wie bei Finastry: links die Gespräche (Symbol vor „Zurück“; am Handy im Vollbild), rechts das Gespräch */
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
    const { data } = await supabase.from("chats").select("id,title,updated_at,pinned,starred").is("doc_id", null).order("updated_at", { ascending: false }).limit(150);
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
  const remove = async (t: Thread) => {
    if (!confirm(`Gespräch „${t.title}“ löschen?`)) return;
    await supabase.from("chats").delete().eq("id", t.id);
    if (t.id === current) open(undefined);
    void loadThreads();
  };
  const patch = async (t: Thread, p: Partial<Pick<Thread, "pinned" | "starred" | "title">>) => {
    setThreads((xs) => xs.map((x) => (x.id === t.id ? { ...x, ...p } : x)));
    await supabase.from("chats").update(p).eq("id", t.id);
  };
  const back = () => (history.length > 1 ? router.back() : router.push("/"));
  // Leiste: am Desktop links ein-/ausklappen, am Handy Vollbild
  const toggleList = () => (window.matchMedia("(min-width: 1024px)").matches ? toggleSide() : setDrawer((v) => !v));
  const ready = docs.filter((d) => d.status === "ready").length;
  const empty = chat.msgs.length === 0;
  // Text im Eingabefeld: der große Avatar weicht nach oben
  const [typing, setTyping] = useState(false);

  const pinned = threads.filter((t) => t.pinned);
  const rest = threads.filter((t) => !t.pinned);
  const list = (
    <div className="flex h-full flex-col">
      {/* Kopf wie bei Finastry: Zurück, Einklappen; darunter Neuer Chat */}
      <div className="flex items-center gap-1 px-3 pt-3 pb-2">
        <span className="flex-1"><button type="button" onClick={back} className="inline-flex h-9 items-center gap-1 rounded-[6px] pr-3 pl-1.5 text-[15px] font-semibold hover:bg-black/[0.04]"><ChevronLeft size={18} /> Zurück</button></span>
        <button type="button" onClick={() => (drawer ? setDrawer(false) : toggleSide())} aria-label="Gespräche einklappen" title="Einklappen" className="grid h-9 w-9 place-items-center rounded-full text-soft hover:bg-black/[0.04] hover:text-fg"><PanelLeftClose size={18} /></button>
      </div>
      <button type="button" onClick={() => open(undefined)} className="mx-2 flex h-10 items-center gap-2.5 rounded-[6px] px-3.5 text-[15px] hover:bg-black/[0.04]"><SquarePen size={16} className="text-soft" /> Neuer Chat</button>
      <div className="no-scrollbar mt-3 flex-1 space-y-4 overflow-y-auto px-2 pb-6">
        {pinned.length > 0 && <div><p className="px-3.5 pb-1.5 text-[13px] text-muted">Angepinnt</p>{pinned.map((t) => <ThreadItem key={t.id} t={t} active={t.id === current} onOpen={() => open(t.id)} onPatch={(p) => void patch(t, p)} onRemove={() => void remove(t)} />)}</div>}
        <div>
          <p className="px-3.5 pb-1.5 text-[13px] text-muted">Letzte</p>
          {threads.length === 0 && <p className="px-3.5 py-2 text-[13px] text-muted">Noch keine Gespräche.</p>}
          {rest.map((t) => <ThreadItem key={t.id} t={t} active={t.id === current} onOpen={() => open(t.id)} onPatch={(p) => void patch(t, p)} onRemove={() => void remove(t)} />)}
        </div>
      </div>
    </div>
  );

  return (
    <div className="flex min-h-dvh bg-page">
      {/* Desktop: Verlauf links */}
      {side && <aside className="sticky top-0 hidden h-dvh w-72 shrink-0 border-r border-card-line bg-page lg:block">{list}</aside>}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="pt-safe sticky top-0 z-20 bg-page/90 backdrop-blur-xl">
          <div className="mx-auto flex h-14 items-center justify-between gap-2 px-3 lg:h-16 lg:px-5">
            {/* links: Gespräche (Leiste) vor „Zurück“, dann der Titel */}
            <span className="flex min-w-0 items-center gap-1">
              {!side && <button type="button" onClick={toggleList} aria-label="Gespräche zeigen" title="Gespräche" className="grid h-10 w-10 shrink-0 place-items-center rounded-full hover:bg-surface"><PanelLeftOpen size={19} /></button>}
              {!side && <button type="button" onClick={back} className="inline-flex h-10 shrink-0 items-center gap-1 rounded-full pr-3 pl-1.5 text-[15px] font-semibold hover:bg-surface"><ChevronLeft size={18} /> Zurück</button>}
              <b className="min-w-0 truncate pl-1 text-[15px] max-lg:hidden">{empty ? "Neuer Chat" : threads.find((t) => t.id === current)?.title ?? "Chat"}</b>
            </span>
            <span className="flex items-center gap-1">
              <button type="button" onClick={() => open(undefined)} aria-label="Neuer Chat" title="Neuer Chat" className="grid h-10 w-10 place-items-center rounded-full bg-surface shadow-card hover:bg-surface-2"><SquarePen size={18} /></button>
              {session?.user.email && <span className="ml-1 max-lg:hidden"><AvatarMenu email={session.user.email} /></span>}
            </span>
          </div>
        </header>

        <div className="mx-auto w-full max-w-3xl flex-1 px-4 pb-[calc(16rem+env(safe-area-inset-bottom))] lg:pb-48">
          {empty ? (
            <div className="flex flex-col items-center pt-[10vh] text-center">
              {/* beim Tippen schwebt er nach oben weg – dann sitzt er links am Eingabefeld */}
              <AiAvatar size={128} state="think" label="Dein Assistent" className={`-my-6 transition-all duration-500 ease-out motion-reduce:transition-none ${typing ? "-translate-y-10 scale-50 opacity-0" : ""}`} />
              <h1 className="mt-4 text-[24px] leading-8 font-[650] tracking-tight">Was möchtest du wissen?</h1>
              <p className="mt-1.5 text-[14px] text-muted">{ready ? `Ich kenne ${ready} ${ready === 1 ? "Dokument" : "Dokumente"} von dir und nenne dir immer die Quelle.` : "Lade zuerst ein paar Dokumente hoch – dann frag mich alles dazu."}</p>
              <div className="mt-6 grid w-full grid-cols-2 gap-2.5 sm:grid-cols-4">
                {SUGGESTIONS.map(({ icon: Icon, title, sub, q }, k) => (
                  <button key={q} type="button" onClick={() => void chat.send(q)} className="flex min-h-[112px] flex-col items-center justify-center gap-2 rounded-2xl p-3.5 text-center text-white transition hover:brightness-105" style={{ background: TILE_BG[k % 2], boxShadow: TILE_GLOW[k % 2] }}>
                    <Icon size={22} className="shrink-0" />
                    <span><span className="block text-[13.5px] leading-[18px] font-semibold">{title}</span><span className="mt-0.5 block text-[11.5px] leading-4 text-white/80">{sub}</span></span>
                  </button>
                ))}
              </div>
              {!ready && <Link href="/" className="mt-4 text-[14px] font-semibold text-selected">Dokumente hochladen</Link>}
            </div>
          ) : (
            <div className="pt-4"><MessageList msgs={chat.msgs} busy={chat.busy} onAsk={(q) => void chat.send(q)} onResearch={(i, y) => void chat.research(i, y)} onSave={(i, y) => void chat.saveFound(i, y)} />{/* Abstand zum Eingabefeld: beim Mitscrollen bleibt das Ende der Antwort darüber sichtbar */}<div ref={end} className="scroll-mb-[calc(15rem+env(safe-area-inset-bottom))] lg:scroll-mb-44" /></div>
          )}
        </div>

        <div className={`kb-dock fixed inset-x-0 bottom-[calc(4rem+env(safe-area-inset-bottom))] z-20 bg-gradient-to-t from-page via-page to-page/0 px-3 pt-6 pb-3 lg:bottom-0 lg:pb-6 ${side ? "lg:left-[calc(var(--side,15.75rem)+18rem)]" : "lg:left-[var(--side,15.75rem)]"}`}>
          {chat.gate && (
            <div className="mx-auto max-w-md">
              <VaultUnlock compact title="Tresor entsperren" onClose={chat.cancelGate}
                text={<>Für <b className="text-white">„{chat.gate.q}“</b> brauche ich wahrscheinlich verschlüsselte Unterlagen. Danach geht die Frage automatisch los.</>}
                footer={<button type="button" onClick={chat.skipGate} className="rounded-full border border-card-line bg-surface px-4 text-[14px] font-semibold text-fg hover:bg-surface-2">Ohne Tresor fragen</button>} />
            </div>
          )}
          <div className={`mx-auto max-w-3xl ${chat.gate ? "hidden" : ""}`}><Composer busy={chat.busy} onSend={(q) => void chat.send(q)} onStop={chat.stop} onTextChange={setTyping} aiState={chat.busy ? (chat.msgs.at(-1)?.role === "assistant" && chat.msgs.at(-1)?.content ? "speak" : "think") : undefined} onFiles={(f) => void chat.attach(f)} attachments={chat.attachments} onRemoveAttachment={chat.removeAttachment} depth={chat.depth} onDepth={chat.setDepth} /></div>
        </div>
      </div>

      {drawer && (
        <div className="panel-in-left pt-safe fixed inset-0 z-50 bg-page lg:hidden" role="dialog" aria-label="Gespräche">{list}</div>
      )}
    </div>
  );
}

/** Ein Gespräch in der Leiste: Titel, Stern/Nadel; „…“ öffnet Anheften, Merken, Umbenennen, Löschen */
function ThreadItem({ t, active, onOpen, onPatch, onRemove }: { t: Thread; active: boolean; onOpen: () => void; onPatch: (p: Partial<Pick<Thread, "pinned" | "starred" | "title">>) => void; onRemove: () => void }) {
  const [menu, setMenu] = useState(false);
  const [edit, setEdit] = useState(false);
  const [title, setTitle] = useState(t.title);
  const item = "flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-[14px] hover:bg-surface-2";
  if (edit) return (
    <form onSubmit={(e) => { e.preventDefault(); if (title.trim()) onPatch({ title: title.trim().slice(0, 120) }); setEdit(false); }} className="px-1 py-0.5">
      <input autoFocus value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} onBlur={() => { if (title.trim()) onPatch({ title: title.trim().slice(0, 120) }); setEdit(false); }} className="h-9 w-full rounded-lg border border-card-line bg-surface px-3 text-[14px]" />
    </form>
  );
  return (
    <div className={`group relative flex items-center rounded-[6px] ${active ? "bg-black/[0.06]" : "hover:bg-black/[0.04]"}`}>
      <button type="button" onClick={onOpen} className="flex min-w-0 flex-1 items-center gap-2 py-2 pr-1 pl-3.5 text-left text-[14px] leading-5 lg:py-1.5 lg:text-[14px]">
        <span className="min-w-0 flex-1 truncate">{t.title}</span>
        {t.starred && <Star size={13} className="shrink-0 fill-amber text-amber" aria-label="Gemerkt" />}
        {t.pinned && <Pin size={13} className="shrink-0 fill-current text-brand-500" aria-label="Angepinnt" />}
      </button>
      <button type="button" onClick={() => setMenu(!menu)} aria-label={`${t.title}: Optionen`} aria-expanded={menu} className="mr-1 grid h-7 w-7 shrink-0 place-items-center rounded-lg text-soft hover:text-fg lg:opacity-0 lg:group-hover:opacity-100 lg:focus-visible:opacity-100"><MoreHorizontal size={16} /></button>
      {menu && (
        <>
          <button type="button" aria-label="Menü schließen" onClick={() => setMenu(false)} className="fixed inset-0 z-10 cursor-default" />
          <div className="absolute top-full right-1 z-20 mt-1 grid min-w-48 gap-0.5 rounded-xl border border-card-line bg-surface p-1 shadow-[0_12px_32px_rgba(16,24,40,.16)]">
            <button type="button" onClick={() => { onPatch({ pinned: !t.pinned }); setMenu(false); }} className={item}>{t.pinned ? <><PinOff size={15} /> Lösen</> : <><Pin size={15} /> Oben anheften</>}</button>
            <button type="button" onClick={() => { onPatch({ starred: !t.starred }); setMenu(false); }} className={item}>{t.starred ? <><StarOff size={15} /> Nicht mehr merken</> : <><Star size={15} /> Merken</>}</button>
            <button type="button" onClick={() => { setTitle(t.title); setEdit(true); setMenu(false); }} className={item}><Pencil size={15} /> Umbenennen</button>
            <button type="button" onClick={() => { setMenu(false); onRemove(); }} className={`${item} text-negative-text`}><Trash2 size={15} /> Löschen</button>
          </div>
        </>
      )}
    </div>
  );
}
